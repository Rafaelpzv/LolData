"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Stat } from "@/components/ui/stat";
import type { PremadeMetrics } from "@/lib/premade/metrics";
import { fromPercent } from "./format";

/**
 * Headline numbers of the window: record with its 95% interval, the side KDA, deaths and towers per
 * game, over a line that says which games (period, lineup) the numbers come from.
 */
export function TeamSummary({
  metrics,
  window,
}: {
  metrics: PremadeMetrics;
  /** The period and lineup the numbers were read from. */
  window: { games: number; fullGames: number; days: string[] };
}) {
  const t = useTranslations("premade.summary");
  const format = useFormatter();
  const sideKda = metrics.sideKda;
  const kda = metrics.kda;
  const towersPerGame = metrics.conversion.turretsPerGame;
  const interval = metrics.winRateStats;
  const days = window.days;
  // The app's own locale, not the browser's: the server and the client must print the same text.
  const day = (iso: string | null) =>
    iso === null
      ? "—"
      : format.dateTime(new Date(`${iso}T12:00:00Z`), {
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label={t("winRate")}
          value={fromPercent(metrics.winRate)}
          tone={
            metrics.winRate === null
              ? "muted"
              : metrics.winRate >= 50
                ? "win"
                : "loss"
          }
          hint={t("winRateInterval", {
            rate:
              metrics.winRate === null ? "—" : `${metrics.winRate.toFixed(1)}%`,
            wins: metrics.wins,
            games: metrics.games,
            low: Math.round((interval.low ?? 0) * 100),
            high: Math.round((interval.high ?? 0) * 100),
          })}
        />
        {/* The collective KDA is the SIDE's. When some game of the window could not read the whole
            side, the number is an estimate and says so; the roster KDA travels beside it in the
            line below, so the two are never confused (prompt §2.3). */}
        <Stat
          label={t("sideKda")}
          value={sideKda === null ? "—" : sideKda.toFixed(2)}
          hint={
            metrics.sideComplete
              ? t("sideKdaComplete", {
                  games: metrics.games,
                })
              : metrics.sideCompleteGames > 0
                ? t("sideKdaEstimatePartial", {
                    complete: metrics.sideCompleteGames,
                    games: metrics.games,
                  })
                : t("sideKdaEstimate", { games: metrics.games })
          }
        />
        {/* The side's deaths per game: never the roster sum when only some of the five played. */}
        <Stat
          label={t("deaths")}
          value={
            metrics.sideKills === null || metrics.games === 0
              ? "—"
              : (metrics.sideKills.deaths / metrics.games).toFixed(1)
          }
          hint={t("deathsHint")}
        />
        <Stat
          label={t("towers")}
          value={towersPerGame === null ? "—" : towersPerGame.toFixed(2)}
        />
      </div>
      <p className="num text-2xs text-muted-foreground">
        {t("games", { count: window.games })} ·{" "}
        {t("fullLineup", { full: window.fullGames, games: window.games })}
        {days.length > 0 &&
          ` · ${day(days[0])} – ${day(days[days.length - 1])}`}
        {kda !== null && ` · ${t("rosterKda")}: ${kda.toFixed(2)}`}
      </p>
    </div>
  );
}
