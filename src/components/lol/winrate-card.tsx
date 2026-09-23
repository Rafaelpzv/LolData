"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, useId } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3 } from "lucide-react";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
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
const MAX_X_LABELS = 6;
/** Bars fill at most this share of the plot height, leaving headroom for the line. */
const BAR_MAX = 70;

/** Responses kept for the session, keyed by region/puuid/queue/period. */
const sessionCache = new Map<string, WinrateResponse>();

type Status = "idle" | "loading" | "error";

/** Win rate over a selectable period, fetched from /api/summoner/winrate: stacked W/L bars + cumulative line. */
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
  const options = WINRATE_PERIODS.map((p) => ({
    value: p,
    label: (
      <>
        <span aria-hidden>{t(`periodsShort.${p}`)}</span>
        <span className="sr-only">{t(`periods.${p}`)}</span>
      </>
    ),
  }));

  const loading = status === "loading";

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
        <div
          className={cn(
            "transition-opacity duration-base",
            loading && "pointer-events-none opacity-50",
          )}
        >
          <WinrateBody data={data} />
        </div>
      )}
    </Card>
  );
}

function WinrateBody({ data }: { data: WinrateResponse }) {
  const t = useTranslations("matches.winrate");
  const overall = winRate(data.wins, data.losses);

  if (data.total === 0 || overall == null) {
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
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className={cn("num text-3xl font-semibold leading-none", rounded >= 50 ? "text-win" : "text-loss")}>
          <AnimatedNumber key={`${data.period}-${rounded}`} value={rounded} decimals={1} suffix="%" />
        </p>
        <p className="num text-xs text-muted-foreground">
          {t("record", { wins: data.wins, losses: data.losses })} · {t("games", { count: data.total })}
        </p>
      </div>
      {data.truncated && <p className="mt-1 text-2xs text-muted-foreground">{t("sampled", { count: data.sampled })}</p>}
      <WinrateChart data={data} />
    </>
  );
}

interface Point {
  start: string;
  wins: number;
  losses: number;
  /** Win rate of this bucket, null when empty. */
  pct: number | null;
  /** Cumulative win rate up to this bucket, null before the first game. */
  cumulative: number | null;
  label: string;
  axisLabel: string;
}

function WinrateChart({ data }: { data: WinrateResponse }) {
  const t = useTranslations("matches.winrate");
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const size = BUCKET_SIZE[data.period];

  const points = useMemo<Point[]>(() => {
    const out: Point[] = [];
    let wins = 0;
    let losses = 0;
    for (const b of data.buckets) {
      wins += b.wins;
      losses += b.losses;
      const date = new Date(b.start);
      // Day/week buckets are UTC days: format them in UTC so the date does not shift.
      const label =
        size === "hour"
          ? format.dateTime(date, { weekday: "short", hour: "2-digit", minute: "2-digit" })
          : format.dateTime(date, { day: "2-digit", month: "short", year: size === "week" ? "numeric" : undefined, timeZone: "UTC" });
      const axisLabel =
        size === "hour"
          ? format.dateTime(date, { hour: "2-digit", minute: "2-digit" })
          : format.dateTime(date, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
      out.push({
        start: b.start,
        wins: b.wins,
        losses: b.losses,
        pct: winRate(b.wins, b.losses),
        cumulative: winRate(wins, losses),
        label,
        axisLabel,
      });
    }
    // Start the axis at the first bucket with games: truncated periods (100-game cap) and quiet
    // stretches before the first game would otherwise leave a long empty chart.
    const first = out.findIndex((p) => p.wins + p.losses > 0);
    return first > 0 ? out.slice(first) : out;
  }, [data.buckets, size, format]);

  const clipId = `wr-clip-${useId().replace(/:/g, "")}`;
  const n = points.length;
  const maxGames = Math.max(1, ...points.map((p) => p.wins + p.losses));
  const slot = 100 / n;
  const barWidth = slot * 0.6;
  const x = (i: number) => (i + 0.5) * slot;

  const line = points
    .map((p, i) => (p.cumulative == null ? null : `${x(i).toFixed(2)},${(100 - p.cumulative).toFixed(2)}`))
    .filter(Boolean)
    .map((xy, i) => `${i === 0 ? "M" : "L"}${xy}`)
    .join(" ");

  const step = Math.max(1, Math.ceil(n / MAX_X_LABELS));
  const edgeAlign = (left: number) => (left < 10 ? "translate-x-0" : left > 90 ? "-translate-x-full" : "-translate-x-1/2");
  const current = active != null ? points[active] : null;
  const pctText = (pct: number | null) =>
    pct == null ? t("noGames") : format.number(pct / 100, { style: "percent", maximumFractionDigits: 1 });

  const moveFocus = useCallback(
    (index: number) => {
      const next = Math.min(n - 1, Math.max(0, index));
      setFocusIndex(next);
      buttonsRef.current[next]?.focus();
    },
    [n],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    moveFocus(moves[e.key]);
  };

  // A new period can have fewer buckets: keep the roving index in range.
  const rovingIndex = Math.min(focusIndex, n - 1);

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <div aria-hidden className="num relative h-36 w-8 shrink-0 text-right text-2xs text-muted-foreground">
          <span className="absolute right-0 top-0 -translate-y-1/2">100%</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">50%</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0%</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative h-36">
            <div aria-hidden className="absolute inset-x-0 top-0 border-t border-border/50" />
            <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 border-t border-border" />

            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              {points.map((p, i) => {
                const total = p.wins + p.losses;
                const lossH = (p.losses / maxGames) * BAR_MAX;
                const winH = (p.wins / maxGames) * BAR_MAX;
                const delay = Math.min(i, 30) * 0.015;
                const transition = { ...SPRING.soft, delay };
                const dim = active != null && active !== i;
                return (
                  <g key={i} className={cn("transition-opacity duration-fast", dim && "opacity-40")}>
                    <motion.rect
                      className="text-loss"
                      fill="currentColor"
                      fillOpacity={0.45}
                      x={x(i) - barWidth / 2}
                      width={barWidth}
                      initial={{ y: 100, height: 0 }}
                      animate={{ y: 100 - lossH, height: lossH }}
                      transition={transition}
                    />
                    <motion.rect
                      className="text-win"
                      fill="currentColor"
                      fillOpacity={0.8}
                      x={x(i) - barWidth / 2}
                      width={barWidth}
                      initial={{ y: 100, height: 0 }}
                      animate={{ y: 100 - lossH - winH, height: total ? winH : 0 }}
                      transition={transition}
                    />
                  </g>
                );
              })}
              <defs>
                <clipPath id={clipId}>
                  <motion.rect
                    key={data.period}
                    x={0}
                    y={-5}
                    height={110}
                    initial={{ width: 0 }}
                    animate={{ width: 100 }}
                    transition={{ duration: DURATION.count, ease: EASE_OUT }}
                  />
                </clipPath>
              </defs>
              <AnimatePresence initial={false}>
                {line && (
                  <motion.path
                    key={`${data.period}-${line}`}
                    clipPath={`url(#${clipId})`}
                    d={line}
                    className="text-foreground"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: DURATION.base } }}
                    transition={{ duration: DURATION.base }}
                  />
                )}
              </AnimatePresence>
            </svg>

            <div role="group" aria-label={t("chartLabel")} onKeyDown={onKeyDown} className="absolute inset-0 flex">
              {points.map((p, i) => (
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
                  className={cn("h-full min-w-0 flex-1 rounded-sm", focusRing)}
                />
              ))}
            </div>

            <AnimatePresence>
              {current && active != null && (
                <div
                  key="tooltip"
                  aria-hidden
                  className={cn("pointer-events-none absolute bottom-full z-10 pb-2", edgeAlign(x(active)))}
                  style={{ left: `${x(active)}%` }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
                    transition={{ duration: DURATION.fast, ease: EASE_OUT }}
                  >
                    <PopoverSurface className="whitespace-nowrap px-3 py-2 text-xs">
                      <p className="mb-1 font-medium text-foreground">{current.label}</p>
                      <p className="num text-muted-foreground">
                        {t("record", { wins: current.wins, losses: current.losses })}
                        {" · "}
                        <span className={current.pct == null ? undefined : current.pct >= 50 ? "text-win" : "text-loss"}>
                          {pctText(current.pct)}
                        </span>
                      </p>
                    </PopoverSurface>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div aria-hidden className="relative mt-2 h-4">
            {points.map((p, i) =>
              i % step === 0 ? (
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
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-3 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-win/80" />
          {t("wins")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-loss/45" />
          {t("losses")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-foreground" />
          {t("cumulative")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t border-dashed border-border-strong" />
          {t("baseline")}
        </li>
      </ul>
    </div>
  );
}
