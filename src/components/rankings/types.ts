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
