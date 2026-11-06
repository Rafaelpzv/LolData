// Collection runner: paginates each player's Flex history -> valid premade games -> Supabase.
import { fetchInBatches, getRegionalUrl, safeFetch } from "@/lib/riot/match-v5";

import { PREMADE_QUEUE_ID, collectMatchSamples } from "./collect";
import {
  getCollectedMatchIds,
  getMatchIdsNeedingChampionData,
  getTeamById,
  saveMatchSamples,
} from "./repository";

/** The list endpoint caps `count` at 100; that is also what Riot returns per page. */
export const PAGE_SIZE = 100;
/** Upper bound on how many pages a single player's history is walked (Riot ids caps `start`). */
export const MAX_PAGES_PER_PLAYER = 20;
/** Match details in parallel. Each one is a request against the key budget. */
export const DEFAULT_DETAIL_CONCURRENCY = 10;
/** Requests per second is not enforced by Riot beyond its own limits, but bursts are paced. */
export const DEFAULT_REQUESTS_PER_SECOND = 10;

export type CollectOutcome = "collected" | "notFound" | "noKey";

export interface CollectProgress {
  /** Account lists fetched so far (one per roster player). */
  listsDone: number;
  listsTotal: number;
  /** Candidate matches whose details were requested. */
  detailsDone: number;
  detailsTotal: number;
  /** Valid premade games written so far. */
  saved: number;
  found: number;
  skipped: number;
  done: boolean;
}

export interface CollectResult {
  outcome: CollectOutcome;
  found: number;
  saved: number;
  skipped: number;
  lists: number;
}

interface IdsResult {
  ids: string[];
  failed: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A small token bucket: keeps the whole run under the configured requests per second. */
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

/** Every page of one player's Flex history, newest first, up to `maxPages`. */
async function flexIds(
  base: string,
  puuid: string,
  headers: HeadersInit,
  maxPages: number,
  wait: () => Promise<void>,
): Promise<IdsResult> {
  const ids: string[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(
      `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
    );
    url.searchParams.set("queue", String(PREMADE_QUEUE_ID));
    url.searchParams.set("start", String(page * PAGE_SIZE));
    url.searchParams.set("count", String(PAGE_SIZE));

    await wait();
    const res = await safeFetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) return { ids, failed: page === 0 };
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body) || body.length === 0) break;
    ids.push(...(body as string[]));
    if (body.length < PAGE_SIZE) break;
  }
  return { ids: [...new Set(ids)], failed: false };
}

/**
 * Collects the premade games of a team. Only queue-440 games where at least three roster players
 * share a side count. Writes are idempotent by (team, matchId), and games already stored without
 * champion/lane data are fetched again so they get repaired.
 */
export async function collectTeamMatches(
  teamId: string,
  options: {
    maxDetails?: number;
    maxPages?: number;
    requestsPerSecond?: number;
    detailConcurrency?: number;
    onProgress?: (progress: CollectProgress) => void;
  } = {},
): Promise<CollectResult> {
  const team = await getTeamById(teamId, { includeArchived: true });
  if (!team)
    return { outcome: "notFound", found: 0, saved: 0, skipped: 0, lists: 0 };

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey)
    return { outcome: "noKey", found: 0, saved: 0, skipped: 0, lists: 0 };

  const headers = { "X-Riot-Token": apiKey };
  const base = getRegionalUrl(team.region);
  const wait = paced(
    options.requestsPerSecond ??
      Number(process.env.PREMADE_REQUESTS_PER_SECOND) ??
      DEFAULT_REQUESTS_PER_SECOND,
  );
  const maxPages =
    options.maxPages ??
    Number(process.env.PREMADE_MAX_PAGES) ??
    MAX_PAGES_PER_PLAYER;
  const concurrency =
    options.detailConcurrency ??
    Number(process.env.PREMADE_DETAIL_CONCURRENCY) ??
    DEFAULT_DETAIL_CONCURRENCY;
  // The whole roster counts for collection, even members archived from the current lineup.
  const puuids = team.members.map((member) => member.puuid);

  const progress: CollectProgress = {
    listsDone: 0,
    listsTotal: puuids.length,
    detailsDone: 0,
    detailsTotal: 0,
    saved: 0,
    found: 0,
    skipped: 0,
    done: false,
  };
  const report = () => options.onProgress?.({ ...progress });

  const lists: IdsResult[] = [];
  for (const puuid of puuids) {
    lists.push(await flexIds(base, puuid, headers, maxPages, wait));
    progress.listsDone += 1;
    report();
  }

  // Only games that appear in at least one player's list can hold the roster together.
  const union = new Set<string>();
  for (const list of lists) for (const id of list.ids) union.add(id);

  const stored = await getCollectedMatchIds(team.id);
  const wantsRepair = await getMatchIdsNeedingChampionData(team.id);
  // Newest first: lexicographic order of Riot match ids follows game order.
  const candidates = [...union]
    .filter((id) => !stored.has(id) || wantsRepair.has(id))
    .sort((a, b) => b.localeCompare(a));

  const cap = Math.min(
    candidates.length,
    options.maxDetails ?? candidates.length,
  );
  const wanted = candidates.slice(0, cap);
  progress.detailsTotal = wanted.length;
  report();

  const raw: unknown[] = [];
  await fetchInBatches(
    wanted.map((id) => async () => {
      await wait();
      const res = await safeFetch(
        `${base}/lol/match/v5/matches/${encodeURIComponent(id)}`,
        {
          headers,
          cache: "no-store",
        },
      );
      if (!res.ok) {
        progress.skipped += 1;
      } else {
        raw.push(await res.json().catch(() => null));
      }
      progress.detailsDone += 1;
      report();
    }),
    concurrency,
  );

  const samples = collectMatchSamples(raw, puuids);
  progress.found = samples.length;
  await saveMatchSamples(team.id, samples);
  progress.saved = samples.length;
  progress.done = true;
  report();

  return {
    outcome: "collected",
    found: samples.length,
    saved: samples.length,
    skipped: progress.skipped,
    lists: union.size,
  };
}
