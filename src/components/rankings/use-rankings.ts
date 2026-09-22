"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { winRate } from "@/lib/format";
import { useRankingsCache } from "./use-rankings-cache";
import { ITEMS_PER_PAGE, allNamesReady, type Game, type RankedRow, type RankingData } from "./types";

interface GameConfig {
  /** API query without `page`/`limit`. */
  query: (region: string, queueType: string) => string;
  pagePrefix: (region: string, queueType: string) => string;
  summonerKey: (region: string) => string;
  /** Must match the server-side TTL. */
  ttlMs: number;
}

const GAME_CONFIG: Record<Game, GameConfig> = {
  lol: {
    query: (region, queueType) => `/api/rankings?region=${region}&queueType=${queueType}`,
    pagePrefix: (region, queueType) => `rankings_${region}_${queueType}`,
    summonerKey: (region) => `summonerCache_${region}`,
    ttlMs: 2 * 24 * 60 * 60 * 1000,
  },
  tft: {
    query: (region) => `/api/tft/rankings?region=${region}`,
    pagePrefix: (region) => `tft_rankings_${region}`,
    summonerKey: (region) => `tftSummonerCache_${region}`,
    ttlMs: 10 * 60 * 1000,
  },
};

interface UseRankingsOptions {
  game: Game;
  /** Normalized platform code (BR1, EUW1...). */
  region: string;
  /** API queue value (RANKED_SOLO_5x5...). Ignored for TFT. */
  queueType: string;
  page: number;
}

export type RankingsError = "page" | "all";

function withPositions(entries: RankingData["entries"], offset: number): RankedRow[] {
  return entries.map((entry, i) => ({ ...entry, position: offset + i + 1 }));
}

/**
 * Loads one leaderboard page (localStorage first, then the API) and, on demand, every page so the
 * table can be sorted by win rate.
 */
export function useRankings({ game, region, queueType, page }: UseRankingsOptions) {
  const config = GAME_CONFIG[game];
  const query = config.query(region, queueType);
  const cache = useRankingsCache({
    pagePrefix: config.pagePrefix(region, queueType),
    summonerKey: config.summonerKey(region),
    ttlMs: config.ttlMs,
  });

  const [pageData, setPageData] = useState<RankingData | null>(null);
  const [allData, setAllData] = useState<RankingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSortingAll, setIsSortingAll] = useState(false);
  const [sortByWinRate, setSortByWinRate] = useState(false);
  const [error, setError] = useState<RankingsError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // A different leaderboard invalidates the full load used for sorting.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
    setAllData(null);
    setSortByWinRate(false);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPageData(null);

    // Cached pages are only trusted once every name was resolved by the backend backfill.
    const cached = cache.readPage(page);
    if (cached && allNamesReady(cached.entries ?? [], cached.summonerNames)) {
      setPageData(cached);
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${query}&page=${page}&limit=${ITEMS_PER_PAGE}`);
        if (!res.ok) throw new Error(`Failed to fetch rankings (${res.status})`);
        const data: RankingData = await res.json();
        if (cancelled) return;
        cache.mergeSummoners(data.summonerNames ?? {});
        if (allNamesReady(data.entries, data.summonerNames)) cache.writePage(page, data);
        setPageData(data);
      } catch (err) {
        if (cancelled) return;
        console.error("[useRankings] Error:", err);
        setError("page");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cache, query, page, reloadToken]);

  const fetchAll = useCallback(async (): Promise<RankingData> => {
    const fetchPage = async (n: number): Promise<RankingData> => {
      const res = await fetch(`${query}&page=${n}&limit=${ITEMS_PER_PAGE}`);
      if (!res.ok) throw new Error(`Failed to fetch page ${n}`);
      return res.json();
    };

    const first = await fetchPage(1);
    const totalPages = first.pagination?.totalPages || 1;
    let entries = [...first.entries];
    let summonerNames = { ...(first.summonerNames ?? {}) };

    for (let n = 2; n <= totalPages; n++) {
      const data = await fetchPage(n);
      entries = entries.concat(data.entries);
      summonerNames = { ...summonerNames, ...(data.summonerNames ?? {}) };
      await new Promise((r) => setTimeout(r, 200));
    }

    cache.mergeSummoners(summonerNames);
    return {
      ...first,
      entries,
      summonerNames,
      pagination: first.pagination && {
        ...first.pagination,
        totalEntries: entries.length,
        totalPages: Math.ceil(entries.length / ITEMS_PER_PAGE),
      },
    };
  }, [cache, query]);

  const toggleWinRateSort = useCallback(async () => {
    if (sortByWinRate) {
      setSortByWinRate(false);
      return;
    }
    const needsFullLoad = (pageData?.pagination?.totalPages ?? 1) > 1 && !allData;
    if (needsFullLoad) {
      const startedFor = query;
      setIsSortingAll(true);
      setError(null);
      try {
        const all = await fetchAll();
        // The user switched region/queue while pages were loading: drop the stale result.
        if (queryRef.current !== startedFor) return;
        setAllData(all);
      } catch (err) {
        if (queryRef.current !== startedFor) return;
        console.error("[useRankings] Error loading all pages:", err);
        setError("all");
        return;
      } finally {
        setIsSortingAll(false);
      }
    }
    setSortByWinRate(true);
  }, [sortByWinRate, pageData, allData, fetchAll, query]);

  const retry = useCallback(() => {
    if (error === "all") void toggleWinRateSort();
    else setReloadToken((n) => n + 1);
  }, [error, toggleWinRateSort]);

  // Win-rate sort reads the full leaderboard when it was loaded, otherwise just this page.
  const source = sortByWinRate && allData ? allData : pageData;

  const rows = useMemo<RankedRow[]>(() => {
    if (!source) return [];
    const isFull = source === allData;
    const ranked = withPositions(source.entries ?? [], isFull ? 0 : (page - 1) * ITEMS_PER_PAGE);
    if (!sortByWinRate) return ranked;
    const sorted = [...ranked].sort(
      (a, b) => (winRate(b.wins, b.losses) ?? -1) - (winRate(a.wins, a.losses) ?? -1),
    );
    if (!isFull) return sorted;
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [source, allData, sortByWinRate, page]);

  return {
    /** Cutoffs, names, cache metadata and pagination for what is on screen. */
    data: source,
    rows,
    totalEntries: source?.pagination?.totalEntries ?? source?.entries?.length ?? 0,
    totalPages: source?.pagination?.totalPages ?? 0,
    // Pages of the sorted full leaderboard are sliced locally: no page load to wait for.
    isLoading: isLoading && !(sortByWinRate && allData),
    isSortingAll,
    sortByWinRate,
    error,
    retry,
    toggleWinRateSort,
  };
}
