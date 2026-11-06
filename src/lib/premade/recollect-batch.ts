// Re-collection of the games already stored: the fields added in migration 0010 only exist in
// Match-V5, so every old game needs one Riot call. Idempotent by (team, match): a game whose
// participants already carry the fields is never fetched again, so a click resumes where the last
// one stopped and the games Riot does not answer are recorded and skipped after a few attempts.
import { fetchInBatches, getRegionalUrl, safeFetch } from "@/lib/riot/match-v5";

import { MIN_PEOPLE_FLOOR, collectMatchSamples } from "./collect";
import {
  getAccountOwners,
  getCollectFailures,
  getMatchIdsNeedingFields,
  getTeamById,
  getTeamMatches,
  markPingsSaved,
  saveCollectFailures,
  saveMatchSamples,
  saveParticipantPings,
} from "./repository";

/** Match details in parallel: Riot answers a detail in a few hundred milliseconds. */
export const DEFAULT_RECOLLECT_CONCURRENCY = 6;
/** Games fetched per batch: the client calls again until `done`. */
export const DEFAULT_RECOLLECT_PER_BATCH = 60;
/** How long one batch may hold the request. */
export const DEFAULT_BATCH_BUDGET_MS = 20_000;
/** A game Riot answered with an error is retried this many times, then skipped for good. */
const GIVE_UP_AFTER = 3;

export type RecollectOutcome = "collected" | "notFound" | "noKey";

export interface RecollectStep {
  outcome: RecollectOutcome;
  /** Games re-read from Riot by this batch. */
  saved: number;
  /** Stored games of the team. */
  total: number;
  /** Stored games whose participants still have no depth fields, after this batch. */
  remaining: number;
  /** Games of this batch Riot did not answer, by reason. */
  failures: Record<string, number>;
  /** Calls this batch made to the match endpoint (one per game). */
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
 * One re-collection step. Only the games that still miss the new fields cost a request; the rest
 * are already complete.
 */
export async function recollectFields(
  teamId: string,
  options: { budgetMs?: number; maxMatches?: number } = {},
): Promise<RecollectStep> {
  const team = await getTeamById(teamId, { includeArchived: true });
  if (!team) return emptyStep("notFound");

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return emptyStep("noKey");

  const base = getRegionalUrl(team.region);
  const headers = { "X-Riot-Token": apiKey };
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BATCH_BUDGET_MS);
  const wait = paced(envNumber("PREMADE_REQUESTS_PER_SECOND", 10));
  const concurrency = envNumber(
    "PREMADE_RECOLLECT_CONCURRENCY",
    DEFAULT_RECOLLECT_CONCURRENCY,
  );
  const cap =
    options.maxMatches ??
    envNumber("PREMADE_RECOLLECT_PER_BATCH", DEFAULT_RECOLLECT_PER_BATCH);

  const [matches, owners, needing, failures] = await Promise.all([
    getTeamMatches(team.id),
    getAccountOwners(team.id),
    getMatchIdsNeedingFields(team.id),
    getCollectFailures(team.id),
  ]);
  // Every account in the stored games: an archived person's games still belong to the history.
  const teamPuuids = [
    ...new Set(
      matches.flatMap((match) =>
        match.participants.map((participant) => participant.puuid),
      ),
    ),
  ];

  const pending = matches
    .filter((match) => needing.has(match.matchId))
    .filter(
      (match) => (failures.get(match.matchId)?.attempts ?? 0) < GIVE_UP_AFTER,
    )
    .slice(0, cap);

  const step: RecollectStep = {
    outcome: "collected",
    saved: 0,
    total: matches.length,
    remaining: needing.size,
    failures: {},
    calls: 0,
    done: false,
    budgetHit: false,
  };

  const batchFailures: {
    matchId: string;
    reason: string;
    status: number | null;
  }[] = [];
  const raw: unknown[] = [];

  await fetchInBatches(
    pending.map((match) => async () => {
      if (Date.now() >= deadline) return;
      await wait();
      step.calls += 1;
      try {
        const res = await safeFetch(
          `${base}/lol/match/v5/matches/${encodeURIComponent(match.matchId)}`,
          {
            headers,
            cache: "no-store",
          },
        );
        if (!res.ok) {
          batchFailures.push({
            matchId: match.matchId,
            reason:
              res.status === 404
                ? "notFound"
                : res.status === 429
                  ? "rateLimited"
                  : `http${res.status}`,
            status: res.status,
          });
          return;
        }
        raw.push(await res.json().catch(() => null));
      } catch {
        batchFailures.push({
          matchId: match.matchId,
          reason: "network",
          status: null,
        });
      }
    }),
    concurrency,
  );

  // Stored again with the same rule: the fields come along, the win/loss and the side stay right.
  const samples = collectMatchSamples(
    raw,
    teamPuuids,
    MIN_PEOPLE_FLOOR,
    owners,
  );
  await saveMatchSamples(team.id, samples);
  // Only the pings are written on participant rows that already exist (no row is inserted here):
  // the games stored before the field existed keep their row and gain the counters.
  await saveParticipantPings(team.id, samples);
  await markPingsSaved(
    team.id,
    samples.map((sample) => sample.matchId),
  );
  await saveCollectFailures(team.id, batchFailures, failures);

  for (const failure of batchFailures)
    step.failures[failure.reason] = (step.failures[failure.reason] ?? 0) + 1;
  step.saved = samples.length;
  // A game Riot answered but could not be stored stays pending: only the ones that answered are done.
  const answered = new Set(samples.map((sample) => sample.matchId));
  step.remaining = Math.max(
    0,
    needing.size - answered.size - batchFailures.length,
  );
  step.budgetHit = Date.now() >= deadline || pending.length >= cap;
  step.done = step.remaining === 0 || pending.length === 0;
  return step;
}

function emptyStep(outcome: RecollectOutcome): RecollectStep {
  return {
    outcome,
    saved: 0,
    total: 0,
    remaining: 0,
    failures: {},
    calls: 0,
    done: outcome === "notFound",
    budgetHit: false,
  };
}
