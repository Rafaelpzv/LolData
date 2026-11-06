"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { winRate } from "@/lib/format";
import { useRankingsCache } from "./use-rankings-cache";
import { ITEMS_PER_PAGE, allNamesReady, type Game, type RankedRow, type RankingData, type RankingsSort, type SortDir, type SortKey } from "./types";

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
  sort: RankingsSort;
}

export type RankingsError = "page" | "all";

function sortValue(row: RankedRow, key: SortKey): number | null {
  if (key === "lp") return row.leaguePoints;
  if (key === "wins") return row.wins;
  if (key === "losses") return row.losses;
  return winRate(row.wins, row.losses);
}

/** Players without games sort last either way; ties fall back to LP (desc), then ladder position. */
function compareRows(key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: RankedRow, b: RankedRow) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null || vb == null) {
      if (va != null) return -1;
      if (vb != null) return 1;
    } else if (va !== vb) {
      return (va - vb) * sign;
    }
    return b.leaguePoints - a.leaguePoints || a.position - b.position;
  };
}

function withPositions(entries: RankingData["entries"], offset: number): RankedRow[] {
  return entries.map((entry, i) => ({ ...entry, position: offset + i + 1 }));
}

/**
 * Loads one leaderboard page (localStorage first, then the API) and, on demand, every page so the
 * table can be sorted by any column across the whole leaderboard.
 */
export function useRankings({ game, region, queueType, page, sort }: UseRankingsOptions) {
  const config = GAME_CONFIG[game];
  const query = config.query(region, queueType);
  const cache = useRankingsCache({
    pagePrefix: config.pagePrefix(region, queueType),
    summonerKey: config.summonerKey(region),
    ttlMs: config.ttlMs,
  });

  const [pageData, setPageData] = useState<RankingData | null>(null);
  const [allData, setAllData] = useState<RankingData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [allReloadToken, setAllReloadToken] = useState(0);
  const [allErrorKey, setAllErrorKey] = useState<string | null>(null);

  // "Which leaderboard do the data on screen belong to" is state, and the loading flag is derived
  // from it: nothing is set synchronously at the top of the effect, which is what React warns about.
  const requestKey = `${query}|${page}|${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // A different leaderboard invalidates the full load used for sorting. Keyed, so it resets during
  // the render instead of in an effect (a synchronous setState in an effect renders twice).
  const [allDataKey, setAllDataKey] = useState(requestKey);
  if (allDataKey !== requestKey) {
    setAllDataKey(requestKey);
    setAllData(null);
    setAllErrorKey(null);
  }

  // A cached page is read during the render: it is an external store (localStorage), which is the
  // documented case for reading state while rendering. Trusting it needs a finished backfill.
  // `requestKey` carries the retry token, so a retry re-reads the cache instead of serving it.
  const [, cacheEpoch] = requestKey.split("|");
  const cachedPage = useMemo(() => {
    void cacheEpoch;
    const cached = cache.readPage(page);
    return cached && allNamesReady(cached.entries ?? [], cached.summonerNames)
      ? cached
      : null;
  }, [cache, page, cacheEpoch]);

  useEffect(() => {
    let cancelled = false;

    // A trusted cache needs no network call at all: `pageData` below already serves it during the
    // render, so this effect only fetches when there is nothing trustworthy on disk.
    if (cachedPage) return;

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
        setErrorKey(requestKey);
      } finally {
        if (!cancelled) setLoadedKey(requestKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cache, query, page, reloadToken, requestKey, cachedPage]);

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

  /** What is on screen: the trusted cache for this request, otherwise what the fetch returned. */
  const currentPage = cachedPage ?? pageData;

  // Any sort orders the whole leaderboard, so every page is loaded once per leaderboard.
  const needsFullLoad = sort != null && !allData && (currentPage?.pagination?.totalPages ?? 1) > 1;  useEffect(() => {
    if (!needsFullLoad) return;
    let cancelled = false;
    fetchAll()
      .then((all) => {
        if (!cancelled) setAllData(all);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useRankings] Error loading all pages:", err);
        setAllErrorKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFullLoad, fetchAll, allReloadToken, requestKey]);

  // The flags the hook returns are derived, never written by the effects above mid-render.
  // A retry clears the previous error in the click handler, not inside the effect.
  const pending = !cachedPage && loadedKey !== requestKey;
  const error: RankingsError | null =
    errorKey === requestKey ? "page" : allErrorKey === requestKey ? "all" : null;
  const isLoading = pending;
  const isSortingAllNow = needsFullLoad && allErrorKey !== requestKey;

  const retry = useCallback(() => {
    if (error === "all") {
      setAllErrorKey(null);
      setAllReloadToken((n) => n + 1);
    } else {
      setErrorKey(null);
      setReloadToken((n) => n + 1);
    }
  }, [error]);

  // Sorting reads the full leaderboard once it is loaded, otherwise just this page.
  const source = sort && allData ? allData : currentPage;

  const rows = useMemo<RankedRow[]>(() => {
    if (!source) return [];
    const isFull = source === allData;
    const ranked = withPositions(source.entries ?? [], isFull ? 0 : (page - 1) * ITEMS_PER_PAGE);
    if (!sort) return ranked;
    const sorted = [...ranked].sort(compareRows(sort.key, sort.dir));
    if (!isFull) return sorted;
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [source, allData, sort, page]);

  return {
    /** Cutoffs, names, cache metadata and pagination for what is on screen. */
    data: source,
    rows,
    totalEntries: source?.pagination?.totalEntries ?? source?.entries?.length ?? 0,
    totalPages: source?.pagination?.totalPages ?? 0,
    // Pages of the sorted full leaderboard are sliced locally: no page load to wait for.
    isLoading: isLoading && !(sort && allData),
    isSortingAll: isSortingAllNow,
    error,
    retry,
  };
}
