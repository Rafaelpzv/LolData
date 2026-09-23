"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCw, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { normalizeRegion } from "@/lib/regions";
import { rankedQueueFromSlug } from "@/lib/queues";
import { PageShell } from "@/components/layout/page-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Reveal } from "@/components/motion/reveal";
import { CutoffSummary } from "./cutoff-summary";
import { RankingsPagination } from "./rankings-pagination";
import { RankingsTable, RankingsTableSkeleton } from "./rankings-table";
import { RankingsToolbar, rankingsHref } from "./rankings-toolbar";
import {
  ITEMS_PER_PAGE,
  SORT_KEYS,
  nextSort,
  parseSort,
  sortQuery,
  type Game,
  type RankingsSort,
  type SortKey,
} from "./types";
import { useRankings } from "./use-rankings";

interface RankingsViewProps {
  game: Game;
  /** Raw route params: normalized here so legacy casing ("soloduo", "br1") keeps working. */
  region: string;
  page: number;
  queueSlug?: string;
  /** Raw `?sort=` / `?dir=` query values. */
  sortParam?: string;
  dirParam?: string;
}

/** High elo leaderboard shared by /rankings/<queue>/<region>/<page> and /tft/rankings/<region>/<page>. */
export function RankingsView({ game, region: regionParam, page, queueSlug, sortParam, dirParam }: RankingsViewProps) {
  const t = useTranslations("rankings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const region = normalizeRegion(regionParam);
  const queue = rankedQueueFromSlug(queueSlug);
  const sort = parseSort(sortParam, dirParam);

  const rankings = useRankings({ game, region, queueType: queue.apiValue, page, sort });
  const { data, rows, isLoading, isSortingAll, error } = rankings;

  // The sort lives in the URL so reloads and shared links keep it; changing it goes back to page 1.
  const applySort = (next: RankingsSort) =>
    router.replace(rankingsHref(game, region, 1, queue) + sortQuery(next), { scroll: false });
  const onSort = (key: SortKey) => applySort(nextSort(sort, key));

  const retryButton = (
    <Button size="sm" onClick={rankings.retry}>
      <RotateCw aria-hidden />
      {tCommon("retry")}
    </Button>
  );

  return (
    <PageShell>
      <Reveal immediate>
        <RankingsToolbar game={game} region={region} queue={queue} />
      </Reveal>

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
                  <Link href={rankingsHref(game, region, 1, queue) + sortQuery(sort)}>
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
          <Reveal immediate delay={0.05}>
            <CutoffSummary cutoffs={data.cutoffs} cache={data.cache} />
          </Reveal>

          {error === "all" && (
            <Alert variant="destructive" title={t("error.sortTitle")} action={retryButton}>
              {t("error.description")}
            </Alert>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p role="status" className="text-xs text-muted-foreground empty:hidden">
              {isSortingAll
                ? t("sort.loadingAll")
                : sort
                  ? t("sort.sortedBy", {
                      column: t(`sort.column.${sort.key}`),
                      dir: sort.dir,
                      count: rankings.totalEntries,
                    })
                  : null}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
              <span className="shrink-0">{t("sort.label")}</span>
              <Select
                wrapperClassName="flex-1"
                value={sort ? `${sort.key}:${sort.dir}` : ""}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  applySort(parseSort(key, dir));
                }}
              >
                <option value="">{t("sort.ladder")}</option>
                {SORT_KEYS.flatMap((key) =>
                  (["desc", "asc"] as const).map((dir) => (
                    <option key={`${key}:${dir}`} value={`${key}:${dir}`}>
                      {t(dir === "desc" ? "sort.option.desc" : "sort.option.asc", { column: t(`sort.column.${key}`) })}
                    </option>
                  )),
                )}
              </Select>
            </label>
          </div>

          <RankingsTable
            game={game}
            region={region}
            rows={rows}
            names={data.summonerNames}
            cutoffs={data.cutoffs}
            challengerSeats={data.regionMode === "three-pages" ? 300 : 200}
            sort={sort}
            sorting={isSortingAll}
            onSort={onSort}
          />

          <RankingsPagination
            page={page}
            totalPages={rankings.totalPages}
            totalEntries={rankings.totalEntries}
            pageSize={ITEMS_PER_PAGE}
            hrefFor={(p) => rankingsHref(game, region, p, queue) + sortQuery(sort)}
          />
        </div>
      )}
    </PageShell>
  );
}
