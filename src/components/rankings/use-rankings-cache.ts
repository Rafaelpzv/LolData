"use client";

import { useMemo } from "react";
import { isNameReady, type RankingData, type SummonerInfo } from "./types";

/** Summoner names/icons can change: refresh daily. */
const SUMMONER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RankingsCacheConfig {
  /** Page keys are `${pagePrefix}_page_${n}`. Keep in sync with keys already in users' browsers. */
  pagePrefix: string;
  /** Storage key for the per-region puuid -> Riot ID map. */
  summonerKey: string;
  /** Must match the server-side TTL. */
  ttlMs: number;
}

interface StoredPage {
  data: RankingData;
  savedAt: number;
}

interface StoredSummoner {
  info: SummonerInfo;
  savedAt: number;
}

function readPage(key: string, ttlMs: number): RankingData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, savedAt }: StoredPage = JSON.parse(raw);
    if (Date.now() - savedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writePage(key: string, data: RankingData) {
  try {
    const entry: StoredPage = { data, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

function readSummoners(key: string): Record<string, SummonerInfo> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: Record<string, StoredSummoner> = JSON.parse(raw);
    const now = Date.now();
    const valid: Record<string, SummonerInfo> = {};
    for (const [puuid, entry] of Object.entries(parsed)) {
      if (now - entry.savedAt <= SUMMONER_CACHE_TTL_MS && isNameReady(entry?.info)) {
        valid[puuid] = entry.info;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function mergeSummoners(key: string, names: Record<string, SummonerInfo>) {
  try {
    const now = Date.now();
    const merged: Record<string, StoredSummoner> = {};
    for (const [puuid, info] of Object.entries({ ...readSummoners(key), ...names })) {
      merged[puuid] = { info, savedAt: now };
    }
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // ignore quota errors
  }
}

/** localStorage caches for leaderboard pages and resolved summoner names. */
export function useRankingsCache({ pagePrefix, summonerKey, ttlMs }: RankingsCacheConfig) {
  return useMemo(
    () => ({
      readPage: (page: number) => readPage(`${pagePrefix}_page_${page}`, ttlMs),
      writePage: (page: number, data: RankingData) => writePage(`${pagePrefix}_page_${page}`, data),
      mergeSummoners: (names: Record<string, SummonerInfo>) => mergeSummoners(summonerKey, names),
    }),
    [pagePrefix, summonerKey, ttlMs],
  );
}
