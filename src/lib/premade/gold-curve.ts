// The gold curve of the team, minute by minute. Pure: no I/O, no Next, no Supabase.
//
// One game contributes to minute M when its last timeline frame is at or after M: a game that
// ended at 21:40 is not a game at 25. Nothing is carried forward after the end of a game, and a
// missing frame is a missing observation, never a zero. Every point keeps its own sample, because
// the number of games behind minute 10 and minute 30 is not the same.
import { median, spread, type Spread } from "./stats";
import type { PremadeTimeline } from "./timeline";

/** The macro markers the overview and the collective tab show. */
export const MARKER_MINUTES = [10, 15, 20, 25] as const;
/** The curve covers the first 35 minutes: beyond it the sample of most teams is a handful of games. */
export const CURVE_LAST_MINUTE = 35;

export interface CurvePoint {
  minute: number;
  /** Games whose last frame reached this minute. */
  n: number;
  /** Median of the team's gold difference at this minute (negative = behind). */
  median: number | null;
  q1: number | null;
  q3: number | null;
  mean: number | null;
}

export interface CurveBreakdown {
  wins: CurvePoint[];
  losses: CurvePoint[];
}

export interface GoldMarker {
  minute: number;
  spread: Spread;
  /** Win rate when ahead at this minute, and when behind (AHEAD_GOLD describes "ahead"). */
  aheadGames: number;
  aheadWins: number;
  behindGames: number;
  behindWins: number;
}

export interface GoldCurve {
  points: CurvePoint[];
  byResult: CurveBreakdown;
  markers: GoldMarker[];
  /** Games the curve was read from. */
  games: number;
  /** Games in the list that are not in the curve because their timeline is missing. */
  missingTimelines: number;
}

/** A gold lead of at least this much at a minute counts as "ahead" (or behind). Fixed, never tuned. */
export const AHEAD_GOLD = 1_000;

/** Gold difference of a game at one minute: the last frame at or before it, null when it ended. */
export function goldAt(
  timeline: PremadeTimeline,
  minute: number,
): number | null {
  const last = timeline.goldDiff[timeline.goldDiff.length - 1]?.[0] ?? 0;
  const end = timeline.duration > 0 ? timeline.duration : last;
  if (end < minute * 60) return null;
  let value: number | null = null;
  for (const [second, diff] of timeline.goldDiff) {
    if (second <= minute * 60) value = diff;
    else break;
  }
  return value;
}

function pointsFrom(
  samples: { timeline: PremadeTimeline; win: boolean }[],
  lastMinute: number,
): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let minute = 0; minute <= lastMinute; minute += 1) {
    const values = samples.flatMap((sample) => {
      const value = goldAt(sample.timeline, minute);
      return value === null ? [] : [value];
    });
    const s = spread(values);
    out.push({
      minute,
      n: s.n,
      median: s.median,
      q1: s.q1,
      q3: s.q3,
      mean: s.mean,
    });
  }
  return out;
}

/**
 * The curve, its dispersion and the two conditions. `samples` are the timelines of the games in
 * the window; `expectGames` is how many games the window has, to count the missing timelines.
 */
export function buildGoldCurve(
  samples: { timeline: PremadeTimeline; win: boolean }[],
  expectGames?: number,
  lastMinute: number = CURVE_LAST_MINUTE,
): GoldCurve {
  const markers: GoldMarker[] = MARKER_MINUTES.map((minute) => {
    const values = samples.flatMap((sample) => {
      const value = goldAt(sample.timeline, minute);
      return value === null ? [] : [{ value, win: sample.win }];
    });
    const ahead = values.filter((entry) => entry.value >= AHEAD_GOLD);
    const behind = values.filter((entry) => entry.value <= -AHEAD_GOLD);
    return {
      minute,
      spread: spread(values.map((entry) => entry.value)),
      aheadGames: ahead.length,
      aheadWins: ahead.filter((entry) => entry.win).length,
      behindGames: behind.length,
      behindWins: behind.filter((entry) => entry.win).length,
    };
  });

  return {
    points: pointsFrom(samples, lastMinute),
    byResult: {
      wins: pointsFrom(
        samples.filter((sample) => sample.win),
        lastMinute,
      ),
      losses: pointsFrom(
        samples.filter((sample) => !sample.win),
        lastMinute,
      ),
    },
    markers,
    games: samples.length,
    missingTimelines:
      expectGames === undefined ? 0 : Math.max(0, expectGames - samples.length),
  };
}

/** Interquartile range of a marker, the width of the box the chart draws. */
export function interquartile(marker: GoldMarker): number | null {
  return marker.spread.q1 === null || marker.spread.q3 === null
    ? null
    : marker.spread.q3 - marker.spread.q1;
}

/** Median of the per-game finals: the gold difference at the end of the game. */
export function finalLead(
  samples: { timeline: PremadeTimeline }[],
): number | null {
  return median(
    samples.flatMap((sample) => {
      const last =
        sample.timeline.goldDiff[sample.timeline.goldDiff.length - 1];
      return last ? [last[1]] : [];
    }),
  );
}
