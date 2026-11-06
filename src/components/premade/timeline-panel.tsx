"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TimelineMetrics } from "@/lib/premade/timeline-metrics";
import { formatGold, formatSeconds } from "@/lib/premade/stats";
import type { SynergyReport } from "@/lib/premade/synergy";
import { SynergyPanel } from "./synergy-panel";
import { GoldCurvePanel } from "./gold-curve-panel";
import type { PremadePlayer } from "@/lib/premade/types";
import { fromPercent } from "./format";

/** One stored timeline, as the page hands it to the chart. */
export interface MatchTimeline {
  matchId: string;
  win: boolean;
  duration: number;
  goldDiff: [number, number][];
  kills?: {
    at: number;
    kind: string;
    x: number;
    y: number;
    /** Roster person the event belongs to; null for a filling account. */
    person?: string | null;
    /** Group people near the event. */
    near?: number | null;
  }[];
  objectives: {
    at: number;
    kind: string;
    x: number;
    y: number;
    variant?: string | null;
    near?: number | null;
  }[];
  /** Every death on the map: the player filter needs who died, not only who killed. */
  deaths?: {
    at: number;
    person: string | null;
    near: number | null;
    costly: boolean;
  }[];
}

const CHART_W = 640;
const CHART_H = 180;
const PAD = 6;
/** Every game is drawn over the same 0..30 minutes window; longer games are cut there. */
const WINDOW_SECONDS = 1_800;

// Formatting comes from the shared helpers: a time is mm:ss even at 11:60, gold is signed.
const secs = formatSeconds;
const num = (value: number | null, digits = 0) =>
  value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const signed = (value: number | null) => formatGold(value);

/** A polyline of one gold-difference series, y flipped so a lead goes up. */
function line(points: [number, number][]): string {
  return points
    .filter(([second]) => second <= WINDOW_SECONDS)
    .map(([second, diff]) => {
      const x = PAD + (second / WINDOW_SECONDS) * (CHART_W - PAD * 2);
      // The scale is symmetric around zero, so both leads get the same room.
      const y = CHART_H / 2 - (diff / 15_000) * (CHART_H / 2 - PAD);
      return `${x.toFixed(1)},${Math.max(PAD, Math.min(CHART_H - PAD, y)).toFixed(1)}`;
    })
    .join(" ");
}

/** The team's games drawn together, the average line on top, and one game highlighted. */
function GoldChart({
  games,
  average,
}: {
  games: MatchTimeline[];
  average: number[][];
}) {
  const t = useTranslations("premade.timeline");
  const title = useId();
  const pointAt = (index: number) =>
    PAD + (index / (average.length - 1 || 1)) * (CHART_W - PAD * 2);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-labelledby={title}
      className="w-full"
    >
      <title id={title}>{t("curveAria")}</title>
      <line
        x1={0}
        x2={CHART_W}
        y1={CHART_H / 2}
        y2={CHART_H / 2}
        className="stroke-border-strong"
        strokeDasharray="4 4"
      />
      {games.slice(-40).map((game) => (
        <polyline
          key={game.matchId}
          points={line(game.goldDiff)}
          fill="none"
          className={game.win ? "stroke-win/25" : "stroke-loss/25"}
          strokeWidth={1}
        />
      ))}
      <polyline
        points={average
          .map(
            ([, diff], index) =>
              `${pointAt(index).toFixed(1)},${(CHART_H / 2 - (diff / 15_000) * (CHART_H / 2 - PAD)).toFixed(1)}`,
          )
          .join(" ")}
        fill="none"
        className="stroke-foreground"
        strokeWidth={2}
      />
    </svg>
  );
}

/** How the group plays together, read from the timelines in the Collective tab. */
export function TimelinePanel({
  metrics,
  games,
  players,
  smallSample,
  synergy,
}: {
  metrics: TimelineMetrics;
  games: MatchTimeline[];
  players: PremadePlayer[];
  smallSample: number;
  /** Observed pair synergy (membership in the same kills vs. what the pair alone predicts). */
  synergy: SynergyReport;
}) {
  const t = useTranslations("premade.timeline");
  const tCollective = useTranslations("premade.collective");
  const [picked, setPicked] = useState<string>("");

  // A person is known by their first active account, exactly like the rest of the analysis.
  const nameOf = (person: string) => {
    const player = players.find((entry) => entry.id === person);
    const account =
      player?.accounts.find((entry) => !entry.archived) ?? player?.accounts[0];
    return account?.gameName ?? player?.gameName ?? person.slice(0, 6);
  };

  const average = useMemo(() => {
    // One average point per minute of the shortest window, skipping the games that ended early.
    const points: number[][] = [];
    for (let second = 0; second <= WINDOW_SECONDS; second += 60) {
      const values = games.flatMap((game) => {
        const found = game.goldDiff.filter(([at]) => at <= second).pop();
        return found && game.duration > second ? [found[1]] : [];
      });
      if (values.length > 0)
        points.push([
          second,
          values.reduce((a, b) => a + b, 0) / values.length,
        ]);
    }
    return points;
  }, [games]);

  if (metrics.games === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title={t("empty")} />
      </Card>
    );
  }

  const selected =
    games.find((game) => game.matchId === (picked || games[0]?.matchId)) ??
    null;
  const objectives = ["dragon", "herald", "baron", "tower"] as const;

  return (
    <div className="space-y-4">
      {metrics.games < smallSample && (
        <p className="text-xs text-muted-foreground">
          {t("smallSample", { count: metrics.games })}
        </p>
      )}

      <Card padding="lg">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t("curveTitle")}
          </h3>
          <p className="num text-xs text-muted-foreground">
            {signed(metrics.curve[0]?.averageLead ?? null)}
          </p>
        </div>
        <GoldChart games={games} average={average} />
        <p className="mt-2 text-xs text-muted-foreground">{t("curveHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {metrics.curve.map((point) => (
            <div
              key={point.minute}
              className="rounded-md border border-border p-2"
            >
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t("minute", { minute: point.minute })}
              </p>
              <p
                className={cn(
                  "num mt-1 font-semibold",
                  (point.averageLead ?? 0) > 0
                    ? "text-win"
                    : (point.averageLead ?? 0) < 0
                      ? "text-loss"
                      : "text-foreground",
                )}
              >
                {signed(point.averageLead)}
              </p>
              <p className="num text-xs text-muted-foreground">
                {t("aheadShort")} {fromPercent(point.winRateAhead)} · {t("behindShort")}{" "}
                {fromPercent(point.winRateBehind)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingDown aria-hidden className="size-3.5" />
            {t("throws")}:{" "}
            <span className="num">
              {metrics.throws.lost}/{metrics.throws.games}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp aria-hidden className="size-3.5" />
            {t("comebacks")}:{" "}
            <span className="num">
              {metrics.comebacks.won}/{metrics.comebacks.games}
            </span>
          </span>
        </div>
      </Card>

      <GoldCurvePanel curve={metrics.gold} />

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {t("preparationTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("preparationHint", { radius: 4000, window: 60, players: 3 })}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("objective")}</TableHead>
              <TableHead numeric>{t("prepEvents")}</TableHead>
              <TableHead numeric>{t("prepPlayers")}</TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("prepWithPlayers")}
              </TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("prepDeaths")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(["dragon", "herald", "baron"] as const).map((key) => {
              const preparation = metrics.preparation[key];
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {tCollective(
                      `objectives.${key === "herald" ? "riftHerald" : key}` as "objectives.dragon",
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {preparation.events === 0 ? "\u2014" : preparation.events}
                  </TableCell>
                  <TableCell numeric>
                    {num(preparation.averageNear, 1)}
                  </TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {fromPercent(
                      preparation.nearShare === null
                        ? null
                        : preparation.nearShare * 100,
                    )}
                  </TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {preparation.events === 0
                      ? "\u2014"
                      : (preparation.deathsBefore / preparation.events).toFixed(
                          2,
                        )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {t("objectivesTitle")}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("objective")}</TableHead>
              <TableHead numeric>{t("first")}</TableHead>
              <TableHead numeric>{t("average")}</TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("games")}
              </TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("total")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {objectives.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-medium">
                  {tCollective(
                    `objectives.${key === "herald" ? "riftHerald" : key}` as "objectives.dragon",
                  )}
                </TableCell>
                <TableCell numeric>
                  {secs(metrics.objectives[key].first)}
                </TableCell>
                <TableCell numeric>
                  {secs(metrics.objectives[key].median)}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {metrics.objectives[key].games}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {metrics.objectives[key].total}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {/* "first" reads the first one per game; "median" reads every one the group took. */}
        <p className="mt-2 text-xs text-muted-foreground">{t("timingHint")}</p>
        <p className="num mt-2 text-xs text-muted-foreground">
          {t("conversion")}: {secs(metrics.conversion.median)} {t("median")} (
          {metrics.conversion.games}/{metrics.conversion.kills})
        </p>
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {t("grouping")}
        </h3>
        <ul className="num mt-3 space-y-1.5 text-sm">
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t("groupedShare")}</span>
            <span>{fromPercent(metrics.grouping.groupedShare)}</span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">
              {t("averageDistance")}
            </span>
            <span>
              {metrics.grouping.averageDistance === null
                ? "\u2014"
                : Math.round(metrics.grouping.averageDistance)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t("nearKill")}</span>
            <span>
              {metrics.grouping.nearKill === null
                ? "\u2014"
                : metrics.grouping.nearKill.toFixed(1)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t("nearObjective")}</span>
            <span>
              {metrics.grouping.nearObjective === null
                ? "\u2014"
                : metrics.grouping.nearObjective.toFixed(1)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t("fights")}</span>
            <span>
              {metrics.fights.averagePerGame === null
                ? "\u2014"
                : metrics.fights.averagePerGame.toFixed(1)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t("frames")}</span>
            <span>{metrics.grouping.frames}</span>
          </li>
        </ul>
      </Card>

      <SynergyPanel report={synergy} players={players} />

      {selected && (
        <Card padding="lg">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("singleTitle")}
            </h3>
            <label className="text-2xs text-muted-foreground">
              <span className="sr-only">{t("singleTitle")}</span>
              <select
                value={selected.matchId}
                onChange={(event) => setPicked(event.target.value)}
                className="num h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground"
              >
                {games.map((game) => (
                  <option key={game.matchId} value={game.matchId}>
                    {game.matchId}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            role="img"
            aria-label={t("singleTitle")}
            className="mt-2 w-full"
          >
            <line
              x1={0}
              x2={CHART_W}
              y1={CHART_H / 2}
              y2={CHART_H / 2}
              className="stroke-border-strong"
              strokeDasharray="4 4"
            />
            <polyline
              points={line(selected.goldDiff)}
              fill="none"
              className={selected.win ? "stroke-win" : "stroke-loss"}
              strokeWidth={2}
            />
          </svg>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {selected.objectives.map((objective, index) => (
              <li
                key={`${objective.kind}-${objective.at}-${index}`}
                className="num flex items-center justify-between gap-2"
              >
                <span>
                  {tCollective(
                    `objectives.${objective.kind === "herald" ? "riftHerald" : objective.kind}` as "objectives.dragon",
                  )}
                </span>
                <span>{secs(objective.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground">
          {t("playersTitle")}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("player")}</TableHead>
              <TableHead numeric>{t("presence")}</TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("objectivesPresent")}
              </TableHead>
              <TableHead numeric>{t("deaths")}</TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("isolatedDeaths")}
              </TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("costlyDeaths")}
              </TableHead>
              <TableHead numeric className="hidden md:table-cell">
                {t("distance")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.players.map((player) => (
              <TableRow key={player.person}>
                <TableCell className="font-medium">
                  {nameOf(player.person)}
                </TableCell>
                <TableCell numeric>{fromPercent(player.presence)}</TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {player.objectivesPresent}
                </TableCell>
                <TableCell numeric>{player.deaths}</TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {player.isolatedDeaths}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {player.costlyDeaths}
                </TableCell>
                <TableCell numeric className="hidden md:table-cell">
                  {player.averageDistance === null
                    ? "\u2014"
                    : Math.round(player.averageDistance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {metrics.pairs.length > 0 && (
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-foreground">
            {t("pairsTitle")}
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {metrics.pairs.slice(0, 5).map((pair) => (
              <li
                key={`${pair.a}-${pair.b}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-foreground">
                  {nameOf(pair.a)} <span aria-hidden>·</span> {nameOf(pair.b)}
                </span>
                <span className="num text-xs text-muted-foreground">
                  {t("closeness")} {fromPercent(pair.closeness)}{" "}
                  <span aria-hidden>·</span> {t("closeGames")} {pair.closeGames}
                  /{pair.games}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">{t("caveat")}</p>
    </div>
  );
}
