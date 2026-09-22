"use client";

import Link from "next/link";
import { ArrowLeft, RotateCw, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { normalizeRegion } from "@/lib/regions";
import { rankedQueueFromSlug } from "@/lib/queues";
import { PageShell } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CutoffSummary } from "./cutoff-summary";
import { RankingsPagination } from "./rankings-pagination";
import { RankingsTable, RankingsTableSkeleton } from "./rankings-table";
import { RankingsToolbar, rankingsHref } from "./rankings-toolbar";
import { ITEMS_PER_PAGE, type Game } from "./types";
import { useRankings } from "./use-rankings";

interface RankingsViewProps {
  game: Game;
  /** Raw route params: normalized here so legacy casing ("soloduo", "br1") keeps working. */
  region: string;
  page: number;
  queueSlug?: string;
}

/** High elo leaderboard shared by /rankings/<queue>/<region>/<page> and /tft/rankings/<region>/<page>. */
export function RankingsView({ game, region: regionParam, page, queueSlug }: RankingsViewProps) {
  const t = useTranslations("rankings");
  const tCommon = useTranslations("common");
  const region = normalizeRegion(regionParam);
  const queue = rankedQueueFromSlug(queueSlug);

  const rankings = useRankings({ game, region, queueType: queue.apiValue, page });
  const { data, rows, isLoading, isSortingAll, sortByWinRate, error } = rankings;

  const retryButton = (
    <Button size="sm" onClick={rankings.retry}>
      <RotateCw aria-hidden />
      {tCommon("retry")}
    </Button>
  );

  return (
    <PageShell>
      <RankingsToolbar game={game} region={region} queue={queue} />

      {error === "page" ? (
        <Alert variant="destructive" title={t("error.title")} action={retryButton}>
          {t("error.description")}
        </Alert>
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <CutoffSummary cutoffs={undefined} loading />
          <RankingsTableSkeleton label={t("loading")} />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Trophy}
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              page > 1 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={rankingsHref(game, region, 1, queue)}>
                    <ArrowLeft aria-hidden />
                    {t("empty.firstPage")}
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <CutoffSummary cutoffs={data.cutoffs} cache={data.cache} />

          {error === "all" && (
            <Alert variant="destructive" title={t("error.sortTitle")} action={retryButton}>
              {t("error.description")}
            </Alert>
          )}
          {game === "lol" && (
            <p role="status" className="text-xs text-muted-foreground empty:hidden">
              {isSortingAll
                ? t("sort.loadingAll")
                : sortByWinRate
                  ? t("sort.sortedByWinRate", { count: rankings.totalEntries })
                  : null}
            </p>
          )}

          <RankingsTable
            game={game}
            region={region}
            rows={rows}
            names={data.summonerNames}
            cutoffs={data.cutoffs}
            challengerSeats={data.regionMode === "three-pages" ? 300 : 200}
            winRateSort={
              game === "lol"
                ? { active: sortByWinRate, loading: isSortingAll, onToggle: rankings.toggleWinRateSort }
                : undefined
            }
          />

          <RankingsPagination
            page={page}
            totalPages={rankings.totalPages}
            totalEntries={rankings.totalEntries}
            pageSize={ITEMS_PER_PAGE}
            hrefFor={(p) => rankingsHref(game, region, p, queue)}
          />
        </div>
      )}
    </PageShell>
  );
}
