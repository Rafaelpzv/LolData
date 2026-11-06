// Match-V5 Timeline -> compact derived data. Pure: no I/O, no Next, no Supabase.
// The endpoint only documents `timestamp`/`realTimestamp`/`type`; every field read here was taken
// from a real timeline of the team (see PREMADE_TIMELINE.md §2). The raw payload is never stored.
import type { AccountOwners } from "./types";

/** The checkpoints the curves are read at: 10, 15, 20 and 25 minutes. */
export const CHECKPOINTS = [600_000, 900_000, 1_200_000, 1_500_000] as const;

/** An enemy objective taken up to this long after a group death is a death that cost something. */
export const COSTLY_DEATH_WINDOW_MS = 60_000;

/** How far a player counts as "with the group" at an event, in game units (1/4 of a lane). */
export const NEARBY_DISTANCE = 4_000;

/** Timeline events of the same side within this gap are one fight. */
export const GROUP_FIGHT_WINDOW_MS = 12_000;

/** Points kept per player: games go to about 40 minutes once a minute. */
const MAX_POINTS = 2_400;

export type KillKind = "groupKill" | "groupDeath" | "fillKill";

export type ObjectiveKind =
  "dragon" | "herald" | "baron" | "tower" | "inhibitor";

export interface TimelinePosition {
  x: number;
  y: number;
}

/** One kill event, already tied to the person it is about. */
export interface TimelineKill extends TimelinePosition {
  /** Seconds since the game started. */
  at: number;
  /** Winner of a group kill, victim of a loss; null when a filling account closed the kill. */
  person: string | null;
  kind: KillKind;
  /** Group people within `NEARBY_DISTANCE` of the kill, the victim included. */
  near: number;
  /** The group people that were near it at that frame. */
  people: string[];
}

/** One objective the group took. */
export interface TimelineObjective extends TimelinePosition {
  at: number;
  kind: Exclude<ObjectiveKind, "inhibitor">;
  /** Dragon element or turret tier when Riot sends it. */
  variant: string | null;
  /** Group people within `NEARBY_DISTANCE` of the objective. */
  near: number;
  /** The group people that were near it at that frame. */
  people: string[];
}

/**
 * One death on the map, whoever died: the per-player views (phase, region, alone, costly) read
 * this list, while the group metrics keep reading `kills`.
 */
export interface TimelineDeath extends TimelinePosition {
  at: number;
  /** The roster person who died, null for a filler or a stranger. */
  person: string | null;
  /** participantId of the victim, so a participant row with no person map still resolves. */
  slot: number;
  /** Group people within `NEARBY_DISTANCE` of the body, the victim included. */
  near: number;
  /** The enemy turned it into an objective within `COSTLY_DEATH_WINDOW_MS`. */
  costly: boolean;
}

/** A roster player's frame, compact: [seconds, x, y, total gold, level, cs]. */
export type PositionPoint = [number, number, number, number, number, number];

export interface TimelineFinalStats {
  gold: number;
  kills: number;
  deaths: number;
  towers: number;
  dragons: number;
  barons: number;
}

/** What is stored per collected game: small derived series, never the raw timeline. */
export interface PremadeTimeline {
  matchId: string;
  /** Seconds the game lasted, from the match when the caller passes it. */
  duration: number;
  endOfGameResult: string | null;
  /** Frame spacing the timeline was sampled at (milliseconds; usually 60000). */
  frameInterval: number;
  /** [second, group side gold, enemy side gold]. */
  goldSeries: [number, number, number][];
  /** [second, group gold - enemy gold]. */
  goldDiff: [number, number][];
  /** [second, group XP - enemy XP]. */
  xpDiff: [number, number][];
  kills: TimelineKill[];
  objectives: TimelineObjective[];
  /** One entry per roster player that played, in participantId order. */
  positions: { puuid: string; points: PositionPoint[] }[];
  /** Every death of the map, for the per-player breakdowns. */
  deaths?: TimelineDeath[];
  finalStats: TimelineFinalStats;
}

export type TimelineParse = { timeline: PremadeTimeline } | { error: string };

export interface TimelineContext {
  matchId: string;
  /** 100 or 200, the side the roster played on (stored with the match). */
  teamSide: number;
  /** PUUID -> person for the accounts still on the lineup. */
  owners: AccountOwners;
  /**
   * PUUIDs of the roster accounts that played the game (the match already knows them). Anyone
   * else on the side is a stranger filling it and stays out of the player metrics.
   */
  roster?: ReadonlySet<string>;
  /** Game duration in seconds, as the match reports it. */
  duration?: number | null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function positionOf(event: Record<string, unknown>): TimelinePosition | null {
  const position = event.position as { x?: unknown; y?: unknown } | undefined;
  return typeof position?.x === "number" && typeof position?.y === "number"
    ? { x: position.x, y: position.y }
    : null;
}

/**
 * participantId -> person, from `info.participants` -> roster owners. Only PUUIDs the match itself
 * counted are read: a stranger who filled the side (the game needs five) is nobody's person, and
 * the timeline must never turn them into a team member.
 */
function personMap(
  raw: unknown,
  owners: AccountOwners,
  roster: ReadonlySet<string> | undefined,
): Map<number, string> {
  const participants = (raw as { info?: { participants?: unknown } } | null)
    ?.info?.participants;
  const map = new Map<number, string>();
  if (!Array.isArray(participants)) return map;
  for (const entry of participants as {
    participantId?: unknown;
    puuid?: unknown;
  }[]) {
    const id = num(entry.participantId);
    const puuid = String(entry.puuid ?? "");
    if (id <= 0 || !puuid) continue;
    // Without an explicit roster every account is accepted (tests and callers with owners only).
    if (roster && !roster.has(puuid)) continue;
    map.set(id, owners[puuid] ?? puuid);
  }
  return map;
}

/** The side of a participantId: ids 1..5 are side 100, 6..10 are side 200, as in the frames. */
function sideOf(participantId: number): number {
  return participantId >= 1 && participantId <= 5 ? 100 : 200;
}

function inGroup(side: number) {
  return (participantId: number) =>
    participantId > 0 && sideOf(participantId) === side;
}

interface RawFrame {
  timestamp?: unknown;
  events?: unknown[];
  participantFrames?: Record<string, unknown>;
}

interface FrameStats {
  ownGold: number;
  ownXp: number;
  enemyGold: number;
  enemyXp: number;
}

function frameStats(
  frame: RawFrame,
  isGroup: (id: number) => boolean,
): FrameStats {
  const out: FrameStats = { ownGold: 0, ownXp: 0, enemyGold: 0, enemyXp: 0 };
  for (let id = 1; id <= 10; id += 1) {
    const entry = frame.participantFrames?.[String(id)] as
      Record<string, unknown> | undefined;
    if (!entry) continue;
    if (isGroup(id)) {
      out.ownGold += num(entry.totalGold);
      out.ownXp += num(entry.xp);
    } else {
      out.enemyGold += num(entry.totalGold);
      out.enemyXp += num(entry.xp);
    }
  }
  return out;
}

/** The dragon/herald/baron the event is about, or null when it is a monster the metrics ignore. */
function eliteKind(monsterType: unknown): "dragon" | "herald" | "baron" | null {
  const type = String(monsterType ?? "");
  if (type === "DRAGON") return "dragon";
  if (type === "RIFTHERALD" || type === "HORDE") return "herald";
  if (type === "BARON_NASHOR") return "baron";
  return null;
}

/**
 * Reads a raw TimelineDto into the compact stored shape. Answers with the reason when the
 * timeline cannot be used: remakes and cancelled games carry no frames.
 */
export function toTimeline(
  raw: unknown,
  context: TimelineContext,
): TimelineParse {
  const info = (raw as { info?: Record<string, unknown> } | null)?.info;
  const matchId = (raw as { metadata?: { matchId?: unknown } } | null)?.metadata
    ?.matchId;
  if (!info || matchId !== context.matchId) return { error: "wrongMatch" };

  const result = str(info.endOfGameResult);
  const frames = (
    Array.isArray(info.frames) ? (info.frames as RawFrame[]) : []
  ).filter((frame) => typeof frame.timestamp === "number");
  if (frames.length === 0) return { error: "remake" };
  // A game the platform cancelled never reached the end: what it carries cannot be read.
  if (result !== null && result !== "GameComplete") return { error: "remake" };

  const side = context.teamSide;
  // The side is fixed by the match, but only the roster accounts are people of the team: a
  // stranger who filled the side keeps their gold in the curve and stays out of every player metric.
  const isGroup = inGroup(side);
  const people = personMap(raw, context.owners, context.roster);
  const isPerson = (participantId: number) => people.has(participantId);

  // 1. Gold and XP of both sides per frame.
  const goldSeries: [number, number, number][] = [];
  const goldDiff: [number, number][] = [];
  const xpDiff: [number, number][] = [];
  for (const frame of frames) {
    const second = Math.round(num(frame.timestamp) / 1000);
    const stats = frameStats(frame, isGroup);
    goldSeries.push([second, stats.ownGold, stats.enemyGold]);
    goldDiff.push([second, stats.ownGold - stats.enemyGold]);
    xpDiff.push([second, stats.ownXp - stats.enemyXp]);
  }

  // 2. Positions of the roster players, one point per frame.
  const positions: { puuid: string; points: PositionPoint[] }[] = [];
  for (const [id, person] of [...people.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (!isGroup(id)) continue;
    const points: PositionPoint[] = [];
    for (const frame of frames) {
      const entry = frame.participantFrames?.[String(id)] as
        Record<string, unknown> | undefined;
      if (!entry || !positionOf(entry)) continue;
      const position = positionOf(entry)!;
      points.push([
        Math.round(num(frame.timestamp) / 1000),
        position.x,
        position.y,
        num(entry.totalGold),
        num(entry.level),
        num(entry.minionsKilled) + num(entry.jungleMinionsKilled),
      ]);
    }
    positions.push({ puuid: person, points: points.slice(-MAX_POINTS) });
  }
  const groupIds = [...people.entries()]
    .filter(([id]) => isGroup(id))
    .map(([id]) => id);

  // 3. Events of the group: kills, deaths and the objectives it took.
  const kills: TimelineKill[] = [];
  const objectives: TimelineObjective[] = [];
  /** Every death on the map, the group's people included: the per-player views read this one. */
  const deaths: TimelineDeath[] = [];
  for (const frame of frames) {
    const framePlayers = groupIds.flatMap((id) => {
      const entry = frame.participantFrames?.[String(id)] as
        Record<string, unknown> | undefined;
      const position = entry ? positionOf(entry) : null;
      return position
        ? [{ person: people.get(id) ?? String(id), ...position }]
        : [];
    });
    // Who of the group was at the event: positions only exist per frame, so this is the closest sample.
    const crowds = (
      where: TimelinePosition,
    ): { near: number; people: string[] } => {
      const inside = framePlayers.filter(
        (player) =>
          Math.hypot(player.x - where.x, player.y - where.y) <= NEARBY_DISTANCE,
      );
      return {
        near: inside.length,
        people: inside.map((player) => player.person),
      };
    };

    for (const event of (Array.isArray(frame.events)
      ? frame.events
      : []) as Record<string, unknown>[]) {
      const type = String(event.type ?? "");
      const at = Math.round(num(event.timestamp) / 1000);
      const where = positionOf(event);
      if (!where) continue;

      if (type === "CHAMPION_KILL") {
        const victim = num(event.victimId);
        const killer = num(event.killerId);
        const crowd = crowds(where);
        deaths.push({
          at,
          ...where,
          person: people.get(victim) ?? null,
          slot: victim,
          near: crowd.near,
          costly: false,
        });
        if (isPerson(victim)) {
          kills.push({
            at,
            ...where,
            person: people.get(victim) ?? null,
            kind: "groupDeath",
            ...crowd,
          });
        } else if (isPerson(killer)) {
          kills.push({
            at,
            ...where,
            person: people.get(killer) ?? null,
            kind: "groupKill",
            ...crowd,
          });
        } else if (isGroup(victim) && isGroup(killer)) {
          // A fight inside the side: nobody of the roster died to the enemy, but the roster lost a
          // kill of the team. It is the team's kill, with no person of the roster behind it.
          kills.push({
            at,
            ...where,
            person: null,
            kind: "fillKill",
            ...crowd,
          });
        }
        continue;
      }

      if (type === "ELITE_MONSTER_KILL") {
        // killerTeamId first: a player can steal a monster, the team that killed it is the one that got it.
        const team = num(event.killerTeamId) || sideOf(num(event.killerId));
        const kind = eliteKind(event.monsterType);
        if (team !== side || !kind) continue;
        objectives.push({
          at,
          ...where,
          kind,
          variant: str(event.monsterSubType),
          ...crowds(where),
        });
        continue;
      }

      if (type === "BUILDING_KILL") {
        // The event side is the one that LOST the building. The building belongs to the side, not
        // to the person who hit it last: a stranger finishing the turret still took it for the team.
        const building = String(event.buildingType ?? "");
        if (num(event.teamId) === side || building === "INHIBITOR_BUILDING")
          continue;
        if (building !== "TOWER_BUILDING") continue;
        objectives.push({
          at,
          ...where,
          kind: "tower",
          variant: str(event.towerType),
          ...crowds(where),
        });
      }
    }
  }

  // A death the enemy turned into a turret, a dragon or a baron within the window cost something.
  const window = COSTLY_DEATH_WINDOW_MS / 1000;
  for (const death of deaths) {
    death.costly = objectives.some(
      (objective) =>
        objective.kind !== "herald" &&
        objective.at >= death.at &&
        objective.at - death.at <= window,
    );
  }

  const finalStats: TimelineFinalStats = {
    gold: goldSeries[goldSeries.length - 1]?.[1] ?? 0,
    kills: kills.filter((kill) => kill.kind !== "groupDeath").length,
    deaths: kills.filter((kill) => kill.kind === "groupDeath").length,
    towers: objectives.filter((objective) => objective.kind === "tower").length,
    dragons: objectives.filter((objective) => objective.kind === "dragon")
      .length,
    barons: objectives.filter((objective) => objective.kind === "baron").length,
  };

  const lastSecond = goldSeries[goldSeries.length - 1]?.[0] ?? 0;
  return {
    timeline: {
      matchId: context.matchId,
      duration:
        context.duration && context.duration > 0
          ? context.duration
          : lastSecond,
      endOfGameResult: result,
      frameInterval: num(info.frameInterval) || 60_000,
      goldSeries,
      goldDiff,
      xpDiff,
      kills: kills.sort((a, b) => a.at - b.at),
      objectives: objectives.sort((a, b) => a.at - b.at),
      positions,
      deaths: deaths.sort((a, b) => a.at - b.at),
      finalStats,
    },
  };
}

/** Value of a [second, value] series at a moment: the last frame at or before it. */
export function valueAt(
  series: [number, number][],
  atMs: number,
): number | null {
  let found: number | null = null;
  for (const [second, value] of series) {
    if (second * 1000 <= atMs) found = value;
    else break;
  }
  return found;
}

/** Gold (or XP) difference at 10, 15, 20 and 25 minutes: null when the game ended before. */
export function curveAt(
  series: [number, number][],
  duration: number,
): (number | null)[] {
  return CHECKPOINTS.map((at) =>
    duration * 1000 >= at ? valueAt(series, at) : null,
  );
}

/** Group kills and deaths close enough in time to be the same fight. */
export function fightCount(kills: TimelineKill[]): number {
  const times = kills.map((kill) => kill.at).sort((a, b) => a - b);
  let fights = 0;
  let previous: number | null = null;
  for (const at of times) {
    if (previous === null || at - previous > GROUP_FIGHT_WINDOW_MS / 1000)
      fights += 1;
    previous = at;
  }
  return fights;
}

/** Deaths the enemy turned into an objective within the window. */
export function costlyDeaths(
  kills: TimelineKill[],
  objectives: TimelineObjective[],
): TimelineKill[] {
  const window = COSTLY_DEATH_WINDOW_MS / 1000;
  return kills.filter(
    (kill) =>
      kill.kind === "groupDeath" &&
      objectives.some(
        (objective) =>
          objective.kind !== "herald" &&
          objective.at >= kill.at &&
          objective.at - kill.at <= window,
      ),
  );
}

/** A death with no other group player within `NEARBY_DISTANCE`: caught alone. */
export function isolatedDeath(kill: TimelineKill): boolean {
  return kill.kind === "groupDeath" && kill.near <= 1;
}
