import { describe, expect, it } from "vitest";

import { buildDimensions } from "./dimensions";
import { PERIOD_SIZE, computeMetrics } from "./metrics";
import type { TimelineMetrics } from "./timeline-metrics";
import type { PremadeMatchSample, PremadeParticipantSample } from "./types";

const PUUIDS = ["a", "b", "c", "d", "e"];

function participant(puuid: string): PremadeParticipantSample {
  return {
    puuid,
    accountId: puuid,
    championId: 1,
    championName: "Annie",
    teamPosition: "TOP",
    kills: 2,
    deaths: 3,
    assists: 5,
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
  };
}

function game(
  win: boolean,
  index: number,
  firstDragon: boolean,
): PremadeMatchSample {
  return {
    matchId: `M${index}`,
    gameCreation: 1_700_000_000_000 + index * 3_600_000,
    season: 14,
    win,
    duration: 1_800,
    teamSide: 100,
    objectives: {
      baron: { first: false, kills: 0 },
      champion: { first: false, kills: 0 },
      dragon: { first: firstDragon, kills: firstDragon ? 2 : 0 },
      inhibitor: { first: false, kills: 0 },
      riftHerald: { first: false, kills: 0 },
      tower: { first: true, kills: 8 },
    },
    teamKills: 10,
    teamGold: 50_000,
    turretTakedowns: 8,
    champLevel: 60,
    participants: PUUIDS.map((person) => participant(person)),
  };
}

/** A window with timelines for every game, all of one kind: the dimension metrics read them. */
function timelineAll(games: PremadeMatchSample[]): TimelineMetrics | null {
  if (games.length === 0) return null;
  return {
    games: games.length,
    missingTimelines: 0,
    curve: [],
    gold: {
      points: [],
      byResult: { wins: [], losses: [] },
      markers: [],
      games: games.length,
      missingTimelines: 0,
    },
    throws: { games: 0, lost: 0 },
    comebacks: { games: 0, won: 0 },
    objectives: {},
    preparation: {
      dragon: {
        events: 2,
        games: 1,
        averageNear: 3,
        deathsBefore: 0,
        nearShare: 0.5,
      },
      herald: {
        events: 0,
        games: 0,
        averageNear: null,
        deathsBefore: 0,
        nearShare: null,
      },
      baron: {
        events: 0,
        games: 0,
        averageNear: null,
        deathsBefore: 0,
        nearShare: null,
      },
    },
    presenceAssociation: {
      withPresence: { events: 0, wins: 0, games: 0 },
      withoutPresence: { events: 0, wins: 0, games: 0 },
    },
    conversion: { average: null, median: null, games: 0, kills: 0 },
    deaths: { total: 0, costly: 0, isolated: 0, perGame: null },
    grouping: {
      averageDistance: null,
      groupedShare: 40,
      nearKill: 2.4,
      nearObjective: 2.1,
      frames: 120,
      radius: 6_000,
    },
    fights: { count: 0, averagePerGame: null },
    players: [],
    pairs: [],
  } as unknown as TimelineMetrics;
}

describe("buildDimensions", () => {
  const games = [
    ...Array.from({ length: 20 }, (_, index) => game(true, index, true)),
    ...Array.from({ length: 20 }, (_, index) => game(false, 20 + index, false)),
  ];

  it("compares the newest window against the one before it, of the same size", () => {
    const report = buildDimensions(
      games,
      (window) => timelineAll(window.games),
      (window) => computeMetrics(window.games),
      {},
      PERIOD_SIZE,
    );
    expect(report.windows.size).toBe(20);
    expect(report.windows.recent.games).toBe(20);
    expect(report.windows.previous.games).toBe(20);
    expect(report.windows.recent.fullGames).toBe(20);
  });

  it("puts the first dragon on both windows, with the previous value kept", () => {
    const report = buildDimensions(
      games,
      (window) => timelineAll(window.games),
      (window) => computeMetrics(window.games),
      {},
      20,
    );
    const dragon = report.dimensions
      .find((dimension) => dimension.key === "objectiveControl")!
      .metrics.find((metric) => metric.key === "firstDragon")!;
    // Newest first: the recent window is the block of losses (no first dragon), the one before the wins.
    expect({ value: dragon.value, previous: dragon.previous }).toEqual({
      value: 0,
      previous: 1,
    });
    expect(dragon.n).toBe(20);
    expect(dragon.change?.delta).toBe(-1);
    // Both windows are pure (all wins against all losses): the pooled spread is zero, so no signal.
    expect(dragon.change?.signal).toBeNull();
  });

  it("says no data when the window has no timeline, instead of zero", () => {
    const report = buildDimensions(
      games,
      () => null,
      (window) => computeMetrics(window.games),
      {},
      20,
    );
    const grouped = report.dimensions
      .find((dimension) => dimension.key === "synchronization")!
      .metrics.find((metric) => metric.key === "groupedShare")!;
    expect(grouped.value).toBeNull();
    expect(grouped.change).toBeNull();
    expect(grouped.n).toBe(0);
  });

  it("reads the previous window before degrading, chronologically", () => {
    const report = buildDimensions(
      games,
      (window) => timelineAll(window.games),
      (window) => computeMetrics(window.games),
      {},
      20,
    );
    // Newest game first: the recent window goes from M20 (oldest of the block) to M39.
    expect(report.windows.recent.from).toBe(1_700_000_000_000 + 20 * 3_600_000);
    expect(report.windows.recent.to).toBe(1_700_000_000_000 + 39 * 3_600_000);
  });
});
