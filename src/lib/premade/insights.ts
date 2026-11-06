// Evidence-first observations: the shape every automatic recommendation with a sample uses.
//
// Each rule that is worth showing carries: a title key, the neutral observation, the numbers behind
// it (with the denominator), the confidence and why, a limitation, a suggested exercise and a
// follow-up metric. Nothing is generated below its minimum sample, nothing says "caused", and the
// kind is "observed" whenever the number is only an association.
import {
  formatProportion,
  proportion,
  sampleBand,
  type Proportion,
  type SampleBand,
} from "./stats";

export type InsightKind = "observed" | "positive" | "sample" | "coverage";

export interface Insight {
  /** Message code under `premade.insights.<code>`; the text lives in messages. */
  code: string;
  kind: InsightKind;
  /** Sample band of the metric that justifies the observation (the UI labels it). */
  band: SampleBand;
  /** The numbers the sentence is about; every percent is a fraction with its denominator. */
  evidence: Record<string, number | string | null>;
  /** The person the observation is about, when it names one. */
  person?: string | null;
}

/** A proportion as evidence: the rate, the counts and the Wilson interval in one field. */
export function rateEvidence(value: Proportion, digits = 1): string {
  return formatProportion(value, digits);
}

/**
 * Bits shared by every rule: the two windows already read as proportions, and the shape of the
 * insight with its band taken from the smallest of the two samples (the weaker side decides).
 */
export function pairedInsight(
  code: string,
  kind: InsightKind,
  withIt: Proportion,
  withoutIt: Proportion,
  evidence: Record<string, number | string | null> = {},
): Insight | null {
  if (withIt.rate === null || withoutIt.rate === null) return null;
  return {
    code,
    kind,
    band: sampleBand(Math.min(withIt.total, withoutIt.total)) ?? "insufficient",
    evidence: {
      withIt: rateEvidence(withIt),
      withoutIt: rateEvidence(withoutIt),
      ...evidence,
    },
  };
}

/** Insight over a single proportion: its band is the sample of that proportion. */
export function singleInsight(
  code: string,
  kind: InsightKind,
  value: Proportion,
  evidence: Record<string, number | string | null> = {},
): Insight | null {
  if (value.rate === null) return null;
  return {
    code,
    kind,
    band: sampleBand(value.total) ?? "insufficient",
    evidence: { value: rateEvidence(value), ...evidence },
  };
}

/** The same two proportions, side by side, as the caller already computed them. */
export function sides(
  successesWith: number,
  gamesWith: number,
  successesWithout: number,
  gamesWithout: number,
) {
  return {
    withIt: proportion(successesWith, gamesWith),
    withoutIt: proportion(successesWithout, gamesWithout),
  };
}
