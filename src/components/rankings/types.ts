import type { Game } from "@/lib/riot-id";

export type { Game };

export interface LeagueEntry {
  puuid: string;
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
  summonerId?: string;
}

export interface SummonerInfo {
  gameName: string;
  tagLine: string;
  profileIconId?: number | null;
}

/** Body of GET /api/rankings and GET /api/tft/rankings (only the fields the UI reads). */
export interface RankingData {
  entries: LeagueEntry[];
  queue: string;
  name: string;
  tier: string;
  summonerNames?: Record<string, SummonerInfo>;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalEntries: number;
    entriesPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  cutoffs?: {
    challenger?: { cutoffLP: number; cutoffPosition?: number } | null;
    grandmaster?: { cutoffLP: number } | null;
  };
  regionMode?: string;
  cache?: {
    isStale?: boolean;
    updatedAt?: string;
  };
}

/** Leaderboard entry with its ladder position (kept when the table is re-sorted). */
export interface RankedRow extends LeagueEntry {
  position: number;
}

/** Entries shown per page; also the page size requested from the API. */
export const ITEMS_PER_PAGE = 200;

/** True when the backend already resolved a real Riot ID (not a backfill placeholder). */
export function isNameReady(info: SummonerInfo | null | undefined): info is SummonerInfo {
  return Boolean(
    info?.gameName &&
      info.gameName !== "Unknown" &&
      info.gameName !== "Loading…" &&
      info.tagLine &&
      info.tagLine !== "???",
  );
}

export function allNamesReady(entries: LeagueEntry[], names: Record<string, SummonerInfo> | undefined): boolean {
  return entries.every((entry) => isNameReady(names?.[entry.puuid]));
}

export const SORT_KEYS = ["lp", "wins", "losses", "winrate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** Active table sort. `null` means the default ladder order. */
export type RankingsSort = { key: SortKey; dir: SortDir } | null;

/** Reads `?sort=wins&dir=asc`; unknown values fall back to the ladder order. */
export function parseSort(sort: unknown, dir: unknown): RankingsSort {
  const key = typeof sort === "string" ? sort.toLowerCase() : "";
  if (!(SORT_KEYS as readonly string[]).includes(key)) return null;
  return { key: key as SortKey, dir: dir === "asc" ? "asc" : "desc" };
}

/** Query string for a sort, including the leading "?" (empty for the ladder order). */
export function sortQuery(sort: RankingsSort): string {
  return sort ? `?sort=${sort.key}&dir=${sort.dir}` : "";
}

/** Header click cycle: off -> desc -> asc -> off. */
export function nextSort(current: RankingsSort, key: SortKey): RankingsSort {
  if (current?.key !== key) return { key, dir: "desc" };
  return current.dir === "desc" ? { key, dir: "asc" } : null;
}
