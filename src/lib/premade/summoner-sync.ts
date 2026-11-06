// Riot calls for the lobby strip: Summoner-V4 (icon, level) and League-V4 (elo) per account, paced,
// with a 429 retry. Server-only: the page never calls it, the sync route does.
import { safeFetch } from "@/lib/riot/match-v5";

import { pickRanked, type LeagueEntry, type RankedSnapshot } from "./ranks";

/** Parallel requests per batch; the pace below keeps the whole batch under the key's limit. */
const CONCURRENCY = 2;
/** Requests per second against the Riot key (20/s over 2 minutes and 100/s over 2 s both hold). */
const REQUESTS_PER_SECOND = 10;
/** Retries after a 429 before giving up on the account. */
const RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function base(region: string): string {
  return `https://${region.toLowerCase()}.api.riotgames.com`;
}

function key(): string | null {
  return process.env.RIOT_API_KEY?.trim() || null;
}

/** Token bucket shared by the whole batch: no more than REQUESTS_PER_SECOND calls per second. */
function paced() {
  const gap = 1_000 / REQUESTS_PER_SECOND;
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    if (wait > 0) await sleep(wait);
  };
}

/** GET with the API key and a 429 retry that respects Retry-After. Null on any other failure. */
async function getJson<T>(
  url: string,
  pace: () => Promise<void>,
): Promise<T | null> {
  const token = key();
  if (!token) return null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    await pace();
    const res = await safeFetch(
      url,
      { headers: { "X-Riot-Token": token }, cache: "no-store" },
      1,
    );
    if (res.ok) return (await res.json().catch(() => null)) as T | null;
    if (res.status === 429) continue;
    return null;
  }
  return null;
}

export interface SummonerSnapshot {
  profileIconId: number | null;
  summonerLevel: number | null;
  gameName?: string | null;
  tagLine?: string | null;
}

/** Summoner-V4 by PUUID: the profile icon, the account level and the Riot ID. */
export async function fetchSummoner(
  region: string,
  puuid: string,
  pace: () => Promise<void>,
): Promise<SummonerSnapshot | null> {
  const data = await getJson<{
    profileIconId?: number;
    summonerLevel?: number;
    gameName?: string;
    tagLine?: string;
  }>(
    `${base(region)}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
    pace,
  );
  if (!data) return null;
  return {
    profileIconId: Number.isFinite(Number(data.profileIconId))
      ? Number(data.profileIconId)
      : null,
    summonerLevel: Number.isFinite(Number(data.summonerLevel))
      ? Number(data.summonerLevel)
      : null,
    gameName: data.gameName ?? null,
    tagLine: data.tagLine ?? null,
  };
}

/** League-V4 entries by PUUID, reduced to the queue the page shows (Flex first). */
export async function fetchRanked(
  region: string,
  puuid: string,
  pace: () => Promise<void>,
): Promise<RankedSnapshot | null> {
  const data = await getJson<LeagueEntry[]>(
    `${base(region)}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    pace,
  );
  if (!data) return null;
  return pickRanked(data);
}

/** Both queues of one account, from the same answer: one call, no extra request. */
export async function fetchRankedPair(
  region: string,
  puuid: string,
  pace: () => Promise<void>,
): Promise<{ flex: RankedSnapshot; solo: RankedSnapshot } | null> {
  const data = await getJson<LeagueEntry[]>(
    `${base(region)}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    pace,
  );
  if (!data) return null;
  return {
    flex: pickRanked(data, ["RANKED_FLEX_SR"]),
    solo: pickRanked(data, ["RANKED_SOLO_5x5"]),
  };
}

export interface AccountSnapshot {
  puuid: string;
  /** Riot ID the account answered with, when Summoner-V4 answered. */
  account?: { gameName: string; tagLine: string };
  summoner: SummonerSnapshot | null;
  /** The queue shown on the page: Flex when the account has it, Solo/Duo otherwise. */
  ranked: RankedSnapshot | null;
  /** Present when League-V4 answered: both queues are kept, which costs no extra call. */
  queues: { flex: RankedSnapshot; solo: RankedSnapshot } | null;
}

/**
 * Two calls per account (Summoner-V4 and League-V4), in small parallel batches. An account whose
 * calls failed keeps a null half, so the caller knows what to retry.
 */
export async function fetchAccountSnapshots(
  region: string,
  puuids: string[],
): Promise<AccountSnapshot[]> {
  if (!key() || puuids.length === 0) return [];
  const results: AccountSnapshot[] = [];
  for (let index = 0; index < puuids.length; index += CONCURRENCY) {
    const chunk = puuids.slice(index, index + CONCURRENCY);
    const pace = paced();
    results.push(
      ...(await Promise.all(
        chunk.map((puuid) => fetchAccount(region, puuid, pace)),
      )),
    );
  }
  return results;
}

/** One account: Summoner-V4 and League-V4, over a pace shared by the whole batch. */
export function fetchAccount(
  region: string,
  puuid: string,
  pace: () => Promise<void>,
): Promise<AccountSnapshot> {
  return Promise.all([
    fetchSummoner(region, puuid, pace),
    fetchRankedPair(region, puuid, pace),
  ]).then(([summoner, queues]) => ({
    puuid,
    account:
      summoner?.gameName && summoner.tagLine
        ? { gameName: summoner.gameName, tagLine: summoner.tagLine }
        : undefined,
    summoner,
    // The shown queue is chosen here, once: Flex first, Solo/Duo only as the fallback.
    ranked: queues
      ? pickRanked([...toEntry(queues.flex), ...toEntry(queues.solo)])
      : null,
    queues,
  }));
}

/** The snapshot back to the shape pickRanked reads, so the choice lives in one place. */
function toEntry(rank: RankedSnapshot): LeagueEntry[] {
  return rank.tier
    ? [
        {
          queueType: rank.queueType,
          tier: rank.tier,
          rank: rank.division,
          leaguePoints: rank.leaguePoints,
          wins: rank.wins,
          losses: rank.losses,
        },
      ]
    : [];
}

/** Pace of a single-account step (the sync route reads one account at a time). */
export function accountPace(): () => Promise<void> {
  return paced();
}
