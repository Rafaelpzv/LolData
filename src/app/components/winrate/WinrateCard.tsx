"use client";

import { useMemo, useState } from "react";
import { Card } from "../ui/Card";

interface WinrateCardProps {
  matches: any[];
  puuid: string;
  mode: "lol" | "tft";
  title?: string;
  pendingMatchesToday?: number;
}

const WIN_COLOR = "#22c55e";
const LOSS_COLOR = "#ef4444";
const MID_COLOR = "#71717a";
const MAX_DATE_LABELS = 14;

function formatShortDate(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function WinrateCard({
  matches,
  puuid,
  mode,
  title = "Winrate",
  pendingMatchesToday = 0,
}: WinrateCardProps) {
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  const stats = useMemo(() => {
    let globalWins = 0;
    let globalLosses = 0;

    // Group matches by day
    const dayGroups: Map<
      string,
      { wins: number; losses: number; ts: number }
    > = new Map();

    for (const match of matches) {
      const participant = match?.info?.participants?.find(
        (p: any) => p.puuid === puuid
      );

      if (!participant) continue;

      const isWin =
        mode === "tft" ? participant.placement <= 4 : participant.win === true;

      const ts =
        match?.info?.gameStartTimestamp ??
        match?.info?.gameCreation ??
        match?.info?.game_datetime;

      const dateKey = ts ? new Date(ts).toDateString() : "unknown";

      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, {
          wins: 0,
          losses: 0,
          ts: ts || 0,
        });
      }

      const dayStats = dayGroups.get(dateKey)!;

      if (isWin) {
        dayStats.wins++;
        globalWins++;
      } else {
        dayStats.losses++;
        globalLosses++;
      }
    }

    // Sort chronologically (oldest first)
    const sortedDays = Array.from(dayGroups.entries()).sort(
      (a, b) => (a[1].ts || 0) - (b[1].ts || 0)
    );

    // Calculate daily winrate and chart series
    const series: number[] = [];
    const dates: number[] = [];
    const dayLabels: string[] = [];
    const dayStats: Array<{
      wins: number;
      losses: number;
      total: number;
      wr: number;
    }> = [];

    sortedDays.forEach(([dateKey, stats]) => {
      const total = stats.wins + stats.losses;
      const dayWr = total > 0 ? (stats.wins / total) * 100 : 0;

      series.push(dayWr);
      dates.push(stats.ts);
      dayLabels.push(formatShortDate(stats.ts));
      dayStats.push({
        wins: stats.wins,
        losses: stats.losses,
        total,
        wr: dayWr,
      });
    });

    const globalTotal = globalWins + globalLosses;
    const globalWinrate =
      globalTotal > 0 ? (globalWins / globalTotal) * 100 : 0;

    const color = globalWinrate >= 50 ? WIN_COLOR : LOSS_COLOR;

    return {
      globalWins,
      globalLosses,
      globalTotal,
      globalWinrate,
      series,
      dates,
      dayLabels,
      dayStats,
      color,
      dayGroups: Object.fromEntries(sortedDays),
    };
  }, [matches, puuid, mode]);

  const {
    globalWins,
    globalLosses,
    globalTotal,
    globalWinrate,
    series,
    dayLabels,
    dayStats,
    color,
  } = stats;

  const chartPoints = useMemo(() => {
    if (series.length === 0) return [];

    return series.map((pct, i) => {
      const x =
        series.length === 1 ? 50 : (i / (series.length - 1)) * 100;

      const y = 10 - (pct / 100) * 8;

      return { x, y, pct };
    });
  }, [series]);

  // Dividers between days (center points and lines)
  const dayDividers = useMemo(() => {
    if (series.length <= 1) return [];

    return Array.from({ length: series.length - 1 }, (_, i) => {
      return ((i + 1) / (series.length - 1)) * 100;
    });
  }, [series]);

  // Show labels only for the most relevant days
  const labeledDays = useMemo(() => {
    const maxLabels = Math.min(MAX_DATE_LABELS, series.length);

    if (series.length <= maxLabels) {
      return dayLabels.map((label, i) => ({ label, index: i }));
    }

    const step = Math.ceil(series.length / maxLabels);
    const result: { label: string; index: number }[] = [];

    for (let i = 0; i < series.length; i += step) {
      result.push({
        label: dayLabels[i],
        index: i,
      });
    }

    // Always show the last day
    if (result[result.length - 1]?.index !== series.length - 1) {
      result.push({
        label: dayLabels[series.length - 1],
        index: series.length - 1,
      });
    }

    return result;
  }, [dayLabels, series.length]);

  // Tooltip information based on the hovered day
  const tooltipInfo = useMemo(() => {
    if (hoveredDayIndex === null || !dayStats[hoveredDayIndex]) return null;

    const day = dayStats[hoveredDayIndex];

    return {
      label: dayLabels[hoveredDayIndex],
      ...day,
    };
  }, [hoveredDayIndex, dayStats, dayLabels]);

  if (globalTotal === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="text-xs text-muted-foreground">
              No games loaded yet
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Create linePath connecting daily winrate points
  // (without Bezier curves to preserve sharp peaks)
  const linePath =
    chartPoints.length === 1
      ? `M${chartPoints[0].x.toFixed(2)},${chartPoints[0].y.toFixed(2)}`
      : chartPoints
          .map((p, i) => {
            const cmd = i === 0 ? "M" : "L";
            return `${cmd}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(" ");

  const areaPath =
    chartPoints.length > 0
      ? `${linePath} L${
          chartPoints[chartPoints.length - 1].x.toFixed(2)
        },10 L${chartPoints[0].x.toFixed(2)},10 Z`
      : "";

  return (
    <Card className="p-5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{title}</p>
          <p className="text-xs text-muted-foreground">
            {globalTotal} games · {series.length} days
            {pendingMatchesToday > 0 && ` · +${pendingMatchesToday} pending`}
          </p>
        </div>

        <div className="text-right">
          <p
            className="text-3xl font-bold leading-none"
            style={{ color }}
          >
            {globalWinrate.toFixed(1)}%
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            <span style={{ color: WIN_COLOR }}>{globalWins} W</span> ·{" "}
            <span style={{ color: LOSS_COLOR }}>{globalLosses} L</span>
          </p>
        </div>
      </div>

      <div className="mt-4 relative overflow-visible w-full">
        <svg
          viewBox="-3 0 106 20"
          className="w-full"
          role="img"
          aria-label={`Daily winrate chart - ${series.length} days`}
          style={{ pointerEvents: "auto", display: "block" }}
          onMouseMove={(e) => {
            const rect = (
              e.currentTarget as SVGSVGElement
            ).getBoundingClientRect();

            setMousePos({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          onMouseLeave={() => {
            setMousePos(null);
            setHoveredDayIndex(null);
          }}
        >
          {/* 50% baseline */}
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke={MID_COLOR}
            strokeWidth="0.15"
            strokeDasharray="1.5 1.5"
            opacity="0.6"
          />

          {/* Vertical dividers between days */}
          {dayDividers.map((x, i) => (
            <line
              key={`divider-${i}`}
              x1={x}
              y1="1.2"
              x2={x}
              y2="10.8"
              stroke={MID_COLOR}
              strokeWidth="0.12"
              strokeLinecap="round"
              strokeDasharray="0.3 0.9"
              opacity="0.4"
            />
          ))}

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={color}
              opacity="0.12"
              stroke="none"
            />
          )}

          {/* Chart line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Invisible hit areas for better interaction */}
          {chartPoints.map((point, i) => (
            <circle
              key={`hit-area-${i}`}
              cx={point.x}
              cy={point.y}
              r="1.5"
              fill="transparent"
              onMouseEnter={() => setHoveredDayIndex(i)}
              onMouseLeave={() => setHoveredDayIndex(null)}
              style={{ cursor: "pointer" }}
            />
          ))}

          {/* Visible data points */}
          {chartPoints.map((point, i) => (
            <circle
              key={`point-${i}`}
              cx={point.x}
              cy={point.y}
              r="0.25"
              fill={color}
              opacity="0.7"
              pointerEvents="none"
            />
          ))}

          {/* Date labels */}
          {series.length > 1 &&
            labeledDays.map(({ label, index }) => {
              const x =
                series.length === 1
                  ? 50
                  : (index / (series.length - 1)) * 100;

              return (
                <text
                  key={`label-${index}`}
                  x={x}
                  y="16.5"
                  textAnchor="middle"
                  fontSize="0.85"
                  fill="#a1a1aa"
                >
                  {label}
                </text>
              );
            })}
        </svg>

        {/* Tooltip - follows the mouse */}
        {tooltipInfo && hoveredDayIndex !== null && mousePos && (
          <div
            className="absolute bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 whitespace-nowrap shadow-lg z-50 pointer-events-none"
            style={{
              left: `${mousePos.x}px`,
              top: `${mousePos.y - 60}px`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-semibold mb-1">{tooltipInfo.label}</div>

            <div className="flex items-center gap-2">
              <span style={{ color: WIN_COLOR }}>{tooltipInfo.wins}W</span>
              <span className="text-zinc-500">·</span>
              <span style={{ color: LOSS_COLOR }}>
                {tooltipInfo.losses}L
              </span>
              <span className="text-zinc-500">·</span>
              <span
                style={{
                  color:
                    tooltipInfo.wr >= 50 ? WIN_COLOR : LOSS_COLOR,
                }}
              >
                {tooltipInfo.wr.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-zinc-800/50 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-[2px] rounded-full"
            style={{ backgroundColor: WIN_COLOR }}
          />
          Winrate ≥ 50%
        </span>

        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-[2px] rounded-full"
            style={{ backgroundColor: LOSS_COLOR }}
          />
          Winrate &lt; 50%
        </span>

        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 border-t border-dashed"
            style={{ borderColor: MID_COLOR }}
          />
          50% baseline
        </span>

        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 border-l border-dotted h-3"
            style={{ borderColor: MID_COLOR }}
          />
          Daily divisions
        </span>
      </div>
    </Card>
  );
}
