"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { MATCH_QUEUES } from "@/lib/queues";
import { profileHref } from "@/lib/riot-id";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchCard } from "./match-card";
import { MatchListSkeleton } from "./match-card-skeleton";
import { MATCH_STATS_EVENT, type MatchStatsDetail } from "./match-stats-text";
import type { LolMatch, QueueType } from "./types";
import { useDdragon } from "./use-ddragon";
import { WinrateCard } from "./winrate-card";

interface MatchHistoryProps {
  initialMatches: LolMatch[];
  puuid: string;
  queueTypes: QueueType[];
  region: string;
  /** Queue id filter ("all", "420"...). */
  queueId: string;
  /** Champion id filter, or null. */
  championId: string | null;
  gameName: string;
  tagLine: string;
}

/** Match list with win rate chart and "load more" pagination through /api/summoner/matches. */
export function MatchHistory({
  initialMatches,
  puuid,
  queueTypes,
  region,
  queueId,
  championId,
  gameName,
  tagLine,
}: MatchHistoryProps) {
  const t = useTranslations("matches");
  const tQueues = useTranslations("queues");
  const tCommon = useTranslations("common");
  const ddragon = useDdragon();

  const [matches, setMatches] = useState<LolMatch[]>(initialMatches);
  const [initialCount, setInitialCount] = useState(initialMatches.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMatches.length >= 10);
  const [loadError, setLoadError] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const consecutiveEmptyRef = useRef(0);
  // Refs so the pagination callback always reads current values (no stale closures; see git history).
  const startRef = useRef(initialMatches.length);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const latestInitialRef = useRef(initialMatches);
  latestInitialRef.current = initialMatches;

  // Reset the list only when the filter actually changes (not on every new array reference).
  const filterKey = `${region}||${puuid}||${queueId}||${championId ?? ""}`;
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    abortControllerRef.current?.abort();
    const fresh = latestInitialRef.current;
    setMatches(fresh);
    setInitialCount(fresh.length);
    startRef.current = fresh.length;
    setHasMore(fresh.length >= 10);
    consecutiveEmptyRef.current = 0;
    setLoadError(false);
  }, [filterKey]);

  // Broadcast wins/losses so the header summary follows the loaded list.
  useEffect(() => {
    const wins = matches.filter((m) => m.info?.participants?.find((p) => p.puuid === puuid)?.win === true).length;
    const detail: MatchStatsDetail = { wins, losses: matches.length - wins };
    window.dispatchEvent(new CustomEvent(MATCH_STATS_EVENT, { detail }));
  }, [matches, puuid]);

  const fetchMoreMatches = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const params = new URLSearchParams({
        region,
        puuid,
        start: String(startRef.current),
        count: "20",
        gameName,
        tagLine,
      });
      if (queueId !== "all") params.append("queueId", queueId);
      if (championId) params.append("championId", championId);

      const res = await fetch(`/api/summoner/matches?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Match API error ${res.status}`);

      const json = await res.json();
      const newMatches: LolMatch[] = json.data || [];

      if (newMatches.length === 0) {
        if (json.hasMore === false) {
          setHasMore(false);
        } else {
          // An empty page with hasMore is usually transient (empty cache page): allow one retry.
          consecutiveEmptyRef.current += 1;
          setLoadError(consecutiveEmptyRef.current >= 2);
          if (consecutiveEmptyRef.current >= 2) setHasMore(false);
        }
      } else {
        consecutiveEmptyRef.current = 0;
        setLoadError(false);
        setMatches((prev) => {
          const existing = new Set(prev.map((m) => m.metadata.matchId));
          return [...prev, ...newMatches.filter((m) => !existing.has(m.metadata.matchId))];
        });
        startRef.current += newMatches.length;
        setHasMore(json.hasMore !== false && newMatches.length >= 10);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Error loading more matches:", error);
        consecutiveEmptyRef.current += 1;
        setLoadError(true);
        // Keep the button on network/5xx errors; stop after 2 consecutive failures.
        if (consecutiveEmptyRef.current >= 2) setHasMore(false);
      }
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [region, puuid, queueId, championId, gameName, tagLine]);

  const retry = () => {
    consecutiveEmptyRef.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
    setLoadError(false);
    fetchMoreMatches();
  };

  const queueLabel = (match: LolMatch) => {
    const known = MATCH_QUEUES.find((q) => q.id === String(match.info.queueId));
    if (known) return tQueues(known.labelKey as "all");
    return queueTypes.find((q) => q.queueId === match.info.queueId)?.description ?? match.info.gameMode;
  };

  if (matches.length === 0) {
    const filtered = queueId !== "all" || championId !== null;
    return (
      <Card>
        <EmptyState
        icon={SearchX}
        title={t("empty")}
        description={filtered ? t("emptyHint") : t("emptyHintNoFilters")}
        action={
          filtered && (
            <Button asChild size="sm">
              <Link href={profileHref("lol", region, gameName, tagLine)} scroll={false}>
                {t("resetFilters")}
              </Link>
            </Button>
          )
        }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <WinrateCard matches={matches} puuid={puuid} mode="lol" />

      <ol className="space-y-2">
        {matches.map((match, i) => {
          const participant = match.info?.participants?.find((p) => p.puuid === puuid);
          if (!participant) return null;
          return (
            <li key={match.metadata.matchId}>
              <MatchCard
                match={match}
                participant={participant}
                queueLabel={queueLabel(match)}
                region={region}
                ddragon={ddragon}
                className={i >= initialCount ? "motion-safe:animate-fade-in" : undefined}
              />
            </li>
          );
        })}
      </ol>

      {loadingMore && <MatchListSkeleton count={2} label={t("loading")} />}

      {loadError && !loadingMore && (
        <Alert
          variant="destructive"
          title={t("loadMoreFailed")}
          action={
            <Button size="sm" onClick={retry}>
              {tCommon("retry")}
            </Button>
          }
        />
      )}

      {hasMore && !loadError && (
        <div className="flex justify-center pt-2">
          <Button onClick={fetchMoreMatches} loading={loadingMore}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
