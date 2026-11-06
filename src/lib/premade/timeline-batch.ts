// Timeline batch collection: one Riot call per collected game that still has no timeline. Saves
// only the derived data (see timeline.ts), resuming from the stored timelines themselves, and
// records the games Riot does not answer so they never block the batch.
import { fetchInBatches, getRegionalUrl, safeFetch } from "@/lib/riot/match-v5";

import {
  getAccountOwners,
  getMatchesMissingDerived,
  getTeamById,
  getTeamMatches,
  getTimelineFailures,
  getTimelines,
  saveTimelineDerived,
  saveTimelineFailures,
  saveTimelines,
} from "./repository";
import { toTimeline, type PremadeTimeline } from "./timeline";
import { participantDerived } from "./timeline-player";
import type { ParticipantDerived } from "./types";

/** Timelines requested in parallel; each one is a heavy response. */
export const DEFAULT_TIMELINE_CONCURRENCY = 4;
/** Timelines per batch: the client calls again until `done`. */
export const DEFAULT_TIMELINES_PER_BATCH = 25;
/** How long one batch may hold the request. */
export const DEFAULT_BATCH_BUDGET_MS = 15_000;
/** A game answered with these is not retried: Riot has no timeline for it. */
const GIVE_UP_AFTER = 3;

export type TimelineCollectOutcome = "collected" | "notFound" | "noKey";

/**
 * O que conta como "esta partida ainda precisa de timeline".
 *
 * Duas coisas diferentes pedem releitura e as duas precisam valer:
 *
 * - **Sem timeline guardada** (ou guardada antes da migração 0010, sem mortes): a partida nunca foi
 *   lida, ou foi lida por uma versão que não gravava tudo.
 * - **Sem o derivado nos participantes** (`rebuild`): a leitura anterior não deixou esse campo.
 *
 * A regra antiga era um OU exclusivo: com `rebuild`, só a segunda condição contava. Uma partida podia
 * ter `derived` nos participantes e nenhuma timeline guardada — foi o que aconteceu com uma partida de
 * 05/11 — e o `rebuild` a considerava pronta. Ela virava invisível na aba Partidas, sem erro.
 */
export interface PendingInput {
  matchIds: string[];
  /** Sem timeline utilizável guardada. */
  needsReading: (matchId: string) => boolean;
  /** Partidas sem o derivado nos participantes (vazio quando não é rebuild). */
  missingDerived: Set<string>;
  rebuild: boolean;
  /** Tentativas que já falharam, por partida (opcional: sem isso, nada é descartado). */
  failureAttempts?: Map<string, number>;
  giveUpAfter?: number;
}

function isPending(matchId: string, input: PendingInput): boolean {
  return (
    input.needsReading(matchId) ||
    (input.rebuild && input.missingDerived.has(matchId))
  );
}

/** As partidas a ler neste lote, respeitando o teto e desistindo das que a Riot já recusou. */
export function selectPending(
  input: PendingInput & { cap: number; giveUpAfter: number; failureAttempts: Map<string, number> },
): string[] {
  return input.matchIds
    .filter((matchId) => isPending(matchId, input))
    // Uma partida com timeline guardada não desiste por falha: ela já tem dado, e o que falta é só
    // o derivado. Desistir da leitura deixaria o campo vazio para sempre.
    .filter((matchId) => {
      if (input.needsReading(matchId) && !input.rebuild) {
        return (input.failureAttempts.get(matchId) ?? 0) < input.giveUpAfter;
      }
      return true;
    })
    .slice(0, input.cap);
}

/** Quantas partidas continuam pendentes (o `remaining` que a tela mostra). */
export function countPending(input: PendingInput): number {
  return input.matchIds.filter((matchId) => isPending(matchId, input)).length;
}

export interface TimelineCollectStep {
  outcome: TimelineCollectOutcome;
  /** Timelines written by this batch. */
  saved: number;
  /** Games of the team already with a timeline, after this batch. */
  withTimeline: number;
  /** Collected games of the team. */
  total: number;
  /** Games still missing a timeline. */
  remaining: number;
  /** Games this batch skipped with the reason (404, remake, empty timeline). */
  failures: Record<string, number>;
  /** Calls this batch made to the timeline endpoint. */
  calls: number;
  done: boolean;
  budgetHit: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Token bucket: keeps the batch under the configured requests per second. */
function paced(requestsPerSecond: number) {
  const gap = 1000 / Math.max(1, requestsPerSecond);
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    if (wait > 0) await sleep(wait);
  };
}

/**
 * Maintains the timelines of the team's collected games. Idempotent by (team, match_id): a game
 * already stored is never requested again, so a click resumes where the previous one stopped.
 * `rebuild: true` also re-reads the timeline of every stored game once: the per-participant derived
 * data (build, skills, lane) is rebuilt from the same payloads, which is how a game stored before
 * those fields existed — or with a bug in them — is completed.
 */
export async function collectTimelines(
  teamId: string,
  options: { budgetMs?: number; maxTimelines?: number; rebuild?: boolean } = {},
): Promise<TimelineCollectStep> {
  const team = await getTeamById(teamId, { includeArchived: true });
  if (!team) return emptyStep("notFound");

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return emptyStep("noKey");

  const base = getRegionalUrl(team.region);
  const headers = { "X-Riot-Token": apiKey };
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BATCH_BUDGET_MS);
  const wait = paced(envNumber("PREMADE_REQUESTS_PER_SECOND", 10));
  const concurrency = envNumber(
    "PREMADE_TIMELINE_CONCURRENCY",
    DEFAULT_TIMELINE_CONCURRENCY,
  );
  const cap =
    options.maxTimelines ??
    envNumber("PREMADE_TIMELINES_PER_BATCH", DEFAULT_TIMELINES_PER_BATCH);

  const [matches, owners, have, failures] = await Promise.all([
    getTeamMatches(team.id),
    getAccountOwners(team.id),
    getTimelines(team.id),
    getTimelineFailures(team.id),
  ]);

  const stored = new Map(have.map((timeline) => [timeline.matchId, timeline]));
  // A timeline stored before migration 0010 has no deaths yet: it is read again, one call, so the
  // per-player breakdowns cover the same games as the rest of the timeline readings. With
  // `rebuild` the games whose participant rows still carry no derived data are read once more:
  // the batch always takes the first ones of that set, and each answer leaves it.
  const needsReading = (matchId: string) =>
    !stored.get(matchId)?.deaths?.length;
  const missingDerived =
    options.rebuild === true
      ? await getMatchesMissingDerived(team.id)
      : new Set<string>();
  const pendingIds = new Set(
    selectPending({
      matchIds: matches.map((match) => match.matchId),
      needsReading,
      missingDerived,
      rebuild: options.rebuild === true,
      failureAttempts: new Map(
        [...failures.entries()].map(([matchId, failure]) => [
          matchId,
          failure.attempts ?? 0,
        ]),
      ),
      giveUpAfter: GIVE_UP_AFTER,
      cap,
    }),
  );
  const pending = matches.filter((match) => pendingIds.has(match.matchId));

  const step: TimelineCollectStep = {
    outcome: "collected",
    saved: 0,
    withTimeline: stored.size,
    total: matches.length,
    remaining: countPending({
      matchIds: matches.map((match) => match.matchId),
      needsReading,
      missingDerived,
      rebuild: options.rebuild === true,
    }),
    failures: {},
    calls: 0,
    done: false,
    budgetHit: false,
  };

  const timelineFailures: {
    matchId: string;
    reason: string;
    status: number | null;
  }[] = [];
  const timelines: PremadeTimeline[] = [];
  /** Timeline data of every roster participant, by match: saved on the participant rows. */
  const byMatch = new Map<
    string,
    { puuid: string; derived: ParticipantDerived }[]
  >();

  await fetchInBatches(
    pending.map((match) => async () => {
      if (Date.now() >= deadline) return;
      await wait();
      step.calls += 1;
      try {
        const res = await safeFetch(
          `${base}/lol/match/v5/matches/${encodeURIComponent(match.matchId)}/timeline`,
          {
            headers,
            cache: "no-store",
          },
        );
        if (!res.ok) {
          // Unsupported for this game, unavailable, or the key ran out: never blocks the batch.
          const reason =
            res.status === 404
              ? "notFound"
              : res.status === 429
                ? "rateLimited"
                : `http${res.status}`;
          timelineFailures.push({
            matchId: match.matchId,
            reason,
            status: res.status,
          });
          return;
        }
        const payload = await res.json().catch(() => null);
        if (payload) {
          // Per participant: what they built, their skill order and the 10/15 minute lane numbers.
          byMatch.set(
            match.matchId,
            participantDerived(payload, {
              matchId: match.matchId,
              participants: match.participants.map((entry) => ({
                puuid: entry.puuid,
                teamPosition: entry.teamPosition,
              })),
              teamSide: match.teamSide,
            }),
          );
        }
        const parsed = toTimeline(payload, {
          matchId: match.matchId,
          teamSide: match.teamSide,
          owners,
          // Only the roster accounts the match itself counted, so a stranger never becomes a member.
          roster: new Set(
            match.participants.map((participant) => participant.puuid),
          ),
          duration: match.duration,
        });
        if ("error" in parsed) {
          timelineFailures.push({
            matchId: match.matchId,
            reason: parsed.error,
            status: res.status,
          });
          return;
        }
        timelines.push(parsed.timeline);
      } catch {
        timelineFailures.push({
          matchId: match.matchId,
          reason: "network",
          status: null,
        });
      }
    }),
    concurrency,
  );

  await saveTimelines(team.id, timelines, matches);
  await saveTimelineFailures(team.id, timelineFailures, failures);
  // Build order, skills and lane numbers go on the participant rows (migration 0010).
  await saveTimelineDerived(
    team.id,
    [...byMatch.entries()].flatMap(([matchId, entries]) =>
      entries.map((entry) => ({ matchId, ...entry })),
    ),
  );

  for (const failure of timelineFailures) {
    step.failures[failure.reason] = (step.failures[failure.reason] ?? 0) + 1;
  }
  step.saved = timelines.length;
  step.withTimeline = new Set([
    ...stored.keys(),
    ...timelines.map((timeline) => timeline.matchId),
  ]).size;
  // Only the games written leave the pending set: a timeline that could not be parsed stays pending,
  // and the batch resumes on it instead of moving its window forward.
  step.remaining =
    options.rebuild === true
      ? Math.max(0, step.remaining - timelines.length)
      : Math.max(
          0,
          step.remaining - timelines.length - timelineFailures.length,
        );
  step.budgetHit = Date.now() >= deadline || pending.length >= cap;
  step.done = step.remaining === 0;
  return step;
}

function emptyStep(outcome: TimelineCollectOutcome): TimelineCollectStep {
  return {
    outcome,
    saved: 0,
    withTimeline: 0,
    total: 0,
    remaining: 0,
    failures: {},
    calls: 0,
    done: outcome === "notFound",
    budgetHit: false,
  };
}
