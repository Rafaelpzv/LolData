import { describe, expect, it } from "vitest";

import {
  AHEAD_GOLD,
  buildGoldCurve,
  finalLead,
  goldAt,
  interquartile,
} from "./gold-curve";
import type { PremadeTimeline } from "./timeline";

/** A timeline with one frame a minute from 0 to `minutes`, gold difference following `diff`. */
function timeline(
  minutes: number,
  diff: (minute: number) => number,
  duration = minutes * 60,
): PremadeTimeline {
  const points: [number, number][] = [];
  for (let minute = 0; minute <= minutes; minute += 1)
    points.push([minute * 60, diff(minute)]);
  return {
    matchId: `M${minutes}-${Math.random()}`,
    duration,
    endOfGameResult: "GameComplete",
    frameInterval: 60_000,
    goldSeries: [],
    goldDiff: points,
    xpDiff: [],
    kills: [],
    objectives: [],
    positions: [],
    deaths: [],
    finalStats: {
      gold: 0,
      kills: 0,
      deaths: 0,
      towers: 0,
      dragons: 0,
      barons: 0,
    },
  };
}

describe("goldAt", () => {
  it("reads the last frame at or before the minute", () => {
    const tl = timeline(20, (minute) => minute * 100);
    expect(goldAt(tl, 10)).toBe(1_000);
  });

  it("does not carry a short game past its end", () => {
    // Ended at 8 minutes: minute 10 is not a game, it is an absence.
    const tl = timeline(8, () => 500, 480);
    expect(goldAt(tl, 8)).toBe(500);
    expect(goldAt(tl, 9)).toBeNull();
  });
});

describe("buildGoldCurve", () => {
  const games = [
    { timeline: timeline(25, (minute) => minute * 200), win: true },
    { timeline: timeline(25, (minute) => minute * -200), win: false },
    { timeline: timeline(25, (minute) => minute * 150), win: true },
  ];

  it("keeps the median, the band and the sample of every minute", () => {
    const curve = buildGoldCurve(games, 4);
    const ten = curve.points.find((point) => point.minute === 10);
    // Diffs at minute 10: +2000, -2000, +1500: median 1500, q1 -250, q3 1750.
    expect(ten?.n).toBe(3);
    expect(ten?.median).toBe(1_500);
    expect(ten?.q1).toBeCloseTo(-250);
    expect(ten?.q3).toBeCloseTo(1_750);
    expect(curve.missingTimelines).toBe(1);
  });

  it("drops the games that ended before the minute", () => {
    const curve = buildGoldCurve(
      [{ timeline: timeline(5, () => 100, 300), win: true }],
      1,
    );
    expect(curve.points.find((point) => point.minute === 6)?.n).toBe(0);
    expect(curve.points.find((point) => point.minute === 4)?.median).toBe(100);
  });

  it("counts ahead and behind with the fixed threshold on both sides", () => {
    const curve = buildGoldCurve(games, 3);
    const marker = curve.markers.find((entry) => entry.minute === 15);
    // At 15: +3000, -3000, +2250: two ahead (both wins), one behind (the loss).
    expect(marker?.aheadGames).toBe(2);
    expect(marker?.aheadWins).toBe(2);
    expect(marker?.behindGames).toBe(1);
    expect(marker?.behindWins).toBe(0);
    expect(marker && interquartile(marker)).toBeGreaterThan(0);
    expect(AHEAD_GOLD).toBe(1_000);
  });

  it("splits the wins from the losses instead of averaging them together", () => {
    const curve = buildGoldCurve(games, 3);
    expect(
      curve.byResult.wins.find((point) => point.minute === 10)?.median,
    ).toBe(1_750);
    expect(
      curve.byResult.losses.find((point) => point.minute === 10)?.median,
    ).toBe(-2_000);
  });
});

describe("finalLead", () => {
  it("is the median of the last frames", () => {
    expect(
      finalLead([
        { timeline: timeline(10, () => 1_000) },
        { timeline: timeline(10, () => 3_000) },
      ]),
    ).toBe(2_000);
    expect(finalLead([])).toBeNull();
  });
});
