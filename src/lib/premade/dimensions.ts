// The team read as independent dimensions instead of one score from 0 to 10. Pure: no I/O.
//
// There is no composite index here on purpose: a single number would need validated weights, and
// an arbitrary weighting would present judgment as measurement (the prompt forbids it). Each
// dimension carries the metrics that compose it, their samples, the direction a better team moves
// in, and its own limitations. Where a metric cannot exist for the window (a game without a
// timeline, no side assists yet), the metric says "no data" instead of disappearing.
import {
  periodContext,
  splitPeriods,
  type PeriodWindow,
  type PremadeMetrics,
} from "./metrics";
import { proportion, type Proportion } from "./stats";
import { compareWindows, type ChangeAnalysis } from "./inference";
import type { TimelineMetrics } from "./timeline-metrics";
import type { AccountOwners, PremadeMatchSample } from "./types";

export type DimensionKey =
  | "objectiveControl"
  | "objectivePreparation"
  | "conversion"
  | "synchronization"
  | "consistency"
  | "individual"
  | "map";

/** One metric inside a dimension: its value, its own sample and where it comes from. */
export interface DimensionMetric {
  /** Message key under `premade.dimensions.metrics.<key>`. */
  key: string;
  /** The value in the metric's own unit (fraction, ratio, seconds). Null = not measurable here. */
  value: number | null;
  /** Proportion, when the value is a rate: wins/games travel with every percent. */
  proportion?: Proportion;
  /** Observations behind the value (games, objectives, deaths...). */
  n: number;
  /** The same metric in the previous window, for the evolution line. */
  previous: number | null;
  /**
   * Between the two windows: the change against the standard error of the difference (Welch), with
   * its interval and verdict. Null when one side has nothing to compare.
   */
  change: ChangeAnalysis | null;
  /**
   * +1 better when higher, -1 better when lower, 0 when the metric has no better side (a gold
   * lead). Set by whoever knows the reading, so the verdict is never guessed from the sign.
   */
  direction: -1 | 0 | 1;
}

export interface Dimension {
  key: DimensionKey;
  metrics: DimensionMetric[];
}

export interface WindowSummary {
  games: number;
  from: number | null;
  to: number | null;
  /** Games with the full five-person lineup. */
  fullGames: number;
  averagePeople: number | null;
  /** UTC days covered, oldest first. */
  days: string[];
}

export interface DimensionReport {
  dimensions: Dimension[];
  windows: { size: number; recent: WindowSummary; previous: WindowSummary };
}

interface Windows {
  metrics: PremadeMetrics;
  timeline: TimelineMetrics | null;
}

/** Compares one metric across the two windows; the standard error of the difference is the yardstick. */
function metric(
  key: string,
  recent: Windows,
  previous: Windows,
  read: (window: Windows) => {
    values: number[];
    n: number;
    proportion?: Proportion;
  },
  direction: -1 | 0 | 1 = 0,
): DimensionMetric {
  const now = read(recent);
  const before = read(previous);
  const mean = (values: number[]) =>
    values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  // A change only exists between two measurements: one missing side is "no comparison", not a delta.
  const comparable = now.values.length > 0 && before.values.length > 0;
  return {
    key,
    value: mean(now.values),
    proportion: now.proportion,
    n: now.n,
    previous: mean(before.values),
    change: comparable
      ? compareWindows(before.values, now.values, { direction })
      : null,
    direction,
  };
}

const single = (
  value: number | null,
  n: number,
  proportionValue?: Proportion,
) => ({
  values: value === null ? [] : [value],
  n,
  proportion: proportionValue,
});

const summarise = (
  window: PeriodWindow,
  owners: AccountOwners,
): WindowSummary => {
  const context = periodContext(window, owners);
  return {
    games: window.games.length,
    from: window.from,
    to: window.to,
    fullGames: context.fullGames,
    averagePeople: context.averagePeople,
    days: context.days,
  };
};

/**
 * Builds the seven dimensions over the newest `size` games and the `size` before them.
 * `timelineOf` answers the timeline metrics of one window (the caller counts the missing timelines);
 * `metricsOf` answers the full metrics of the same games. A window without timelines leaves the
 * timeline metrics empty, never zero.
 */
export function buildDimensions(
  matches: PremadeMatchSample[],
  timelineOf: (window: PeriodWindow) => TimelineMetrics | null,
  metricsOf: (window: PeriodWindow) => PremadeMetrics,
  owners: AccountOwners = {},
  size = 20,
): DimensionReport {
  const periods = splitPeriods(matches, size);
  const read = (window: PeriodWindow): Windows => ({
    metrics: metricsOf(window),
    timeline: timelineOf(window),
  });
  const recent = read(periods.recent);
  const previous = read(periods.previous);

  // The first objective is a per-game fact (first or not). The series handed to the comparison must
  // be the GAMES themselves, one 1/0 per game: it used to be a single rate value padded with zeros,
  // which mixed a proportion with a count and gave the standard error the wrong spread.
  const firstRate =
    (kind: "dragon" | "riftHerald" | "baron" | "tower") =>
    (window: Windows) => {
      const group = window.metrics.objectives[kind];
      const values: number[] = [];
      for (let index = 0; index < group.firstGames; index += 1) values.push(1);
      for (let index = group.firstGames; index < group.games; index += 1)
        values.push(0);
      return { values, n: group.games, proportion: group.firstStats };
    };

  // The direction of every metric, in the one place it is decided: +1 better when higher, -1 better
  // when lower, 0 no better side. It is stated here instead of inferred from the sign of the change,
  // because "fewer deaths" and "more towers" are both improvements and go opposite ways.
  const BETTER_HIGH = 1 as const;
  const BETTER_LOW = -1 as const;
  const NEUTRAL = 0 as const;

  const dimensions: Dimension[] = [
    {
      key: "objectiveControl",
      metrics: [
        metric("firstDragon", recent, previous, firstRate("dragon"), BETTER_HIGH),
        metric("firstHerald", recent, previous, firstRate("riftHerald"), BETTER_HIGH),
        metric("firstBaron", recent, previous, firstRate("baron"), BETTER_HIGH),
        metric("firstTower", recent, previous, firstRate("tower"), BETTER_HIGH),
        metric(
          "dragonsPerGame",
          recent,
          previous,
          (w) =>
            single(w.metrics.objectives.dragon.averageKills, w.metrics.games),
          BETTER_HIGH,
        ),
        metric(
          "baronsPerGame",
          recent,
          previous,
          (w) =>
            single(w.metrics.objectives.baron.averageKills, w.metrics.games),
          BETTER_HIGH,
        ),
      ],
    },
    {
      key: "objectivePreparation",
      metrics: [
        metric(
          "dragonPresence",
          recent,
          previous,
          (w) =>
            single(
              w.timeline?.preparation.dragon.nearShare ?? null,
              w.timeline?.preparation.dragon.games ?? 0,
            ),
          BETTER_HIGH,
        ),
        metric(
          "playersAtObjective",
          recent,
          previous,
          (w) =>
            single(
              w.timeline?.preparation.dragon.averageNear ?? null,
              w.timeline?.preparation.dragon.events ?? 0,
            ),
          BETTER_HIGH,
        ),
        metric(
          "deathsBeforeObjective",
          recent,
          previous,
          (w) => {
            const preparation = w.timeline?.preparation.dragon;
            if (!preparation || preparation.events === 0) return single(null, 0);
            return single(
              preparation.deathsBefore / preparation.events,
              preparation.events,
            );
          },
          BETTER_LOW,
        ),
      ],
    },
    {
      key: "conversion",
      metrics: [
        metric(
          "winRateAhead15",
          recent,
          previous,
          (w) => {
            const marker = w.timeline?.gold.markers.find(
              (entry) => entry.minute === 15,
            );
            const games = marker?.aheadGames ?? 0;
            const wins = marker?.aheadWins ?? 0;
            return single(
              games > 0 ? wins / games : null,
              games,
              proportion(wins, games),
            );
          },
          BETTER_HIGH,
        ),
        metric(
          "comebackRate",
          recent,
          previous,
          (w) => {
            const games = w.timeline?.comebacks.games ?? 0;
            const won = w.timeline?.comebacks.won ?? 0;
            return single(
              games > 0 ? won / games : null,
              games,
              proportion(won, games),
            );
          },
          BETTER_HIGH,
        ),
        metric(
          "killToObjective",
          recent,
          previous,
          (w) =>
            single(
              w.timeline?.conversion.median ?? null,
              w.timeline?.conversion.games ?? 0,
            ),
          BETTER_LOW,
        ),
        metric(
          "turretsPerKill",
          recent,
          previous,
          (w) => single(w.metrics.conversion.killsToTurrets, w.metrics.games),
          BETTER_HIGH,
        ),
      ],
    },
    {
      key: "synchronization",
      metrics: [
        metric(
          "groupedShare",
          recent,
          previous,
          (w) => {
            const share = w.timeline?.grouping.groupedShare;
            return single(
              share === null || share === undefined ? null : share / 100,
              w.timeline?.grouping.frames ?? 0,
            );
          },
          BETTER_HIGH,
        ),
        metric(
          "playersAtKills",
          recent,
          previous,
          (w) =>
            single(w.timeline?.grouping.nearKill ?? null, w.timeline?.games ?? 0),
          BETTER_HIGH,
        ),
        metric(
          "isolatedDeathShare",
          recent,
          previous,
          (w) => {
            const deaths = w.timeline?.deaths.total ?? 0;
            return single(
              deaths > 0
                ? (w.timeline as TimelineMetrics).deaths.isolated / deaths
                : null,
              deaths,
            );
          },
          BETTER_LOW,
        ),
      ],
    },
    {
      key: "consistency",
      metrics: [
        // Less variation is better: a team that dies 18 times one game and 4 the next is not the
        // same team, and the point of the dimension is the predictability of the result.
        metric(
          "teamDeathsVariation",
          recent,
          previous,
          (w) =>
            single(
              w.metrics.consistency.team.deaths,
              w.metrics.consistency.games,
            ),
          BETTER_LOW,
        ),
        metric(
          "teamGoldVariation",
          recent,
          previous,
          (w) =>
            single(w.metrics.consistency.team.gold, w.metrics.consistency.games),
          BETTER_LOW,
        ),
        metric(
          "deathsPerGame",
          recent,
          previous,
          (w) =>
            single(
              w.metrics.games > 0
                ? w.metrics.kills.deaths / w.metrics.games
                : null,
              w.metrics.games,
            ),
          BETTER_LOW,
        ),
      ],
    },
    {
      key: "individual",
      metrics: [
        // A smaller gap between the most and least involved player is better participation.
        metric(
          "killParticipationGap",
          recent,
          previous,
          (w) => {
            const rated = w.metrics.killParticipation
              .filter((entry) => entry.ratio !== null)
              .map((entry) => entry.ratio as number);
            if (rated.length < 2) return { values: [], n: rated.length };
            return {
              values: [Math.max(...rated) - Math.min(...rated)],
              n: rated.length,
            };
          },
          BETTER_LOW,
        ),
        metric(
          "kda",
          recent,
          previous,
          (w) => single(w.metrics.kda, w.metrics.games),
          BETTER_HIGH,
        ),
        // A lineup that changes size game to game is not more consistent for having more people.
        metric(
          "averagePresence",
          recent,
          previous,
          (w) => {
            const games = w.metrics.presence.reduce(
              (n, bucket) => n + bucket.games,
              0,
            );
            const people = w.metrics.presence.reduce(
              (n, bucket) => n + bucket.players * bucket.games,
              0,
            );
            return single(games > 0 ? people / games : null, games);
          },
          NEUTRAL,
        ),
      ],
    },
    {
      key: "map",
      metrics: [
        metric(
          "towersPerGame",
          recent,
          previous,
          (w) => single(w.metrics.conversion.turretsPerGame, w.metrics.games),
          BETTER_HIGH,
        ),
        // How many fights happen is a style, not a quality: loads of fights is neither good nor bad.
        metric(
          "fightsPerGame",
          recent,
          previous,
          (w) =>
            single(
              w.timeline?.fights.averagePerGame ?? null,
              w.timeline?.games ?? 0,
            ),
          NEUTRAL,
        ),
        metric(
          "goldAt15",
          recent,
          previous,
          (w) => {
            const marker = w.timeline?.gold.markers.find(
              (entry) => entry.minute === 15,
            );
            return single(marker?.spread.median ?? null, marker?.spread.n ?? 0);
          },
          BETTER_HIGH,
        ),
      ],
    },
  ];

  return {
    dimensions,
    windows: {
      size: periods.size,
      recent: summarise(periods.recent, owners),
      previous: summarise(periods.previous, owners),
    },
  };
}
