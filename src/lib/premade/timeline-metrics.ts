// Timeline metrics over the collected timelines. Pure functions: no I/O, no Next, no Supabase.
// Every reading here interprets sampled positions and events: the Timeline says what happened, not
// why, and a position is sampled about once a minute (PREMADE_TIMELINE.md §7).
import { median, proportion, spread, type Spread } from "./stats";
import {
  curveAt,
  costlyDeaths,
  fightCount,
  isolatedDeath,
  NEARBY_DISTANCE,
  type PremadeTimeline,
} from "./timeline";
import { buildGoldCurve, type GoldCurve } from "./gold-curve";

/** Below this many timelines, group conclusions are weak (same floor the rest of the app uses). */
export const SMALL_TIMELINE_SAMPLE = 10;

/** The checkpoints, in minutes: 10, 15, 20 and 25. */
export const CURVE_MINUTES = [10, 15, 20, 25];

/** A gold lead at a checkpoint has to reach this much to count as "ahead" (or behind). */
export const LEAD_GOLD = 1_000;

/** Two players are "close" in a frame when they are within this far to each other (game units). */
export const PAIR_RADIUS = 5_000;
/** Radius each group player needs another one inside for the group to count as grouped. */
export const GROUPED_RADIUS = 6_000;
/** How long after a kill an objective still counts as its conversion, in seconds. */
export const CONVERSION_WINDOW = 45;
/** Group players near an objective for it to count as "observed with presence". */
export const OBJECTIVE_PRESENCE_PLAYERS = 3;
/** Group players near an event (game units; the same radius `timeline.ts` uses). */
export const NEAR_EVENT = NEARBY_DISTANCE;

/** One collected timeline with the result of its match. */
export interface TimelineSample {
  timeline: PremadeTimeline;
  win: boolean;
  duration: number;
}

export interface CurveCheckpoint {
  minute: number;
  /** Games long enough to be read at this checkpoint. */
  games: number;
  /** Average gold lead over those games (negative is behind). */
  averageLead: number | null;
  ahead: number;
  behind: number;
  /** Win rate among the games ahead, and among the games behind. */
  winRateAhead: number | null;
  winRateBehind: number | null;
}

/**
 * When the group takes one kind of objective. `first` reads only the first objective of each game;
 * `average`/`median` read EVERY objective the group took, so the two answer different questions
 * and are never mixed. All times are seconds, converted to mm:ss only in the UI.
 */
export interface ObjectiveTiming {
  /** Median time of the first one of each game, in seconds. */
  first: number | null;
  /** Mean time of the first one of each game. */
  firstMean: number | null;
  /** Games where the group took at least one. */
  games: number;
  /** Mean time of every one the group took. */
  average: number | null;
  /** Median time of every one the group took. */
  median: number | null;
  /** Games where the group took none, over the games read: the denominator of `games`. */
  without: number;
  /** Every objective of that kind the group took. */
  total: number;
  /** Spread of all the takedown times. */
  spread: Spread;
}

/**
 * Preparation for one objective kind: what the group observed in the 60 s before the objective
 * appeared (fights, deaths) and how many of its people were gathered around the objective when it
 * was taken. It is an observation of positions sampled about once a minute, not of intent.
 */
export interface ObjectivePreparation {
  /** Objectives read (the group's own takedowns). */
  events: number;
  /** Games with at least one. */
  games: number;
  /** Mean group players within NEARBY_DISTANCE of the objective's last contact. */
  averageNear: number | null;
  /** Group deaths in the 60 s before the objective was taken (the window before the pit). */
  deathsBefore: number;
  /** Share of the objectives with at least OBJECTIVE_PRESENCE_PLAYERS group players around them. */
  nearShare: number | null;
}

export interface PlayerPresence {
  person: string;
  kills: number;
  deaths: number;
  /** Deaths with no other group player nearby. */
  isolatedDeaths: number;
  /** Deaths the enemy turned into an objective within the window. */
  costlyDeaths: number;
  /** Group kills where the player was at the kill. */
  killsPresent: number;
  /** Group kills the player had a hand in, per game, over the group's kills per game. */
  presence: number | null;
  /** Group objectives the player was at. */
  objectivesPresent: number;
  /** Average distance to the closest group ally, per frame. */
  averageDistance: number | null;
}

export interface PairSynergy {
  a: string;
  b: string;
  games: number;
  /** Games where the two were close at most of the frames. */
  closeGames: number;
  /** Share of the sampled frames the two were close. */
  closeness: number | null;
}

/** A win rate conditioned on a presence observation, with both samples. */
export interface PresenceCondition {
  events: number;
  wins: number;
  /** Games behind those events. */
  games: number;
}

export interface TimelineMetrics {
  games: number;
  /** Games of the window that had no timeline: never mixed into the numbers above. */
  missingTimelines: number;
  curve: CurveCheckpoint[];
  /** The curve per minute with median, quartiles and its sample. */
  gold: GoldCurve;
  /** Games the group led at 15 min and lost, and trailed at 15 min and won. */
  throws: { games: number; lost: number };
  comebacks: { games: number; won: number };
  objectives: Record<"dragon" | "herald" | "baron" | "tower", ObjectiveTiming>;
  /** Preparation observed before each objective kind (`presence` is the radius it uses). */
  preparation: Record<"dragon" | "herald" | "baron", ObjectivePreparation>;
  /** Win rate of the games where four or more players were observed around the objective. */
  presenceAssociation: {
    withPresence: PresenceCondition;
    withoutPresence: PresenceCondition;
  };
  /** Seconds from a group kill to the next objective the group took, when one followed. */
  conversion: {
    average: number | null;
    median: number | null;
    games: number;
    kills: number;
  };
  deaths: {
    total: number;
    costly: number;
    isolated: number;
    perGame: number | null;
  };
  grouping: {
    /** Average distance between group players and their closest ally, per frame. */
    averageDistance: number | null;
    /** Share of the frames where every player had an ally inside the radius. */
    groupedShare: number | null;
    /** Group players at a group kill, and at a group objective (mean of the sampled value). */
    nearKill: number | null;
    nearObjective: number | null;
    /** Frames the grouping was read from. */
    frames: number;
    /** Radius, in game units, every player needed an ally inside. */
    radius: number;
  };
  /** Kills and deaths per game of the whole group: the fight size, not a rating. */
  fights: { count: number; averagePerGame: number | null };
  players: PlayerPresence[];
  pairs: PairSynergy[];
}

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Group objectives that count as "map": herald is left out of the conversion, it is taken at will. */
const MAP_OBJECTIVES = ["dragon", "baron", "tower"] as const;

/** Frames of one timeline, grouped by second, with the players present in each of them. */
function framesOf(
  timeline: PremadeTimeline,
): { second: number; players: { person: string; x: number; y: number }[] }[] {
  const bySecond = new Map<
    number,
    { person: string; x: number; y: number }[]
  >();
  for (const entry of timeline.positions) {
    for (const [second, x, y] of entry.points) {
      bySecond.set(second, [
        ...(bySecond.get(second) ?? []),
        { person: entry.puuid, x, y },
      ]);
    }
  }
  return [...bySecond.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([second, players]) => ({ second, players }));
}

function checkpointLeads(sample: TimelineSample): (number | null)[] {
  return curveAt(sample.timeline.goldDiff, sample.duration);
}

function timingOf(
  samples: TimelineSample[],
  kind: "dragon" | "herald" | "baron" | "tower",
): ObjectiveTiming {
  const all = samples.flatMap((sample) =>
    sample.timeline.objectives
      .filter((objective) => objective.kind === kind)
      .map((objective) => objective.at),
  );
  const firsts = samples.flatMap((sample) => {
    const times = sample.timeline.objectives
      .filter((objective) => objective.kind === kind)
      .map((objective) => objective.at);
    return times.length > 0 ? [Math.min(...times)] : [];
  });
  return {
    // Median for the headline: one 40-minute game must not turn a 9-minute habit into 12.
    first: median(firsts),
    firstMean: average(firsts),
    games: firsts.length,
    average: average(all),
    median: median(all),
    without: samples.length - firsts.length,
    total: all.length,
    spread: spread(all),
  };
}

/** What was observed around and before each objective of one kind. */
function preparationOf(
  samples: TimelineSample[],
  kind: "dragon" | "herald" | "baron",
): ObjectivePreparation {
  let events = 0;
  let deathsBefore = 0;
  let near = 0;
  const withPresenceGames = new Set<string>();
  const games = new Set<string>();
  for (const sample of samples) {
    const deaths = sample.timeline.kills.filter(
      (kill) => kill.kind === "groupDeath",
    );
    for (const objective of sample.timeline.objectives.filter(
      (entry) => entry.kind === kind,
    )) {
      events += 1;
      games.add(sample.timeline.matchId);
      near += objective.near;
      if (objective.near >= OBJECTIVE_PRESENCE_PLAYERS)
        withPresenceGames.add(sample.timeline.matchId);
      // The 60 s window before the objective: deaths of the group in that game, before the kill.
      deathsBefore += deaths.filter(
        (death) =>
          death.at <= objective.at &&
          objective.at - death.at <= PREPARATION_WINDOW,
      ).length;
    }
  }
  return {
    // Mean players around every objective, not a per-game average: an event is the observation.
    averageNear: events > 0 ? near / events : null,
    nearShare: proportion(withPresenceGames.size, games.size).rate,
    deathsBefore,
    events,
    games: games.size,
  };
}

/** The 60 s before an objective, in seconds: the window the preparation readings use. */
export const PREPARATION_WINDOW = 60;

/**
 * Everything the Collective tab shows. `samples` are the stored timelines of the team; a game
 * without one simply does not enter the numbers, and `expectGames` (the size of the same window) is
 * only used to report how many timelines are missing.
 */
export function computeTimelineMetrics(
  samples: TimelineSample[],
  expectGames?: number,
): TimelineMetrics {
  const missingTimelines = Math.max(
    0,
    (expectGames ?? samples.length) - samples.length,
  );
  const curve: CurveCheckpoint[] = CURVE_MINUTES.map((minute, index) => {
    const read = samples.flatMap((sample) => {
      const lead = checkpointLeads(sample)[index];
      return lead === null ? [] : [{ lead, win: sample.win }];
    });
    const ahead = read.filter((entry) => entry.lead >= LEAD_GOLD);
    const behind = read.filter((entry) => entry.lead <= -LEAD_GOLD);
    return {
      minute,
      games: read.length,
      averageLead: average(read.map((entry) => entry.lead)),
      ahead: ahead.length,
      behind: behind.length,
      winRateAhead:
        ahead.length > 0
          ? (ahead.filter((entry) => entry.win).length / ahead.length) * 100
          : null,
      winRateBehind:
        behind.length > 0
          ? (behind.filter((entry) => entry.win).length / behind.length) * 100
          : null,
    };
  });

  const led = samples.filter(
    (sample) => (checkpointLeads(sample)[1] ?? -Infinity) >= LEAD_GOLD,
  );
  const trailed = samples.filter(
    (sample) => (checkpointLeads(sample)[1] ?? Infinity) <= -LEAD_GOLD,
  );

  const allKills = samples.flatMap((sample) => sample.timeline.kills);
  const kills = allKills.filter((kill) => kill.kind !== "groupDeath");
  const deaths = allKills.filter((kill) => kill.kind === "groupDeath");
  const objectives = samples.flatMap((sample) => sample.timeline.objectives);
  const mapObjectives = objectives.filter((objective) =>
    (MAP_OBJECTIVES as readonly string[]).includes(objective.kind),
  );

  // Deaths are read within their own game: an objective of another game is never "after" it.
  const costly = samples.flatMap((sample) =>
    costlyDeaths(sample.timeline.kills, sample.timeline.objectives),
  );
  const isolated = deaths.filter(isolatedDeath);

  // Conversion: the next map objective the group took within the window of a group kill.
  const gaps: number[] = [];
  for (const { timeline } of samples) {
    for (const kill of timeline.kills.filter(
      (entry) => entry.kind !== "groupDeath",
    )) {
      const next = timeline.objectives.find(
        (objective) =>
          (MAP_OBJECTIVES as readonly string[]).includes(objective.kind) &&
          objective.at >= kill.at &&
          objective.at - kill.at <= CONVERSION_WINDOW,
      );
      if (next) gaps.push(next.at - kill.at);
    }
  }

  // Grouping: per frame distances, and how many people were at each fight.
  const distances: number[] = [];
  const groupedFrames: number[] = [];
  const pairFrames = new Map<string, number[]>();
  for (const { timeline } of samples) {
    for (const { players } of framesOf(timeline)) {
      if (players.length < 2) continue;
      for (const me of players) {
        const allies = players.filter((other) => other.person !== me.person);
        if (allies.length > 0)
          distances.push(Math.min(...allies.map((ally) => near(me, ally))));
      }
      groupedFrames.push(
        players.every((me) =>
          players.some(
            (other) =>
              other.person !== me.person && near(me, other) <= GROUPED_RADIUS,
          ),
        )
          ? 1
          : 0,
      );
      for (let a = 0; a < players.length; a += 1) {
        for (let b = a + 1; b < players.length; b += 1) {
          const key = [players[a].person, players[b].person].sort().join("|");
          pairFrames.set(key, [
            ...(pairFrames.get(key) ?? []),
            near(players[a], players[b]) <= PAIR_RADIUS ? 1 : 0,
          ]);
        }
      }
    }
  }

  const people = [
    ...new Set(
      samples.flatMap((sample) =>
        sample.timeline.positions.map((entry) => entry.puuid),
      ),
    ),
  ];

  const players: PlayerPresence[] = people.map((person) => {
    const ownKills = kills.filter((kill) => kill.person === person);
    const present = kills.filter((kill) => kill.people.includes(person));
    const ownDeaths = deaths.filter((kill) => kill.person === person);
    const ownCostly = costly.filter((kill) => kill.person === person);
    const ownIsolated = isolated.filter((kill) => kill.person === person);
    const groupKills = samples
      .filter((sample) =>
        sample.timeline.positions.some((entry) => entry.puuid === person),
      )
      .flatMap((sample) =>
        sample.timeline.kills.filter((kill) => kill.kind !== "groupDeath"),
      );
    const ownObjectives = mapObjectives.filter((objective) =>
      objective.people.includes(person),
    );
    return {
      person,
      kills: ownKills.length,
      deaths: ownDeaths.length,
      isolatedDeaths: ownIsolated.length,
      costlyDeaths: ownCostly.length,
      killsPresent: present.length,
      // Share of the group's kills the player was at, over the games they played.
      presence:
        groupKills.length > 0
          ? (present.length / groupKills.length) * 100
          : null,
      objectivesPresent: ownObjectives.length,
      averageDistance: average(
        samples.flatMap((sample) =>
          sample.timeline.positions.some((entry) => entry.puuid === person)
            ? distancesToAllies(sample.timeline, person)
            : [],
        ),
      ),
    };
  });

  const pairs: PairSynergy[] = [];
  for (let a = 0; a < people.length; a += 1) {
    for (let b = a + 1; b < people.length; b += 1) {
      const key = [people[a], people[b]].sort().join("|");
      const frames = pairFrames.get(key) ?? [];
      if (frames.length === 0) continue;
      const together = samples.filter(
        (sample) =>
          sample.timeline.positions.some(
            (entry) => entry.puuid === people[a],
          ) &&
          sample.timeline.positions.some((entry) => entry.puuid === people[b]),
      );
      const closeness =
        (frames.reduce((sum, value) => sum + value, 0) / frames.length) * 100;
      pairs.push({
        a: people[a],
        b: people[b],
        games: together.length,
        closeGames: together.filter(
          (sample) => closenessOf(sample.timeline, people[a], people[b]) >= 0.5,
        ).length,
        closeness,
      });
    }
  }

  // Presence at the objectives: the games where the group was observed around an objective it
  // took, against the games where none of it was. One game counts once per side of the split.
  const presenceWith = new Set<string>();
  const presenceWithout = new Set<string>();
  for (const { timeline } of samples) {
    for (const objective of timeline.objectives) {
      if (objective.near >= OBJECTIVE_PRESENCE_PLAYERS)
        presenceWith.add(timeline.matchId);
      else if (objective.near === 0) presenceWithout.add(timeline.matchId);
    }
  }
  const winOf = (matchId: string) =>
    samples.find((sample) => sample.timeline.matchId === matchId)?.win ?? false;
  const condition = (ids: Set<string>): PresenceCondition => {
    const list = [...ids];
    return {
      events: list.length,
      games: list.length,
      wins: list.filter(winOf).length,
    };
  };

  const fights = samples.reduce(
    (sum, sample) => sum + fightCount(sample.timeline.kills),
    0,
  );

  return {
    games: samples.length,
    missingTimelines,
    curve,
    gold: buildGoldCurve(
      samples.map((sample) => ({ timeline: sample.timeline, win: sample.win })),
    ),
    throws: {
      games: led.length,
      lost: led.filter((sample) => !sample.win).length,
    },
    comebacks: {
      games: trailed.length,
      won: trailed.filter((sample) => sample.win).length,
    },
    objectives: {
      dragon: timingOf(samples, "dragon"),
      herald: timingOf(samples, "herald"),
      baron: timingOf(samples, "baron"),
      tower: timingOf(samples, "tower"),
    },
    preparation: {
      dragon: preparationOf(samples, "dragon"),
      herald: preparationOf(samples, "herald"),
      baron: preparationOf(samples, "baron"),
    },
    presenceAssociation: {
      withPresence: condition(presenceWith),
      withoutPresence: condition(presenceWithout),
    },
    conversion: {
      average: average(gaps),
      median: median(gaps),
      games: gaps.length,
      kills: kills.length,
    },
    deaths: {
      total: deaths.length,
      costly: costly.length,
      isolated: isolated.length,
      perGame: samples.length > 0 ? deaths.length / samples.length : null,
    },
    grouping: {
      averageDistance: average(distances),
      groupedShare:
        groupedFrames.length > 0
          ? (groupedFrames.reduce((a, b) => a + b, 0) / groupedFrames.length) *
            100
          : null,
      nearKill: average(kills.map((kill) => kill.near)),
      nearObjective: average(mapObjectives.map((objective) => objective.near)),
      frames: groupedFrames.length,
      radius: GROUPED_RADIUS,
    },
    fights: {
      count: fights,
      averagePerGame: samples.length > 0 ? fights / samples.length : null,
    },
    players: players.sort(
      (a, b) =>
        (a.averageDistance ?? Infinity) - (b.averageDistance ?? Infinity),
    ),
    pairs: pairs.sort((a, b) => (b.closeness ?? 0) - (a.closeness ?? 0)),
  };
}

/** Share of the frames two players of one game were close. */
export function closenessOf(
  timeline: PremadeTimeline,
  a: string,
  b: string,
): number {
  const other = new Map(
    timeline.positions
      .find((entry) => entry.puuid === b)
      ?.points.map(([second, x, y]) => [second, { x, y }] as const) ?? [],
  );
  const self =
    timeline.positions.find((entry) => entry.puuid === a)?.points ?? [];
  let frames = 0;
  let close = 0;
  for (const [second, x, y] of self) {
    const point = other.get(second);
    if (!point) continue;
    frames += 1;
    if (near({ x, y }, point) <= PAIR_RADIUS) close += 1;
  }
  return frames > 0 ? close / frames : 0;
}

/** Distance from one player to the closest group ally, once per frame. */
function distancesToAllies(
  timeline: PremadeTimeline,
  person: string,
): number[] {
  const self = new Map(
    timeline.positions
      .find((entry) => entry.puuid === person)
      ?.points.map(([second, x, y]) => [second, { x, y }] as const) ?? [],
  );
  const allies = new Map<number, { x: number; y: number }[]>();
  for (const entry of timeline.positions.filter(
    (position) => position.puuid !== person,
  )) {
    for (const [second, x, y] of entry.points)
      allies.set(second, [...(allies.get(second) ?? []), { x, y }]);
  }
  return [...self.entries()].flatMap(([second, point]) => {
    const list = allies.get(second) ?? [];
    return list.length > 0
      ? [Math.min(...list.map((ally) => near(point, ally)))]
      : [];
  });
}

/** Health check for the UI: how many games have a timeline against how many were collected. */
export function timelineCoverage(
  total: number,
  withTimeline: number,
): {
  total: number;
  withTimeline: number;
  missing: number;
  rate: number | null;
} {
  return {
    total,
    withTimeline,
    missing: Math.max(0, total - withTimeline),
    rate: total > 0 ? (withTimeline / total) * 100 : null,
  };
}
