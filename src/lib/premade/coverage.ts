// What a number is made of (prompt §2.2). Pure: no I/O, no Next, no Supabase.
//
// Every metric the app shows is created through `metric()`, which cannot omit: the valid
// observations, the games considered, the denominator in words, the source of the data, the formula,
// the limitations and the coverage. "No data" is a value, never a zero and never a missing row.

import type { Proportion } from "./stats";

/** Where the number comes from: which endpoint/table of the pipeline produced it. */
export type MetricSource =
  | "match" // Match-V5 participant/side fields, stored per game
  | "sideObjectives" // info.teams[].objectives, the SIDE's count (fillers included)
  | "timeline" // Match-V5 timeline events (kills, objectives, building kills)
  | "timelinePositions" // Match-V5 timeline participantFrames (sampled ~1/min)
  | "timelineDerived" // per-participant derived data from the timeline (build, lane at 10/15)
  | "framework"; // the app's own record of the games (roster, duration, result)

/** How much of the window a metric could actually read. */
export interface Coverage {
  /** Games of the window the metric was computed over. */
  gamesConsidered: number;
  /** Games that had the data the metric needs (never larger than `gamesConsidered`). */
  gamesWithData: number;
  /** Observations behind the value: for a per-game mean this equals `gamesWithData`; for a rate of
   * events it is the number of EVENTS, which is why it is kept apart. */
  observations: number;
  /** `gamesWithData / gamesConsidered`, null when the window is empty. */
  rate: number | null;
}

export interface MetricDefinition<T> {
  /** Stable key: `premade.metrics.<key>` in the message catalog. */
  key: string;
  /** The label of the metric in its own unit (fraction, ratio, seconds, gold, games). */
  unit: MetricUnit;
  /** The value, null when the metric cannot be computed for this window. */
  value: T | null;
  /** The denominator stated in words, e.g. "jogos com timeline", "dragões disputados". */
  denominator: string;
  source: MetricSource;
  /** The formula exactly as applied, for the evidence level (§8.3). */
  formula: string;
  /** What this number cannot tell, always said next to it. */
  limitations: string[];
  /** The proportion, when the value is a rate: wins/games travels with every percent. */
  proportion?: Proportion;
  coverage: Coverage;
  /** Below the floor the metric is shown but cannot support a conclusion. */
  sampleFloor: number;
  /** True when the value exists and its sample reaches the floor. */
  conclusive: boolean;
}

export type MetricUnit =
  | "fraction" // 0..1
  | "percent" // 0..100
  | "ratio" // unbounded multiplier
  | "count" // absolute count
  | "perGame"
  | "perMinute"
  | "seconds"
  | "minutes"
  | "gold"
  | "games";

export interface MetricInput<T> {
  key: string;
  unit: MetricUnit;
  value: T | null;
  denominator: string;
  source: MetricSource;
  formula: string;
  limitations?: string[];
  proportion?: Proportion;
  gamesConsidered: number;
  /** Defaults to `observations`. */
  gamesWithData?: number;
  observations?: number;
  sampleFloor: number;
}

/** Builds a metric with its full definition; nothing here can be left implicit. */
export function metric<T>(input: MetricInput<T>): MetricDefinition<T> {
  const gamesConsidered = Math.max(0, Math.trunc(input.gamesConsidered));
  const observations = Math.max(
    0,
    Math.trunc(input.observations ?? input.gamesConsidered),
  );
  const gamesWithData = Math.max(
    0,
    Math.min(
      gamesConsidered,
      Math.trunc(input.gamesWithData ?? observations),
    ),
  );
  const value = input.value;
  return {
    key: input.key,
    unit: input.unit,
    value,
    denominator: input.denominator,
    source: input.source,
    formula: input.formula,
    limitations: input.limitations ?? [],
    proportion: input.proportion,
    coverage: {
      gamesConsidered,
      gamesWithData,
      observations,
      rate: gamesConsidered > 0 ? gamesWithData / gamesConsidered : null,
    },
    sampleFloor: input.sampleFloor,
    conclusive:
      value !== null && gamesWithData >= input.sampleFloor && observations > 0,
  };
}

/** A metric that could not be computed, saying why instead of showing a zero. */
export function unavailable<T>(input: {
  key: string;
  unit: MetricUnit;
  reason: string;
  denominator: string;
  source: MetricSource;
  formula: string;
  gamesConsidered: number;
  sampleFloor: number;
  limitations?: string[];
}): MetricDefinition<T> {
  return metric<T>({
    ...input,
    value: null,
    gamesWithData: 0,
    observations: 0,
    limitations: [input.reason, ...(input.limitations ?? [])],
  });
}
