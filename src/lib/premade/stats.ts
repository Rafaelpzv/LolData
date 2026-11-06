// Statistics behind every number the premade analysis shows. Pure: no I/O, no Next, no Supabase.
//
// Conventions used across the analysis (documented here once, read everywhere):
//  - A game is the observation unit. Events of one game are never independent observations.
//  - Means use the arithmetic mean; spreads use the SAMPLE standard deviation (n - 1), so the
//    variation of two games is not divided by two. The coefficient of variation is sd / mean,
//    returned as a FRACTION (0.38 = 38%) and null when the mean is zero or there is one game.
//  - Proportions come with a Wilson 95% interval, never with the normal approximation, because the
//    samples here are small and the rates sit close to 0 and 1.
//  - Nothing here invents a value: an interval without data is null, never a guess.

/** Sample sizes are counted per metric; these labels only help the reader, they prove nothing. */
export const SAMPLE_BANDS = [
  { min: 80, label: "good" },
  { min: 40, label: "moderate" },
  { min: 20, label: "low" },
  { min: 10, label: "veryLow" },
  { min: 0, label: "insufficient" },
] as const;

export type SampleBand = (typeof SAMPLE_BANDS)[number]["label"];

export function sampleBand(n: number): SampleBand | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return SAMPLE_BANDS.find((band) => n >= band.min)?.label ?? "insufficient";
}

/** Two-sided 95%: z for the Wilson interval. */
const Z95 = 1.959963984540054;

export interface Proportion {
  successes: number;
  total: number;
  /** 0..1, null when the denominator is zero. */
  rate: number | null;
  /** Wilson 95% interval, 0..1. Null when there is nothing to estimate. */
  low: number | null;
  high: number | null;
}

/**
 * Proportion with its Wilson score interval: the estimator used here for every binomial rate, wild when small.
 */
export function proportion(successes: number, total: number): Proportion {
  const n = Math.max(0, Math.trunc(total));
  const k = Math.min(n, Math.max(0, Math.trunc(successes)));
  if (n === 0)
    return { successes: k, total: 0, rate: null, low: null, high: null };
  const p = k / n;
  const z2 = Z95 * Z95;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin =
    (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    successes: k,
    total: n,
    rate: p,
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

/** `61.9% (31/50)` with the interval when it exists; never a rate without its denominator. */
export function formatProportion(value: Proportion, digits = 1): string {
  if (value.rate === null) return "\u2014";
  const pct = `${(value.rate * 100).toFixed(digits)}% (${value.successes}/${value.total})`;
  if (value.low === null || value.high === null) return pct;
  return `${pct} \u00b7 IC95 ${(value.low * 100).toFixed(0)}\u2013${(value.high * 100).toFixed(0)}%`;
}

export function mean(values: readonly number[]): number | null {
  return values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

/** Sample standard deviation (n - 1). Null with fewer than two values. */
export function standardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  const variance =
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/** Coefficient of variation as a fraction: sample sd / mean. Null when the mean is zero or one game. */
export function coefficientOfVariation(
  values: readonly number[],
): number | null {
  const sd = standardDeviation(values);
  const m = mean(values);
  if (sd === null || m === null || m === 0) return null;
  return sd / Math.abs(m);
}

/** Linear-interpolated quantile (Hyndman type 7, the default of R and numpy). Values unsorted. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, q));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

export interface Spread {
  n: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  /** Sample standard deviation. */
  sd: number | null;
  min: number | null;
  max: number | null;
}

/** Mean, median, quartiles and spread of one metric over its observations. */
export function spread(values: readonly number[]): Spread {
  if (values.length === 0) {
    return {
      n: 0,
      mean: null,
      median: null,
      q1: null,
      q3: null,
      sd: null,
      min: null,
      max: null,
    };
  }
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    sd: standardDeviation(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** A change already divided by the observed noise: null when the noise cannot be estimated. */
export interface NoiseComparison {
  before: number | null;
  after: number | null;
  /** after - before, in the metric's unit (points of win rate, deaths per game...). */
  delta: number | null;
  /** relative change (delta / before), null when before is zero or missing. */
  relative: number | null;
  /** sd of the differences between comparable pairs (see `meanDifference`). */
  noise: number | null;
  /**
   * Rough number of "noise units" in the change: delta / noise. The prompt asked not to call a
   * change small or big on vibes; this is the yardstick. There is no p-value here, and it must not
   * be read as one.
   */
  signal: number | null;
  pairs: number;
}

/** |signal| below this is a change of the same size as the normal game-to-game noise. */
export const NOISE_THRESHOLD = 1;

/**
 * Difference between two windows on per-game values, measured against the natural spread of the
 * metric itself (the standard deviation of the games in both windows). With fewer than two games
 * on either side the noise is unknown and the change is not judged.
 */
export function compareAgainstNoise(
  before: readonly number[],
  after: readonly number[],
): NoiseComparison {
  const a = mean(before);
  const b = mean(after);
  const delta = a === null || b === null ? null : b - a;
  const relative =
    delta === null || a === null || a === 0 ? null : delta / Math.abs(a);
  const values = [...before, ...after];
  const m = mean(values);
  // Fewer than two games on either window: one side has no spread, and the noise would be zero.
  const noise =
    before.length >= 2 && after.length >= 2 && m !== null
      ? Math.sqrt(
          values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
            (values.length - 1),
        )
      : null;
  return {
    before: a,
    after: b,
    delta,
    relative,
    noise,
    signal:
      delta === null || noise === null || noise === 0 ? null : delta / noise,
    pairs: values.length,
  };
}

/** `+2.3 pp` for a change of a proportion given in 0..1. */
export function formatPoints(delta: number | null, digits = 1): string {
  if (delta === null || !Number.isFinite(delta)) return "\u2014";
  return `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(digits)} pp`;
}

/** `+1.20` for a change in units. */
export function formatDelta(delta: number | null, digits = 2): string {
  if (delta === null || !Number.isFinite(delta)) return "\u2014";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(digits)}`;
}

/** Seconds -> `mm:ss`, the only place a time ever becomes text. Never `11:60`. */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
    return "\u2014";
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Gold with a sign, in thousands: `+2.3k`. Gold differences are large numbers; reading them with
 * a unit is the only way a chart and a table can agree.
 */
export function formatGold(delta: number | null, digits = 1): string {
  if (delta === null || !Number.isFinite(delta)) return "\u2014";
  const thousands = delta / 1000;
  const rounded = Math.abs(thousands) < 0.05 ? 0 : thousands;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}k`;
}
