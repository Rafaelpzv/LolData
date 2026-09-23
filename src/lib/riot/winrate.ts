// Win rate over a time period: shared by /api/summoner/winrate and its fixtures.

export const WINRATE_PERIODS = ["today", "week", "month", "3months", "year"] as const;
export type WinratePeriod = (typeof WINRATE_PERIODS)[number];

/** Most recent games aggregated per request (dev keys allow 100 requests / 2 min). */
export const MAX_MATCHES = 100;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const PERIOD_MS: Record<WinratePeriod, number> = {
  // "Today" is ambiguous on the server (viewer's midnight is unknown): last 24h.
  today: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  "3months": 90 * DAY,
  year: 365 * DAY,
};

export type BucketSize = "hour" | "day" | "week";

export const BUCKET_SIZE: Record<WinratePeriod, BucketSize> = {
  today: "hour",
  week: "day",
  month: "day",
  "3months": "week",
  year: "week",
};

export interface WinrateGame {
  /** Game end (or start) timestamp, epoch ms. */
  ts: number;
  win: boolean;
}

export interface WinrateBucket {
  start: string;
  wins: number;
  losses: number;
}

export interface WinrateResponse {
  period: WinratePeriod;
  from: string;
  to: string;
  total: number;
  wins: number;
  losses: number;
  truncated: boolean;
  sampled: number;
  buckets: WinrateBucket[];
}

export function isWinratePeriod(value: string | null): value is WinratePeriod {
  return !!value && (WINRATE_PERIODS as readonly string[]).includes(value);
}

export function periodRange(period: WinratePeriod, now: number): { from: number; to: number } {
  return { from: now - PERIOD_MS[period], to: now };
}

/** Start of the bucket containing `ts` (UTC; weeks start on Monday, ISO). */
function bucketStart(ts: number, size: BucketSize): number {
  if (size === "hour") return Math.floor(ts / HOUR) * HOUR;
  const day = Math.floor(ts / DAY) * DAY;
  if (size === "day") return day;
  const weekday = (new Date(day).getUTCDay() + 6) % 7;
  return day - weekday * DAY;
}

function nextBucket(ts: number, size: BucketSize): number {
  return ts + (size === "hour" ? HOUR : size === "day" ? DAY : 7 * DAY);
}

/** Buckets cover the whole period (empty ones included) so the chart keeps a steady time axis. */
export function aggregateWinrate(
  games: WinrateGame[],
  period: WinratePeriod,
  now: number,
  truncated: boolean,
): WinrateResponse {
  const { from, to } = periodRange(period, now);
  const size = BUCKET_SIZE[period];
  const buckets = new Map<number, WinrateBucket>();
  for (let t = bucketStart(from, size); t <= to; t = nextBucket(t, size)) {
    buckets.set(t, { start: new Date(t).toISOString(), wins: 0, losses: 0 });
  }

  let wins = 0;
  let losses = 0;
  for (const game of games) {
    if (game.ts < from || game.ts > to) continue;
    const bucket = buckets.get(bucketStart(game.ts, size));
    if (!bucket) continue;
    if (game.win) {
      bucket.wins++;
      wins++;
    } else {
      bucket.losses++;
      losses++;
    }
  }

  return {
    period,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    total: wins + losses,
    wins,
    losses,
    truncated,
    sampled: wins + losses,
    buckets: [...buckets.values()],
  };
}
