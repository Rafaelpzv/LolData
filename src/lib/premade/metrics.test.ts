import { describe, expect, it } from "vitest";

import {
  SESSION_GAP_MS,
  buildPlayerProfiles,
  comparePeriods,
  computeMetrics,
  splitSessions,
  variation,
} from "./metrics";
import type {
  PremadeMatchSample,
  PremadeParticipantSample,
  TeamObjectives,
} from "./types";

const PUUIDS = ["a", "b", "c", "d", "e"];

const objectives = (
  kills: number,
  first = false,
  towerKills = 2,
): TeamObjectives => ({
  baron: { first, kills },
  champion: { first, kills: 1 },
  dragon: { first, kills },
  inhibitor: { first: false, kills: 0 },
  riftHerald: { first, kills },
  tower: { first, kills: towerKills },
});

function participant(
  puuid: string,
  overrides: Partial<PremadeParticipantSample> = {},
): PremadeParticipantSample {
  return {
    puuid,
    championId: 1,
    championName: "Annie",
    teamPosition: "TOP",
    kills: 2,
    deaths: 4,
    assists: 6,
    goldEarned: 10_000,
    champExperience: 8_000,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 20,
    visionScore: 20,
    wardsPlaced: 10,
    wardsKilled: 2,
    totalDamageDealtToChampions: 15_000,
    totalDamageTaken: 20_000,
    pings: null,
    ...overrides,
  };
}

function game(
  win: boolean,
  overrides: Partial<PremadeMatchSample> & {
    participants?: PremadeParticipantSample[];
  } = {},
): PremadeMatchSample {
  return {
    matchId: `BR1_${Math.random()}`,
    gameCreation: 1_700_000_000_000,
    season: 0,
    win,
    duration: 1800,
    teamSide: 100,
    objectives: objectives(2, true),
    champLevel: 80,
    turretTakedowns: 10,
    teamKills: 10,
    teamGold: 50_000,
    participants: PUUIDS.map((puuid) => participant(puuid)),
    ...overrides,
  };
}

describe("variation", () => {
  it("is null for a single game and zero when every game matches", () => {
    expect(variation([5])).toBeNull();
    expect(variation([5, 5, 5])).toBe(0);
  });

  it("grows with the spread", () => {
    const tight = variation([10, 11, 9])!;
    const loose = variation([2, 10, 18])!;
    expect(loose).toBeGreaterThan(tight);
  });
});

describe("splitSessions", () => {
  const at = (hours: number) => ({
    matchId: String(hours),
    gameCreation: hours * 3_600_000,
    win: true,
  });

  it("starts a new session on a 4h break between games", () => {
    // Games one hour apart form a session; a four-hour break starts another one.
    const sessions = splitSessions([at(0), at(1), at(2), at(6), at(7)]);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].games).toBe(3);
    expect(sessions[1].games).toBe(2);
    expect(sessions[0].onset).toBe(true);
    expect(sessions[1].onset).toBe(false);
  });

  it("keeps the session boundary inclusive", () => {
    const sessions = splitSessions([
      { matchId: "x", gameCreation: 0, win: true },
      { matchId: "y", gameCreation: SESSION_GAP_MS, win: false },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].wins).toBe(1);
  });
});

describe("computeMetrics", () => {
  it("computes collective KDA, per-player KP and win rate", () => {
    const metrics = computeMetrics([game(true), game(true), game(false)]);
    expect(metrics.games).toBe(3);
    expect(metrics.wins).toBe(2);
    expect(metrics.winRate).toBeCloseTo(66.666, 2);
    expect(metrics.kills).toEqual({ kills: 30, deaths: 60, assists: 90 });
    expect(metrics.kda).toBe(2);
    expect(metrics.killParticipation).toHaveLength(5);
    // 2 kills + 6 assists out of 10 team kills.
    expect(metrics.killParticipation[0].ratio).toBeCloseTo(0.8);
    expect(metrics.killParticipation[0].games).toBe(3);
  });

  it("leaves KP out when team kills are unknown", () => {
    const metrics = computeMetrics([game(true, { teamKills: 0 })]);
    expect(metrics.killParticipation[0].ratio).toBeNull();
    expect(metrics.killParticipation[0].games).toBe(0);
  });

  it("conditions win rate on objectives", () => {
    const metrics = computeMetrics([
      game(true, { objectives: objectives(3, true) }),
      game(true, { objectives: objectives(0, false) }),
      game(false, { objectives: objectives(0, false) }),
    ]);
    const dragon = metrics.objectives.dragon;
    expect(dragon.games).toBe(3);
    expect(dragon.firstGames).toBe(1);
    expect(dragon.firstRate).toBeCloseTo(1 / 3);
    expect(dragon.winRateWithCondition).toBe(100);
    expect(dragon.winRateWithoutCondition).toBe(50);
  });

  it("associates kills with towers instead of scoring them", () => {
    const metrics = computeMetrics([
      game(true, { turretTakedowns: 15 }),
      game(false, { turretTakedowns: 5 }),
    ]);
    expect(metrics.conversion.killsToTurrets).toBe(1);
    expect(metrics.conversion.winGoldPerKill).toBe(5_000);
    expect(metrics.conversion.lossGoldPerKill).toBe(5_000);
  });

  it("returns nulls instead of inventing numbers on an empty sample", () => {
    const metrics = computeMetrics([]);
    expect(metrics.games).toBe(0);
    expect(metrics.winRate).toBeNull();
    // No deaths across the sample means a perfect KDA, exactly like a single perfect game.
    expect(metrics.kda).toBeNull();
    expect(metrics.killParticipation).toEqual([]);
    expect(metrics.sessions).toEqual([]);
    expect(metrics.consistency.team.deaths).toBeNull();
  });

  it("deltas a period comparison and keeps nulls null", () => {
    const before = computeMetrics([
      game(false, {
        participants: PUUIDS.map((p) => participant(p, { deaths: 5 })),
      }),
    ]);
    const after = computeMetrics([game(true), game(true)]);
    const delta = comparePeriods(before, after);
    expect(delta.games).toBe(2);
    expect(delta.winRate).toBe(100);
    // 1.4 - 1.0
    expect(delta.kda).toBeCloseTo(0.4);
    expect(delta.dragonFirstRate).toBe(0);
  });

  it("keeps a player's consistency null when every game is identical", () => {
    const metrics = computeMetrics([game(true), game(true)]);
    expect(metrics.consistency.individual).toHaveLength(5);
    expect(metrics.consistency.individual[0].deaths).toBe(0);
    expect(metrics.consistency.team.deaths).toBe(0);
  });
});

describe("buildPlayerProfiles", () => {
  it("measures each player only over the games they played", () => {
    const bench = [
      participant("a", {
        championId: 2,
        championName: "Ashe",
        teamPosition: "BOTTOM",
        kills: 10,
        deaths: 0,
        assists: 5,
      }),
      participant("b", {
        championId: 2,
        championName: "Ashe",
        teamPosition: "BOTTOM",
        kills: 1,
        deaths: 1,
        assists: 1,
      }),
      participant("c"),
      participant("d"),
      participant("e"),
    ];
    const profiles = buildPlayerProfiles([
      game(true),
      game(false, { participants: bench }),
    ]);
    const a = profiles.find((p) => p.puuid === "a")!;

    expect(a.games).toBe(2);
    expect(a.champions.map((c) => c.championId).sort()).toEqual([1, 2]);
    expect(a.champions.find((c) => c.championId === 2)?.kda).toBe(15);
    expect(a.positions.find((p) => p.teamPosition === "BOTTOM")?.games).toBe(1);
    expect(a.mainPosition?.teamPosition).toBe("TOP");
  });

  it("skips players who never appear", () => {
    const profiles = buildPlayerProfiles([game(true)]);
    expect(profiles.map((p) => p.puuid)).not.toContain("benched");
  });

  it("sums the accounts of one person into a single player", () => {
    // "a" and "f" are the same person, playing one account per game.
    const owners = { a: "person-a", f: "person-a" };
    const second = [
      participant("f", { championId: 2, championName: "Ashe" }),
      participant("b"),
      participant("c"),
      participant("d"),
      participant("e"),
    ];
    const matches = [game(true), game(false, { participants: second })];
    const metrics = computeMetrics(matches, owners);

    expect(metrics.players.map((p) => p.puuid).sort()).toEqual([
      "b",
      "c",
      "d",
      "e",
      "person-a",
    ]);
    const person = metrics.players.find((p) => p.puuid === "person-a")!;
    expect(person.games).toBe(2);
    expect(person.champions.map((c) => c.championId).sort()).toEqual([1, 2]);
    // Kill participation counts the person once per game, never twice.
    expect(
      metrics.killParticipation.find((k) => k.puuid === "person-a")?.games,
    ).toBe(2);
    expect(
      metrics.consistency.individual.find((i) => i.puuid === "person-a")?.games,
    ).toBe(2);
  });
});
describe("removed players", () => {
  it("stops counting accounts the lineup no longer has", () => {
    // The repository leaves accountId empty for an account of a removed player.
    const participants = [
      participant("a", { accountId: null }),
      ...PUUIDS.slice(1).map((puuid) => participant(puuid)),
    ];
    expect(participants[0].accountId).toBeNull();
    const metrics = computeMetrics([game(true, { participants })]);

    expect(metrics.players).toHaveLength(4);
    expect(metrics.players.map((p) => p.puuid)).not.toContain("a");
    expect(metrics.kills.kills).toBe(8);
    expect(metrics.presence).toEqual([{ players: 4, games: 1, wins: 1 }]);
  });

  it("counts two accounts of one person once in the presence buckets", () => {
    const participants = [
      participant("a", { accountId: "p1" }),
      participant("a2", { accountId: "p1" }),
      participant("b", { accountId: "p2" }),
    ];
    const metrics = computeMetrics([game(false, { participants })], {
      a: "p1",
      a2: "p1",
      b: "p2",
    });

    expect(metrics.presence).toEqual([{ players: 2, games: 1, wins: 0 }]);
  });
});
