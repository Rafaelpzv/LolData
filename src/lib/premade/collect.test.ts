import { describe, expect, it } from "vitest";

import {
  collectMatchSamples,
  normalizeMinPeople,
  tierCounts,
  toMatchSample,
} from "./collect";

const PUUIDS = ["a", "b", "c", "d", "e"];

interface Overrides {
  queueId?: number;
  duration?: number;
  win?: boolean;
  sides?: number[];
  gameEndTimestamp?: number;
  extraParticipants?: number;
}

function match(overrides: Overrides = {}) {
  const sides = overrides.sides ?? [100, 100, 100, 100, 100];
  const participants = PUUIDS.map((puuid, i) => ({
    puuid,
    teamId: sides[i],
    win: overrides.win ?? true,
    kills: i,
    deaths: 2,
    assists: 3,
    goldEarned: 1000 * (i + 1),
    champExperience: 500,
    totalMinionsKilled: 100,
    neutralMinionsKilled: 10,
    visionScore: 20,
    wardsPlaced: 5,
    wardsKilled: 2,
    totalDamageDealtToChampions: 10000,
    totalDamageTaken: 9000,
    teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i],
    championId: 100 + i,
    championName: `Champ${i}`,
    pings: { assistMePings: 7 },
  }));

  for (let i = 0; i < (overrides.extraParticipants ?? 0); i++) {
    participants.push({
      ...participants[0],
      puuid: `enemy-${i}`,
      teamId: 200,
      win: !(overrides.win ?? true),
    });
  }

  return {
    metadata: { matchId: "BR1_1" },
    info: {
      queueId: overrides.queueId ?? 440,
      gameDuration: overrides.duration ?? 1800,
      gameEndTimestamp: overrides.gameEndTimestamp ?? 1_700_000_000_000,
      gameSeasonId: 16,
      participants,
      teams: [
        {
          teamId: 100,
          win: true,
          objectives: { dragon: { first: true, kills: 3 } },
        },
        {
          teamId: 200,
          win: false,
          objectives: { dragon: { first: false, kills: 1 } },
        },
      ],
    },
  };
}

describe("toMatchSample", () => {
  it("keeps a queue-440 game where the five share a side", () => {
    const sample = toMatchSample(match(), PUUIDS);
    expect(sample?.matchId).toBe("BR1_1");
    expect(sample?.teamSide).toBe(100);
    expect(sample?.participants).toHaveLength(5);
    expect(sample?.participants[1].kills).toBe(1);
    expect(sample?.objectives.dragon).toEqual({ first: true, kills: 3 });
    expect(sample?.participants[0].pings?.assistMePings).toBe(7);
  });

  it("counts the side's turrets once, from info.teams, never summing the takedowns", () => {
    // Every participant reports the turret they helped close: summing them inflates the count.
    const raw = match();
    for (const participant of raw.info.participants) {
      Object.assign(participant, { turretTakedowns: 3 });
    }
    raw.info.teams[0].objectives = {
      dragon: { first: true, kills: 3 },
      tower: { first: true, kills: 7 },
    } as never;
    const sample = toMatchSample(raw, PUUIDS);
    expect(sample?.turretTakedowns).toBe(7);
    expect(sample?.sideObjectives?.turret).toBe(7);
  });

  it("tracks the red side", () => {
    const sample = toMatchSample(
      match({ sides: [200, 200, 200, 200, 200], win: false }),
      PUUIDS,
    );
    expect(sample?.teamSide).toBe(200);
    expect(sample?.win).toBe(false);
    expect(sample?.objectives.dragon).toEqual({ first: false, kills: 1 });
  });

  it("rejects other queues", () => {
    expect(toMatchSample(match({ queueId: 420 }), PUUIDS)).toBeNull();
  });

  it("rejects remakes", () => {
    expect(toMatchSample(match({ duration: 200 }), PUUIDS)).toBeNull();
  });

  it("counts a side that holds five roster players even if a sixth is elsewhere", () => {
    const sample = toMatchSample(
      match({ sides: [100, 100, 100, 100, 100, 200] }),
      [...PUUIDS, "f"],
    );
    expect(sample?.participants).toHaveLength(5);
    expect(sample?.teamSide).toBe(100);
  });

  it("rejects a side with only two roster players", () => {
    expect(
      toMatchSample(
        match({ sides: [100, 100, 200, 200, 200] }),
        PUUIDS.slice(0, 2),
      ),
    ).toBeNull();
    expect(
      toMatchSample(
        match({ sides: [100, 100, 200, 200, 200] }),
        PUUIDS.slice(0, 3),
      ),
    ).toBeNull();
  });

  it("counts a trio on the same side when the minimum is three", () => {
    const sample = toMatchSample(
      match({ sides: [100, 100, 100, 200, 200] }),
      PUUIDS,
      3,
    );
    expect(sample?.teamSide).toBe(100);
    expect(sample?.participants).toHaveLength(3);
  });

  it("counts a trio when the roster itself is only three players", () => {
    const sample = toMatchSample(
      match({ sides: [200, 200, 200, 100, 100] }),
      ["a", "b", "c"],
      3,
    );
    expect(sample?.teamSide).toBe(200);
    expect(sample?.participants.map((p) => p.puuid)).toEqual(["a", "b", "c"]);
  });

  it("keeps champion and lane of every roster player that played", () => {
    const sample = toMatchSample(match(), PUUIDS);
    expect(
      sample?.participants.every((p) => p.championId > 0 && p.championName),
    ).toBe(true);
    expect(sample?.participants[2].teamPosition).toBe("MIDDLE");
  });

  it("rejects a missing player when the side drops below three", () => {
    expect(
      toMatchSample(
        match({ sides: [100, 100, 100, 200, 200] }),
        ["a", "b", "z"],
        3,
      ),
    ).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(toMatchSample(null, PUUIDS)).toBeNull();
    expect(toMatchSample({}, PUUIDS)).toBeNull();
  });
});

describe("people instead of accounts", () => {
  // Five accounts on the side, but "a" and "b" are the same person: only four people.
  const owners = { a: "person-1", b: "person-1" };

  it("counts one person twice as one", () => {
    expect(toMatchSample(match(), PUUIDS, 5, owners)).toBeNull();
    expect(toMatchSample(match(), PUUIDS, 4, owners)).not.toBeNull();
  });

  it("stamps the person on each participant", () => {
    const sample = toMatchSample(match(), PUUIDS, 4, owners);
    expect(sample?.participants.map((p) => p.accountId)).toEqual([
      "person-1",
      "person-1",
      "c",
      "d",
      "e",
    ]);
  });

  it("reports the games per level", () => {
    const aFullSide = match();
    const aTrio = match({ sides: [100, 100, 100, 200, 200] });
    expect(tierCounts([aFullSide], PUUIDS, owners)).toEqual({
      2: 1,
      3: 1,
      4: 1,
      5: 0,
    });
    expect(tierCounts([aTrio], PUUIDS)).toEqual({ 2: 1, 3: 1, 4: 0, 5: 0 });
  });

  it("clamps the minimum to what a side can hold", () => {
    expect(normalizeMinPeople(9)).toBe(5);
    expect(normalizeMinPeople(1)).toBe(2);
  });
});

describe("collectMatchSamples", () => {
  it("dedupes by matchId and sorts newest first", () => {
    const older = match({ gameEndTimestamp: 1_000 });
    const newer = match({ gameEndTimestamp: 5_000 });
    newer.metadata.matchId = "BR1_2";
    const samples = collectMatchSamples(
      [older, newer, older, match({ queueId: 400 })],
      PUUIDS,
    );
    expect(samples.map((s) => s.gameCreation)).toEqual([5_000, 1_000]);
  });
});
