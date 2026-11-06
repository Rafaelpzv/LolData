import { describe, expect, it } from "vitest";

import { computeMetrics } from "./metrics";
import { buildRecommendations, withSampleLedger } from "./recommendations";
import { buildIndividualRecommendations } from "./individual-recommendations";
import { computePlayerDepth } from "./individual-metrics";
import type { PremadeMatchSample, PremadeParticipantSample } from "./types";

const PUUIDS = ["a", "b", "c", "d", "e"];

function participant(
  puuid: string,
  index: number,
  overrides: Partial<PremadeParticipantSample> = {},
): PremadeParticipantSample {
  return {
    puuid,
    accountId: puuid,
    championId: 100 + index,
    championName: `Champ${index}`,
    teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][index],
    kills: 3,
    deaths: index === 0 ? 6 : 2,
    assists: 5,
    goldEarned: 10_000,
    champExperience: 12_000,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 10,
    visionScore: index === 4 ? 40 : 20,
    wardsPlaced: 8,
    wardsKilled: 3,
    totalDamageDealtToChampions: 15_000,
    totalDamageTaken: 20_000,
    win: true,
    pings: {
      allInPings: 0,
      assistMePings: 1,
      basicPings: 2,
      commandPings: 0,
      dangerPings: 1,
      enemyMissingPings: 1,
      enemyVisionPings: 0,
      getBackPings: index === 0 ? 12 : 2,
      holdPings: 0,
      needVisionPings: 0,
      onMyWayPings: 2,
      pushPings: 0,
      retreatPings: 1,
      visionClearedPings: 0,
    },
    perks: { keystone: 8005, primary: 8000, secondary: 8200, shards: [] },
    items: [6655, 3020, 4645, 0, 0, 0, 3340],
    derived: {
      purchases: [],
      firstCompletedItem: { itemId: 6655, at: 620 },
      completedOrder: [6655, 3020, 4645],
      skillOrder: [1, 2, 3, 1, 1, 4],
      laning: [
        {
          at: 600,
          cs: index === 0 ? 60 : 80,
          xp: 4000,
          gold: 3500,
          enemyCs: 82,
          enemyXp: 4200,
          enemyGold: 3600,
        },
        {
          at: 900,
          cs: index === 0 ? 90 : 120,
          xp: 7000,
          gold: 6200,
          enemyCs: 132,
          enemyXp: 7400,
          enemyGold: 6500,
        },
      ],
    },
    ...overrides,
  };
}

function match(
  index: number,
  overrides: {
    win?: boolean;
    turretTakedowns?: number;
    sideTurrets?: number;
  } = {},
): PremadeMatchSample {
  const win = overrides.win ?? true;
  return {
    matchId: `BR1_${index}`,
    season: 16,
    champLevel: 16,
    gameCreation: 1_700_000_000_000 + index * 1_000_000,
    duration: 1800,
    win,
    teamSide: 100,
    teamKills: 15,
    teamDeaths: 10,
    teamGold: 50_000,
    teamDamage: 70_000,
    turretTakedowns: overrides.turretTakedowns ?? 3,
    objectives: {
      baron: { first: false, kills: 1 },
      champion: { first: win, kills: 15 },
      dragon: { first: index % 5 === 0, kills: 2 },
      inhibitor: { first: false, kills: 1 },
      riftHerald: { first: index % 2 === 0, kills: 1 },
      tower: { first: false, kills: overrides.sideTurrets ?? 3 },
    },
    sideObjectives: {
      turret: overrides.sideTurrets ?? 3,
      dragon: 2,
      baron: 1,
      inhibitor: 1,
    },
    participants: PUUIDS.map((puuid, i) => ({
      ...participant(puuid, i, { win }),
      derived: {
        ...participant(puuid, i).derived!,
        completedOrder: i === 0 ? [6655, 3020, 3153] : [6655, 3020, 4645],
      },
    })),
  };
}

describe("recommendation samples", () => {
  it("always carries the games behind the claim", () => {
    const matches = Array.from({ length: 8 }, (_, i) => match(i));
    const metrics = computeMetrics(matches);
    const recommendations = withSampleLedger(
      buildRecommendations(metrics, matches, []),
      0,
      matches.length,
    );
    expect(recommendations.length).toBeGreaterThan(0);
    for (const recommendation of recommendations) {
      expect(recommendation.games).toBe(matches.length);
    }
  });

  it("reads turrets per game from the side total, not from the takedowns", () => {
    // Twenty takedowns summed over five players and only 4 towers on the map.
    const matches = Array.from({ length: 6 }, (_, i) =>
      match(i, { turretTakedowns: 20, sideTurrets: 4 }),
    );
    const metrics = computeMetrics(matches);
    expect(metrics.conversion.turretsPerGame).toBe(4);
    const towers = buildRecommendations(metrics, matches, []).find(
      (rec) => rec.code === "fewTowers",
    );
    expect(towers?.evidence.towersPerGame).toBe(4);
  });

  it("never mixes a translated rule with an untranslated one", () => {
    const matches = Array.from({ length: 12 }, (_, i) =>
      match(i, { win: i % 2 === 0 }),
    );
    const metrics = computeMetrics(matches);
    const codes = new Set(
      buildRecommendations(metrics, matches, []).map((rec) => rec.code),
    );
    expect(codes.has("stableDeaths") || codes.has("deathsVolatile")).toBe(true);
    expect(codes.has("positiveStreak" as never)).toBe(false);
  });
});

describe("individual depth", () => {
  const matches = Array.from({ length: 6 }, (_, i) => match(i, { win: i < 3 }));

  it("measures a person over their own games only", () => {
    const metrics = computeMetrics(matches);
    const depth = computePlayerDepth("a", matches, metrics.players[0], metrics);
    expect(depth.summary.games).toBe(6);
    expect(depth.summary.wins).toBe(3);
    expect(depth.champions).toHaveLength(1);
    expect(depth.champions[0].games).toBe(6);
    expect(depth.champions[0].build.firstItem).toEqual({
      itemId: 6655,
      games: 6,
      at: 620,
    });
    // Ana's own build wins three of six, and she never played another one in these games.
    expect(depth.champions[0].build.order?.games).toBe(6);
    expect(depth.champions[0].buildWinRate.withBuild).toBe(50);
    expect(depth.champions[0].buildWinRate.other).toBeNull();
    expect(depth.champions[0].runes).toMatchObject({
      keystone: 8005,
      games: 6,
    });
    expect(depth.champions[0].skills?.order).toEqual([1, 2, 3, 1, 1, 4]);
  });

  it("reads the lane from the timeline: CS and the difference at 10 and 15", () => {
    const metrics = computeMetrics(matches);
    const depth = computePlayerDepth("a", matches, metrics.players[0], metrics);
    expect(depth.early.at10.cs).toBe(60);
    expect(depth.early.at10.csDiff).toBe(-22);
    expect(depth.early.at15.csDiff).toBe(-42);
    // The lane is read at 10 AND 15 minutes, so six games are twelve observations: the denominator
    // is what was read, never the games played.
    expect(depth.early.laneGames).toBe(12);
  });

  it("counts the deaths before 10 minutes only over the games with a timeline", () => {
    const metrics = computeMetrics(matches);
    // No timeline at all: the metric has no denominator and says so instead of answering zero.
    const withoutTimeline = computePlayerDepth(
      "a",
      matches,
      metrics.players[0],
      metrics,
    );
    expect(withoutTimeline.early.deathsBefore10).toBeNull();
    expect(withoutTimeline.early.deathsBefore10Games).toBe(0);

    // Three games with a timeline, two early deaths: 2/3 per game. A game without a timeline is a
    // missing observation, never a game with zero deaths.
    const deaths = new Map([
      ["BR1_0", [{ at: 300, person: "a", alone: true, costly: false, region: "top" as const }]],
      ["BR1_1", [{ at: 599, person: "a", alone: false, costly: false, region: "mid" as const }]],
      ["BR1_2", [{ at: 600, person: "a", alone: false, costly: false, region: "mid" as const }]],
    ]);
    const depth = computePlayerDepth(
      "a",
      matches,
      metrics.players[0],
      metrics,
      {},
      deaths,
    );
    expect(depth.early.deathsBefore10Games).toBe(3);
    expect(depth.early.deathsBefore10).toBeCloseTo(2 / 3);
  });

  it("compares the trend with the window before it", () => {
    const metrics = computeMetrics(matches);
    const depth = computePlayerDepth("a", matches, metrics.players[0], metrics);
    expect(depth.trend.recentGames).toBe(6);
    expect(depth.trend.previousGames).toBe(0);
    expect(depth.trend.deltas.winRate).toBeNull();
  });

  it("splits deaths by phase and region from the timeline", () => {
    const metrics = computeMetrics(matches);
    const deaths = new Map([
      [
        "BR1_0",
        [
          {
            at: 300,
            person: "a",
            alone: true,
            costly: true,
            region: "top" as const,
          },
        ],
      ],
      [
        "BR1_1",
        [
          {
            at: 1750,
            person: "a",
            alone: false,
            costly: false,
            region: "mid" as const,
          },
        ],
      ],
    ]);
    const depth = computePlayerDepth(
      "a",
      matches,
      metrics.players[0],
      metrics,
      {},
      deaths,
    );
    expect(depth.deaths.total).toBe(2);
    expect(depth.deaths.byPhase.early).toBe(1);
    expect(depth.deaths.byPhase.late).toBe(1);
    expect(depth.deaths.byRegion.top).toBe(1);
    // The unit is PERCENT (0..100), not a fraction: one death of two alone and costly is 50, and
    // the UI must not multiply it by 100 again (it showed 5000% because of exactly that).
    expect(depth.deaths.costlyShare).toBe(50);
    expect(depth.deaths.aloneShare).toBe(50);
    expect(depth.deaths.alone).toBe(1);
    expect(depth.deaths.costly).toBe(1);
  });

  it("keeps every individual rule on a small sample at low confidence", () => {
    const metrics = computeMetrics(matches);
    const depths = metrics.players.map((profile) =>
      computePlayerDepth(profile.puuid, matches, profile, metrics),
    );
    const recommendations = buildIndividualRecommendations(
      depths,
      new Map([["a", "Ana"]]),
    );
    for (const recommendation of recommendations) {
      if ((recommendation.games ?? 0) < 3)
        expect(recommendation.confidence).toBe("low");
      expect(recommendation.evidence.player).toBeTruthy();
    }
  });
});
