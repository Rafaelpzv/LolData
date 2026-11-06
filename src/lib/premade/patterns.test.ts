import { describe, expect, it } from "vitest";

import { buildPatterns, deathSpread, type PatternInput } from "./patterns";
import type { PremadeMatchSample } from "./types";
import type { PremadeTimeline, TimelineKill, TimelineObjective } from "./timeline";

function match(id: string, win = false, at = 1_700_000_000_000): PremadeMatchSample {
  return {
    matchId: id,
    gameCreation: at,
    duration: 1800,
    win,
    teamSide: 100,
    participants: [],
    teamTotals: {},
    timelineDuration: 1800,
  } as unknown as PremadeMatchSample;
}

function timeline(
  id: string,
  options: {
    objectives?: TimelineObjective[];
    kills?: TimelineKill[];
    deaths?: { at: number; near: number }[];
    goldDiff?: [number, number][];
  } = {},
): PremadeTimeline {
  return {
    matchId: id,
    duration: 1800,
    endOfGameResult: "GameComplete",
    frameInterval: 60000,
    goldSeries: [],
    goldDiff: options.goldDiff ?? [[0, 0], [1800, 0]],
    xpDiff: [],
    kills: options.kills ?? [],
    objectives: options.objectives ?? [],
    positions: [],
    deaths: (options.deaths ?? []).map((entry) => ({
      at: entry.at,
      x: 0,
      y: 0,
      person: null,
      slot: 1,
      near: entry.near,
      costly: false,
    })),
    finalStats: { gold: 0, kills: 0, deaths: 0, towers: 0, dragons: 0, barons: 0 },
  };
}

function objective(at: number, kind: "dragon" | "baron" = "dragon", near = 4): TimelineObjective {
  return { at, x: 0, y: 0, kind, variant: null, near, people: [] };
}

function emptyWindow(): PatternInput["recent"] {
  return { matches: [], timelines: [] };
}

/** A window of n games, each with the given timeline factory. */
function windowOf(
  n: number,
  make: (index: number) => ReturnType<typeof timeline>,
): PatternInput["recent"] {
  const matches = Array.from({ length: n }, (_, i) => match(`BR1_${i}`));
  const timelines = matches.map((m, i) => {
    const built = make(i);
    return { ...built, matchId: m.matchId };
  });
  return { matches, timelines };
}

describe("buildPatterns", () => {
  it("returns nothing without games, instead of inventing patterns", () => {
    expect(buildPatterns({ recent: emptyWindow(), previous: emptyWindow() })).toEqual([]);
  });

  it("marks a pattern as recurring only when it repeats in enough games", () => {
    // Six games, every one with an objective taken while outnumbered.
    const recent = windowOf(6, (i) => timeline(`BR1_${i}`, { objectives: [objective(600, "dragon", 1)] }));
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const unprepared = patterns.find((p) => p.id === "unpreparedObjectives")!;
    expect(unprepared.strength).toBe("recurring");
    expect(unprepared.frequency.rate).toBe(1);
    expect(unprepared.games).toBe(6);
  });

  it("is only suggestive when the behaviour appears in a single game", () => {
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, {
        objectives: [objective(600, "dragon", i === 0 ? 1 : 4)],
      }),
    );
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const unprepared = patterns.find((p) => p.id === "unpreparedObjectives")!;
    expect(unprepared.strength).toBe("suggestive");
    expect(unprepared.frequency.rate).toBeCloseTo(1 / 6, 5);
  });

  it("carries the nine fields the prompt asks for, on every pattern", () => {
    const recent = windowOf(6, (i) => timeline(`BR1_${i}`, { objectives: [objective(600)] }));
    for (const pattern of buildPatterns({ recent, previous: emptyWindow() })) {
      // Titles travel as message keys, not as sentences in a single language.
      expect(pattern.title.id.length).toBeGreaterThan(0);
      expect(pattern.frequency.total).toBe(6);
      expect(pattern.games).toBeGreaterThan(0);
      expect(pattern.events).toBeGreaterThanOrEqual(0);
      expect(pattern.period).toBeDefined();
      expect(pattern.limitations.length).toBeGreaterThan(0);
      expect(Array.isArray(pattern.examples)).toBe(true);
    }
  });

  it("never leaves limitations empty: a pattern must say what it does not prove", () => {
    const recent = windowOf(6, (i) => timeline(`BR1_${i}`, { objectives: [objective(600)] }));
    for (const pattern of buildPatterns({ recent, previous: emptyWindow() })) {
      expect(pattern.limitations.length).toBeGreaterThan(0);
    }
  });

  it("leaves the change null when there is no previous window to compare", () => {
    const recent = windowOf(6, (i) => timeline(`BR1_${i}`, { objectives: [objective(600)] }));
    for (const pattern of buildPatterns({ recent, previous: emptyWindow() })) {
      expect(pattern.change).toBeNull();
    }
  });

  it("compares against the previous window when both sides have data", () => {
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, { objectives: [objective(600, "dragon", 1)] }),
    );
    const previous = windowOf(6, (i) =>
      timeline(`BR1_${i}`, { objectives: [objective(600, "dragon", 5)] }),
    );
    const patterns = buildPatterns({ recent, previous });
    const unprepared = patterns.find((p) => p.id === "unpreparedObjectives")!;
    expect(unprepared.change).not.toBeNull();
    expect(unprepared.previous).not.toBeNull();
  });

  it("exposes the distance and time criteria it used (§4.3)", () => {
    const recent = windowOf(6, (i) => timeline(`BR1_${i}`, { objectives: [objective(600)] }));
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const unprepared = patterns.find((p) => p.id === "unpreparedObjectives")!;
    expect(unprepared.criteria.length).toBeGreaterThan(0);
    expect(unprepared.criteria.some((c) => c.unit === "units")).toBe(true);
    expect(unprepared.criteria.some((c) => c.unit === "players")).toBe(true);
  });

  it("picks examples from the games where the behaviour actually happened", () => {
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, { objectives: [objective(600, "dragon", i < 2 ? 1 : 5)] }),
    );
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const unprepared = patterns.find((p) => p.id === "unpreparedObjectives")!;
    expect(unprepared.examples.length).toBe(2);
  });

  it("counts a kill cluster as ONE chance to convert, not one per kill", () => {
    // Three kills 2 s apart are one fight. Counting each of them as a chance to convert would make
    // every team look like it never converts; the cluster is the unit.
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, {
        kills: [0, 2, 4].map((offset) => ({
          at: 600 + offset,
          x: 0,
          y: 0,
          person: "a",
          kind: "groupKill" as const,
          near: 3,
          people: ["a"],
        })),
        objectives: [],
      }),
    );
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const conversion = patterns.find((p) => p.id === "killsWithoutConversion")!;
    // One cluster per game, never converted: six clusters, not eighteen kills.
    expect(conversion.events).toBe(6);
  });

  it("does not treat a single kill as a conversion chance", () => {
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, {
        kills: [
          {
            at: 600,
            x: 0,
            y: 0,
            person: "a",
            kind: "groupKill" as const,
            near: 2,
            people: ["a"],
          },
        ],
        objectives: [],
      }),
    );
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const conversion = patterns.find((p) => p.id === "killsWithoutConversion")!;
    expect(conversion.events).toBe(0);
    expect(conversion.strength).toBe("suggestive");
  });

  it("falls back to the group deaths when the deaths array is missing", () => {
    // Timelines collected before the field existed carry only `groupDeath` in `kills`; reading the
    // empty array as "no deaths" made a whole team look deathless.
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, {
        kills: [
          { at: 300, x: 0, y: 0, person: "a", kind: "groupDeath" as const, near: 1, people: ["a"] },
          { at: 900, x: 0, y: 0, person: "a", kind: "groupDeath" as const, near: 4, people: ["a"] },
        ],
        deaths: [],
      }),
    );
    const spread = deathSpread({ recent, previous: emptyWindow() }).recent;
    expect(spread.mean).toBe(2);
    expect(spread.max).toBe(2);
  });

  it("judges a collapse against the group's own median, not against zero", () => {
    // Four games with 3 deaths, two with 12: only the two are far above the group's own pattern.
    const recent = windowOf(6, (i) =>
      timeline(`BR1_${i}`, {
        kills: Array.from({ length: i < 4 ? 3 : 12 }, (_, k) => ({
          at: 100 * k,
          x: 0,
          y: 0,
          person: "a",
          kind: "groupDeath" as const,
          near: 1,
          people: ["a"],
        })),
      }),
    );
    const patterns = buildPatterns({ recent, previous: emptyWindow() });
    const collapse = patterns.find((p) => p.id === "collapseGames")!;
    expect(collapse).toBeDefined();
    expect(collapse.frequency.successes).toBe(2);
    expect(collapse.frequency.total).toBe(6);
  });
});

describe("deathSpread", () => {
  it("reports mean, median and dispersion over the window", () => {
    const recent = windowOf(4, (i) =>
      timeline(`BR1_${i}`, {
        kills: Array.from({ length: i + 1 }, (_, k) => ({
          at: 100 * k,
          x: 0,
          y: 0,
          person: "a",
          kind: "groupDeath" as const,
          near: 1,
          people: ["a"],
        })),
      }),
    );
    const spread = deathSpread({ recent, previous: emptyWindow() }).recent;
    expect(spread.games).toBe(4);
    expect(spread.median).not.toBeNull();
    expect(spread.mean).not.toBeNull();
  });

  it("has nothing to report for an empty window", () => {
    const spread = deathSpread({ recent: emptyWindow(), previous: emptyWindow() }).recent;
    expect(spread.games).toBe(0);
    expect(spread.mean).toBeNull();
  });
});
