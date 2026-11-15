import { describe, expect, it } from "vitest";

import {
  ALL_MODES_KEY,
  CLASSIC_QUEUE_ID,
  DEFAULT_QUEUE_MODE,
  PREMADE_QUEUES,
  collectMatchSamples,
  normalizeMinPeople,
  premadeQueueId,
  premadeQueueIdsFor,
  premadeQueueKey,
  readModeFilter,
  rejectionReason,
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

  it("keeps a CLASSIC (710) game and stamps its queue", () => {
    const sample = toMatchSample(match({ queueId: 710 }), PUUIDS);
    expect(sample?.matchId).toBe("BR1_1");
    expect(sample?.queueId).toBe(710);
  });

  it("stamps Flex (440) on a Flex game", () => {
    expect(toMatchSample(match(), PUUIDS)?.queueId).toBe(440);
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

  it("collects Flex and CLASSIC games side by side, with the queue of each", () => {
    const flex = match({ gameEndTimestamp: 1_000 });
    const classic = match({ queueId: 710, gameEndTimestamp: 2_000 });
    classic.metadata.matchId = "BR1_2";
    const samples = collectMatchSamples([flex, classic], PUUIDS);
    expect(samples.map((s) => [s.gameCreation, s.queueId])).toEqual([
      [2_000, 710],
      [1_000, 440],
    ]);
  });

  it("rejects a game whose queue is not collected", () => {
    expect(rejectionReason(match({ queueId: 420 }), PUUIDS)).toBe("wrongQueue");
    expect(rejectionReason(match({ queueId: 710 }), PUUIDS)).toBeNull();
  });
});

describe("the collected modes", () => {
  it("list Flex and CLASSIC, Flex first", () => {
    expect(PREMADE_QUEUES.map((queue) => [queue.key, queue.id])).toEqual([
      ["flex", 440],
      ["classic", 710],
    ]);
    expect(DEFAULT_QUEUE_MODE).toBe(ALL_MODES_KEY);
    expect(CLASSIC_QUEUE_ID).toBe(710);
  });

  it("read the mode filter of the URL: nothing means every mode together", () => {
    expect(readModeFilter(undefined)).toBeNull();
    expect(readModeFilter(ALL_MODES_KEY)).toBeNull();
    expect(readModeFilter("aram")).toBeNull();
    expect(readModeFilter("flex")).toBe("flex");
    expect(readModeFilter("classic")).toBe("classic");
  });

  it("resolve a mode name to its queue and back", () => {
    expect(premadeQueueId("classic")).toBe(710);
    expect(premadeQueueId("flex")).toBe(440);
    expect(premadeQueueId("aram")).toBeNull();
    expect(premadeQueueKey(710)).toBe("classic");
    expect(premadeQueueKey("710")).toBe("classic");
    expect(premadeQueueKey(420)).toBeNull();
  });

  it("asks Riot for the queue of the chosen mode only", () => {
    expect(premadeQueueIdsFor("classic")).toEqual([710]);
    expect(premadeQueueIdsFor("flex")).toEqual([440]);
    // A name the collection does not know never becomes an empty list: it falls back to all modes.
    expect(premadeQueueIdsFor("aram")).toEqual([440, 710]);
    expect(premadeQueueIdsFor(null)).toEqual([440, 710]);
  });
});
