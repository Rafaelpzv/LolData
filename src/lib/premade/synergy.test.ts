import { describe, expect, it } from "vitest";

import { buildSynergyReport, SYNERGY_MIN_GAMES } from "./synergy";
import type { PremadeTimeline } from "./timeline";
import type { PremadeMatchSample, PremadeParticipantSample } from "./types";

const PEOPLE = ["a", "b", "c"];

function participant(
  puuid: string,
  overrides: Partial<PremadeParticipantSample> = {},
): PremadeParticipantSample {
  return {
    puuid,
    accountId: puuid,
    championId: 1,
    championName: "Annie",
    teamPosition: "MIDDLE",
    kills: 1,
    deaths: 2,
    assists: 2,
    goldEarned: 10_000,
    champExperience: 8_000,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 10,
    visionScore: 20,
    wardsPlaced: 5,
    wardsKilled: 1,
    totalDamageDealtToChampions: 12_000,
    totalDamageTaken: 15_000,
    pings: null,
    ...overrides,
  };
}

function match(id: string, people = PEOPLE): PremadeMatchSample {
  return {
    matchId: id,
    gameCreation: 1_700_000_000_000,
    season: 14,
    win: true,
    duration: 1_800,
    teamSide: 100,
    objectives: {
      baron: { first: false, kills: 0 },
      champion: { first: false, kills: 0 },
      dragon: { first: true, kills: 2 },
      inhibitor: { first: false, kills: 0 },
      riftHerald: { first: false, kills: 0 },
      tower: { first: true, kills: 8 },
    },
    teamKills: 10,
    teamGold: 50_000,
    turretTakedowns: 8,
    champLevel: 60,
    participants: people.map((person) => participant(person)),
  };
}

function timeline(id: string, withAB: boolean): PremadeTimeline {
  return {
    matchId: id,
    duration: 1_800,
    endOfGameResult: "GameComplete",
    frameInterval: 60_000,
    goldSeries: [],
    goldDiff: [],
    xpDiff: [],
    // One group kill: with both "a" and "b" present, or with only "c".
    kills: [
      {
        at: 300,
        kind: "groupKill",
        x: 0,
        y: 0,
        person: "a",
        near: withAB ? 2 : 1,
        people: withAB ? ["a", "b"] : ["c"],
      },
    ],
    objectives: [],
    positions: [],
    deaths: [],
    finalStats: {
      gold: 0,
      kills: 0,
      deaths: 0,
      towers: 0,
      dragons: 0,
      barons: 0,
    },
  };
}

describe("buildSynergyReport", () => {
  it("measures joint kills against what the two individuals predict", () => {
    const matches = [match("m1"), match("m2")];
    const timelines = [timeline("m1", true), timeline("m2", true)];
    const report = buildSynergyReport(matches, timelines);
    const ab = report.pairs.find(
      (pair) => [pair.a, pair.b].sort().join() === "a,b",
    )!;

    expect(ab.games).toBe(2);
    expect(ab.together).toBe(2);
    expect(ab.observed.rate).toBe(1);
    // Each one's kill participation is (1 kill + 2 assists) / 10 kills = 0.3, so the pair predicts 9%.
    expect(ab.expected).toBeCloseTo(0.09);
    expect(ab.lift).toBeCloseTo(1 / 0.09);
    expect(ab.enoughGames).toBe(false);
    expect(SYNERGY_MIN_GAMES).toBe(5);
  });

  it("a pair that never shares a kill sits at zero", () => {
    const report = buildSynergyReport([match("m1")], [timeline("m1", false)]);
    const ab = report.pairs.find(
      (pair) => [pair.a, pair.b].sort().join() === "a,b",
    )!;
    expect(ab.together).toBe(0);
    expect(ab.lift).toBe(0);
  });

  it("ignores a timeline with no stored match instead of inventing a result", () => {
    const report = buildSynergyReport([match("m1")], [timeline("old", true)]);
    expect(report.pairs).toEqual([]);
    expect(report.timelines).toBe(1);
  });
});
