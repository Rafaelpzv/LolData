// Timeline -> per participant derived data (migration 0010): what a person built, the order they
// levelled their skills and how their lane went at 10 and 15 minutes against their lane opponent.
// Pure: no I/O, no Next, no Supabase. Positions are taken from the frames, events from the stream.
import type { ParticipantDerived, PremadeMatchSample } from "./types";

/** The minutes the lane comparison is read at. */
export const LANE_MINUTES = [10, 15] as const;

/** Riot stamps frames a few milliseconds after the round minute (600286 for 10:00). */
const FRAME_TOLERANCE_MS = 5_000;

/** Item ids below this are consumables, trinkets and wards: never a "build" item. */
const CONSUMABLE_IDS = new Set([
  2003, 2031, 2033, 2034, 2049, 2051, 2052, 2054, 2055, 2138, 2139, 2140, 2403,
  2411, 2422, 2423, 2424, 3330, 3340, 3341, 3342, 3343, 3344, 3345, 3346, 3347,
  3348, 3349, 3350, 3351, 3352, 3363, 3364, 3513, 3514, 3599, 3865, 3866, 3867,
  3869, 3870, 3871, 3872, 3873, 3874, 3875, 3876, 3877,
]);

/** Legendary and mythic items start here; epic items (components) below it are not "finished". */
const FINISHED_ITEM_FLOOR = 2000;

/** True when the item id is something a build is made of (never a potion, a trinket or a ward). */
export function isFinishedItem(itemId: number): boolean {
  return itemId >= FINISHED_ITEM_FLOOR && !CONSUMABLE_IDS.has(itemId);
}

interface Event {
  type?: string;
  timestamp?: number;
  participantId?: number;
  killerId?: number;
  creatorId?: number;
  itemId?: number;
  beforeId?: number;
  afterId?: number;
  goldGain?: number;
  skillSlot?: number;
}

interface Frame {
  timestamp?: number;
  events?: Event[];
  participantFrames?: Record<string, Record<string, unknown>>;
}

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The frame closest to a moment, accepting Riot's jitter (frames land a few milliseconds late). */
function frameAt(frames: Frame[], atMs: number): Frame | null {
  let found: Frame | null = null;
  let best = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    const at = num(frame.timestamp);
    // Frames are not guaranteed to be sorted, and a game's first frame carries timestamp 0.
    if (at <= atMs + FRAME_TOLERANCE_MS && at >= best) {
      found = frame;
      best = at;
    }
  }
  return found;
}

/**
 * Purchases of one participant, in the order they happened. `ITEM_UNDO` names the item that was
 * bought and then undone (`beforeId`), so every purchase it names outright is not a purchase that
 * stayed; `ITEM_SELL`/`ITEM_DESTROYED` leave the history alone, a game is what was bought. Items
 * that turn into another one (the support quest into its wardstone, item 3301/3302 into 3303) are
 * kept: another item appearing is not a purchase being undone.
 */
export function purchaseHistory(
  events: Event[],
  participantId: number,
): { itemId: number; at: number }[] {
  const purchases: { itemId: number; at: number }[] = [];
  for (const event of events) {
    if (num(event.participantId) !== participantId) continue;
    const at = Math.round(num(event.timestamp) / 1000);
    if (event.type === "ITEM_PURCHASED" && num(event.itemId) > 0) {
      purchases.push({ itemId: num(event.itemId), at });
      continue;
    }
    if (event.type === "ITEM_UNDO") {
      // `afterId` is what the slot held before the undone purchase; an undo that names no purchase
      // (gold changes only) cancels nothing.
      const undone = num(event.beforeId);
      if (undone <= 0) continue;
      for (let index = purchases.length - 1; index >= 0; index -= 1) {
        if (purchases[index].itemId === undone) {
          purchases.splice(index, 1);
          break;
        }
      }
    }
  }
  return purchases;
}

/** Skill order as slot numbers, one per level up, ignoring the automatic level of a transform. */
export function skillOrderOf(events: Event[], participantId: number): number[] {
  return events
    .filter(
      (event) =>
        event.type === "SKILL_LEVEL_UP" &&
        num(event.participantId) === participantId,
    )
    .map((event) => num(event.skillSlot))
    .filter((slot) => slot >= 1 && slot <= 4);
}

/** The build: the finished items in the order they were bought, first one first. */
export function buildOf(purchases: { itemId: number; at: number }[]): {
  firstCompletedItem: { itemId: number; at: number } | null;
  completedOrder: number[];
} {
  const finished = purchases.filter((purchase) =>
    isFinishedItem(purchase.itemId),
  );
  const completedOrder: number[] = [];
  for (const purchase of finished)
    if (!completedOrder.includes(purchase.itemId))
      completedOrder.push(purchase.itemId);
  return {
    firstCompletedItem: finished[0] ?? null,
    completedOrder: completedOrder.slice(0, 12),
  };
}

/**
 * Lane numbers of one participant at 10 and 15 minutes, against the enemy on the same
 * `teamPosition`. The enemy participantId is found from the match itself (team 100 is 1..5).
 */
/** Lane CS, XP and gold at 10 and 15 minutes, the player's own against the same-lane opponent. */
export function laneCompare(
  frames: Frame[],
  participantId: number,
  opponentId: number,
): ParticipantDerived["laning"] {
  if (opponentId <= 0) return [];
  return LANE_MINUTES.flatMap((minute) => {
    const frame = frameAt(frames, minute * 60_000);
    const self = frame?.participantFrames?.[String(participantId)];
    const enemy = frame?.participantFrames?.[String(opponentId)];
    // A missing frame on either side means the game had not reached the minute: no reading at all.
    if (!self || !enemy) return [];
    return [
      {
        at: minute * 60,
        cs: num(self.minionsKilled) + num(self.jungleMinionsKilled),
        xp: num(self.xp),
        gold: num(self.totalGold),
        enemyCs: num(enemy.minionsKilled) + num(enemy.jungleMinionsKilled),
        enemyXp: num(enemy.xp),
        enemyGold: num(enemy.totalGold),
      },
    ];
  });
}

/**
 * Derived timeline data of every roster participant of one game. `match` carries who played and
 * on which lane (the sample already stored), so the lane opponent can be resolved by position.
 */
export function participantDerived(
  rawTimeline: unknown,
  match: Pick<PremadeMatchSample, "matchId"> & {
    participants: { puuid: string; teamPosition: string }[];
    teamSide: number;
  },
): { puuid: string; derived: ParticipantDerived }[] {
  const info = (rawTimeline as { info?: { frames?: Frame[] } } | null)?.info;
  const frames = (info?.frames ?? []).filter(
    (frame) => typeof frame.timestamp === "number",
  );
  if (frames.length === 0) return [];
  const events = frames.flatMap((frame) =>
    Array.isArray(frame.events) ? frame.events : [],
  );

  // participantId -> puuid is the timeline's own map; which person played what comes from the match.
  const idsOf = new Map<string, number>();
  const raw = rawTimeline as {
    info?: {
      participants?: {
        participantId?: number;
        puuid?: string;
        championId?: unknown;
        teamPosition?: unknown;
      }[];
    };
  };
  for (const entry of raw.info?.participants ?? []) {
    const id = num(entry.participantId);
    if (id > 0 && entry.puuid) idsOf.set(entry.puuid, id);
  }
  // The lane opponent is on the other side with the same teamPosition. The opponent's position is
  // not in the stored sample (only the roster plays there) and the timeline's participant list does
  // not carry it either, so the mirror slot is the reference: Riot lists the blue side 1..5 and the
  // red side 6..10, and slot n + 5 plays the same lane as slot n.
  const rosterSide = match.teamSide;
  const enemyTeamId = rosterSide === 100 ? 200 : 100;

  const out: { puuid: string; derived: ParticipantDerived }[] = [];
  for (const participant of match.participants) {
    const id = idsOf.get(participant.puuid);
    if (!id) continue;
    const side = id <= 5 ? 100 : 200;
    if (side !== rosterSide) continue;
    const opponent = mirrorSlot(id, enemyTeamId);
    const purchases = purchaseHistory(events, id);
    const build = buildOf(purchases);
    out.push({
      puuid: participant.puuid,
      derived: {
        purchases: purchases.slice(0, 40),
        firstCompletedItem: build.firstCompletedItem,
        completedOrder: build.completedOrder,
        skillOrder: skillOrderOf(events, id),
        laning: laneCompare(frames, id, opponent ?? 0),
      },
    });
  }
  return out;
}

/**
 * The mirror slot: Riot lists the blue side 1..5 and the red side 6..10 in the same lane order, so
 * the same lane of the other side is the id plus (or minus) five.
 */
function mirrorSlot(id: number, enemyTeamId: number): number | undefined {
  const mirror = enemyTeamId === 200 ? id + 5 : id - 5;
  return mirror >= 1 && mirror <= 10 && mirror !== id ? mirror : undefined;
}
