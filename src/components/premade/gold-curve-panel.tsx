"use client";

import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { timeTicks, valueTicks } from "@/lib/premade/chart-axes";
import type { CurvePoint, GoldCurve } from "@/lib/premade/gold-curve";
import { formatGold } from "@/lib/premade/stats";

const W = 640;
const H = 200;
const PAD = 8;
/** Vertical scale: ±15k, symmetric, so a lead and a deficit get the same room. */
const LIMIT = 15_000;

const x = (minute: number, lastMinute: number) =>
  PAD + (minute / Math.max(1, lastMinute)) * (W - PAD * 2);
const y = (gold: number) =>
  H / 2 - (Math.max(-LIMIT, Math.min(LIMIT, gold)) / LIMIT) * (H / 2 - PAD);

/** A polyline over the minutes with a sample, gaps where the sample is empty. */
function polyline(
  points: CurvePoint[],
  lastMinute: number,
  value: (point: CurvePoint) => number | null,
): string {
  const parts: string[][] = [];
  let current: string[] = [];
  for (const point of points) {
    const v = value(point);
    if (v === null) {
      if (current.length > 0) parts.push(current);
      current = [];
      continue;
    }
    current.push(
      `${x(point.minute, lastMinute).toFixed(1)},${y(v).toFixed(1)}`,
    );
  }
  if (current.length > 0) parts.push(current);
  return parts.map((part) => part.join(" ")).join(" ");
}

/**
 * The gold difference per minute: median with the interquartile band, the wins and losses drawn
 * separately, and the survival of a lead at 10/15/20/25 with each sample. The number of games
 * behind each minute changes, so the table keeps `n` next to every line.
 */
export function GoldCurvePanel({ curve }: { curve: GoldCurve }) {
  const t = useTranslations("premade.gold");
  const lastMinute = curve.points[curve.points.length - 1]?.minute ?? 35;
  const drawn = curve.points.filter((point) => point.n > 0);
  if (drawn.length === 0) return null;

  const band = [
    ...drawn
      .filter((point) => point.q3 !== null)
      .map(
        (point) =>
          `${x(point.minute, lastMinute).toFixed(1)},${y(point.q3 as number).toFixed(1)}`,
      ),
    ...[...drawn]
      .reverse()
      .filter((point) => point.q1 !== null)
      .map(
        (point) =>
          `${x(point.minute, lastMinute).toFixed(1)},${y(point.q1 as number).toFixed(1)}`,
      ),
  ].join(" ");

  return (
    <Card padding="lg">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("hint", { games: curve.games, missing: curve.missingTimelines })}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("aria")}
        className="mt-3 w-full"
      >        <line
          x1={PAD}
          x2={W - PAD}
          y1={H / 2}
          y2={H / 2}
          className="stroke-border-strong"
          strokeDasharray="4 4"
        />
        {band && <polygon points={band} className="fill-muted-foreground/10" />}
        <polyline
          points={polyline(
            curve.byResult.wins,
            lastMinute,
            (point) => point.median,
          )}
          fill="none"
          className="stroke-win"
          strokeWidth={1.5}
        />
        <polyline
          points={polyline(
            curve.byResult.losses,
            lastMinute,
            (point) => point.median,
          )}
          fill="none"
          className="stroke-loss"
          strokeWidth={1.5}
        />
        <polyline
          points={polyline(curve.points, lastMinute, (point) => point.median)}
          fill="none"
          className="stroke-foreground"
          strokeWidth={2.5}
        />
        {/* §8.5: os eixos com a unidade e as marcas. Sem eles o gráfico só mostra a forma. */}
        {valueTicks(LIMIT, H, PAD, (value) => formatGold(value)).map((tick) => (
          <g key={`y-${tick.at}`}>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={tick.at}
              y2={tick.at}
              className="stroke-border"
              strokeWidth={0.5}
            />
            <text
              x={PAD + 2}
              y={tick.at - 2}
              className="fill-muted-foreground text-[7px]"
            >
              {tick.label}
            </text>
          </g>
        ))}
        {timeTicks(lastMinute * 60, W, PAD, (second) => `${second / 60}′`).map(
          (tick) => (
            <text
              key={`x-${tick.at}`}
              x={tick.at}
              y={H - 1}
              textAnchor="middle"
              className="fill-muted-foreground text-[7px]"
            >
              {tick.label}
            </text>
          ),
        )}
      </svg>

      {/* A unidade e a direção, em texto: a cor sozinha nunca diz o que é melhor. */}
      <p className="mt-1 text-2xs text-muted-foreground">
        {t("axes", { limit: formatGold(LIMIT) })}
      </p>

      <div className="mt-2 flex flex-wrap gap-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-foreground" />{" "}
          {t("legendMedian")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-win" /> {t("legendWins")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-loss" />{" "}
          {t("legendLosses")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 bg-muted-foreground/20" />{" "}
          {t("legendBand")}
        </span>
      </div>

      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>{t("minute")}</TableHead>
            <TableHead numeric>{t("median")}</TableHead>
            <TableHead numeric className="hidden sm:table-cell">
              {t("range")}
            </TableHead>
            <TableHead numeric>{t("games")}</TableHead>
            <TableHead numeric className="hidden md:table-cell">
              {t("ahead")}
            </TableHead>
            <TableHead numeric className="hidden md:table-cell">
              {t("behind")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {curve.markers.map((marker) => (
            <TableRow key={marker.minute}>
              <TableCell className="font-medium">{marker.minute}</TableCell>
              <TableCell numeric>
                <span
                  className={cn(
                    (marker.spread.median ?? 0) > 0
                      ? "text-win"
                      : (marker.spread.median ?? 0) < 0
                        ? "text-loss"
                        : undefined,
                  )}
                >
                  {formatGold(marker.spread.median)}
                </span>
              </TableCell>
              <TableCell numeric className="hidden sm:table-cell">
                {formatGold(marker.spread.q1)} — {formatGold(marker.spread.q3)}
              </TableCell>
              <TableCell numeric>{marker.spread.n}</TableCell>
              <TableCell numeric className="hidden md:table-cell">
                {rate(marker.aheadWins, marker.aheadGames)}
              </TableCell>
              <TableCell numeric className="hidden md:table-cell">
                {rate(marker.behindWins, marker.behindGames)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">{t("caveat")}</p>
    </Card>
  );
}

/** Win rate of the games in one condition, with its counts; a dash without games. */
function rate(wins: number, games: number): string {
  if (games === 0) return "—";
  return `${Math.round((wins / games) * 100)}% (${wins}/${games})`;
}
