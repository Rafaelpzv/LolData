import { describe, expect, it } from "vitest";

import {
  classifyDiagnoses,
  diagnoseRoster,
  laneComparable,
  sharedResponsibility,
  splitDiagnoses,
  type DiagnosisInput,
} from "./individual-diagnosis";
import type { PlayerDepth } from "./individual-metrics";

function depth(overrides: Partial<PlayerDepth> = {}): PlayerDepth {
  return {
    person: "p1",
    summary: {
      games: 20,
      wins: 10,
      winRate: 50,
      kda: 2.5,
      killParticipation: 0.7,
      damagePerMin: 600,
      goldPerMin: 400,
      csPerMin: 7,
      visionPerMin: 1,
      deathsPerGame: 4,
      deadTimeShare: 10,
    },
    champions: [],
    pings: {
      perGame: {},
      total: 2,
      games: 20,
      teamTotal: 2,
      aboveTeam: 5,
      deathsWithReplies: 3,
      deathsWithoutReplies: 4,
      replySplitGames: 20,
    } as unknown as PlayerDepth["pings"],
    early: {
      games: 20,
      at10: { cs: 70, csDiff: 5, xpDiff: 100, goldDiff: 200 },
      at15: { cs: 110, csDiff: 8, xpDiff: 200, goldDiff: 300 },
      firstBlood: { games: 20, kills: 1, assists: 2 },
      deathsBefore10: 1,
      deathsBefore10Games: 20,
      laneGames: 20,
    },
    vision: {
      games: 20,
      wardsPlaced: 10,
      wardsKilled: 2,
      controlWards: 1,
      visionPerMin: 1.2,
      teamPerMin: 1.5,
      laneAveragePerMin: 1.1,
      laneGames: 20,
    },
    combat: {
      games: 20,
      damagePerDeath: 2000,
      damageTakenPerGame: 20000,
      damageShare: 20,
      goldShare: 20,
      killShare: 20,
      soloKills: 1,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      largestMultiKill: 2,
      killingSprees: 1,
      firstBloodKills: 1,
      firstBloodAssists: 1,
    } as unknown as PlayerDepth["combat"],
    deaths: {
      total: 80,
      byPhase: {} as never,
      byRegion: {} as never,
      alone: 20,
      aloneShare: 25,
      costly: 10,
      costlyShare: 12.5,
      games: 20,
    },
    objectives: {} as never,
    trend: {} as never,
    synergy: { best: [], worst: [] },
    fieldGames: 20,
    derivedGames: 20,
    games: 20,
    roles: ["MIDDLE"],
    ...overrides,
  };
}

function input(
  depths: PlayerDepth[],
  /**
   * A régua de mortes usada pela regra. Nos testes ela É a referência por pessoa (é o que a regra
   * compara); o `teamDeathsPerGame` acompanha só como evidência textual.
   */
  referencePerPerson: number | null = 4,
): DiagnosisInput {
  return {
    depths,
    names: new Map([["p1", "Ana"]]),
    teamDeathsPerGame: referencePerPerson,
    rosterDeathsPerPerson: referencePerPerson,
    teamGames: 20,
    fullGames: 20,
  };
}

/** Um jogador com mortes isoladas acima da média do grupo: o caso em que a morte é dele. */
function heavyDeaths(overrides: Partial<PlayerDepth> = {}): PlayerDepth {
  return depth({
    summary: { ...depth().summary, deathsPerGame: 9 },
    deaths: { ...depth().deaths, aloneShare: 70 },
    ...overrides,
  });
}

describe("sharedResponsibility", () => {
  it("blames nobody when there is no team reference", () => {
    expect(sharedResponsibility(5, null)).toBe("teamDeaths");
  });

  it("keeps the responsibility individual when the player stands out", () => {
    // 9 deaths against a group average of 4: clearly this player's.
    expect(sharedResponsibility(9, 4)).toBeNull();
  });

  it("hands the problem to the team when everyone dies at the same rate", () => {
    // 5 deaths against a group average of 4.5: the group is dying, not this player alone.
    expect(sharedResponsibility(5, 4.5)).toBe("teamDeaths");
  });

  it("compares a person with the group's per-person average, not with the group total", () => {
    // Regressão do bug que mandava TODA morte para o time: o grupo morria 29,3 por partida (5
    // pessoas), cada pessoa morria ~5,9. Lido contra o total, ninguém nunca seria responsável.
    const rosterTotal = 29.3;
    const perPerson = rosterTotal / 5; // 5,86
    // Uma pessoa que morre 9 por partida morre muito para o grupo, mesmo morrendo bem menos que o total.
    expect(sharedResponsibility(9, perPerson)).toBeNull();
    // E o mesmo 9, lido contra o total do grupo, seria sempre "do time" — o bug, fixado aqui.
    expect(sharedResponsibility(9, rosterTotal)).toBe("teamDeaths");
  });
});

describe("laneComparable", () => {
  it("allows one or two roles, where a lane average means something", () => {
    expect(laneComparable(["MIDDLE"])).toBe(true);
    expect(laneComparable(["TOP", "JUNGLE"])).toBe(true);
  });

  it("refuses when the person played three or more roles", () => {
    // A player who filled five roles has no "own role": the lane average would mix a support's
    // vision with a top laner's, which §5.1 forbids outright.
    expect(laneComparable(["TOP", "JUNGLE", "MIDDLE"])).toBe(false);
    expect(laneComparable(["JUNGLE", "MIDDLE", "UTILITY", "TOP", "BOTTOM"])).toBe(false);
  });
});

describe("diagnoseRoster — farming", () => {
  it("flags a farming problem only when the player is behind the lane opponent", () => {
    const behind = depth({
      early: {
        ...depth().early,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
    });
    const found = diagnoseRoster(input([behind])).find((d) => d.aspect === "farming");
    expect(found).toBeDefined();
    expect(found!.kind).toBe("problem");
    expect(found!.shared).toBeNull();
    expect(found!.evidence.some((e) => e.unit === "points")).toBe(true);
  });

  it("says nothing about farming when the player is even with the lane opponent", () => {
    const found = diagnoseRoster(input([depth()])).find((d) => d.aspect === "farming");
    expect(found).toBeUndefined();
  });

  it("reports farming AHEAD as a strength, with its own exercise", () => {
    const ahead = depth({
      early: {
        ...depth().early,
        at10: { cs: 95, csDiff: 30, xpDiff: 300, goldDiff: 500 },
      },
    });
    const found = diagnoseRoster(input([ahead])).find((d) => d.aspect === "farming");
    expect(found).toBeDefined();
    // The same number that would be a problem behind the opponent is a strength ahead of them.
    expect(found!.kind).toBe("strength");
    expect(found!.shared).toBeNull();
    // The exercise is a message key the UI translates, not a sentence in any single language.
    expect(found!.exercise.id).toEqual(expect.any(String));
    expect(found!.exercise.id.length).toBeGreaterThan(0);
  });

  it("refuses the lane comparison for a player with no stable role", () => {
    const flexible = depth({
      roles: ["TOP", "JUNGLE", "MIDDLE"],
      early: {
        ...depth().early,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
    });
    const found = diagnoseRoster(input([flexible])).find(
      (d) => d.aspect === "farming",
    );
    // The data exists and the player IS behind, but against whom is not comparable: the refusal
    // names the reason instead of blaming the player for the lineup.
    expect(found).toBeDefined();
    expect(found!.shared).toBe("laneStructure");
    expect(found!.tracking.metric).toBe("csDiffAt10");
  });
});

describe("diagnoseRoster — deaths", () => {
  it("refuses the deaths diagnosis when the whole team dies at the same pace", () => {
    // The player dies 4/game, the group 4/game: this is a group problem, and the module says so
    // instead of pointing at the player (§5: never attribute a collective problem to a person).
    const found = diagnoseRoster(input([depth()], 4)).find((d) => d.aspect === "deaths");
    expect(found).toBeDefined();
    expect(found!.shared).toBe("teamDeaths");
    expect(found!.confidence).toBe("low");
    expect(found!.tracking.metric).toBe("teamDeathsPerGame");
  });

  it("keeps the deaths diagnosis individual for someone dying far more than the group, alone", () => {
    const found = diagnoseRoster(input([heavyDeaths()], 4)).find(
      (d) => d.aspect === "deaths",
    );
    expect(found).toBeDefined();
    expect(found!.shared).toBeNull();
    expect(found!.kind).toBe("problem");
    expect(found!.tracking.metric).toBe("aloneDeathShare");
  });

  it("does not blame a player whose excess deaths happen inside team fights", () => {
    // Dies far more than the group, but 90% of those deaths had an ally nearby: the fight is the
    // problem, not the individual decision (§4.3: an isolated death is not a team decision).
    const inFights = heavyDeaths({
      deaths: { ...depth().deaths, alone: 8, aloneShare: 10 },
    });
    const found = diagnoseRoster(input([inFights], 4)).find(
      (d) => d.aspect === "deaths",
    );
    expect(found).toBeDefined();
    expect(found!.shared).toBe("laneStructure");
    expect(found!.tracking.metric).toBe("teamDeathsPerGame");
  });

  it("refuses to blame deaths it cannot position when no timeline was read", () => {
    const noTimeline = heavyDeaths({
      deaths: { ...depth().deaths, alone: 0, aloneShare: null, games: 0 },
    });
    const found = diagnoseRoster(input([noTimeline], 4)).find(
      (d) => d.aspect === "deaths",
    );
    expect(found).toBeDefined();
    // Absence is not a problem: the refusal says the sample is what is missing.
    expect(found!.shared).toBe("notMeasured");
  });
});

describe("diagnoseRoster — vision", () => {
  it("compares vision against the same role, never across roles", () => {
    const support = depth({
      person: "sup",
      roles: ["UTILITY"],
      vision: {
        ...depth().vision,
        visionPerMin: 1.5,
        laneAveragePerMin: 2.6,
      },
    });
    const top = depth({
      person: "top",
      roles: ["TOP"],
      vision: {
        ...depth().vision,
        visionPerMin: 0.4,
        laneAveragePerMin: 0.5,
      },
    });
    const found = diagnoseRoster(input([support, top]));
    const sup = found.find((d) => d.person === "sup" && d.aspect === "vision");
    // The support has FAR more vision per minute than the top laner and still gets flagged,
    // because the comparison is against other supports — not against the top laner's 0.4.
    expect(sup).toBeDefined();
    // The role-average source is the one that travels with the same-role comparison.
    expect(sup!.evidence.some((e) => e.source.id === "source.sameRoleGames")).toBe(true);
    expect(
      found.find((d) => d.person === "top" && d.aspect === "vision"),
    ).toBeUndefined();
  });

  it("skips the vision comparison for a player who played too many roles", () => {
    const flexible = depth({
      person: "flex",
      roles: ["TOP", "JUNGLE", "MIDDLE", "UTILITY"],
      vision: { ...depth().vision, visionPerMin: 0.2, laneAveragePerMin: 2.6 },
    });
    const found = diagnoseRoster(input([flexible])).find(
      (d) => d.aspect === "vision",
    );
    // Without a stable role there is no honest comparison, so nothing is said.
    expect(found).toBeUndefined();
  });

  it("reports vision above the role average as a strength", () => {
    const seeing = depth({
      vision: { ...depth().vision, visionPerMin: 2.4, laneAveragePerMin: 1.2 },
    });
    const found = diagnoseRoster(input([seeing])).find(
      (d) => d.aspect === "vision",
    );
    expect(found).toBeDefined();
    expect(found!.kind).toBe("strength");
  });
});

describe("diagnoseRoster — participation and combat", () => {
  it("keeps the confidence low when the sample is small", () => {
    // Below LOW_CONFIDENCE_GAMES (3): two games are not a sample.
    const small = depth({
      games: 2,
      summary: { ...depth().summary, games: 2, killParticipation: 0.2 },
    });
    const found = diagnoseRoster(input([small])).find(
      (d) => d.aspect === "killParticipation",
    );
    expect(found).toBeDefined();
    expect(found!.confidence).toBe("low");
  });

  it("still diagnoses a player with very few games, at low confidence", () => {
    // A small sample lowers the confidence; it must not silence the analysis. Before, a guard
    // returned early and a player with two games simply had no diagnosis at all.
    const small = depth({
      games: 2,
      summary: { ...depth().summary, games: 2, killParticipation: 0.2 },
      early: {
        ...depth().early,
        laneGames: 2,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
    });
    const found = diagnoseRoster(input([small]));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((entry) => entry.confidence === "low")).toBe(true);
    expect(found.some((entry) => entry.aspect === "farming")).toBe(true);
  });

  it("does not floor a player with one unknown metric", () => {
    const noTimeline = depth({
      early: {
        ...depth().early,
        laneGames: 0,
        at10: { cs: null, csDiff: null, xpDiff: null, goldDiff: null },
      },
      deaths: { ...depth().deaths, aloneShare: null, games: 0 },
      summary: { ...depth().summary, killParticipation: 0.45, deathsPerGame: 4 },
      combat: { ...depth().combat, damagePerDeath: 1500 },
    });
    const found = diagnoseRoster(input([noTimeline], 4)).find(
      (d) => d.aspect === "farming",
    );
    // Without lane data there is nothing to say about farming: absence is not a problem.
    expect(found).toBeUndefined();
  });

  it("does not blame low damage per death when the early game was the hole", () => {
    const behindEarly = depth({
      combat: { ...depth().combat, damagePerDeath: 600 },
      early: {
        ...depth().early,
        at10: { cs: 60, csDiff: 0, xpDiff: -900, goldDiff: -200 },
      },
    });
    const found = diagnoseRoster(input([behindEarly])).find(
      (d) => d.aspect === "combat",
    );
    expect(found).toBeDefined();
    expect(found!.shared).toBe("laneStructure");
  });

  it("refuses the participation diagnosis when there is no timeline to see the fights", () => {
    const solo = depth({
      summary: { ...depth().summary, killParticipation: 0.2 },
      deaths: { ...depth().deaths, aloneShare: null, games: 0 },
    });
    const found = diagnoseRoster(input([solo], 4)).find(
      (d) => d.aspect === "killParticipation",
    );
    expect(found).toBeDefined();
    expect(found!.shared).toBe("notMeasured");
  });
});

describe("diagnoseRoster — the seven fields", () => {
  it("carries all seven fields of the diagnosis and the roster name", () => {
    const behind = heavyDeaths({
      early: {
        ...depth().early,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
    });
    const found = diagnoseRoster(input([behind])).find((d) => d.aspect === "farming")!;
    expect(found.person).toBe("p1");
    // §5.3 "Jogador": the name from the roster, never the raw id.
    expect(found.personName).toBe("Ana");
    expect(found.aspect).toBeDefined();
    expect(found.kind === "problem" || found.kind === "strength").toBe(true);
    expect(found.evidence.length).toBeGreaterThan(0);
    expect(found.context.roles.length).toBeGreaterThan(0);
    expect(found.context.games).toBeGreaterThan(0);
    expect(found.confidence).toBeTypeOf("string");
    expect(found.exercise.id.length).toBeGreaterThan(0);
    expect(found.tracking.metric.length).toBeGreaterThan(0);
  });

  it("falls back to a short id when the roster has no name for the person", () => {
    const unknown = depth({ person: "abcdef123456" });
    const found = diagnoseRoster(input([unknown, depth()])).find(
      (d) => d.person === "abcdef123456",
    );
    expect(found!.personName).toBe("abcdef12");
  });

  it("never claims more full-lineup games than the person played", () => {
    // The caller says the window has 40 full games, but this person only played 20: the context
    // must not claim a sample the person does not have.
    const found = diagnoseRoster({
      ...input([heavyDeaths()], 4),
      fullGames: 40,
    }).find((d) => d.aspect === "deaths")!;
    expect(found.context.fullGames).toBe(20);
  });
});

describe("splitDiagnoses and classifyDiagnoses", () => {
  it("separates what belongs to the player from what belongs to the team", () => {
    // Two people: one behind in farm (individual), one dying at the group's pace (shared).
    const behind = heavyDeaths({
      person: "p1",
      early: {
        ...depth().early,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
    });
    const even = depth({ person: "p2" });
    const split = splitDiagnoses(
      diagnoseRoster({ ...input([behind, even], 4), names: new Map([["p1", "Ana"]]) }),
    );
    expect(split.individual.some((d) => d.aspect === "farming")).toBe(true);
    expect(split.shared.some((d) => d.person === "p2" && d.aspect === "deaths")).toBe(true);
    expect(split.individual.every((d) => d.shared === null)).toBe(true);
    expect(split.shared.every((d) => d.shared !== null)).toBe(true);
  });

  it("keeps problems, strengths and unmeasured entries apart", () => {
    const player = heavyDeaths({
      early: {
        ...depth().early,
        at10: { cs: 50, csDiff: -25, xpDiff: -100, goldDiff: -300 },
      },
      vision: { ...depth().vision, visionPerMin: 2.4, laneAveragePerMin: 1.2 },
      summary: {
        ...depth().summary,
        deathsPerGame: 9,
        killParticipation: 0.8,
      },
    });
    const classified = classifyDiagnoses(diagnoseRoster(input([player], 4)));
    expect(classified.problems.some((d) => d.aspect === "farming")).toBe(true);
    expect(classified.strengths.some((d) => d.aspect === "vision")).toBe(true);
    expect(classified.strengths.some((d) => d.aspect === "killParticipation")).toBe(true);
    // Every bucket holds what its name says and nothing else.
    expect(classified.strengths.every((d) => d.shared === null && d.kind === "strength")).toBe(true);
    expect(classified.problems.every((d) => d.shared === null && d.kind === "problem")).toBe(true);
    expect(
      classified.unmeasured.every((d) => d.shared !== null && d.aspect !== "deaths"),
    ).toBe(true);
  });
});
