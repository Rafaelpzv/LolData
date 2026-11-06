import { describe, expect, it } from "vitest";

import { computeMetrics } from "./metrics";
import {
  NEUTRAL_SCORE,
  band,
  computeRatings,
  inverseBand,
  playerRating,
  round1,
  shrink,
  teamRating,
} from "./score";
import type { PremadeMatchSample, PremadeParticipantSample } from "./types";

function participant(
  overrides: Partial<PremadeParticipantSample> = {},
): PremadeParticipantSample {
  return {
    puuid: "p1",
    accountId: "a1",
    championId: 1,
    championName: "Ahri",
    teamPosition: "MIDDLE",
    kills: 5,
    deaths: 3,
    assists: 8,
    goldEarned: 12000,
    champExperience: 15000,
    totalMinionsKilled: 200,
    neutralMinionsKilled: 10,
    visionScore: 30,
    wardsPlaced: 10,
    wardsKilled: 3,
    totalDamageDealtToChampions: 25000,
    totalDamageTaken: 18000,
    pings: null,
    ...overrides,
  };
}

function match(
  overrides: Partial<PremadeMatchSample> = {},
  participants?: PremadeParticipantSample[],
): PremadeMatchSample {
  return {
    matchId: `M${Math.random()}`,
    gameCreation: 1_700_000_000_000,
    season: 14,
    win: true,
    duration: 1800,
    teamSide: 100,
    objectives: {
      baron: { first: true, kills: 1 },
      champion: { first: false, kills: 0 },
      dragon: { first: true, kills: 3 },
      inhibitor: { first: false, kills: 1 },
      riftHerald: { first: true, kills: 1 },
      tower: { first: true, kills: 8 },
    },
    champLevel: 80,
    turretTakedowns: 8,
    teamKills: 20,
    teamGold: 60000,
    participants: participants ?? [participant()],
    ...overrides,
  };
}

function series(
  games: number,
  win: boolean,
  patch: Partial<PremadeMatchSample> = {},
): PremadeMatchSample[] {
  return Array.from({ length: games }, (_, index) =>
    match({
      ...patch,
      win,
      matchId: `M${index}`,
      gameCreation: 1_700_000_000_000 + index * 1_000_000,
    }),
  );
}

describe("bands", () => {
  it("scores 0 at the floor and 10 at the target", () => {
    expect(band(25, 25, 65)).toBe(0);
    expect(band(65, 25, 65)).toBe(10);
    expect(band(45, 25, 65)).toBe(5);
  });

  it("saturates instead of growing forever", () => {
    expect(band(90, 25, 65)).toBe(10);
    expect(band(5, 25, 65)).toBe(0);
  });

  it("is NaN when the metric is missing, never a fake 0", () => {
    expect(band(null, 0, 10)).toBeNaN();
  });

  it("inverts for values where lower is better", () => {
    expect(inverseBand(3, 3, 8)).toBe(10);
    expect(inverseBand(8, 3, 8)).toBe(0);
  });
});

describe("shrink", () => {
  it("pulls a small sample back to the neutral score", () => {
    const pulled = shrink(10, 3);
    expect(pulled).toBeGreaterThan(NEUTRAL_SCORE);
    expect(pulled).toBeLessThan(8.5);
  });

  it("leaves a large sample almost untouched", () => {
    expect(shrink(10, 200)).toBeCloseTo(9.79, 1);
  });

  it("never moves the neutral score", () => {
    expect(shrink(NEUTRAL_SCORE, 1)).toBe(NEUTRAL_SCORE);
  });
});

describe("teamRating", () => {
  it("scores a dominant five-person team high", () => {
    const matches = series(40, true).map((m) =>
      match({
        ...m,
        participants: [1, 2, 3, 4, 5].map((n) =>
          participant({
            puuid: `p${n}`,
            accountId: `a${n}`,
            kills: 6,
            deaths: 2,
          }),
        ),
      }),
    );
    const rating = teamRating(computeMetrics(matches), matches);
    expect(rating.score).toBeGreaterThan(7.5);
    expect(rating.score).toBeLessThanOrEqual(10);
    expect(rating.parts.length).toBeGreaterThan(4);
  });

  it("scores a losing team low", () => {
    const matches = series(40, false).map((m) =>
      match({
        ...m,
        objectives: {
          ...m.objectives,
          dragon: { first: false, kills: 0 },
          tower: { first: false, kills: 1 },
          baron: { first: false, kills: 0 },
        },
        turretTakedowns: 1,
        participants: [1, 2, 3, 4, 5].map((n) =>
          participant({
            puuid: `p${n}`,
            accountId: `a${n}`,
            kills: 2,
            deaths: 9,
          }),
        ),
      }),
    );
    const rating = teamRating(computeMetrics(matches), matches);
    expect(rating.score).toBeLessThan(3);
  });

  it("keeps a small sample away from the extremes", () => {
    const matches = series(2, true);
    const rating = teamRating(computeMetrics(matches), matches);
    expect(rating.score).toBeGreaterThan(NEUTRAL_SCORE);
    expect(rating.score).toBeLessThan(8);
    expect(rating.confidence).toBeLessThan(0.2);
  });

  it("returns neutral with no games", () => {
    const rating = teamRating(computeMetrics([]), []);
    expect(rating.score).toBe(NEUTRAL_SCORE);
    expect(rating.parts).toEqual([]);
  });

  it("always rounds to one decimal", () => {
    const matches = series(12, true);
    const rating = teamRating(computeMetrics(matches), matches);
    expect(rating.score).toBe(round1(rating.score));
  });

  it("uses the presence part: three-person games score below five-person games", () => {
    const five = series(20, true).map((m) =>
      match({
        ...m,
        participants: [1, 2, 3, 4, 5].map((n) =>
          participant({ puuid: `p${n}`, accountId: `a${n}` }),
        ),
      }),
    );
    const three = series(20, true).map((m) =>
      match({
        ...m,
        participants: [1, 2, 3].map((n) =>
          participant({ puuid: `p${n}`, accountId: `a${n}` }),
        ),
      }),
    );
    const full = teamRating(computeMetrics(five), five);
    const short = teamRating(computeMetrics(three), three);
    const presenceOf = (score: { parts: { key: string; score: number }[] }) =>
      score.parts.find((p) => p.key === "presence")?.score ?? 0;
    expect(presenceOf(full)).toBe(10);
    expect(presenceOf(short)).toBe(0);
    expect(full.score).toBeGreaterThan(short.score);
  });
});

describe("playerRating", () => {
  it("scores a strong player above a weak one over the same games", () => {
    const strong = [1, 2, 3, 4, 5].map((n) =>
      participant({
        puuid: `p${n}`,
        accountId: `a${n}`,
        kills: n === 1 ? 12 : 3,
        deaths: n === 1 ? 1 : 6,
        assists: n === 1 ? 10 : 2,
      }),
    );
    const matches = Array.from({ length: 15 }, (_, index) =>
      match({ matchId: `M${index}`, participants: strong }),
    );
    const metrics = computeMetrics(matches);
    const ratings = computeRatings(metrics, matches);
    const carrier = ratings.players.find((p) => p.person === "a1")!;
    const filler = ratings.players.find((p) => p.person === "a2")!;
    expect(carrier.rating.score).toBeGreaterThan(filler.rating.score);
  });

  it("ignores missing shares instead of scoring them as zero", () => {
    // Only the kill participation exists: the synergy part is built from it alone, never from a 0.
    const solo = [
      participant({
        puuid: "p1",
        accountId: "a1",
        damageShare: null,
        goldShare: null,
      }),
    ];
    const matches = Array.from({ length: 12 }, (_, index) =>
      match({ matchId: `M${index}`, participants: solo }),
    );
    const metrics = computeMetrics(matches);
    const rating = playerRating(metrics.players[0], matches, metrics);
    const synergy = rating.parts.find((p) => p.key === "synergy")!;
    expect(synergy.evidence.damageShare).toBeNull();
    expect(synergy.score).toBe(6.3);
    expect(rating.score).toBeGreaterThan(NEUTRAL_SCORE);
  });
});
