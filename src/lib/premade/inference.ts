// Small-sample inference for the analysis: is a change bigger than the noise of these games?
// Pure: no I/O, no Next, no Supabase.
//
// Why this module exists. The analysis compares two windows of per-game values (recent against
// previous, after training against the baseline). The rule the prompt asks for: "não utilize apenas
// limites fixos para afirmar que uma mudança é ruído". The right yardstick for a MEAN is the
// standard error of the difference, not the spread of a single game:
//
//     se = sqrt(s1²/n1 + s2²/n2)        (Welch; no assumption that both windows vary equally)
//     t  = (mean2 - mean1) / se
//
// With 20 vs 20 games the spread of the games is about 6.3 times the standard error of their
// difference, so judging a change against the spread alone calls almost everything "noise".
// Using the noise of the metric (one game) as the denominator is the mistake this replaces.
//
// The interval is a Welch t interval, and the critical value comes from the Student t at the Welch
// degrees of freedom (Welch–Satterthwaite), so a 5v5 comparison needs |t| >= 2.31 instead of 1.96.
// Nothing here is a p-value test a reader is asked to interpret; the output is the same
// signal/noise vocabulary the UI already shows, now with the right denominator.

import { CHANGE_Z, CONFIDENCE_LEVEL, T_MAX_DF } from "./config";
import { mean, standardDeviation } from "./stats";

/** Two-sided critical values of Student t at 95%, by degrees of freedom 1..30. */
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069,
  2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
] as const;

/**
 * Two-sided critical value of Student t at 95% for `df` degrees of freedom. Non-integer df (Welch
 * rounds down, the conservative choice) and anything above 30 fall back to z.
 */
export function tCritical(df: number): number {
  // A pool of one pair of games is t(1)-like at best; an unknown df (Infinity) is the normal limit.
  if (Number.isNaN(df) || df < 1) return Infinity;
  if (df === Infinity || df > T_MAX_DF) return CHANGE_Z;
  return T_975[Math.floor(df) - 1];
}

/** Where a change stands, in the words the prompt asks for (§6.3). */
export type ChangeVerdict =
  | "improved"
  | "worsened"
  | "inconclusive"
  | "unmeasurable";

export interface ChangeAnalysis {
  /** Mean of each window; null when a window is empty. */
  before: number | null;
  after: number | null;
  /** after - before, in the metric's own unit. */
  delta: number | null;
  /** delta / |before|, null when `before` is zero, missing or the metric has no meaningful zero. */
  relative: number | null;
  gamesBefore: number;
  gamesAfter: number;
  /** Standard deviation of each window (sample, n-1); null with fewer than two games. */
  sdBefore: number | null;
  sdAfter: number | null;
  /** sqrt(s1²/n1 + s2²/n2): the standard error of the difference of the two means. */
  standardError: number | null;
  /** Welch degrees of freedom; null when the standard error is unavailable. */
  degreesOfFreedom: number | null;
  /** Two-sided 95% interval of the change: delta ± t * se. Null when it cannot be computed. */
  low: number | null;
  high: number | null;
  /** delta / standardError: how many standard errors the change is. Never a p-value. */
  signal: number | null;
  criticalValue: number | null;
  /** "improved" only when the interval is entirely on the better side of zero. */
  verdict: ChangeVerdict;
}

export interface ChangeOptions {
  /**
   * Which direction is an improvement: +1 when a higher value is better (CS/min), -1 when a lower
   * value is better (deaths), 0 when the metric has no better side (an average gold lead), in which
   * case the verdict can only be "inconclusive" or "unmeasurable".
   */
  direction?: 1 | -1 | 0;
}

const isNumber = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);

/**
 * Compares two windows of per-game observations. A window with fewer than two games has no spread
 * of its own, so the change is `unmeasurable`: the app says "dados insuficientes", never "no change".
 */
export function compareWindows(
  before: readonly number[],
  after: readonly number[],
  options: ChangeOptions = {},
): ChangeAnalysis {
  const direction = options.direction ?? 0;
  const b = before.filter(isNumber);
  const a = after.filter(isNumber);
  const meanBefore = mean(b);
  const meanAfter = mean(a);
  const delta =
    meanBefore === null || meanAfter === null ? null : meanAfter - meanBefore;
  const sdBefore = standardDeviation(b);
  const sdAfter = standardDeviation(a);
  const relative =
    delta === null || meanBefore === null || meanBefore === 0
      ? null
      : delta / Math.abs(meanBefore);

  const base: ChangeAnalysis = {
    before: meanBefore,
    after: meanAfter,
    delta,
    relative,
    gamesBefore: b.length,
    gamesAfter: a.length,
    sdBefore,
    sdAfter,
    standardError: null,
    degreesOfFreedom: null,
    low: null,
    high: null,
    signal: null,
    criticalValue: null,
    verdict: "unmeasurable",
  };

  if (
    delta === null ||
    sdBefore === null ||
    sdAfter === null ||
    b.length < 2 ||
    a.length < 2
  ) {
    return base;
  }

  const variance =
    (sdBefore * sdBefore) / b.length + (sdAfter * sdAfter) / a.length;
  if (!(variance > 0)) {
    // Both windows are perfectly constant: the change is either zero (no change at all) or real,
    // but a constant sample cannot say anything about the variability, so the interval is undefined.
    // Zero delta with zero variance is reported as a determinate "no change".
    return delta === 0
      ? { ...base, standardError: 0, signal: 0, verdict: "inconclusive" }
      : { ...base, standardError: 0, signal: null, verdict: "inconclusive" };
  }

  const standardError = Math.sqrt(variance);
  // Welch–Satterthwaite: the effective degrees of freedom of the pooled standard error.
  const numerator = variance * variance;
  const denominator =
    (sdBefore ** 4) / (b.length ** 2 * (b.length - 1)) +
    (sdAfter ** 4) / (a.length ** 2 * (a.length - 1));
  const degreesOfFreedom =
    denominator > 0 ? Math.floor(numerator / denominator) : Infinity;
  const criticalValue = tCritical(degreesOfFreedom);
  const signal = delta / standardError;
  const margin = criticalValue * standardError;
  const low = delta - margin;
  const high = delta + margin;

  let verdict: ChangeVerdict = "inconclusive";
  if (direction !== 0 && Number.isFinite(criticalValue)) {
    // The whole interval has to sit on the better side of zero: the strict reading, which is the
    // one that avoids calling a change from an interval that still contains "nothing happened".
    if (direction > 0 && low > 0) verdict = "improved";
    else if (direction > 0 && high < 0) verdict = "worsened";
    else if (direction < 0 && high < 0) verdict = "improved";
    else if (direction < 0 && low > 0) verdict = "worsened";
  }

  return {
    ...base,
    standardError,
    degreesOfFreedom: Number.isFinite(degreesOfFreedom)
      ? degreesOfFreedom
      : null,
    low,
    high,
    signal,
    criticalValue: Number.isFinite(criticalValue) ? criticalValue : null,
    verdict,
  };
}

/** The confidence level as text (`95%`), so the interval is never shown without its level. */
export const CONFIDENCE_LABEL = `${Math.round(CONFIDENCE_LEVEL * 100)}%`;
