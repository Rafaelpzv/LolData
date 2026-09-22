"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { winRate } from "@/lib/format";
import { focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PopoverSurface } from "@/components/ui/popover-surface";

interface WinrateCardProps {
  /** Riot match objects (LoL match-v5 or TFT match-v1). */
  matches: any[];
  puuid: string;
  /** "tft" counts a top 4 placement as a win. */
  mode: "lol" | "tft";
  title?: string;
  pendingMatchesToday?: number;
  className?: string;
}

interface Day {
  key: string;
  ts: number;
  wins: number;
  losses: number;
}

const MAX_DATE_LABELS = 7;
/** Vertical padding of the plot, in % of its height, so 0% / 100% days stay visible. */
const PLOT_PAD = 10;

/** Daily win rate over the loaded games: line chart with a 50% baseline and one marker per day. */
export function WinrateCard({ matches, puuid, mode, title, pendingMatchesToday = 0, className }: WinrateCardProps) {
  const t = useTranslations("matches.winrate");
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);

  const { days, wins, losses } = useMemo(() => {
    const groups = new Map<string, Day>();
    let wins = 0;
    let losses = 0;

    for (const match of matches) {
      const p = match?.info?.participants?.find((x: any) => x.puuid === puuid);
      if (!p) continue;
      const isWin = mode === "tft" ? p.placement <= 4 : p.win === true;
      const ts: number = match?.info?.gameStartTimestamp ?? match?.info?.gameCreation ?? match?.info?.game_datetime ?? 0;
      // Group by calendar day in the viewer's time zone (same on server and client).
      const key = ts ? format.dateTime(ts, { year: "numeric", month: "2-digit", day: "2-digit" }) : "unknown";

      const day = groups.get(key) ?? { key, ts, wins: 0, losses: 0 };
      if (isWin) {
        day.wins++;
        wins++;
      } else {
        day.losses++;
        losses++;
      }
      groups.set(key, day);
    }

    return { days: [...groups.values()].sort((a, b) => a.ts - b.ts), wins, losses };
  }, [matches, puuid, mode, format]);

  const total = wins + losses;
  const overall = winRate(wins, losses);
  const heading = title ?? t("title");

  if (total === 0 || overall == null) {
    return (
      <Card padding="md" className={className}>
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      </Card>
    );
  }

  const tone = overall >= 50 ? "win" : "loss";
  const points = days.map((d, i) => {
    const pct = winRate(d.wins, d.losses) ?? 0;
    const x = days.length === 1 ? 50 : (i / (days.length - 1)) * 100;
    const y = PLOT_PAD + (1 - pct / 100) * (100 - PLOT_PAD * 2);
    return { ...d, pct, x, y, label: format.dateTime(d.ts, { day: "2-digit", month: "2-digit" }) };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area =
    points.length > 1 ? `${line} L${points[points.length - 1].x.toFixed(2)},100 L${points[0].x.toFixed(2)},100 Z` : "";

  const step = Math.max(1, Math.ceil(points.length / MAX_DATE_LABELS));
  const labeled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const edgeAlign = (x: number) => (x < 12 ? "translate-x-0" : x > 88 ? "-translate-x-full" : "-translate-x-1/2");
  const current = active != null ? points[active] : null;

  return (
    <Card padding="md" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="num text-xs text-muted-foreground">
            {t("summary", { games: total, days: days.length })}
            {pendingMatchesToday > 0 && ` · ${t("pending", { count: pendingMatchesToday })}`}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("num text-3xl font-semibold leading-none", tone === "win" ? "text-win" : "text-loss")}>
            {format.number(overall / 100, { style: "percent", maximumFractionDigits: 1 })}
          </p>
          <p className="num mt-1 text-xs text-muted-foreground">{t("record", { wins, losses })}</p>
        </div>
      </div>

      <div role="group" aria-label={t("chartLabel", { days: days.length })} className="mx-2 mt-5">
        <div className="relative h-24">
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong" />
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className={cn("absolute inset-0 size-full overflow-visible", tone === "win" ? "text-win" : "text-loss")}
          >
            {area && <path d={area} fill="currentColor" fillOpacity={0.12} />}
            {points.length > 1 && (
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {points.map((p, i) => {
            const above = p.pct >= 50;
            return (
              <button
                key={p.key}
                type="button"
                aria-label={t("day", { date: p.label, wins: p.wins, losses: p.losses, winRate: Math.round(p.pct) })}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={cn(
                  "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
                  focusRing,
                )}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                <span
                  className={cn(
                    "block rounded-full transition-transform duration-fast",
                    above ? "size-2 bg-win" : "size-2.5 border-2 border-loss bg-surface-sunken",
                    active === i && "scale-150",
                  )}
                />
              </button>
            );
          })}

          {current && (
            <div
              aria-hidden
              className={cn("pointer-events-none absolute z-10 -translate-y-full pb-3", edgeAlign(current.x))}
              style={{ left: `${current.x}%`, top: `${current.y}%` }}
            >
              <PopoverSurface className="whitespace-nowrap px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-foreground">{current.label}</p>
                <p className="num text-muted-foreground">
                  <span className="text-win">{t("wins", { count: current.wins })}</span>{" "}
                  <span className="text-loss">{t("losses", { count: current.losses })}</span>
                  {" · "}
                  <span className={current.pct >= 50 ? "text-win" : "text-loss"}>
                    {format.number(current.pct / 100, { style: "percent", maximumFractionDigits: 1 })}
                  </span>
                </p>
              </PopoverSurface>
            </div>
          )}
        </div>

        {points.length > 1 && (
          <div aria-hidden className="relative mt-2 h-4">
            {labeled.map((p) => (
              <span
                key={p.key}
                className={cn("num absolute top-0 whitespace-nowrap text-2xs text-muted-foreground", edgeAlign(p.x))}
                style={{ left: `${p.x}%` }}
              >
                {p.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-win" />
          {t("above")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-2 border-loss" />
          {t("below")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t border-dashed border-border-strong" />
          {t("baseline")}
        </li>
      </ul>
    </Card>
  );
}
