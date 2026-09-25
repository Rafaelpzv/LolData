"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3 } from "lucide-react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { winRate } from "@/lib/format";
import { BUCKET_SIZE, WINRATE_PERIODS, type WinratePeriod, type WinrateResponse } from "@/lib/riot/winrate";
import { Alert } from "@/components/ui/alert";
import { Button, focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PopoverSurface } from "@/components/ui/popover-surface";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AnimatedNumber } from "@/components/motion/animated-number";

interface WinrateCardProps {
  region: string;
  puuid: string;
  /** Queue id filter ("420"...); "all" or empty means every queue. */
  queueId?: string;
  className?: string;
}

const DEFAULT_PERIOD: WinratePeriod = "month";
const MAX_X_LABELS = 12;
/** Vertical padding of the plot (viewBox units) so dots at 0% and 100% are not clipped. */
const PAD = 6;

/** Responses kept for the session, keyed by region/puuid/queue/period. */
const sessionCache = new Map<string, WinrateResponse>();

type Status = "idle" | "loading" | "error";

/**
 * Win rate over a selectable period, fetched from /api/summoner/winrate. One point per hour/day/week
 * that has games (empty periods are skipped, so the line never breaks), over a 50% baseline.
 */
export function WinrateCard({ region, puuid, queueId, className }: WinrateCardProps) {
  const t = useTranslations("matches.winrate");
  const [period, setPeriod] = useState<WinratePeriod>(DEFAULT_PERIOD);
  const queue = queueId && queueId !== "all" ? queueId : "";
  const key = `${region}|${puuid}|${queue}|${period}`;

  // Responses per request key (session cache); the last shown key keeps the chart up while the next loads.
  const [results, setResults] = useState<Record<string, WinrateResponse>>({});
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const cached = sessionCache.get(key);
    const controller = new AbortController();
    const params = new URLSearchParams({ region, puuid, period });
    if (queue) params.set("queueId", queue);

    (cached
      ? Promise.resolve(cached)
      : fetch(`/api/summoner/winrate?${params.toString()}`, { signal: controller.signal }).then((res) => {
          if (!res.ok) throw new Error(`Winrate API error ${res.status}`);
          return res.json() as Promise<WinrateResponse>;
        })
    )
      .then((json) => {
        if (controller.signal.aborted) return;
        sessionCache.set(key, json);
        setResults((prev) => ({ ...prev, [key]: json }));
        setShownKey(key);
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        console.error("Error loading win rate:", error);
        setFailedKey(key);
      });

    return () => controller.abort();
  }, [key, region, puuid, period, queue, attempt]);

  const retry = () => {
    setFailedKey(null);
    setAttempt((n) => n + 1);
  };

  const current = results[key];
  const data = current ?? (shownKey ? results[shownKey] : undefined) ?? null;
  const status: Status = current ? "idle" : failedKey === key ? "error" : "loading";
  const loading = status === "loading";
  const options = WINRATE_PERIODS.map((p) => ({
    value: p,
    label: (
      <>
        <span aria-hidden>{t(`periodsShort.${p}`)}</span>
        <span className="sr-only">{t(`periods.${p}`)}</span>
      </>
    ),
  }));

  return (
    <Card padding="md" className={className} aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          {loading && data && <Spinner label={t("loading")} className="text-muted-foreground" />}
        </div>
        <SegmentedControl label={t("periodLabel")} value={period} onChange={setPeriod} options={options} />
      </div>

      {status === "error" ? (
        <Alert
          variant="destructive"
          className="mt-4"
          action={
            <Button size="sm" variant="outline" onClick={retry}>
              {t("retry")}
            </Button>
          }
        >
          {t("error")}
        </Alert>
      ) : !data ? (
        <div role="status" className="mt-4 space-y-3">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className={cn("transition-opacity duration-base", loading && "pointer-events-none opacity-50")}>
          <WinrateBody data={data} />
        </div>
      )}
    </Card>
  );
}

interface Point {
  start: string;
  wins: number;
  losses: number;
  pct: number;
  label: string;
  axisLabel: string;
}

function usePoints(data: WinrateResponse): Point[] {
  const format = useFormatter();
  const size = BUCKET_SIZE[data.period];
  return useMemo(
    () =>
      data.buckets
        .filter((b) => b.wins + b.losses > 0)
        .map((b) => {
          const date = new Date(b.start);
          // Day/week buckets are UTC days: format them in UTC so the date does not shift.
          return {
            start: b.start,
            wins: b.wins,
            losses: b.losses,
            pct: winRate(b.wins, b.losses) ?? 0,
            label:
              size === "hour"
                ? format.dateTime(date, { weekday: "short", hour: "2-digit", minute: "2-digit" })
                : format.dateTime(date, { weekday: size === "day" ? "short" : undefined, day: "2-digit", month: "short", year: size === "week" ? "numeric" : undefined, timeZone: "UTC" }),
            axisLabel:
              size === "hour"
                ? format.dateTime(date, { hour: "2-digit", minute: "2-digit" })
                : format.dateTime(date, { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
          };
        }),
    [data.buckets, size, format],
  );
}

function WinrateBody({ data }: { data: WinrateResponse }) {
  const t = useTranslations("matches.winrate");
  const points = usePoints(data);
  const overall = winRate(data.wins, data.losses);
  const unit = t(`units.${BUCKET_SIZE[data.period]}`);

  if (data.total === 0 || overall == null || points.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-sunken">
          <BarChart3 aria-hidden className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">{t("empty")}</p>
        <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  const rounded = Math.round(overall * 10) / 10;
  return (
    <>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="num text-xs text-muted-foreground">
            {t("span", { games: data.total, buckets: points.length, unit })}
          </p>
          {data.truncated && <p className="mt-1 text-2xs text-subtle-foreground">{t("sampled", { count: data.sampled })}</p>}
        </div>
        <div className="text-right">
          <p className={cn("num text-3xl font-semibold leading-none", rounded >= 50 ? "text-win" : "text-loss")}>
            <AnimatedNumber key={`${data.period}-${rounded}`} value={rounded} decimals={1} suffix="%" />
          </p>
          <p className="num mt-1 text-xs">
            <span className="text-win">{t("winsCount", { count: data.wins })}</span>
            <span className="text-subtle-foreground"> · </span>
            <span className="text-loss">{t("lossesCount", { count: data.losses })}</span>
          </p>
        </div>
      </div>
      <WinrateChart points={points} period={data.period} unit={unit} />
    </>
  );
}

function WinrateChart({ points, period, unit }: { points: Point[]; period: WinratePeriod; unit: string }) {
  const t = useTranslations("matches.winrate");
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId().replace(/:/g, "");

  const n = points.length;
  // One point spreads edge to edge; a single point sits in the middle.
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (pct: number) => PAD + ((100 - pct) / 100) * (100 - PAD * 2);
  const baselineY = y(50);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.pct).toFixed(2)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(2)},100 L${x(0).toFixed(2)},100 Z`;

  const step = Math.max(1, Math.ceil(n / MAX_X_LABELS));
  const edgeAlign = (left: number) => (left < 6 ? "translate-x-0" : left > 94 ? "-translate-x-full" : "-translate-x-1/2");
  const current = active != null ? points[active] : null;
  const pctText = (pct: number) => format.number(pct / 100, { style: "percent", maximumFractionDigits: 1 });

  const moveFocus = useCallback(
    (index: number) => {
      const next = Math.min(n - 1, Math.max(0, index));
      setFocusIndex(next);
      buttonsRef.current[next]?.focus();
    },
    [n],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: focusIndex + 1, ArrowLeft: focusIndex - 1, Home: 0, End: n - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    moveFocus(moves[e.key]);
  };

  // A new period can have fewer points: keep the roving index in range.
  const rovingIndex = Math.min(focusIndex, n - 1);
  const revealKey = `${period}-${n}`;

  return (
    <div className="mt-4">
      <div className="relative h-40 px-1">
        {/* Day dividers + 50% baseline (HTML so dashes keep their size at any width). */}
        {points.map((p, i) => (
          <div
            key={`d-${p.start}`}
            aria-hidden
            className="absolute inset-y-0 border-l border-dashed border-border/70"
            style={{ left: `${x(i)}%` }}
          />
        ))}
        <div
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-border-strong"
          style={{ top: `${baselineY}%` }}
        />

        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id={`wr-fill-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
            <clipPath id={`wr-clip-${uid}`}>
              <motion.rect
                key={revealKey}
                x={-2}
                y={-10}
                height={120}
                initial={{ width: 0 }}
                animate={{ width: 104 }}
                transition={{ duration: DURATION.count, ease: EASE_OUT }}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#wr-clip-${uid})`} className="text-win">
            <path d={area} fill={`url(#wr-fill-${uid})`} />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>

        {/* Dots in HTML so they stay round while the SVG stretches. */}
        {points.map((p, i) => (
          <motion.span
            key={`p-${revealKey}-${p.start}`}
            aria-hidden
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: active === i ? 1.6 : 1, opacity: 1 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT, delay: active == null ? (i / Math.max(1, n - 1)) * DURATION.count : 0 }}
            className={cn(
              "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface",
              p.pct >= 50 ? "bg-win" : "bg-loss",
            )}
            style={{ left: `${x(i)}%`, top: `${y(p.pct)}%` }}
          />
        ))}

        {/* Hover/focus targets: one column per point. */}
        <div role="group" aria-label={t("chartLabel")} onKeyDown={onKeyDown} className="absolute inset-0">
          {points.map((p, i) => {
            const half = n === 1 ? 50 : 50 / (n - 1);
            const left = Math.max(0, x(i) - half);
            const right = Math.min(100, x(i) + half);
            return (
              <button
                key={p.start}
                ref={(el) => {
                  buttonsRef.current[i] = el;
                }}
                type="button"
                tabIndex={i === rovingIndex ? 0 : -1}
                aria-label={t("bucket", { date: p.label, wins: p.wins, losses: p.losses, winRate: pctText(p.pct) })}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => {
                  setFocusIndex(i);
                  setActive(i);
                }}
                onBlur={() => setActive(null)}
                className={cn("absolute inset-y-0 rounded-sm", focusRing)}
                style={{ left: `${left}%`, width: `${right - left}%` }}
              />
            );
          })}
        </div>

        <AnimatePresence>
          {current && active != null && (
            <motion.div
              key="tooltip"
              aria-hidden
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
              className={cn("pointer-events-none absolute z-10 -translate-y-full pb-3", edgeAlign(x(active)))}
              style={{ left: `${x(active)}%`, top: `${y(current.pct)}%` }}
            >
              <PopoverSurface className="whitespace-nowrap px-3 py-2 text-xs">
                <p className="mb-1 font-medium capitalize text-foreground">{current.label}</p>
                <p className="num">
                  <span className={current.pct >= 50 ? "text-win" : "text-loss"}>{pctText(current.pct)}</span>
                  <span className="text-muted-foreground"> · {t("record", { wins: current.wins, losses: current.losses })}</span>
                </p>
              </PopoverSurface>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div aria-hidden className="relative mt-3 h-4 px-1">
        {points.map((p, i) =>
          i % step === 0 || i === n - 1 ? (
            <span
              key={p.start}
              className={cn("num absolute top-0 whitespace-nowrap text-2xs text-muted-foreground", edgeAlign(x(i)))}
              style={{ left: `${x(i)}%` }}
            >
              {p.axisLabel}
            </span>
          ) : null,
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-win" />
          {t("above")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-loss" />
          {t("below")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t border-dashed border-border-strong" />
          {t("baseline")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 border-l border-dashed border-border" />
          {t("dividers", { unit })}
        </li>
      </ul>
    </div>
  );
}
