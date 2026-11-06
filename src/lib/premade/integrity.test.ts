import { describe, expect, it } from "vitest";

import {
  classifyMatch,
  classifyMatches,
  measurableGame,
  setShare,
} from "./integrity";
import type { AccountOwners, PremadeMatchSample, PremadeParticipantSample } from "./types";

function participant(
  puuid: string,
  overrides: Partial<PremadeParticipantSample> = {},
): PremadeParticipantSample {
  return {
    puuid,
    accountId: puuid,
    championId: 100,
    championName: "Champ",
    teamPosition: "TOP",
    kills: 1,
    deaths: 1,
    assists: 1,
    goldEarned: 10_000,
    champExperience: 10_000,
    totalMinionsKilled: 100,
    neutralMinionsKilled: 10,
    visionScore: 20,
    wardsPlaced: 5,
    wardsKilled: 1,
    totalDamageDealtToChampions: 10_000,
    totalDamageTaken: 10_000,
    pings: null,
    ...overrides,
  };
}

function match(
  id: string,
  puuids: string[],
  overrides: Partial<PremadeMatchSample> = {},
): PremadeMatchSample {
  return {
    matchId: id,
    gameCreation: 1_700_000_000_000,
    season: 16,
    win: true,
    duration: 1_800,
    teamSide: 100,
    objectives: {
      baron: { first: false, kills: 0 },
      champion: { first: false, kills: 0 },
      dragon: { first: false, kills: 0 },
      inhibitor: { first: false, kills: 0 },
      riftHerald: { first: false, kills: 0 },
      tower: { first: false, kills: 0 },
    },
    champLevel: 15,
    turretTakedowns: 0,
    teamKills: 0,
    teamGold: 50_000,
    participants: puuids.map((puuid) => participant(puuid)),
    ...overrides,
  };
}

const FIVE = ["a", "b", "c", "d", "e"];

describe("classifyMatch", () => {
  it("calls a five-person game full and a four-person game partial", () => {
    expect(classifyMatch(match("m1", FIVE)).lineup).toBe("full");
    expect(classifyMatch(match("m2", FIVE.slice(0, 4))).lineup).toBe("partial");
    expect(classifyMatch(match("m3", [])).lineup).toBe("absent");
  });

  it("counts people, not accounts: one person with two accounts is one person", () => {
    // "a" plays two accounts in the same game only in a broken payload; the classifier must still
    // resolve both to the person and refuse to call it a five-person game.
    const owners: AccountOwners = { acc1: "a", acc2: "a" };
    const game = match("m", ["acc1", "acc2", "b", "c", "d"], {
      participants: ["acc1", "acc2", "b", "c", "d"].map((puuid) =>
        participant(puuid, { accountId: owners[puuid] }),
      ),
    });
    const entry = classifyMatch(game, { owners });
    expect(entry.accounts).toBe(5);
    expect(entry.people).toBe(4);
    expect(entry.lineup).toBe("partial");
  });

  it("resolves owners when the participant carries no account id", () => {
    const owners = { p1: "person1" };
    const game = match("m", ["p1"]).participants.map((p) => ({
      ...p,
      accountId: undefined,
    }));
    const entry = classifyMatch(
      match("m", ["p1"], { participants: game }),
      { owners },
    );
    expect(entry.people).toBe(1);
  });

  it("flags a participant of a removed player instead of counting them", () => {
    const game = match("m", FIVE, {
      participants: FIVE.map((puuid, index) =>
        participant(puuid, { accountId: index === 0 ? null : puuid }),
      ),
    });
    const entry = classifyMatch(game);
    expect(entry.people).toBe(4);
    expect(entry.unattributed).toBe(true);
    expect(entry.lineup).toBe("partial");
  });

  it("reads the timeline, the fields and the derived data from what is stored", () => {
    const withData = match("m", FIVE, {
      participants: FIVE.map((puuid) =>
        participant(puuid, {
          perks: { keystone: 8005, primary: 8000, secondary: 8200, shards: [] },
          derived: {
            purchases: [],
            firstCompletedItem: null,
            completedOrder: [],
            skillOrder: [],
            laning: [],
          },
        }),
      ),
    });
    const entry = classifyMatch(withData, { timelineIds: new Set(["m"]) });
    expect(entry.hasTimeline).toBe(true);
    expect(entry.hasFields).toBe(true);
    expect(entry.hasDerived).toBe(true);

    const bare = classifyMatch(match("n", FIVE));
    expect(bare.hasTimeline).toBe(false);
    expect(bare.hasFields).toBe(false);
    expect(bare.hasDerived).toBe(false);
  });

  it("counts a short side separately from a partial lineup", () => {
    // A four-person lineup on a side Riot still stored five participants for is partial but not
    // short; a stored row with four participants is both.
    expect(classifyMatch(match("m", FIVE.slice(0, 4))).shortSide).toBe(true);
    expect(
      classifyMatch(
        match("m", FIVE, { participants: FIVE.map((p) => participant(p)) }),
      ).shortSide,
    ).toBe(false);
  });
});

describe("classifyMatches", () => {
  const matches = [
    match("full1", FIVE),
    match("full2", FIVE),
    match("partial1", FIVE.slice(0, 4)),
    match("partial2", FIVE.slice(0, 3)),
    match("absent1", []),
  ];
  const sets = classifyMatches(matches, {
    timelineIds: new Set(["full1", "partial1"]),
  });

  it("keeps the sets apart and sums to the window", () => {
    expect(sets.total).toBe(5);
    expect(sets.full).toHaveLength(2);
    expect(sets.partial).toHaveLength(2);
    expect(sets.absent).toHaveLength(1);
    expect(sets.full.length + sets.partial.length + sets.absent.length).toBe(
      sets.total,
    );
  });

  it("splits by timeline without leaving a game out", () => {
    expect(sets.withTimeline.map((e) => e.matchId)).toEqual([
      "full1",
      "partial1",
    ]);
    expect(sets.withoutTimeline).toHaveLength(3);
  });

  it("marks the only set where every metric can be read honestly", () => {
    expect(sets.fullWithTimeline.map((e) => e.matchId)).toEqual(["full1"]);
  });

  it("counts a full-lineup game against strangers as a game with substitutes", () => {
    // A four-person lineup means one stranger filled the side: the subtitle set.
    expect(sets.withSubstitutes.map((e) => e.matchId)).toEqual([
      "partial1",
      "partial2",
    ]);
  });

  it("answers whether a game may feed a metric", () => {
    const fullWithTimeline = sets.full.find((e) => e.matchId === "full1")!;
    const fullWithout = sets.full.find((e) => e.matchId === "full2")!;
    const partial = sets.partial[0];
    expect(measurableGame(fullWithTimeline, "anyGame")).toBe(true);
    expect(measurableGame(fullWithTimeline, "fullLineup")).toBe(true);
    expect(measurableGame(fullWithTimeline, "fullAndTimeline")).toBe(true);
    // full2 is a five-person game that never got a timeline: readable as a game, not from positions.
    expect(measurableGame(fullWithout, "fullLineup")).toBe(true);
    expect(measurableGame(fullWithout, "fullAndTimeline")).toBe(false);
    expect(measurableGame(partial, "fullLineup")).toBe(false);
  });

  it("an empty window has empty sets, not an error", () => {
    const empty = classifyMatches([]);
    expect(empty.total).toBe(0);
    expect(empty.full).toEqual([]);
    expect(empty.fullWithTimeline).toEqual([]);
  });
});

describe("setShare", () => {
  it("never divides by zero", () => {
    expect(setShare(3, 10)).toEqual({ games: 3, total: 10, rate: 0.3 });
    expect(setShare(0, 0).rate).toBeNull();
  });
});
