"use client";

import { useMemo } from "react";
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
  return new Date(ts).toLocaleDateString("pt-BR", {
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
  const stats = useMemo(() => {
    let globalWins = 0;
    let globalLosses = 0;

    // Agrupar matches por dia
    const dayGroups: Map<string, { wins: number; losses: number; ts: number }> =
      new Map();

    for (const match of matches) {
      const participant = match?.info?.participants?.find(
        (p: any) => p.puuid === puuid,
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
        dayGroups.set(dateKey, { wins: 0, losses: 0, ts: ts || 0 });
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

    // Ordenar cronologicamente (mais antigo primeiro)
    const sortedDays = Array.from(dayGroups.entries())
      .sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));

    // Calcular WR por dia e séries para o gráfico
    const series: number[] = [];
    const dates: number[] = [];
    const dayLabels: string[] = [];

    sortedDays.forEach(([dateKey, stats]) => {
      const total = stats.wins + stats.losses;
      const dayWr = total > 0 ? (stats.wins / total) * 100 : 0;
      series.push(dayWr);
      dates.push(stats.ts);
      dayLabels.push(formatShortDate(stats.ts));
    });

    const globalTotal = globalWins + globalLosses;
    const globalWinrate = globalTotal > 0 ? (globalWins / globalTotal) * 100 : 0;
    const color = globalWinrate >= 50 ? WIN_COLOR : LOSS_COLOR;

    return {
      globalWins,
      globalLosses,
      globalTotal,
      globalWinrate,
      series,
      dates,
      dayLabels,
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
    color,
  } = stats;

  const chartPoints = useMemo(() => {
    if (series.length === 0) return [];

    return series.map((pct, i) => {
      const x = series.length === 1 ? 50 : (i / (series.length - 1)) * 100;
      const y = 10 - (pct / 100) * 8;

      return { x, y, pct };
    });
  }, [series]);

  // Divisores entre dias (pontos centrais e linhas)
  const dayDividers = useMemo(() => {
    if (series.length <= 1) return [];
    return Array.from({ length: series.length - 1 }, (_, i) => {
      return ((i + 1) / (series.length - 1)) * 100;
    });
  }, [series]);

  // Mostrar labels apenas dos dias mais relevantes
  const labeledDays = useMemo(() => {
    const maxLabels = Math.min(MAX_DATE_LABELS, series.length);
    if (series.length <= maxLabels) {
      return dayLabels.map((label, i) => ({ label, index: i }));
    }

    const step = Math.ceil(series.length / maxLabels);
    const result: { label: string; index: number }[] = [];
    for (let i = 0; i < series.length; i += step) {
      result.push({ label: dayLabels[i], index: i });
    }
    // Sempre mostrar o último dia
    if (result[result.length - 1]?.index !== series.length - 1) {
      result.push({ label: dayLabels[series.length - 1], index: series.length - 1 });
    }
    return result;
  }, [dayLabels, series.length]);

  if (globalTotal === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="text-xs text-muted-foreground">
              Sem jogos carregados ainda
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Cria linePath conectando pontos de WR por dia (sem bezier para manter picos agudos)
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
      ? `${linePath} L${chartPoints[
          chartPoints.length - 1
        ].x.toFixed(2)},10 L${chartPoints[0].x.toFixed(2)},10 Z`
      : "";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{title}</p>
          <p className="text-xs text-muted-foreground">
            {globalTotal} jogos · {series.length} dias
            {pendingMatchesToday > 0 && ` · +${pendingMatchesToday} pendentes`}
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
            <span style={{ color: WIN_COLOR }}>{globalWins} V</span> ·{" "}
            <span style={{ color: LOSS_COLOR }}>{globalLosses} D</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <svg
          viewBox="0 0 100 15"
          className="w-full"
          role="img"
          aria-label={`Gráfico de winrate por dia - ${series.length} dias`}
        >
          {/* Linha base 50% */}
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

          {/* Divisores verticais entre dias */}
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

          {/* Preenchimento da área */}
          {areaPath && (
            <path
              d={areaPath}
              fill={color}
              opacity="0.12"
              stroke="none"
            />
          )}

          {/* Linha do gráfico */}
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

          {/* Pontos de dados */}
          {chartPoints.map((point, i) => (
            <circle
              key={`point-${i}`}
              cx={point.x}
              cy={point.y}
              r="0.25"
              fill={color}
              opacity="0.7"
            />
          ))}

          {/* Labels de data */}
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
                  y="14.4"
                  textAnchor="middle"
                  fontSize="0.9"
                  fill="#a1a1aa"
                >
                  {label}
                </text>
              );
            })}
        </svg>
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
          Linha base 50%
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 border-l border-dotted h-3"
            style={{ borderColor: MID_COLOR }}
          />
          Divisões por dia
        </span>
      </div>
    </Card>
  );
}