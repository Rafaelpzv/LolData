// Riot League-V4 entries -> one ranked queue per account. Pure: no Riot, no Next, no Supabase.
import { TIERS, toTier, type Tier } from "../tiers";

import type { AccountRank } from "./types";

/**
 * The queue the strip and the individual card show. Flex comes FIRST: a premade plays Flex, so that
 * is the rank that describes the account here. Solo/Duo is only the fallback when there is no Flex.
 */
export const RANKED_QUEUES = ["RANKED_FLEX_SR", "RANKED_SOLO_5x5"] as const;
export type RankedQueue = (typeof RANKED_QUEUES)[number];

/** One entry of `GET /lol/league/v4/entries/by-puuid/{puuid}`. The queue decides the order. */
export interface LeagueEntry {
  queueType?: string | null;
  tier?: string | null;
  rank?: string | null;
  leaguePoints?: number | null;
  wins?: number | null;
  losses?: number | null;
}

/** The ranked part of one account, as League-V4 answered it. */
export interface RankedSnapshot {
  queueType: RankedQueue | null;
  tier: Tier | null;
  division: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
}

/** One queue of a cached account: the queue it came from plus its numbers. */
export type RankQueueCache = RankedSnapshot;

/** The tier as stored ("EMERALD" or "emerald") on the shared type. */
export { toTier };

export const EMPTY_RANKED: RankedSnapshot = {
  queueType: null,
  tier: null,
  division: null,
  leaguePoints: null,
  wins: null,
  losses: null,
};

const TIER_ORDER: Record<Tier, number> = Object.fromEntries(
  TIERS.map((tier, index) => [tier, index]),
) as Record<Tier, number>;
const DIVISION_ORDER: Record<string, number> = { I: 4, II: 3, III: 2, IV: 1 };

function upper(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

/** "RANKED_SOLO_5x5" -> "rankedsolo5x5": letters and digits only, so the RU locale cannot split it. */
function key(value: unknown): string {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

/** The entry of one queue, or undefined when the account has no entry in it. */
function entryOf(
  list: LeagueEntry[],
  queue: RankedQueue,
): LeagueEntry | undefined {
  return list.filter((item) => key(item?.queueType) === key(queue))[0];
}

/**
 * Flexible first, Solo/Duo as the fallback. The tier is never used to choose: a Master Flex beats
 * an Emerald Solo because of the queue, not because of the numbers.
 */
export function pickRanked(
  entries: LeagueEntry[] | null | undefined,
  order: readonly RankedQueue[] = RANKED_QUEUES,
): RankedSnapshot {
  const list = Array.isArray(entries) ? entries : [];
  const queue = order.filter((name) => entryOf(list, name) !== undefined)[0];
  const entry = queue ? entryOf(list, queue) : undefined;
  const tier = entry ? upper(entry.tier).toLowerCase() : "";
  if (!queue || !entry || TIERS.filter((name) => name === tier).length === 0)
    return { ...EMPTY_RANKED };
  const division = upper(entry.rank) || null;
  const points = Number(entry.leaguePoints);
  return {
    queueType: queue,
    tier: tier as Tier,
    division: division && division in DIVISION_ORDER ? division : null,
    leaguePoints: Number.isFinite(points) ? points : null,
    wins: numberOrNull(entry.wins),
    losses: numberOrNull(entry.losses),
  };
}

/**
 * Which queue a person is shown with: Flex when any of their accounts has it, Solo only when nobody
 * does. One person, one queue, so the strip never compares a Flex account with a Solo one.
 */
export function personQueue(
  snapshots: readonly RankedSnapshot[],
): RankedQueue | null {
  return (
    RANKED_QUEUES.filter((queue) =>
      snapshots.some((rank) => rank.queueType === queue),
    )[0] ?? null
  );
}

/** True when the rank came from Flex: the queue the page names next to the elo. */
export function isFlex(queue: RankedQueue | null | undefined): boolean {
  return queue === "RANKED_FLEX_SR";
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed)
    ? parsed
    : null;
}

/**
 * Comparable position of a rank: tier, then division, then LP. Returns -1 for an account without a
 * rank, so any ranked account beats an unranked one. Only ranks of the same queue are compared.
 */
export function rankScore(
  rank: Pick<RankedSnapshot, "tier" | "division" | "leaguePoints"> | null,
): number {
  if (!rank || !rank.tier) return -1;
  const division = DIVISION_ORDER[rank.division ?? ""] ?? 4;
  const points = Math.max(0, rank.leaguePoints ?? 0);
  // A division is a whole tier step (400 LP); the comparison only needs the order to hold.
  return TIER_ORDER[rank.tier] * 10_000 + division * 1_000 + points;
}

/** True when the last Riot answer is still inside the interval: no new call is needed. */
export function isFresh(
  fetchedAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  return (
    fetchedAt !== null &&
    Number.isFinite(fetchedAt) &&
    now - fetchedAt < intervalMs
  );
}

/** One Riot sync may spend this long; the client calls it again for the accounts left. */
export const RANK_SYNC_BUDGET_MS = 8_000;
/** How often an account's icon, level and elo are fetched again: at most once per 6 h. */
export const RANK_REFRESH_MS = 6 * 60 * 60 * 1_000;
/**
 * Minimum age of a cached answer for a forced pass ("Update data"). Long enough that two passes next
 * to each other do not repeat the Riot calls, short enough that a click always reaches Riot.
 */
export const RANK_FORCE_REFRESH_MS = 5 * 60 * 1_000;
/** How long a failed account waits before it is tried again (it got no `fetched_at`). */
export const RANK_RETRY_AFTER_MS = 60 * 60 * 1_000;

/** How long to wait after a 429: Riot's Retry-After header, or one second by default. */
export function retryDelayMs(retryAfterHeader: string | null): number {
  const seconds = Number(retryAfterHeader);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds) * 1_000
    : 1_000;
}

/** Where the rank cache is read into the strip: by PUUID. */
export type AccountRanks = Readonly<Record<string, AccountRank | undefined>>;
