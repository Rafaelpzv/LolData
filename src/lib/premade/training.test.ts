import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TRAINING_METRICS,
  TRAINING_METRIC_SPECS,
  displayedState,
  evaluateGoal,
  splitObservations,
  stateOfVerdict,
  suggestedTarget,
  trainingVerdict,
  windowSpread,
  type TrainingObservation,
} from "./training";
import { compareWindows } from "./inference";

/** A day away from the UTC boundary, so the baseline cut has no ambiguity. */
const MIDDAY = (day: number) => Date.UTC(2026, 0, 10 + day, 12, 0, 0);
const START = MIDDAY(5);

function obs(values: (number | null)[], fromDay = 0): TrainingObservation[] {
  return values.map((value, index) => ({
    matchId: `m${index}`,
    at: MIDDAY(fromDay + index),
    value,
  }));
}

/** Four games of one window: enough games that the standard error exists. */
const four = (base: number, spread = 0.1) => [
  base - spread,
  base + spread,
  base,
  base,
];

describe("the metric table", () => {
  it("gives every tracked metric a direction and a unit", () => {
    for (const metric of TRAINING_METRICS) {
      const spec = TRAINING_METRIC_SPECS[metric];
      expect(spec.direction === 1 || spec.direction === -1).toBe(true);
      expect(spec.unit.length).toBeGreaterThan(0);
    }
  });

  it("has a translated source for every tracked metric, in every locale", () => {
    // A fonte saiu do módulo puro justamente para ser traduzida: cada métrica precisa dela nos dois
    // idiomas, senão a aba de treino volta a mostrar português para quem lê em inglês.
    for (const locale of ["en", "pt-BR"]) {
      const file = join(process.cwd(), "messages", locale, "premade.json");
      const json = JSON.parse(readFileSync(file, "utf8")) as {
        training: { sources: Record<string, string> };
      };
      for (const metric of TRAINING_METRICS) {
        expect(json.training.sources[metric], `${locale}: ${metric}`).toBeTruthy();
      }
    }
  });
});

describe("splitObservations", () => {
  it("puts the games before the start day in the baseline and the later ones in the window", () => {
    // Days 0..4 (before), day 5 (the start day itself), days 6,7 (after).
    const observations = obs([1, 2, 3, 4, 5, 99, 6, 7], 0);
    const split = splitObservations(observations, START);
    expect(split.baseline).toEqual([1, 2, 3, 4, 5]);
    // The game played ON the start day belongs to neither side: the exercise may not have applied.
    expect(split.after).toEqual([6, 7]);
  });

  it("keeps only the last baseline window of the history", () => {
    // 15 games before the start: the baseline reads the 10 most recent of them.
    const observations = obs(Array.from({ length: 15 }, (_, i) => i), 0);
    const split = splitObservations(observations, MIDDAY(20));
    expect(split.baseline).toHaveLength(10);
    expect(split.baseline.at(-1)).toBe(14);
  });

  it("drops the games with no value instead of reading them as zero", () => {
    const observations = obs([1, null, 3, null], 0);
    const split = splitObservations(observations, MIDDAY(10));
    expect(split.baseline).toEqual([1, 3]);
  });

  it("sorts by time, so a late insert does not scramble the baseline window", () => {
    const observations: TrainingObservation[] = [
      { matchId: "late", at: MIDDAY(2), value: 3 },
      { matchId: "early", at: MIDDAY(0), value: 1 },
    ];
    const split = splitObservations(observations, MIDDAY(10));
    expect(split.baseline).toEqual([1, 3]);
  });

  it("never splits a single UTC day across the two windows", () => {
    // Same day, one game before the stored start hour and one after it: both are excluded.
    const start = Date.UTC(2026, 0, 13, 20, 0, 0);
    const observations: TrainingObservation[] = [
      { matchId: "a", at: Date.UTC(2026, 0, 13, 2, 0, 0), value: 5 },
      { matchId: "b", at: Date.UTC(2026, 0, 13, 23, 0, 0), value: 1 },
      { matchId: "c", at: Date.UTC(2026, 0, 12, 23, 0, 0), value: 4 },
    ];
    const split = splitObservations(observations, start);
    expect(split.baseline).toEqual([4]);
    expect(split.after).toEqual([]);
  });
});

describe("evaluateGoal — values that can be checked by hand", () => {
  it("computes the means and the delta of a visible improvement", () => {
    // Baseline 3.9/4.1/4/4 (mean 4), after training 1.9/2.1/2/2 (mean 2): delta -2.
    const observations = [...obs(four(4), 0), ...obs(four(2), 7)];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.baselineGames).toBe(4);
    expect(evaluation.windowGames).toBe(4);
    expect(evaluation.baseline).toBe(4);
    expect(evaluation.current).toBe(2);
    expect(evaluation.delta).toBe(-2);
    // Fewer deaths is better and the interval sits entirely below zero: a consistent gain.
    expect(evaluation.verdict).toBe("consistent");
    expect(evaluation.state).toBe("achieved");
  });

  it("reads a lower-is-better metric the right way round", () => {
    // Alone deaths went UP from 20% to 60%: that is worse, not "consistent improvement".
    const observations = [
      ...obs([18, 22, 20, 20], 0),
      ...obs([58, 62, 60, 60], 7),
    ];
    const evaluation = evaluateGoal({
      goal: { metric: "aloneDeathShare", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.delta).toBe(40);
    expect(evaluation.verdict).toBe("worse");
    expect(evaluation.state).toBe("missed");
  });

  it("says it has not enough games instead of guessing", () => {
    const observations = obs([4, 2], 0); // nothing after the start
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.windowGames).toBe(0);
    expect(evaluation.verdict).toBe("notEnoughGames");
    expect(evaluation.state).toBe("inconclusive");
    expect(evaluation.current).toBeNull();
  });

  it("keeps a single later game unmeasurable, never 'no change'", () => {
    const observations = [...obs([4, 4, 4], 0), ...obs([2], 6)];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.windowGames).toBe(1);
    expect(evaluation.verdict).toBe("notEnoughGames");
  });

  it("marks a change inside the noise as inconclusive, not as improvement", () => {
    // A small drop against a very noisy history: the interval still contains zero.
    const observations = [
      ...obs([3, 5, 3, 5], 0),
      ...obs([2.5, 5.5, 2.5, 5.5], 9),
    ];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.verdict).toBe("positiveButInconclusive");
    expect(evaluation.state).toBe("inconclusive");
  });

  it("records a reached target as a fact without promoting it to a consistent gain", () => {
    // Noisy, but the person's current window is under the stated target of 2.5 deaths per game.
    const observations = [
      ...obs([3, 5, 3, 5], 0),
      ...obs([2.3, 2.7, 2.4, 2.5], 7),
    ];
    const goal = { metric: "deathsPerGame" as const, target: 2.48, startsAt: START };
    const evaluation = evaluateGoal({ goal, observations });
    expect(evaluation.current).toBe(2.48);
    expect(evaluation.targetReached).toBe(true);
    // The target is met, and the change is not significant: the verdict stays inconclusive.
    expect(evaluation.verdict).toBe("positiveButInconclusive");
    expect(evaluation.state).toBe("inconclusive");
  });

  it("does not report a target as reached when the window is above it", () => {
    const observations = [
      ...obs(four(4), 0),
      ...obs([3.6, 3.8, 3.7, 3.7], 7),
    ];
    const goal = { metric: "deathsPerGame" as const, target: 3, startsAt: START };
    const evaluation = evaluateGoal({ goal, observations });
    expect(evaluation.targetReached).toBe(false);
  });

  it("reports no target status when the goal has no target", () => {
    const observations = [...obs(four(4), 0), ...obs(four(2), 7)];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.targetReached).toBeNull();
  });

  it("finds a target of a higher-is-better metric from the correct side", () => {
    const observations = [
      ...obs([4.9, 5.1, 5, 5], 0),
      ...obs([6.9, 7.1, 7, 7], 7),
    ];
    const goal = { metric: "visionPerMin" as const, target: 6.5, startsAt: START };
    const evaluation = evaluateGoal({ goal, observations });
    expect(evaluation.targetReached).toBe(true);
    expect(evaluation.verdict).toBe("consistent");
  });
});

describe("confidence of an evaluation", () => {
  it("never claims high confidence from a small window on either side", () => {
    // Plenty of baseline, two games after: the smaller side rules.
    const observations = [...obs([3.9, 4.1, 4, 4, 4, 4], 0), ...obs([2, 2], 7)];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: START },
      observations,
    });
    expect(evaluation.confidence).toBe("low");
  });

  it("reaches high only when both windows are big", () => {
    // Days 10..17 are after the start (day 9); days 0..9 are the baseline (the start day is out).
    const observations = [
      ...obs([3.9, 4.1, 4, 4, 4, 4, 4, 4, 4, 4], 0),
      ...obs([1.9, 2.1, 2, 2, 2, 2, 2, 2], 10),
    ];
    const evaluation = evaluateGoal({
      goal: { metric: "deathsPerGame", target: null, startsAt: MIDDAY(9) },
      observations,
    });
    expect(evaluation.baselineGames).toBe(9);
    expect(evaluation.windowGames).toBe(8);
    expect(evaluation.confidence).toBe("high");
  });
});

describe("trainingVerdict", () => {
  it("calls the improvement that faded 'initialGainLost'", () => {
    // Baseline around 4, early window around 2.2, recent window back at 4.1: overall the change is
    // still a significant improvement, but the gain of the first games did not hold.
    const baseline = Array.from({ length: 10 }, (_, i) => 4 + ((i % 3) - 1) * 0.2);
    const after = [...Array(6).fill(2.2), ...Array(6).fill(4.1)];
    const change = compareWindows(baseline, after, { direction: -1 });
    const verdict = trainingVerdict(change, -1, {
      early: after.slice(0, 6),
      late: after.slice(-6),
    });
    expect(verdict).toBe("initialGainLost");
    expect(stateOfVerdict(verdict)).toBe("inconclusive");
  });

  it("does not call a one-game comparison a result", () => {
    const change = compareWindows([4, 4], [2], { direction: -1 });
    expect(trainingVerdict(change, -1, { early: [2], late: [2] })).toBe(
      "notEnoughGames",
    );
  });
});

describe("displayedState", () => {
  it("keeps the chosen state until there is something to read", () => {
    const goal = { id: "g", state: "planned" as const };
    expect(displayedState(goal, null)).toBe("planned");
    expect(
      displayedState(goal, {
        at: 0,
        baselineGames: 4,
        windowGames: 1,
        baseline: 4,
        current: 3,
        delta: -1,
        relative: -0.25,
        low: null,
        high: null,
        verdict: "notEnoughGames",
        confidence: "low",
        state: "inconclusive",
        targetReached: null,
      }),
    ).toBe("planned");
  });

  it("hands over to the data once a window exists", () => {
    const goal = { id: "g", state: "running" as const };
    expect(
      displayedState(goal, {
        at: 0,
        baselineGames: 8,
        windowGames: 6,
        baseline: 4,
        current: 2,
        delta: -2,
        relative: -0.5,
        low: -2.5,
        high: -1.5,
        verdict: "consistent",
        confidence: "medium",
        state: "achieved",
        targetReached: true,
      }),
    ).toBe("achieved");
  });
});

describe("suggestedTarget", () => {
  it("moves by half a standard deviation in the metric's better direction", () => {
    // sd of [2,4,2,4] ~ 1.15; half of it ~0.58 below a current of 4 for a lower-is-better metric.
    const target = suggestedTarget("deathsPerGame", 4, [2, 4, 2, 4], 0.5);
    expect(target).not.toBeNull();
    expect(target!).toBeLessThan(4);
    expect(target!).toBeGreaterThan(3);
  });

  it("proposes no number when the person's own variability is unknown", () => {
    // One game, or a constant history: there is no sd to size the step by.
    expect(suggestedTarget("deathsPerGame", 4, [4], 0.5)).toBeNull();
    expect(suggestedTarget("deathsPerGame", 4, [], 0.5)).toBeNull();
  });
});

describe("windowSpread", () => {
  it("reports the n, the mean and the sd of the window", () => {
    const spread = windowSpread([2, 4, 6]);
    expect(spread.n).toBe(3);
    expect(spread.mean).toBe(4);
    expect(spread.sd).toBeCloseTo(2, 5);
  });
});
