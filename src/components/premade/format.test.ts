import { describe, expect, it } from "vitest";

import { fromFraction, fromPercent, interval } from "./format";

describe("premade formatters", () => {
  it("formats a 0..1 fraction as a percentage", () => {
    expect(fromFraction(0.72)).toBe("72%");
    expect(fromFraction(0.7249, 1)).toBe("72.5%");
    expect(fromFraction(1)).toBe("100%");
    expect(fromFraction(0)).toBe("0%");
  });

  it("formats a value that is already a percentage without scaling it again", () => {
    // The bug this module exists to prevent: 54.41 was rendered as "5441%".
    expect(fromPercent(54.41)).toBe("54%");
    expect(fromPercent(57.8, 1)).toBe("57.8%");
    expect(fromPercent(100)).toBe("100%");
  });

  it("keeps the two units apart for the same number", () => {
    expect(fromFraction(50)).toBe("5000%");
    expect(fromPercent(50)).toBe("50%");
  });

  it("renders missing values as a dash, never as 0", () => {
    expect(fromFraction(null)).toBe("\u2014");
    expect(fromPercent(null)).toBe("\u2014");
    expect(fromFraction(Number.NaN)).toBe("\u2014");
    expect(interval(null, 0.5)).toBe("\u2014");
  });

  it("formats a confidence interval from fractions", () => {
    expect(interval(0.44, 0.64)).toBe("44%\u201364%");
  });
});
