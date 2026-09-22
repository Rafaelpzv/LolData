"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { profileIconUrl, rankedCrestUrl } from "@/lib/cdn";
import { winRate } from "@/lib/format";
import { profileHref } from "@/lib/riot-id";
import { apexTierFor, tierTextClass } from "@/lib/tiers";
import { focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isNameReady, type Game, type RankedRow, type RankingData, type SummonerInfo } from "./types";

// Tighter gutters on phones so five columns fit without horizontal scroll.
const pad = "px-2 sm:px-3";

interface WinRateSort {
  active: boolean;
  loading: boolean;
  onToggle: () => void;
}

interface RankingsTableProps {
  game: Game;
  region: string;
  rows: RankedRow[];
  names: Record<string, SummonerInfo> | undefined;
  cutoffs: RankingData["cutoffs"];
  /** Challenger seats used when the API sends no LP cutoffs. */
  challengerSeats: number;
  /** LoL only: win-rate column toggles a sort over the whole leaderboard. */
  winRateSort?: WinRateSort;
}

export function RankingsTable({ game, region, rows, names, cutoffs, challengerSeats, winRateSort }: RankingsTableProps) {
  const t = useTranslations("rankings");
  const tTiers = useTranslations("tiers");
  const format = useFormatter();

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
            <TableHead numeric className={pad}>
              {t("columns.lp")}
            </TableHead>
            <TableHead numeric className={cn(pad, "hidden sm:table-cell")}>
              {t("columns.wins")}
            </TableHead>
            <TableHead numeric className={cn(pad, "hidden sm:table-cell")}>
              {t("columns.losses")}
            </TableHead>
            <TableHead
              numeric
              className={pad}
              aria-sort={winRateSort ? (winRateSort.active ? "descending" : "none") : undefined}
            >
              {winRateSort ? (
                <button
                  type="button"
                  onClick={winRateSort.onToggle}
                  disabled={winRateSort.loading}
                  aria-busy={winRateSort.loading || undefined}
                  title={winRateSort.active ? t("sort.byLp") : t("sort.byWinRate")}
                  className={cn(
                    "-mr-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 uppercase tracking-wide transition-colors duration-fast hover:text-foreground disabled:opacity-60",
                    winRateSort.active && "text-foreground",
                    focusRing,
                  )}
                >
                  <WinRateLabel />
                  {winRateSort.loading ? (
                    <Spinner className="size-3.5" />
                  ) : winRateSort.active ? (
                    <ArrowDown aria-hidden className="size-3.5" />
                  ) : (
                    <ArrowUpDown aria-hidden className="size-3.5" />
                  )}
                </button>
              ) : (
                <WinRateLabel />
              )}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const info = names?.[row.puuid];
            const tier = apexTierFor(row.leaguePoints, row.position, cutoffs, challengerSeats);
            const crest = rankedCrestUrl(tier);
            const wr = winRate(row.wins, row.losses);

            return (
              <TableRow key={row.puuid}>
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
                    {crest && <Image src={crest} alt="" width={20} height={20} className="size-5 shrink-0" />}
                    <span className={cn("sr-only text-sm font-medium md:not-sr-only", tierTextClass(tier))}>
                      {tTiers(tier)}
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function WinRateLabel() {
  const t = useTranslations("rankings");
  return (
    <>
      <span className="hidden sm:inline">{t("columns.winRate")}</span>
      <abbr title={t("columns.winRate")} className="no-underline sm:hidden">
        {t("columns.winRateShort")}
      </abbr>
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
