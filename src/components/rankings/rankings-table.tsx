"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { profileIconUrl } from "@/lib/cdn";
import { TierCrest } from "@/components/ui/tier-crest";
import { winRate } from "@/lib/format";
import { profileHref } from "@/lib/riot-id";
import { apexTierFor, tierTextClass } from "@/lib/tiers";
import { SPRING, riseVariants } from "@/lib/motion";
import { focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tip } from "@/components/ui/tooltip";
import { Stagger } from "@/components/motion/reveal";
import {
  isNameReady,
  nextSort,
  type Game,
  type RankedRow,
  type RankingData,
  type RankingsSort,
  type SortKey,
  type SummonerInfo,
} from "./types";

// Tighter gutters on phones so five columns fit without horizontal scroll.
const pad = "px-2 sm:px-3";
/** Only the first rows cascade in; the rest render plainly to keep long pages smooth. */
const CASCADE_ROWS = 25;

interface RankingsTableProps {
  game: Game;
  region: string;
  rows: RankedRow[];
  names: Record<string, SummonerInfo> | undefined;
  cutoffs: RankingData["cutoffs"];
  /** Challenger seats used when the API sends no LP cutoffs. */
  challengerSeats: number;
  sort: RankingsSort;
  /** True while every page is loading for the active sort. */
  sorting: boolean;
  onSort: (key: SortKey) => void;
}

export function RankingsTable({
  game,
  region,
  rows,
  names,
  cutoffs,
  challengerSeats,
  sort,
  sorting,
  onSort,
}: RankingsTableProps) {
  const t = useTranslations("rankings");
  const tTiers = useTranslations("tiers");
  const format = useFormatter();
  const headProps = { sort, sorting, onSort };

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(pad, "w-12")}>
              <span aria-hidden>{t("columns.position")}</span>
              <span className="sr-only">{t("columns.positionLabel")}</span>
            </TableHead>
            <TableHead className={pad}>{t("columns.player")}</TableHead>
            <TableHead className={pad}>{t("columns.tier")}</TableHead>
            <SortHead column="lp" label={t("columns.lp")} {...headProps} />
            <SortHead column="wins" label={t("columns.wins")} className="hidden sm:table-cell" {...headProps} />
            <SortHead column="losses" label={t("columns.losses")} className="hidden sm:table-cell" {...headProps} />
            <SortHead column="winrate" label={<WinRateLabel />} {...headProps} />
          </TableRow>
        </TableHeader>
        <Stagger as="tbody" immediate stagger={0.03} className="[&_tr:last-child]:border-0">
          {rows.map((row, index) => {
            const info = names?.[row.puuid];
            const tier = apexTierFor(row.leaguePoints, row.position, cutoffs, challengerSeats);
            const wr = winRate(row.wins, row.losses);
            const tierName = tTiers(tier);

            return (
              <motion.tr
                key={row.puuid}
                layout="position"
                transition={SPRING.soft}
                variants={index < CASCADE_ROWS ? riseVariants : undefined}
                className="group border-b border-border/50 transition-colors duration-fast hover:bg-accent/30"
              >
                <TableCell className={cn(pad, "num text-muted-foreground")}>{format.number(row.position)}</TableCell>
                <TableCell className={cn(pad, "w-full max-w-0")}>
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <IconFrame
                      src={profileIconUrl(info?.profileIconId)}
                      alt=""
                      size="sm"
                      shape="circle"
                      priority={index < 5}
                      unoptimized
                      imageClassName="transition-transform duration-fast group-hover:scale-105"
                    />
                    {isNameReady(info) ? (
                      <Link
                        href={profileHref(game, region, info.gameName, info.tagLine)}
                        className={cn("min-w-0 truncate rounded-sm font-medium text-foreground hover:underline", focusRing)}
                      >
                        {info.gameName}
                        <span className="hidden font-normal text-muted-foreground sm:inline">#{info.tagLine}</span>
                      </Link>
                    ) : (
                      <span className="num min-w-0 truncate text-muted-foreground" title={t("nameUnavailable")}>
                        {row.puuid.slice(0, 8)}
                        <span className="sr-only">{t("nameUnavailable")}</span>
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className={cn(pad, "whitespace-nowrap")}>
                  <span className="flex items-center gap-2">
                    <Tip label={tierName}>
                      <span tabIndex={0} role="img" aria-label={tierName} className={cn("inline-flex rounded-full", focusRing)}>
                        <TierCrest tier={tier} size={20} />
                      </span>
                    </Tip>
                    <span aria-hidden className={cn("hidden text-sm font-medium md:inline", tierTextClass(tier))}>
                      {tierName}
                    </span>
                  </span>
                </TableCell>
                <TableCell numeric className={cn(pad, "font-medium text-foreground")}>
                  {format.number(row.leaguePoints)}
                </TableCell>
                <TableCell numeric className={cn(pad, "hidden sm:table-cell")}>
                  {format.number(row.wins)}
                </TableCell>
                <TableCell numeric className={cn(pad, "hidden text-muted-foreground sm:table-cell")}>
                  {format.number(row.losses)}
                </TableCell>
                <TableCell numeric className={cn(pad, "whitespace-nowrap")}>
                  <span className={wr == null ? "text-muted-foreground" : wr >= 50 ? "text-win" : "text-loss"}>
                    {wr == null
                      ? "—"
                      : format.number(wr / 100, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                  <span className="block text-2xs text-muted-foreground sm:hidden">
                    {t("record", { wins: row.wins, losses: row.losses })}
                  </span>
                </TableCell>
              </motion.tr>
            );
          })}
        </Stagger>
      </Table>
    </Card>
  );
}

interface SortHeadProps {
  column: SortKey;
  label: React.ReactNode;
  sort: RankingsSort;
  sorting: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
}

/** Numeric column header whose button cycles descending, ascending, then back to the ladder order. */
function SortHead({ column, label, sort, sorting, onSort, className }: SortHeadProps) {
  const t = useTranslations("rankings");
  const dir = sort?.key === column ? sort.dir : null;
  const Icon = dir === "desc" ? ArrowDown : dir === "asc" ? ArrowUp : ArrowUpDown;
  const next = nextSort(sort, column);
  const action = next
    ? t(next.dir === "desc" ? "sort.action.desc" : "sort.action.asc", { column: t(`sort.column.${column}`) })
    : t("sort.action.reset");

  return (
    <TableHead
      numeric
      className={cn(pad, className)}
      aria-sort={dir === "desc" ? "descending" : dir === "asc" ? "ascending" : "none"}
    >
      <Tip label={action}>
        <button
          type="button"
          onClick={() => onSort(column)}
          aria-busy={(dir != null && sorting) || undefined}
          className={cn(
            "-mr-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 uppercase tracking-wide transition-colors duration-fast hover:text-foreground",
            dir && "text-foreground",
            focusRing,
          )}
        >
          {label}
          <span className="sr-only">{`, ${action}`}</span>
          {dir && sorting ? (
            <Spinner className="size-3.5" />
          ) : (
            <Icon aria-hidden className={cn("size-3.5", !dir && "opacity-60")} />
          )}
        </button>
      </Tip>
    </TableHead>
  );
}

function WinRateLabel() {
  const t = useTranslations("rankings");
  return (
    <>
      <span className="hidden sm:inline">{t("columns.winRate")}</span>
      <span aria-hidden className="sm:hidden">
        {t("columns.winRateShort")}
      </span>
      <span className="sr-only sm:hidden">{t("columns.winRate")}</span>
    </>
  );
}

/** Placeholder shaped like the table: position, avatar + name, tier, LP, record, win rate. */
export function RankingsTableSkeleton({ label, rows = 12 }: { label: string; rows?: number }) {
  return (
    <Card>
      <div role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        <div className="h-10 border-b border-border/70" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border/50 px-2 py-2.5 last:border-0 sm:px-3">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-full max-w-48" />
            <Skeleton className="ml-auto h-5 w-5 shrink-0 rounded-full md:w-24" />
            <Skeleton className="h-4 w-12 shrink-0" />
            <Skeleton className="hidden h-4 w-24 shrink-0 sm:block" />
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}
