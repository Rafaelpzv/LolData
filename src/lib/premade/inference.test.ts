import { describe, expect, it } from "vitest";

import { tCritical, compareWindows, CONFIDENCE_LABEL } from "./inference";

describe("tCritical", () => {
  it("matches the published 95% table for the small degrees of freedom", () => {
    // Row values of any two-sided 95% t table.
    expect(tCritical(1)).toBeCloseTo(12.706, 3);
    expect(tCritical(5)).toBeCloseTo(2.571, 3);
    expect(tCritical(10)).toBeCloseTo(2.228, 3);
    expect(tCritical(30)).toBeCloseTo(2.042, 3);
  });

  it("uses z above 30 degrees of freedom and t below", () => {
    expect(tCritical(31)).toBeCloseTo(1.96, 2);
    expect(tCritical(5.9)).toBeCloseTo(2.571, 3); // rounds down, the conservative side
    expect(tCritical(Infinity)).toBeCloseTo(1.96, 2);
    expect(tCritical(0)).toBe(Infinity);
  });
});

describe("compareWindows", () => {
  it("measures a change against the standard error of the difference, not the spread of games", () => {
    // Two windows that differ by a constant +1 with identical spread 1:
    // before = 3,4,5,6,7 ; after = 4,5,6,7,8. sd of each is sqrt(2.5) = 1.5811.
    // se = sqrt(2.5/5 + 2.5/5) = 1.0 ; delta = 1 ; so t = 1.0, df = 8, t* = 2.306.
    const result = compareWindows([3, 4, 5, 6, 7], [4, 5, 6, 7, 8], {
      direction: 1,
    });
    expect(result.delta).toBe(1);
    expect(result.standardError).toBeCloseTo(1, 10);
    expect(result.signal).toBeCloseTo(1, 10);
    expect(result.degreesOfFreedom).toBe(8);
    expect(result.criticalValue).toBeCloseTo(2.306, 3);
    // The interval [-1.306, 3.306] contains zero: a one-unit shift over five games proves nothing.
    expect(result.low).toBeCloseTo(-1.306, 3);
    expect(result.high).toBeCloseTo(3.306, 3);
    expect(result.verdict).toBe("inconclusive");
  });

  it("calls a change real only when the interval leaves zero entirely", () => {
    // before = 10 ten times, after = 20 ten times: no spread inside a window, so it is inconclusive
    // by construction (a constant window cannot estimate its own variation).
    expect(
      compareWindows([10, 10, 10], [20, 20, 20], { direction: 1 }).verdict,
    ).toBe("inconclusive");

    // Realistic-window version: small spread, large shift.
    const before = [9, 10, 11, 10, 9, 10, 11, 10];
    const after = [14, 15, 16, 15, 14, 15, 16, 15];
    const result = compareWindows(before, after, { direction: 1 });
    expect(result.signal).toBeGreaterThan(result.criticalValue ?? Infinity);
    expect(result.low).toBeGreaterThan(0);
    expect(result.verdict).toBe("improved");

    // The same shift with the direction flipped is a worsening, never an improvement.
    expect(
      compareWindows(before, after, { direction: -1 }).verdict,
    ).toBe("worsened");
  });

  it("a lower value is better when the metric says so (deaths)", () => {
    const before = [8, 9, 10, 9, 8, 9, 10, 9];
    const after = [4, 5, 6, 5, 4, 5, 6, 5];
    expect(compareWindows(before, after, { direction: -1 }).verdict).toBe(
      "improved",
    );
  });

  it("no direction means no verdict, only the numbers", () => {
    const result = compareWindows([1, 2, 3, 4], [5, 6, 7, 8]);
    expect(result.low).not.toBeNull();
    expect(result.verdict).toBe("inconclusive");
  });

  it("is unmeasurable when a window has fewer than two games", () => {
    const result = compareWindows([1], [5, 6, 7], { direction: 1 });
    expect(result.before).toBe(1);
    expect(result.after).toBe(6);
    expect(result.delta).toBe(5);
    expect(result.standardError).toBeNull();
    expect(result.verdict).toBe("unmeasurable");
  });

  it("is unmeasurable with an empty window instead of inventing a zero", () => {
    const result = compareWindows([], [5, 6, 7], { direction: 1 });
    expect(result.before).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.verdict).toBe("unmeasurable");
  });

  it("reports a determinate no-change when both windows are identical constants", () => {
    const result = compareWindows([7, 7, 7], [7, 7, 7], { direction: 1 });
    expect(result.delta).toBe(0);
    expect(result.signal).toBe(0);
    expect(result.verdict).toBe("inconclusive");
    expect(result.low).toBeNull();
  });

  it("keeps the relative change against the first window", () => {
    const result = compareWindows([10, 11, 9, 10], [15, 14, 16, 15]);
    expect(result.relative).toBeCloseTo(0.5, 2);
  });

  it("has no relative change when the baseline is zero", () => {
    expect(compareWindows([0, 0, 0, 0], [1, 1, 1, 1]).relative).toBeNull();
  });

  it("drops non-finite values instead of poisoning the mean", () => {
    const result = compareWindows(
      [3, 4, Number.NaN, 5],
      [4, 5, Infinity, 6],
      { direction: 1 },
    );
    expect(result.gamesBefore).toBe(3);
    expect(result.gamesAfter).toBe(3);
    expect(Number.isFinite(result.before)).toBe(true);
    expect(Number.isFinite(result.after)).toBe(true);
  });

  it("says its confidence level", () => {
    expect(CONFIDENCE_LABEL).toBe("95%");
  });
});
