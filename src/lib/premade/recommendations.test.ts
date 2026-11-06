import { describe, expect, it } from "vitest";

import { computeMetrics } from "./metrics";
import { buildRecommendations, RECOMMENDATION_CODES } from "./recommendations";
import type {
  PremadeMatchSample,
  PremadeParticipantSample,
  PremadePlayer,
  TeamObjectives,
} from "./types";

const PUUIDS = ["a", "b", "c", "d", "e"];
const PLAYERS: PremadePlayer[] = PUUIDS.map((puuid, slot) => ({
  id: puuid,
  gameName: `P${slot}`,
  slot,
  accounts: [{ puuid, gameName: `P${slot}`, tagLine: "BR1" }],
}));

const objectives = (kills: number, first: boolean): TeamObjectives => ({
  baron: { first, kills: 0 },
  champion: { first: false, kills: 0 },
  dragon: { first, kills },
  inhibitor: { first: false, kills: 0 },
  riftHerald: { first, kills },
  tower: { first: false, kills: 2 },
});

function participant(
  puuid: string,
  kills = 2,
  assists = 6,
  deaths = 4,
): PremadeParticipantSample {
  return {
    puuid,
    championId: 1,
    championName: "Annie",
    teamPosition: "TOP",
    kills,
    deaths,
    assists,
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
  overrides: Partial<PremadeMatchSample> = {},
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
    participants: PUUIDS.map((p) => participant(p)),
    ...overrides,
  };
}

const run = (matches: PremadeMatchSample[]) =>
  buildRecommendations(computeMetrics(matches), matches, PLAYERS);

const codes = (matches: PremadeMatchSample[]) =>
  run(matches).map((r) => r.code);

describe("buildRecommendations", () => {
  it("flags a small sample and never claims high confidence on it", () => {
    const recs = run([game(true), game(false)]);
    expect(recs[0].code).toBe("smallSample");
    expect(recs.every((r) => r.confidence !== "high")).toBe(true);
  });

  it("warns about a losing record with evidence", () => {
    const recs = run([game(false), game(false), game(true)]);
    const rec = recs.find((r) => r.code === "lowWinRate");
    expect(rec?.evidence.winRate).toBeCloseTo(33.3, 1);
    expect(rec?.confidence).toBe("low");
  });

  it("warns when the team rarely takes the first dragon", () => {
    const matches = [game(true), game(false), game(true)].map((m) => ({
      ...m,
      objectives: objectives(0, false),
    }));
    expect(codes(matches)).toContain("dragonFirstLow");
  });

  it("praises a first-dragon rate that turns into wins, with both sides of the comparison", () => {
    // Five wins taking the first dragon and five losses taking none: enough games on both sides.
    const matches = [
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ].map((win, index) =>
      game(win, {
        objectives: index < 5 ? objectives(2, true) : objectives(0, false),
      }),
    );
    const rec = run(matches).find((r) => r.code === "dragonFirstHigh");
    expect(rec?.evidence.withIt).toBe("5/5");
    expect(rec?.evidence.withoutIt).toBe("0/5");
  });

  it("does not praise a comparison one side of which has no sample", () => {
    // Every game took the dragon: there is no "without" group to compare with.
    const matches = [game(true), game(true), game(true)].map((m) => ({
      ...m,
      objectives: objectives(2, true),
    }));
    expect(codes(matches)).not.toContain("dragonFirstHigh");
  });

  it("separates low conversion from losing effect, only with both groups", () => {
    // Two thirds of the games lost, with the dragon taken in all of them.
    const losing = Array.from({ length: 7 }, () =>
      game(false, { objectives: objectives(2, true) }),
    );
    const withoutDragon = Array.from({ length: 5 }, () =>
      game(true, { objectives: objectives(0, false) }),
    );
    const found = codes([...losing, ...withoutDragon]);
    expect(found).toContain("baronConversion");
    expect(found).toContain("lowWinRate");
  });

  it("names the player far from the team's kill participation", () => {
    const matches = [0, 1, 2].map(() =>
      game(true, {
        participants: [
          participant("a", 0, 0),
          participant("b"),
          participant("c"),
          participant("d"),
          participant("e"),
        ],
      }),
    );
    const rec = run(matches).find((r) => r.code === "kpGapLow");
    expect(rec?.evidence.player).toBe("P0");
  });

  it("reads pings as habits with low confidence and a caveat key", () => {
    const matches = [0, 1, 2].map(() =>
      game(true, {
        participants: PUUIDS.map(
          (p) =>
            ({
              ...participant(p),
              pings: { assistMePings: 20 },
            }) as PremadeParticipantSample,
        ),
      }),
    );
    const rec = run(matches).find((r) => r.code === "pingAssistMe");
    expect(rec?.confidence).toBe("low");
    expect(rec?.evidence.perGame).toBe(20);
  });

  it("still reports positives to preserve", () => {
    const stable = Array.from({ length: 6 }, () => game(true));
    const recs = run(stable);
    expect(recs.some((r) => r.kind === "positive")).toBe(true);
    expect(recs.some((r) => r.code === "lowWinRate")).toBe(false);
  });

  it("returns only the small-sample note for an empty window", () => {
    const recs = run([]);
    expect(recs.map((r) => r.code)).toEqual(["smallSample"]);
  });

  it("only emits codes that exist in the message catalog", () => {
    const recs = run([
      game(true),
      game(false),
      game(false),
      game(true),
      game(false),
    ]);
    for (const rec of recs) expect(RECOMMENDATION_CODES).toContain(rec.code);
  });
});
