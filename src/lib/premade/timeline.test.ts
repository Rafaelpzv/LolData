import { describe, expect, it } from "vitest";

import {
  computeTimelineMetrics,
  type TimelineSample,
} from "./timeline-metrics";
import { toTimeline, type PremadeTimeline } from "./timeline";

/** Builds one frame of a timeline: who is alive where, and the events of that minute. */
function frame(
  at: number,
  people: Record<string, [number, number]>,
  events: Record<string, unknown>[] = [],
) {
  const participantFrames: Record<string, unknown> = {};
  for (const [id, [x, y]] of Object.entries(people)) {
    participantFrames[id] = {
      participantId: Number(id),
      position: { x, y },
      totalGold: 1_000,
      xp: 1_000,
      level: 5,
      minionsKilled: 20,
      jungleMinionsKilled: 0,
    };
  }
  return { timestamp: at, events, participantFrames };
}

const participants = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => ({
  participantId: id,
  puuid: `p${id}`,
}));

function timeline(frames: unknown[], matchId = "BR1_1") {
  return {
    metadata: { matchId, dataVersion: "2" },
    info: {
      frameInterval: 60_000,
      endOfGameResult: "GameComplete",
      participants,
      frames,
    },
  };
}

/** Lanes apart: five players far from each other, an enemy at lane 1. */
const spread = (at: number) =>
  frame(at, {
    "1": [1_000, 14_000],
    "2": [14_000, 1_000],
    "3": [8_000, 8_000],
    "6": [1_200, 14_200],
  });

describe("toTimeline", () => {
  it("leaves out a stranger who filled the side", () => {
    // Three roster people on side 100 and one random filler on the same side (the game needs five).
    const raw = timeline(
      [
        frame(
          0,
          { "1": [1_000, 14_000], "2": [14_000, 1_000], "4": [9_000, 1_000] },
          [
            {
              type: "CHAMPION_KILL",
              timestamp: 1_000,
              killerId: 4,
              victimId: 6,
              position: { x: 9_000, y: 1_000 },
            },
            {
              type: "CHAMPION_KILL",
              timestamp: 2_000,
              killerId: 2,
              victimId: 6,
              position: { x: 9_000, y: 1_000 },
            },
          ],
        ),
        spread(60_000),
      ],
      "BR1_9",
    );
    const parsed = toTimeline(raw, {
      matchId: "BR1_9",
      teamSide: 100,
      owners: { p1: "person-1", p2: "person-2" },
      roster: new Set(["p1", "p2"]),
    });
    if (!("timeline" in parsed)) throw new Error(parsed.error);
    // p4 filled the side and is not on the roster: no positions, no kill of the group.
    expect(parsed.timeline.positions.map((entry) => entry.puuid)).toEqual([
      "person-1",
      "person-2",
    ]);
    // The filler's kill is not a group kill: only person-2's kill stays.
    expect(parsed.timeline.kills.map((kill) => kill.person)).toEqual([
      "person-2",
    ]);
    expect(parsed.timeline.finalStats.kills).toBe(1);
  });

  it("keeps a kill the team closed with a filling account", () => {
    // Joyce-case: the stranger kills for the side. The kill is the team's, the person is nobody.
    const raw = timeline(
      [
        frame(0, { "2": [14_000, 1_000], "4": [9_000, 1_000] }, [
          {
            type: "CHAMPION_KILL",
            timestamp: 1_000,
            killerId: 4,
            victimId: 6,
            position: { x: 9_000, y: 1_000 },
          },
          // A fight inside the side: the roster did not lose anyone to the enemy.
          {
            type: "CHAMPION_KILL",
            timestamp: 2_000,
            killerId: 4,
            victimId: 5,
            position: { x: 9_000, y: 2_000 },
          },
        ]),
        frame(
          60_000,
          { "1": [1_000, 14_000], "2": [14_000, 1_000], "4": [9_000, 1_000] },
          [
            // The turret belongs to the side: a stranger closing it still wins it for the team.
            {
              type: "BUILDING_KILL",
              timestamp: 61_000,
              teamId: 200,
              buildingType: "TOWER_BUILDING",
              position: { x: 9_000, y: 1_000 },
            },
          ],
        ),
      ],
      "BR1_9",
    );
    const parsed = toTimeline(raw, {
      matchId: "BR1_9",
      teamSide: 100,
      owners: { p1: "person-1", p2: "person-2" },
      roster: new Set(["p1", "p2"]),
    });
    if (!("timeline" in parsed)) throw new Error(parsed.error);
    // A fight inside the side (p4 killed p5) is not a kill of the team: the enemy was not the victim.
    expect(
      parsed.timeline.kills.map((kill) => [kill.kind, kill.person]),
    ).toEqual([["fillKill", null]]);
    expect(
      parsed.timeline.objectives.map((objective) => objective.kind),
    ).toEqual(["tower"]);
    expect(parsed.timeline.finalStats).toMatchObject({
      kills: 1,
      deaths: 0,
      towers: 1,
    });
    // Still no stranger among the players.
    expect(parsed.timeline.positions.map((entry) => entry.puuid)).toEqual([
      "person-1",
      "person-2",
    ]);
  });

  it("reads the group side, gold and the frames", () => {
    const raw = timeline([
      spread(0),
      frame(600_000, { "1": [1_000, 14_000] }, [
        {
          type: "CHAMPION_KILL",
          timestamp: 601_000,
          killerId: 1,
          victimId: 6,
          position: { x: 1_000, y: 14_000 },
        },
      ]),
    ]);
    const parsed = toTimeline(raw, {
      matchId: "BR1_1",
      teamSide: 100,
      owners: { p1: "person-1" },
      roster: new Set(["p1"]),
    });
    expect("timeline" in parsed).toBe(true);
    if (!("timeline" in parsed)) return;
    expect(parsed.timeline.goldSeries).toHaveLength(2);
    expect(parsed.timeline.kills).toEqual([
      {
        at: 601,
        person: "person-1",
        kind: "groupKill",
        x: 1_000,
        y: 14_000,
        near: 1,
        people: ["person-1"],
      },
    ]);
    // The enemy that died is not a group death: only the kill the roster took is kept.
    expect(parsed.timeline.finalStats).toMatchObject({ kills: 1, deaths: 0 });
  });

  it("rejects another match, a remake and an empty timeline", () => {
    const raw = timeline([spread(0)]);
    expect(
      toTimeline(raw, { matchId: "BR1_2", teamSide: 100, owners: {} }),
    ).toEqual({ error: "wrongMatch" });
    expect(
      toTimeline(timeline([]), { matchId: "BR1_1", teamSide: 100, owners: {} }),
    ).toEqual({ error: "remake" });
    expect(
      toTimeline(
        {
          ...timeline([spread(0)]),
          info: { ...timeline([spread(0)]).info, endOfGameResult: "Abort" },
        },
        {
          matchId: "BR1_1",
          teamSide: 100,
          owners: {},
        },
      ),
    ).toEqual({ error: "remake" });
  });

  it("reads only the objectives the group took", () => {
    const raw = timeline([
      spread(0),
      frame(400_000, { "1": [8_000, 8_000] }, [
        {
          type: "ELITE_MONSTER_KILL",
          timestamp: 400_000,
          killerTeamId: 100,
          monsterType: "DRAGON",
          monsterSubType: "HEXTECH_DRAGON",
          position: { x: 8_000, y: 8_000 },
        },
        // someone else took this one
        {
          type: "ELITE_MONSTER_KILL",
          timestamp: 410_000,
          killerTeamId: 200,
          monsterType: "BARON_NASHOR",
          position: { x: 8_000, y: 8_000 },
        },
        // teamId is the side that LOST the building: 200 means the group took it
        {
          type: "BUILDING_KILL",
          timestamp: 420_000,
          teamId: 200,
          buildingType: "TOWER_BUILDING",
          towerType: "OUTER_TURRET",
          position: { x: 8_000, y: 8_000 },
        },
      ]),
    ]);
    const parsed = toTimeline(raw, {
      matchId: "BR1_1",
      teamSide: 100,
      owners: {},
    });
    if (!("timeline" in parsed)) throw new Error(parsed.error);
    expect(
      parsed.timeline.objectives.map((objective) => objective.kind),
    ).toEqual(["dragon", "tower"]);
    expect(parsed.timeline.objectives[0].variant).toBe("HEXTECH_DRAGON");
    expect(parsed.timeline.finalStats).toMatchObject({
      dragons: 1,
      towers: 1,
      barons: 0,
    });
  });
});

function sample(timelineData: PremadeTimeline, win: boolean): TimelineSample {
  return { timeline: timelineData, win, duration: timelineData.duration };
}

function syntheticTimeline(): PremadeTimeline {
  const at = (second: number) => second * 1_000;
  const raw = timeline([
    frame(at(0), { "1": [1_000, 14_000], "2": [1_200, 14_400] }, []),
    // First dragon at 12 minutes; both group players at it.
    frame(at(720), { "1": [8_000, 8_000], "2": [8_400, 8_400] }, [
      {
        type: "ELITE_MONSTER_KILL",
        timestamp: at(720),
        killerTeamId: 100,
        monsterType: "DRAGON",
        position: { x: 8_000, y: 8_000 },
      },
      // One death at minute 10, blown up by an objective 30 s later.
      {
        type: "CHAMPION_KILL",
        timestamp: at(600),
        killerId: 6,
        victimId: 1,
        position: { x: 1_000, y: 14_000 },
      },
      {
        type: "BUILDING_KILL",
        timestamp: at(630),
        teamId: 200,
        buildingType: "TOWER_BUILDING",
        position: { x: 1_000, y: 14_000 },
      },
    ]),
    frame(at(1_800), { "1": [2_000, 2_000], "2": [2_200, 2_200] }, []),
  ]);
  const parsed = toTimeline(raw, {
    matchId: "BR1_1",
    teamSide: 100,
    owners: {},
    duration: 1_800,
  });
  if (!("timeline" in parsed)) throw new Error(parsed.error);
  return parsed.timeline;
}

describe("computeTimelineMetrics", () => {
  it("reads the curve at the checkpoints only when the game was long enough", () => {
    const metrics = computeTimelineMetrics([sample(syntheticTimeline(), true)]);
    expect(metrics.curve.map((point) => point.minute)).toEqual([
      10, 15, 20, 25,
    ]);
    // Three group players against one enemy in the fixture: the lead is their extra gold.
    expect(metrics.curve[0].averageLead).toBe(2_000);
    // The last frame is minute 30: the 25-minute checkpoint still has a value to read.
    expect(metrics.curve[3].games).toBe(1);
  });

  it("counts the objectives and their first timing", () => {
    const metrics = computeTimelineMetrics([sample(syntheticTimeline(), true)]);
    expect(metrics.objectives.dragon.total).toBe(1);
    expect(metrics.objectives.dragon.first).toBe(720);
    expect(metrics.objectives.baron.games).toBe(0);
    expect(metrics.objectives.baron.first).toBeNull();
  });

  it("counts the death the enemy turned into an objective", () => {
    const metrics = computeTimelineMetrics([sample(syntheticTimeline(), true)]);
    expect(metrics.deaths.total).toBe(1);
    expect(metrics.deaths.costly).toBe(1);
  });

  it("answers with nulls, never with invented numbers, on an empty sample", () => {
    const metrics = computeTimelineMetrics([]);
    expect(metrics.games).toBe(0);
    expect(metrics.grouping.averageDistance).toBeNull();
    expect(metrics.deaths.perGame).toBeNull();
    expect(metrics.curve[0].winRateAhead).toBeNull();
    expect(metrics.players).toEqual([]);
  });

  it("measures one player's presence at the group's kills", () => {
    const metrics = computeTimelineMetrics([sample(syntheticTimeline(), true)]);
    const top = metrics.players.find((player) => player.person === "p1")!;
    // The victim was at both events (the kill it died in and the tower after it).
    expect(top.deaths).toBe(1);
    expect(top.costlyDeaths).toBe(1);
    expect(top.averageDistance).not.toBeNull();
  });

  it("keeps a positive share for a team that grouped together", () => {
    const raw = timeline([
      frame(0, { "1": [8_000, 8_000], "2": [8_500, 8_500] }, []),
      frame(60_000, { "1": [8_000, 8_000], "2": [8_500, 8_500] }, []),
    ]);
    const parsed = toTimeline(raw, {
      matchId: "BR1_1",
      teamSide: 100,
      owners: {},
    });
    if (!("timeline" in parsed)) throw new Error(parsed.error);
    const metrics = computeTimelineMetrics([sample(parsed.timeline, true)]);
    expect(metrics.grouping.groupedShare).toBe(100);
    expect(metrics.pairs[0]).toMatchObject({
      a: "p1",
      b: "p2",
      closeness: 100,
    });
  });
});
