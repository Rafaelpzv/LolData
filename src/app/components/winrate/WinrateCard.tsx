"use client";

import { useMemo } from "react";
import { Card } from "../ui/Card";

interface WinrateCardProps {
  matches: any[];
  puuid: string;
  mode: "lol" | "tft";
  title?: string;
}

const WIN_COLOR = "#22c55e";
const LOSS_COLOR = "#ef4444";

export function WinrateCard({
  matches,
  puuid,
  mode,
  title = "Winrate",
}: WinrateCardProps) {
  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    const series: number[] = [];

    for (const match of matches) {
      const participant = match?.info?.participants?.find(
        (p: any) => p.puuid === puuid,
      );
      if (!participant) continue;

      const isWin =
        mode === "tft" ? participant.placement <= 4 : participant.win === true;

      if (isWin) wins++;
      else losses++;

      const total = wins + losses;
      series.push((wins / total) * 100);
    }

    const total = wins + losses;
    const winrate = total > 0 ? (wins / total) * 100 : 0;
    const color = winrate >= 50 ? WIN_COLOR : LOSS_COLOR;

    return { wins, losses, total, winrate, series, color };
  }, [matches, puuid, mode]);

  const { wins, losses, total, winrate, series, color } = stats;

  const chartPoints = useMemo(() => {
    if (series.length === 0) return [];

    return series.map((pct, i) => {
      const x = series.length === 1 ? 50 : (i / (series.length - 1)) * 100;
      const y = 10 - (pct / 100) * 8;

      return { x, y, pct };
    });
  }, [series]);

  if (total === 0) {
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

  // Cria uma curva suave usando Bézier cúbica.
  const linePath =
    chartPoints.length === 1
      ? `M${chartPoints[0].x.toFixed(2)},${chartPoints[0].y.toFixed(2)}`
      : chartPoints
          .map((p, i) => {
            if (i === 0) {
              return `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
            }

            const prev = chartPoints[i - 1];

            const controlX1 = prev.x + (p.x - prev.x) * 0.5;
            const controlY1 = prev.y;

            const controlX2 = p.x - (p.x - prev.x) * 0.5;
            const controlY2 = p.y;

            return `C${controlX1.toFixed(2)},${controlY1.toFixed(
              2,
            )} ${controlX2.toFixed(2)},${controlY2.toFixed(
              2,
            )} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
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
            Últimos {total} jogos carregados
          </p>
        </div>

        <div className="text-right">
          <p
            className="text-3xl font-bold leading-none"
            style={{ color }}
          >
            {winrate.toFixed(1)}%
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            <span style={{ color: WIN_COLOR }}>{wins} V</span> ·{" "}
            <span style={{ color: LOSS_COLOR }}>{losses} D</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <svg
          viewBox="0 0 100 12"
          className="w-full"
          role="img"
          aria-label={`Gráfico de winrate dos últimos ${total} jogos`}
        >
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke="#71717a"
            strokeWidth="0.25"
            strokeDasharray="1.5 1.5"
            opacity="0.6"
          />

          {areaPath && (
            <path
              d={areaPath}
              fill={color}
              opacity="0.15"
              stroke="none"
            />
          )}

          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="0.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
    </Card>
  );
}