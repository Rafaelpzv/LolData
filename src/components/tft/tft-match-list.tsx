"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { TftMatchRow } from "./tft-match-row";
import type { TftMatch } from "./types";

/** Only the first rows cascade in; the rest render plainly to keep long lists smooth. */
const STAGGERED_ROWS = 20;

interface TftMatchListProps {
  matches: TftMatch[];
  puuid: string;
  region: string;
  ddragonVersion: string | null;
  /** Server render time, used as the reference for relative dates. */
  now: number;
}

export function TftMatchList({ matches, puuid, region, ddragonVersion, now }: TftMatchListProps) {
  const t = useTranslations("tft");
  const tCommon = useTranslations("common");

  // Rows not in the server payload were appended by "load more" and rise in on mount.
  const initialIds = useMemo(() => new Set(matches.map((m) => m.metadata.match_id)), [matches]);
  const [loadedMatches, setLoadedMatches] = useState<TftMatch[]>(matches);
  const [start, setStart] = useState(matches.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(matches.length >= 10);
  const [loadError, setLoadError] = useState(false);

  const startRef = useRef(start);
  startRef.current = start;
  const loadingRef = useRef(false);
  const consecutiveEmptyRef = useRef(0);

  useEffect(() => {
    setLoadedMatches(matches);
    setStart(matches.length);
    startRef.current = matches.length;
    setHasMore(matches.length >= 10);
    consecutiveEmptyRef.current = 0;
    setLoadError(false);
  }, [matches]);

  /** `force` bypasses `hasMore` for a manual retry after repeated failures. */
  const fetchMoreMatches = useCallback(async (force = false) => {
    if (loadingRef.current || (!hasMore && !force)) return;

    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        region,
        puuid,
        start: startRef.current.toString(),
        count: "20",
      });

      const res = await fetch(`/api/tft/matches?${params.toString()}`);
      if (!res.ok) throw new Error("TFT matches API error");

      const json = await res.json();
      const newMatches: TftMatch[] = json.data || [];

      // Empty page with hasMore=true is a transient server error:
      // keep the button on the first time so the user can retry.
      if (newMatches.length === 0) {
        if (json.hasMore === false) {
          setHasMore(false);
          setLoadError(false);
        } else {
          consecutiveEmptyRef.current += 1;
          setLoadError(consecutiveEmptyRef.current >= 2);
          if (consecutiveEmptyRef.current >= 2) setHasMore(false);
        }
      } else {
        consecutiveEmptyRef.current = 0;
        setLoadError(false);
        setLoadedMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.metadata.match_id));
          const uniqueNew = newMatches.filter((m) => !existingIds.has(m.metadata.match_id));
          return [...prev, ...uniqueNew];
        });
        setStart((prev) => {
          const next = prev + newMatches.length;
          startRef.current = next;
          return next;
        });
        setHasMore(json.hasMore !== false && newMatches.length >= 10);
      }
    } catch (error) {
      console.error("Failed to load more TFT matches:", error);
      consecutiveEmptyRef.current += 1;
      setLoadError(true);
      if (consecutiveEmptyRef.current >= 2) setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, region, puuid]);

  const rows = useMemo(
    () =>
      loadedMatches.flatMap((match) => {
        const participant = match.info?.participants?.find((p) => p.puuid === puuid);
        return participant ? [{ match, participant }] : [];
      }),
    [loadedMatches, puuid],
  );

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const placements = rows.map((r) => r.participant.placement);
    return {
      average: placements.reduce((sum, p) => sum + p, 0) / placements.length,
      top4Rate: placements.filter((p) => p <= 4).length / placements.length,
      firsts: placements.filter((p) => p === 1).length,
    };
  }, [rows]);

  return (
    <Reveal as="section" delay={0.05} aria-labelledby="tft-match-history" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="tft-match-history" className="text-lg font-semibold tracking-tight text-foreground">
          {t("matchHistory")}
        </h2>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("lastGames", { count: rows.length })}</p>
        )}
      </div>

      {summary && (
        <Stagger role="group" aria-label={t("summary")} stagger={0.05} className="grid grid-cols-3 gap-2 sm:gap-3">
          <SummaryStat label={t("avgPlacement")} value={<AnimatedNumber value={summary.average} decimals={1} />} />
          <SummaryStat
            label={t("top4Rate")}
            value={<AnimatedNumber value={Math.round(summary.top4Rate * 100)} suffix="%" />}
          />
          <SummaryStat label={t("firsts")} value={<AnimatedNumber value={summary.firsts} />} />
        </Stagger>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Gamepad2} title={t("noMatches")} description={t("noMatchesHint")} />
        </Card>
      ) : (
        <Stagger as="ul" stagger={0.04} className="space-y-2">
          {rows.map(({ match, participant }, i) => {
            const row = (
              <TftMatchRow match={match} participant={participant} ddragonVersion={ddragonVersion} now={now} />
            );
            const key = match.metadata.match_id;
            if (i < STAGGERED_ROWS) return <StaggerItem as="li" key={key}>{row}</StaggerItem>;
            if (!initialIds.has(key)) return <Reveal as="li" immediate key={key}>{row}</Reveal>;
            return <li key={key}>{row}</li>;
          })}
        </Stagger>
      )}

      {loadError && (
        <Alert
          variant="destructive"
          title={t("loadMoreFailed")}
          action={
            <Button
              size="sm"
              loading={loadingMore}
              onClick={() => fetchMoreMatches(true)}
            >
              {tCommon("retry")}
            </Button>
          }
        />
      )}

      {hasMore && !loadError && rows.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button onClick={() => fetchMoreMatches()} loading={loadingMore}>
            {tCommon("loadMore")}
          </Button>
        </div>
      )}
    </Reveal>
  );
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <StaggerItem>
      <Card padding="md">
        <Stat label={label} value={value} size="lg" />
      </Card>
    </StaggerItem>
  );
}
