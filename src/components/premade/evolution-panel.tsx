"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { PremadeMetrics } from "@/lib/premade/metrics";
import type { DimensionReport } from "@/lib/premade/dimensions";
import { fromPercent } from "./format";

export interface SeriesGame {
  matchId: string;
  gameCreation: number;
  win: boolean;
}

/**
 * Period comparison on the same terms as the rest of the analysis: the newest window against the
 * one before it, both of the same size, each with its dates and its lineup. A change that is not
 * bigger than the game-to-game noise is said so, and the dimensions block below judges every metric
 * against its own spread.
 */
export function EvolutionPanel({
  metrics,
  series,
  report,
}: {
  metrics: PremadeMetrics;
  series: SeriesGame[];
  report: DimensionReport;
}) {
  const t = useTranslations("premade.evolution");
  const tSeries = useTranslations("premade.series");
  const format = useFormatter();
  const { size, recent, previous } = report.windows;
  // Already in percentage points (0..100), so it is formatted with `fromPercent`: multiplying by 100
  // again here is what showed "7000%" instead of "70%".
  const recentRate =
    recent.games > 0
      ? (series.slice(0, recent.games).filter((game) => game.win).length /
          recent.games) *
        100
      : null;
  const previousGames = series.slice(
    recent.games,
    recent.games + previous.games,
  );
  const previousRate =
    previousGames.length > 0
      ? (previousGames.filter((game) => game.win).length /
          previousGames.length) *
        100
      : null;
  const delta =
    recentRate !== null && previousRate !== null
      ? recentRate - previousRate
      : null;

  const period = (from: number | null, to: number | null) =>
    from === null || to === null
      ? "—"
      : t("period", {
          from: format.dateTime(new Date(from), {
            day: "2-digit",
            month: "short",
          }),
          to: format.dateTime(new Date(to), { day: "2-digit", month: "short" }),
        });

  if (series.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarClock} title={t("empty")} />
      </Card>
    );
  }

  const enough = recent.games >= 5 && previous.games >= 5;
  // The yardstick: one standard deviation of the per-game win (0/100) over both windows, in points.
  const noiseBand =
    enough && metrics.winRateStats.rate !== null
      ? Math.sqrt(metrics.winRateStats.rate * (1 - metrics.winRateStats.rate)) *
        100
      : null;
  // One place for the label of the change, so the JSX keeps no nested conditionals.
  const changeLabel = (value: number, band: number) =>
    Math.abs(value) < band
      ? t("withinNoise")
      : value > 0
        ? t("aboveNoise")
        : t("belowNoise");

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {tSeries("title")}
        </h3>
        <div className="mt-3 flex flex-wrap gap-1">
          {series.map((game, index) => (
            <span
              key={`${game.matchId}-${index}`}
              title={format.dateTime(new Date(game.gameCreation), {
                dateStyle: "short",
                timeStyle: "short",
              })}
              className={cn(
                "flex size-7 items-center justify-center rounded-sm border text-2xs font-medium",
                game.win
                  ? "border-win/30 bg-win/10 text-win"
                  : "border-loss/30 bg-loss/10 text-loss",
              )}
            >
              {game.win
                ? tSeries("win").slice(0, 1)
                : tSeries("loss").slice(0, 1)}
              <span className="sr-only">
                {game.win ? tSeries("win") : tSeries("loss")} ·{" "}
                {format.dateTime(new Date(game.gameCreation), {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </span>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {t("description", { size })}
        </h3>
        {!enough && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("noComparison")}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {t("windowRecent", { size })}
            </p>
            <p className="num mt-1 text-lg font-semibold">{fromPercent(recentRate)}</p>
            <p className="num text-xs text-muted-foreground">
              {recent.games > 0
                ? `${series.slice(0, recent.games).filter((game) => game.win).length}/${recent.games}`
                : "—"}
            </p>
            <p className="num text-2xs text-muted-foreground">
              {period(recent.from, recent.to)}
            </p>
            <p className="num text-2xs text-muted-foreground">
              {t("fullGames", { full: recent.fullGames, games: recent.games })}
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {t("windowPrevious", { size })}
            </p>
            <p className="num mt-1 text-lg font-semibold">
              {fromPercent(previousRate)}
            </p>
            <p className="num text-xs text-muted-foreground">
              {previous.games > 0
                ? `${previousGames.filter((game) => game.win).length}/${previous.games}`
                : "—"}
            </p>
            <p className="num text-2xs text-muted-foreground">
              {period(previous.from, previous.to)}
            </p>
            <p className="num text-2xs text-muted-foreground">
              {t("fullGames", {
                full: previous.fullGames,
                games: previous.games,
              })}
            </p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              {t("change")}
            </p>
            <p
              className={cn(
                "num mt-1 text-lg font-semibold",
                delta !== null && delta > 0
                  ? "text-win"
                  : delta !== null && delta < 0
                    ? "text-loss"
                    : "text-foreground",
              )}
            >
              {delta === null
                ? "—"
                : t("deltaPoints", {
                    value: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`,
                  })}
            </p>
            {/* A change of a few games in a 20-game window is inside the noise: said, not implied. */}
            <p className="text-2xs text-muted-foreground">
              {delta !== null && enough && noiseBand !== null
                ? changeLabel(delta, noiseBand)
                : ""}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("dimensionsNote")}
        </p>
      </Card>

      {metrics.sessions.length > 0 && (
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-foreground">
            {t("sessions")}
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {metrics.sessions.map((session) => (
              <li
                key={session.index}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-muted-foreground">
                  {t("session", { index: session.index + 1 })} ·{" "}
                  {format.dateTime(new Date(session.start), {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="num">
                  {t("sessionGames", { count: session.games })} · {session.wins}
                  V
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("minGames", { games: 5 })}
          </p>
        </Card>
      )}
    </div>
  );
}
