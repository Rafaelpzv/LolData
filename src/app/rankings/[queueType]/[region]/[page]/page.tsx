"use client";

import { use, useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card } from "@/app/components/ui/Card";

interface LeagueEntry {
  puuid: string;
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

interface CacheMeta {
  isFromCache: boolean;
  isStale: boolean;
  updatedAt: string;
  ageInMinutes: number;
  expiresInMinutes: number;
  ttlDays: number;
}

interface RankingData {
  entries: LeagueEntry[];
  queue: string;
  name: string;
  tier: string;
  summonerNames?: Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId: number | null;
    }
  >;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalEntries: number;
    entriesPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  cutoffs?: {
    challenger: { cutoffLP: number; cutoffPosition: number };
    grandmaster: { cutoffLP: number };
  };
  regionMode?: string;
  cache?: CacheMeta;
}

interface SummonerInfo {
  gameName: string;
  tagLine: string;
  profileIconId?: number | null;
}

interface LocalStorageRankingsEntry {
  data: RankingData;
  savedAt: number;
}

interface LocalStorageSummonerEntry {
  info: SummonerInfo;
  savedAt: number;
}

// Must match the server-side TTL (2 days)
const RANKINGS_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;
// Summoner names/icons can change â€” refresh daily
const SUMMONER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ITEMS_PER_PAGE = 200;

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readRankingsCache(key: string): RankingData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, savedAt }: LocalStorageRankingsEntry = JSON.parse(raw);
    if (Date.now() - savedAt > RANKINGS_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeRankingsCache(key: string, data: RankingData) {
  try {
    const entry: LocalStorageRankingsEntry = { data, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

function readSummonerCache(region: string): Record<string, SummonerInfo> {
  try {
    const raw = localStorage.getItem(`summonerCache_${region}`);
    if (!raw) return {};
    const parsed: Record<string, LocalStorageSummonerEntry> = JSON.parse(raw);
    const now = Date.now();
    const valid: Record<string, SummonerInfo> = {};
    for (const [puuid, entry] of Object.entries(parsed)) {
      const info = entry?.info;
      const isValid = Boolean(
        info?.gameName &&
          info.gameName !== "Unknown" &&
          info.gameName !== "Loadingâ€¦" &&
          info?.tagLine &&
          info.tagLine !== "???",
      );
      if (now - entry.savedAt <= SUMMONER_CACHE_TTL_MS && isValid) {
        valid[puuid] = info;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function writeSummonerCache(
  region: string,
  cache: Record<string, SummonerInfo>,
) {
  try {
    const now = Date.now();
    const withTimestamps: Record<string, LocalStorageSummonerEntry> = {};
    for (const [puuid, info] of Object.entries(cache)) {
      withTimestamps[puuid] = { info, savedAt: now };
    }
    localStorage.setItem(
      `summonerCache_${region}`,
      JSON.stringify(withTimestamps),
    );
  } catch {
    // ignore quota errors
  }
}
// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RankingsPage({
  params,
}: {
  params: Promise<{ queueType: string; region: string; page: string }>;
}) {
  const router = useRouter();

  const { queueType: queueTypeParam, region, page: pageParam } = use(params);

  const [rankings, setRankings] = useState<RankingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSortingAll, setIsSortingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summonerNames, setSummonerNames] = useState<
    Record<string, SummonerInfo>
  >({});
  const [sortByWinRate, setSortByWinRate] = useState(false);

  const currentPage = parseInt(pageParam) || 1;

  const queueTypeMap: Record<string, string> = {
    soloduo: "RANKED_SOLO_5x5",
    flex: "RANKED_FLEX_SR",
  };

  const queueType = queueTypeMap[queueTypeParam] || "RANKED_SOLO_5x5";
  const friendlyQueueType = queueTypeParam;

  const displayRegionMap: Record<string, string> = {
    BR1: "BR",
    NA1: "NA",
    LA1: "LAN",
    LA2: "LAS",
    EUW1: "EUW",
    EUN1: "EUNE",
    KR: "KR",
    JP1: "JP",
    OC1: "OCE",
    TR1: "TR",
    RU: "RU",
    TW2: "TW",
    VN2: "VN",
    SG2: "SG",
    ME1: "ME",
  };

  const queueDisplayNames: Record<string, string> = {
    soloDuo: "Solo/Duo",
    flex: "Flex",
  };

  const updateLocalSummonerCache = useCallback((newData: Record<string, SummonerInfo>) => {
    const current = readSummonerCache(region);
    writeSummonerCache(region, { ...current, ...newData });
  }, [region]);

  const fetchAllRankings = useCallback(async () => {
    try {
      setIsSortingAll(true);
      setError(null);

      const firstRes = await fetch(
        `/api/rankings?region=${region}&queueType=${queueType}&page=1&limit=${ITEMS_PER_PAGE}`,
      );
      if (!firstRes.ok) throw new Error("Failed to fetch first page");
      const firstData = await firstRes.json();

      const totalPages = firstData.pagination?.totalPages || 1;
      let allEntries = [...firstData.entries];
      let allSummonerNames = { ...(firstData.summonerNames ?? {}) };

      for (let page = 2; page <= totalPages; page++) {
        const res = await fetch(
          `/api/rankings?region=${region}&queueType=${queueType}&page=${page}&limit=${ITEMS_PER_PAGE}`,
        );
        if (!res.ok) throw new Error(`Failed to fetch page ${page}`);
        const data = await res.json();
        allEntries = allEntries.concat(data.entries);
        allSummonerNames = {
          ...allSummonerNames,
          ...(data.summonerNames ?? {}),
        };
        await new Promise((r) => setTimeout(r, 200));
      }

      const fullData: RankingData = {
        ...firstData,
        entries: allEntries,
        summonerNames: allSummonerNames,
        pagination: {
          ...firstData.pagination,
          totalEntries: allEntries.length,
          totalPages: Math.ceil(allEntries.length / ITEMS_PER_PAGE),
        },
      };

      setSummonerNames(allSummonerNames);
      updateLocalSummonerCache(allSummonerNames);
      setRankings(fullData);
    } catch (err) {
      console.error("[fetchAllRankings] Error:", err);
      setError("Failed to load all rankings for sorting");
    } finally {
      setIsSortingAll(false);
    }
  }, [region, queueType, updateLocalSummonerCache]);

  const fetchRankings = useCallback(
    async (pageToFetch: number = currentPage) => {
      try {
        setIsLoading(true);
        setError(null);

        if (typeof window !== "undefined") {
          const storageKey = `rankings_${region}_${queueType}_page_${pageToFetch}`;
          const cached = readRankingsCache(storageKey);
          if (cached) {
            const cachedEntries = cached.entries ?? [];
            const cachedNames = cached.summonerNames ?? {};
            const namesReady = cachedEntries.every((entry) => {
              const info = cachedNames[entry.puuid];
              return Boolean(
                info?.gameName &&
                  info.gameName !== "Unknown" &&
                  info.gameName !== "Loadingâ€¦" &&
                  info.tagLine &&
                  info.tagLine !== "???",
              );
            });

            if (namesReady) {
              setSummonerNames(cached.summonerNames ?? {});
              setRankings(cached);
              setIsLoading(false);
              return;
            }
          }
        }

        const response = await fetch(
          `/api/rankings?region=${region}&queueType=${queueType}&page=${pageToFetch}&limit=${ITEMS_PER_PAGE}`,
        );
        if (!response.ok) throw new Error("Failed to fetch rankings");

        const data: RankingData & {
          summonerNames?: Record<string, SummonerInfo>;
        } = await response.json();

        const namesReady = data.entries.every((entry) => {
          const info = data.summonerNames?.[entry.puuid];
          return Boolean(
            info?.gameName &&
              info.gameName !== "Unknown" &&
              info.gameName !== "Loadingâ€¦" &&
              info?.tagLine &&
              info.tagLine !== "???",
          );
        });

        if (!namesReady) {
          throw new Error("Ranking page returned before all 200 names were ready");
        }

        setSummonerNames(data.summonerNames ?? {});
        updateLocalSummonerCache(data.summonerNames ?? {});
        setRankings(data);

        if (typeof window !== "undefined") {
          const storageKey = `rankings_${region}_${queueType}_page_${pageToFetch}`;
          writeRankingsCache(storageKey, data);
        }
      } catch (err) {
        console.error("[fetchRankings] Error:", err);
        setError("Failed to load rankings");
      } finally {
        setIsLoading(false);
      }
    },
    [region, queueType, currentPage, updateLocalSummonerCache],
  );

  const getTier = useCallback(
    (entry: LeagueEntry, globalRank: number): string => {
      if (rankings?.cutoffs) {
        const { challenger, grandmaster } = rankings.cutoffs;
        if (entry.leaguePoints >= challenger.cutoffLP) return "Challenger";
        if (entry.leaguePoints >= grandmaster.cutoffLP) return "Grandmaster";
        return "Master";
      }

      const isThreePages = rankings?.regionMode === "three-pages";
      const challengerLimit = isThreePages ? 300 : 200;
      if (globalRank <= challengerLimit) return "Challenger";
      if (globalRank <= challengerLimit + 700) return "Grandmaster";
      return "Master";
    },
    [rankings],
  );

  const allSortedEntries = useMemo(() => {
    if (!rankings) return [];
    if (!sortByWinRate) return rankings.entries;
    return [...rankings.entries].sort((a, b) => {
      const wrA = a.wins / (a.wins + a.losses);
      const wrB = b.wins / (b.wins + b.losses);
      return wrB - wrA;
    });
  }, [rankings, sortByWinRate]);

  const totalPages = rankings?.pagination?.totalPages ?? 0;
  const totalEntries =
    rankings?.pagination?.totalEntries ?? rankings?.entries.length ?? 0;

  const paginatedEntries = useMemo(() => {
    if (!sortByWinRate) return allSortedEntries;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return allSortedEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [allSortedEntries, sortByWinRate, currentPage]);

  const pageNamesReady = useMemo(() => {
    if (paginatedEntries.length === 0) return false;
    return paginatedEntries.every((entry) => {
      const info = summonerNames[entry.puuid];
      return Boolean(
        info?.gameName &&
          info.gameName !== "Unknown" &&
          info.gameName !== "Loadingâ€¦" &&
          info?.tagLine &&
          info.tagLine !== "???",
      );
    });
  }, [paginatedEntries, summonerNames]);

  useEffect(() => {
    if (sortByWinRate) return;
    setRankings(null);
    setSummonerNames({});
    fetchRankings(currentPage);
  }, [region, queueType, currentPage, sortByWinRate, fetchRankings]);

  const handleWinRateSort = async () => {
    const newValue = !sortByWinRate;
    try {
      if (newValue) {
        const needsFullLoad =
          rankings && (rankings.pagination?.totalPages ?? 1) > 1;
        if (needsFullLoad) await fetchAllRankings();
      } else {
        setSortByWinRate(false);
        await fetchRankings(currentPage);
        return;
      }
      setSortByWinRate(newValue);
    } catch (err) {
      console.error(err);
      setIsSortingAll(false);
    }
  };

  const getTierIconUrl = (tier: string) =>
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;

  const navigateToPage = (page: number) =>
    router.push(`/rankings/${friendlyQueueType}/${region}/${page}`);

  const changeQueueType = (newQueueType: string) =>
    router.push(`/rankings/${newQueueType}/${region}/1`);

  const changeRegion = (newRegion: string) =>
    router.push(`/rankings/${friendlyQueueType}/${newRegion}/1`);

  const generatePageNumbers = (currentPage: number, totalPages: number) => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 4) pages.push("...");
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < totalPages - 3) pages.push("...");
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages;
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Challenger":
        return "text-yellow-400 font-bold";
      case "Grandmaster":
        return "text-red-400 font-semibold";
      case "Master":
        return "text-purple-400 font-medium";
      default:
        return "text-gray-400";
    }
  };

  const cutoffs = rankings?.cutoffs
    ? {
        challenger: rankings.cutoffs.challenger?.cutoffLP ?? null,
        grandmaster: rankings.cutoffs.grandmaster?.cutoffLP ?? null,
      }
    : { challenger: null, grandmaster: null };

  const lastUpdatedLabel = useMemo(() => {
    const updatedAt = rankings?.cache?.updatedAt;
    if (!updatedAt) return null;
    const date = new Date(updatedAt);
    const ageMin = rankings?.cache?.ageInMinutes ?? 0;
    if (ageMin < 60)
      return `Updated ${ageMin} minute${ageMin !== 1 ? "s" : ""} ago`;
    const ageHours = Math.floor(ageMin / 60);
    if (ageHours < 24)
      return `Updated ${ageHours} hour${ageHours !== 1 ? "s" : ""} ago`;
    return `Updated on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }, [rankings?.cache]);

  return (
    <div className="container p-4 mx-auto">
      <header role="banner" className="mb-4">
        <nav
          className="flex items-center justify-between"
          role="navigation"
          aria-label="Principal"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors border rounded-md bg-background border-input hover:bg-accent/50"
            aria-label="Back to home"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </Link>

          <h1 className="hidden text-2xl font-bold md:block">
            <div className="flex flex-col gap-2">
              <span>
                High Elo Rankings  •{" "}
                {region ? (displayRegionMap[region.toUpperCase()] || region.toUpperCase()) : "RegiÃ£o nÃ£o especificada"}{" "}
                â€“ {queueDisplayNames[friendlyQueueType] || friendlyQueueType}
              </span>
              {(cutoffs.challenger || cutoffs.grandmaster) && (
                <div className="flex items-center gap-4 text-base font-normal">
                  <span>Cutoff:</span>
                  {cutoffs.challenger && (
                    <div className="flex items-center gap-1.5">
                      <img
                        src={getTierIconUrl("Challenger")}
                        alt="Challenger"
                        width={24}
                        height={24}
                        className="inline-block"
                      />
                      <span className="font-semibold text-yellow-400">
                        {cutoffs.challenger} LP
                      </span>
                    </div>
                  )}
                  {cutoffs.grandmaster && (
                    <div className="flex items-center gap-1.5">
                      <img
                        src={getTierIconUrl("Grandmaster")}
                        alt="Grandmaster"
                        width={24}
                        height={24}
                        className="inline-block"
                      />
                      <span className="font-semibold text-red-400">
                        {cutoffs.grandmaster} LP
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </h1>

          <h2 className="flex flex-col gap-1 text-xs font-bold md:hidden">
            <span>
              Rankings{" "}
              {queueDisplayNames[friendlyQueueType] || friendlyQueueType}
            </span>
            {(cutoffs.challenger || cutoffs.grandmaster) && (
              <div className="flex items-center gap-2 text-xs font-normal">
                {cutoffs.challenger && (
                  <div className="flex items-center gap-1">
                    <img
                      src={getTierIconUrl("Challenger")}
                      alt="Challenger"
                      width={16}
                      height={16}
                      className="inline-block"
                    />
                    <span className="font-medium text-yellow-400">
                      {cutoffs.challenger} LP
                    </span>
                  </div>
                )}
                {cutoffs.grandmaster && (
                  <div className="flex items-center gap-1">
                    <img
                      src={getTierIconUrl("Grandmaster")}
                      alt="Grandmaster"
                      width={16}
                      height={16}
                      className="inline-block"
                    />
                    <span className="font-medium text-red-400">
                      {cutoffs.grandmaster} LP
                    </span>
                  </div>
                )}
              </div>
            )}
          </h2>

          <div
            className="flex items-center gap-2"
            role="navigation"
            aria-label="Filters"
          >
            <select
              value={region}
              onChange={(e) => changeRegion(e.target.value)}
              className="w-12 px-3 py-2 text-sm border rounded-md cursor-pointer border-input bg-background"
            >
             <optgroup label="Americas">
		  <option value="BR1">🇧🇷 – Brazil</option>
		  <option value="NA1">🇺🇸 – North America</option>
		  <option value="LA1">🇲🇽 – Latin America North</option>
		  <option value="LA2">🇦🇷 – Latin America South</option>
		</optgroup>
		<optgroup label="Europe">
		  <option value="EUW1">🇪🇸 – Western Europe</option>
		  <option value="EUN1">🇸🇪 – Northern &amp; Eastern Europe</option>
		  <option value="RU">🇷🇺 – Russia</option>
		  <option value="ME1">🇪🇬 – Middle East</option>
		  <option value="TR1">🇹🇷 – Turkey</option>
		</optgroup>
		<optgroup label="Asia">
		  <option value="KR">🇰🇷 – Korea</option>
		  <option value="JP1">🇯🇵 – Japan</option>
		</optgroup>
		<optgroup label="South Asia">
		  <option value="OC1">🇦🇺 – Oceania</option>
		  <option value="VN2">🇻🇳 – Vietnam</option>
		  <option value="TW2">🇹🇼 – Taiwan, HK & Macau</option>
		  <option value="SG2">🇸🇬 – Singapore</option>
		</optgroup>         
		</select>
            <select
              value={friendlyQueueType}
              onChange={(e) => changeQueueType(e.target.value)}
              className="px-3 py-2 text-sm border rounded-md cursor-pointer bg-background"
            >
              <option value="soloduo">Solo/Duo</option>
              <option value="flex">Flex</option>
            </select>
          </div>
        </nav>
      </header>

      <main role="main">
        {(isLoading || isSortingAll || (!pageNamesReady && rankings && paginatedEntries.length > 0)) && (
          <div className="py-8 text-center" role="status" aria-live="polite">
            <div
              className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {isSortingAll ? "Loading all players for sortingâ€¦" : "Loading rankings and summoner namesâ€¦"}
            </p>
          </div>
        )}

        {!isLoading && !isSortingAll && error && (
          <div className="py-8 text-center" role="alert">
            <Card className="p-4 mb-4 text-red-500">{error}</Card>
          </div>
        )}

        {!isLoading &&
          !isSortingAll &&
          pageNamesReady &&
          rankings &&
          paginatedEntries.length > 0 && (
            <div className="grid gap-4">
              <Card className="p-4">
                <table className="w-full mx-auto">
                  <thead>
                    <tr className="border-b">
                      <th className="hidden p-2 text-center sm:table-cell">
                        Rank
                      </th>
                      <th className="w-1/5 p-2 text-left sm:text-center sm:w-auto">
                        Name
                      </th>
                      <th className="p-2 text-center">Tier</th>
                      <th className="p-2 text-center">LP</th>
                      <th className="hidden p-2 text-center sm:table-cell">
                        Wins
                      </th>
                      <th className="hidden p-2 text-center sm:table-cell">
                        Losses
                      </th>
                      <th className="p-2 text-center">
                        <button
                          onClick={handleWinRateSort}
                          disabled={isSortingAll}
                          className="flex items-center justify-center w-full gap-1 transition-colors hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="hidden sm:inline">Win Rate</span>
                          <span className="inline sm:hidden">WR</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform ${sortByWinRate ? "rotate-180" : ""}`}
                          >
                            <path d="m7 15 5 5 5-5" />
                            <path d="m7 9 5-5 5 5" />
                          </svg>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEntries.map((entry, index) => {
                      const winRate = (
                        (entry.wins / (entry.wins + entry.losses)) *
                        100
                      ).toFixed(1);
                      const summonerInfo = summonerNames[entry.puuid];
                      const displayName = `${summonerInfo.gameName} #${summonerInfo.tagLine}`;

                      const globalRank =
                        (currentPage - 1) * ITEMS_PER_PAGE + index + 1;

                      const tier = getTier(entry, globalRank);

                      return (
                        <tr
                          key={entry.puuid}
                          className="border-b last:border-0"
                        >
                          <td className="hidden p-2 text-center sm:table-cell">
                            {globalRank}
                          </td>
                          <td className="w-1/3 p-2 sm:w-auto">
                            <div className="flex items-center min-w-0 gap-2">
                              {summonerInfo?.profileIconId != null && summonerInfo.profileIconId > 0 && (
                                <Image
                                  src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${summonerInfo.profileIconId}.jpg`}
                                  alt="Profile Icon"
                                  width={24}
                                  height={24}
                                  className="flex-shrink-0 object-cover border rounded-full border-zinc-700 sm:w-8 sm:h-8"
                                  unoptimized
                                  priority={index < 5}
                                  loading={index < 5 ? "eager" : "lazy"}
                                />
                              )}
                              <Link
                                href={
                                  summonerInfo
                                    ? `/lol/${region}/${summonerInfo.gameName}/${summonerInfo.tagLine}/all/all`
                                    : "#"
                                }
                                className="block min-w-0 truncate cursor-pointer hover:underline"
                              >
                                <span className="hidden sm:inline">
                                  {displayName}
                                </span>
                                <span className="block inline truncate sm:hidden">
                                  {summonerInfo.gameName}
                                </span>
                              </Link>
                            </div>
                          </td>
                          <td
                            className={`p-2 text-center ${getTierColor(tier)}`}
                          >
                            <div className="flex items-center justify-center gap-2">
                              <img
                                src={getTierIconUrl(tier)}
                                alt={`${tier} tier`}
                                width={20}
                                height={20}
                                className="inline-block"
                                loading={index < 5 ? "eager" : "lazy"}
                              />
                              <span className="hidden md:inline">{tier}</span>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            {entry.leaguePoints}
                            <span className="hidden sm:inline"> LP</span>
                          </td>
                          <td className="hidden p-2 text-center sm:table-cell">
                            {entry.wins}
                          </td>
                          <td className="hidden p-2 text-center sm:table-cell">
                            {entry.losses}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex flex-col sm:block">
                              <span className="inline text-xs text-gray-400 sm:hidden">
                                {entry.wins}W/{entry.losses}L
                              </span>
                              <span>{winRate}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-2 mt-4">
                  <div className="text-sm text-muted-foreground">
                    {`Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1}•${Math.min(
                      currentPage * ITEMS_PER_PAGE,
                      totalEntries,
                    )} of ${totalEntries}`}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          navigateToPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm border rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        â€¹
                      </button>

                      {generatePageNumbers(currentPage, totalPages).map(
                        (page, index) => (
                          <button
                            key={index}
                            onClick={() =>
                              typeof page === "number" && navigateToPage(page)
                            }
                            disabled={page === "..." || page === currentPage}
                            className={`px-3 py-1 text-sm border rounded-md ${
                              page === currentPage
                                ? "bg-primary text-primary-foreground border-primary"
                                : page === "..."
                                  ? "bg-background border-input cursor-default"
                                  : "bg-background hover:bg-accent border-input"
                            } ${page === "..." ? "cursor-default" : "cursor-pointer"}`}
                          >
                            {page}
                          </button>
                        ),
                      )}

                      <button
                        onClick={() =>
                          navigateToPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage >= totalPages}
                        className="px-3 py-1 text-sm border rounded-md bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        â€º
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
      </main>

      <footer
        role="contentinfo"
        className="mt-8 text-sm text-center text-muted-foreground"
      >
        {lastUpdatedLabel && (
          <p className="mb-1">
            <span
              className={
                rankings?.cache?.isStale ? "text-yellow-500" : "text-green-600"
              }
            >
              â—
            </span>{" "}
            {lastUpdatedLabel}
            {rankings?.cache?.isStale && (
              <span className="ml-1 text-yellow-500">(stale)</span>
            )}
          </p>
        )}
        <p>
          © {new Date().getFullYear()} LolData  • High Elo Rankings. Data
          provided by Riot Games API.
        </p>
      </footer>
    </div>
  );
}
