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
}: WinrateCardProps) {
  const stats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    const series: number[] = [];
    const dates: number[] = [];

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
      dates.push(
        match?.info?.gameStartTimestamp ??
          match?.info?.gameCreation ??
          match?.info?.game_datetime,
      );
    }

    const total = wins + losses;
    const winrate = total > 0 ? (wins / total) * 100 : 0;
    const color = winrate >= 50 ? WIN_COLOR : LOSS_COLOR;

    return { wins, losses, total, winrate, series, dates, color };
  }, [matches, puuid, mode]);

  const { wins, losses, total, winrate, series, dates, color } = stats;

  // Ordem cronológica (mais antigo à esquerda, mais recente à direita)
  const orderedSeries = useMemo(() => [...series].reverse(), [series]);
  const orderedDates = useMemo(() => [...dates].reverse(), [dates]);

  const chartPoints = useMemo(() => {
    if (orderedSeries.length === 0) return [];

    return orderedSeries.map((pct, i) => {
      const x =
        orderedSeries.length === 1
          ? 50
          : (i / (orderedSeries.length - 1)) * 100;
      const y = 10 - (pct / 100) * 8;

      return { x, y, pct };
    });
  }, [orderedSeries]);

  // Setores: um por dia jogado, com linha divisória pontilhada e rótulo da data
  const daySectors = useMemo(() => {
    const n = orderedDates.length;
    if (n === 0) return [];

    const groups: { label: string; start: number; count: number }[] = [];
    let currentKey = "";
    let currentLabel = "";
    let start = 0;

    orderedDates.forEach((ts, i) => {
      const key = ts ? new Date(ts).toDateString() : "unknown";
      if (key !== currentKey) {
        if (currentKey !== "") {
          groups.push({ label: currentLabel, start, count: i - start });
        }
        currentKey = key;
        currentLabel = formatShortDate(ts);
        start = i;
      }
    });
    groups.push({ label: currentLabel, start, count: n - start });

    const span = n - 1;

    return groups.map((g) => ({
      ...g,
      centerX:
        span === 0 ? 50 : ((g.start + (g.count - 1) / 2) / span) * 100,
      boundaryX:
        span === 0 || g.start + g.count >= n
          ? null
          : ((g.start + g.count) / span) * 100,
    }));
  }, [orderedDates]);

  const dividers = useMemo(
    () => daySectors.flatMap((g) => (g.boundaryX !== null ? [g.boundaryX] : [])),
    [daySectors],
  );

  // Mostra o rótulo de data apenas nos dias com mais jogos (limite MAX_DATE_LABELS)
  const labeledSectors = useMemo(() => {
    const top = new Set(
      [...daySectors]
        .sort((a, b) => b.count - a.count || a.start - b.start)
        .slice(0, MAX_DATE_LABELS)
        .map((s) => s.start),
    );
    return daySectors.filter((s) => top.has(s.start));
  }, [daySectors]);

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
          viewBox="0 0 100 15"
          className="w-full"
          role="img"
          aria-label={`Gráfico de winrate dos últimos ${total} jogos`}
        >
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

          {dividers.map((x) => (
            <line
              key={x}
              x1={x}
              y1="1.2"
              x2={x}
              y2="10.8"
              stroke={MID_COLOR}
              strokeWidth="0.15"
              strokeLinecap="round"
              strokeDasharray="0.4 1.1"
              opacity="0.5"
            />
          ))}

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

          {total > 1 &&
            labeledSectors.map((sector) =>
              sector.label ? (
                <text
                  key={`${sector.start}-${sector.label}`}
                  x={sector.centerX}
                  y="14.4"
                  textAnchor="middle"
                  fontSize="1"
                  fill="#a1a1aa"
                >
                  {sector.label}
                </text>
              ) : null,
            )}
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