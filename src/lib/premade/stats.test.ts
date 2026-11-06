import { describe, expect, it } from "vitest";

import {
  coefficientOfVariation,
  compareAgainstNoise,
  formatProportion,
  formatSeconds,
  mean,
  median,
  proportion,
  quantile,
  sampleBand,
  spread,
  standardDeviation,
} from "./stats";

describe("proportion and the Wilson interval", () => {
  it("keeps the rate with its denominator", () => {
    const value = proportion(31, 50);
    expect(value.rate).toBeCloseTo(0.62);
    // A Wilson 95% interval of 31/50 is about 48.2%..74.1%.
    expect(value.low).toBeCloseTo(0.482, 2);
    expect(value.high).toBeCloseTo(0.741, 2);
    expect(formatProportion(value)).toBe(
      "62.0% (31/50) \u00b7 IC95 48\u201374%",
    );
  });

  it("does not collapse to a point at 0 and 1", () => {
    const all = proportion(10, 10);
    expect(all.rate).toBe(1);
    expect(all.low).toBeLessThan(1);
    expect(all.low).toBeGreaterThan(0.6);
    const none = proportion(0, 5);
    expect(none.high).toBeGreaterThan(0);
    expect(none.high).toBeLessThan(0.6);
  });

  it("without a denominator there is no rate and no interval", () => {
    const value = proportion(0, 0);
    expect(value).toEqual({
      successes: 0,
      total: 0,
      rate: null,
      low: null,
      high: null,
    });
    expect(formatProportion(value)).toBe("\u2014");
  });

  it("clamps nonsense counts instead of throwing", () => {
    expect(proportion(5, 2).rate).toBe(1);
    expect(proportion(-1, 2).rate).toBe(0);
  });
});

describe("spread, median and quantiles", () => {
  it("uses the sample standard deviation", () => {
    // n-1: sqrt((4 + 1 + 0 + 1 + 4) / 4) = sqrt(2.5)
    expect(standardDeviation([3, 4, 5, 6, 7])).toBeCloseTo(Math.sqrt(2.5));
    expect(standardDeviation([5])).toBeNull();
  });

  it("interpolates the quantiles like R's type 7", () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(median([1, 100, 3])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("summarises a series without inventing values", () => {
    expect(spread([])).toMatchObject({ n: 0, mean: null, median: null });
    const s = spread([10, 20, 30]);
    expect(s.n).toBe(3);
    expect(s.mean).toBe(20);
    expect(s.median).toBe(20);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
  });
});

describe("coefficient of variation", () => {
  it("is sd / mean as a fraction", () => {
    // sd = 1, mean = 4, so 25%: not 0.25% and not 0.0025.
    expect(coefficientOfVariation([3, 4, 5])).toBeCloseTo(0.25);
  });

  it("is zero when every game is identical and null when the mean is zero", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
    expect(coefficientOfVariation([0, 0, 0])).toBeNull();
    expect(coefficientOfVariation([7])).toBeNull();
    expect(coefficientOfVariation([])).toBeNull();
  });
});

describe("sample bands", () => {
  it("labels the ranges the analysis annotates", () => {
    expect(sampleBand(0)).toBeNull();
    expect(sampleBand(9)).toBe("insufficient");
    expect(sampleBand(10)).toBe("veryLow");
    expect(sampleBand(39)).toBe("low");
    expect(sampleBand(40)).toBe("moderate");
    expect(sampleBand(80)).toBe("good");
  });
});

describe("comparison against noise", () => {
  it("calls a change of one game's noise exactly one unit", () => {
    // Both windows are the same spread: the change between their means is one sd.
    const before = [4, 5, 6];
    const after = [5, 6, 7];
    const value = compareAgainstNoise(before, after);
    expect(value.delta).toBe(1);
    // Pooled over all six games: sd = sqrt(22/20) = 1.0488.
    expect(value.noise).toBeCloseTo(Math.sqrt(22 / 20));
    expect(value.signal).toBeCloseTo(1 / Math.sqrt(22 / 20));
  });

  it("does not judge a change it cannot measure", () => {
    const value = compareAgainstNoise([3], [3]);
    expect(value.delta).toBe(0);
    expect(value.noise).toBeNull();
    expect(value.signal).toBeNull();
  });

  it("keeps the nulls when one window is empty", () => {
    const value = compareAgainstNoise([], [1, 2, 3]);
    expect(value.before).toBeNull();
    expect(value.delta).toBeNull();
  });

  it("reports the relative change against the first window", () => {
    const value = compareAgainstNoise([10, 10], [15, 15]);
    expect(value.delta).toBe(5);
    expect(value.relative).toBe(0.5);
  });
});

describe("formatting", () => {
  it("never writes 11:60", () => {
    expect(formatSeconds(719)).toBe("11:59");
    expect(formatSeconds(719.6)).toBe("12:00");
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(null)).toBe("\u2014");
    expect(formatSeconds(-5)).toBe("\u2014");
    expect(formatSeconds(5_940)).toBe("99:00");
  });

  it("means what it says", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
  });
});
