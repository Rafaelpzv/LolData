// How a stored game is classified before it enters any number (prompt §2.1). Pure: no I/O.
//
// The analysis mixes games of very different quality if nobody separates them, which is exactly what
// the prompt forbids ("Não misture esses conjuntos sem informar explicitamente"). A game is
// classified along three independent axes, because a game can be, at once, a four-person game with
// a substitute and no timeline:
//
//  - LINEUP: full five-person lineup / partial lineup / substitutes and fillers used / roster data
//    incomplete (an account no longer attributed to a person).
//  - DATA: matches with a usable timeline / without one.
//  - fresh: whether the stored row carries the fields the deeper metrics need.
//
// `classifyMatch` never drops anything: it labels. The analysis chooses which subset a metric reads
// and reports the rest as a coverage gap (`coverage.ts`).

import type { AccountOwners, PremadeMatchSample } from "./types";

/** A complete side of five. */
export const FULL_LINEUP = 5;

export type LineupKind =
  /** Five distinct roster people on the side. */
  | "full"
  /** Fewer than five roster people (the side was completed by strangers). */
  | "partial"
  /** Nobody of the roster played: the row should not exist, but it is labelled, not deleted. */
  | "absent";

export interface MatchClass {
  matchId: string;
  /** Distinct roster people on the side, after resolving accounts to people. */
  people: number;
  /** Roster accounts on the side (a person with two accounts here is still one person). */
  accounts: number;
  lineup: LineupKind;
  /** The side held fewer than five participants: a surrender, a remake or a broken payload. */
  shortSide: boolean;
  /** At least one participant in the stored row belongs to no current person. */
  unattributed: boolean;
  /** The timeline was collected and stored for this game. */
  hasTimeline: boolean;
  /** The deeper per-participant fields (items, runes, spells) were collected. */
  hasFields: boolean;
  /** The timeline-derived data (build, skill order, lane) exists for every roster participant. */
  hasDerived: boolean;
  /** The game ran the minimum the app accepts; anything shorter is a remake and kept out earlier. */
  durationSeconds: number;
}

/**
 * People and accounts of one stored game. `participantsOf` in `metrics.ts` hides the accounts of a
 * removed player (`accountId: null`); the classification must see them to report the gap, so it
 * reads the raw list.
 */
function counts(
  match: PremadeMatchSample,
  owners: AccountOwners,
): { people: number; accounts: number; unattributed: boolean } {
  const people = new Set<string>();
  let accounts = 0;
  let unattributed = false;
  for (const participant of match.participants) {
    accounts += 1;
    if (participant.accountId === null) {
      // Stamped by the repository for an account of a person who left: still a person of the game,
      // but no longer one of the lineup the analysis measures.
      unattributed = true;
      continue;
    }
    const person =
      participant.accountId ?? owners[participant.puuid] ?? participant.puuid;
    people.add(person);
  }
  return { people: people.size, accounts, unattributed };
}

/** Labels one stored game. `hasTimeline` comes from the caller: the timeline lives in its own table. */
export function classifyMatch(
  match: PremadeMatchSample,
  options: {
    owners?: AccountOwners;
    /** Games with a stored timeline, by match id. */
    timelineIds?: ReadonlySet<string>;
  } = {},
): MatchClass {
  const owners = options.owners ?? {};
  const { people, accounts, unattributed } = counts(match, owners);
  const participants = match.participants;

  return {
    matchId: match.matchId,
    people,
    accounts,
    lineup:
      people === 0 ? "absent" : people >= FULL_LINEUP ? "full" : "partial",
    shortSide: participants.length < FULL_LINEUP,
    unattributed,
    hasTimeline: options.timelineIds?.has(match.matchId) ?? false,
    hasFields: participants.some(
      (participant) => participant.perks != null || participant.items != null,
    ),
    hasDerived:
      participants.length > 0 &&
      participants.every((participant) => participant.derived != null),
    durationSeconds: match.duration,
  };
}

/** The sets the prompt asks to keep apart, each with its ids and its size. */
export interface MatchSets {
  total: number;
  full: MatchClass[];
  partial: MatchClass[];
  absent: MatchClass[];
  /** Games where a person of the roster is missing but a stranger took the slot. */
  withSubstitutes: MatchClass[];
  /** Games with an account no longer attributed to a person of the lineup. */
  unattributed: MatchClass[];
  withTimeline: MatchClass[];
  withoutTimeline: MatchClass[];
  /** Full lineup AND a timeline: the only set where every metric can be read honestly. */
  fullWithTimeline: MatchClass[];
}

/**
 * Splits the games of a window into the sets above. Every game is in `full`/`partial`/`absent` and
 * in exactly one of `withTimeline`/`withoutTimeline`; a full five-person game played against random
 * opponents also counts as `withSubstitutes` when one of the five is not a roster person.
 */
export function classifyMatches(
  matches: readonly PremadeMatchSample[],
  options: {
    owners?: AccountOwners;
    timelineIds?: ReadonlySet<string>;
    /** Side size of the queue (5). A side with fewer participants is counted as short. */
    sideSize?: number;
  } = {},
): MatchSets {
  const sideSize = options.sideSize ?? FULL_LINEUP;
  const classes = matches.map((match) =>
    classifyMatch(match, options),
  );
  // A "substitute" is a roster slot filled by a stranger: fewer roster people than the side holds.
  const withSubstitutes = classes.filter(
    (entry) => entry.people > 0 && entry.people < sideSize,
  );
  return {
    total: classes.length,
    full: classes.filter((entry) => entry.lineup === "full"),
    partial: classes.filter((entry) => entry.lineup === "partial"),
    absent: classes.filter((entry) => entry.lineup === "absent"),
    withSubstitutes,
    unattributed: classes.filter((entry) => entry.unattributed),
    withTimeline: classes.filter((entry) => entry.hasTimeline),
    withoutTimeline: classes.filter((entry) => !entry.hasTimeline),
    fullWithTimeline: classes.filter(
      (entry) => entry.lineup === "full" && entry.hasTimeline,
    ),
  };
}

/** The short text the UI shows for one set: `12 de 40 jogos (30%)`. */
export function setShare(part: number, total: number): {
  games: number;
  total: number;
  rate: number | null;
} {
  return {
    games: part,
    total,
    rate: total > 0 ? part / total : null,
  };
}

/**
 * Whether a game may feed a metric that needs every roster person: a "full" game. Everything else is
 * reported in the coverage, never silently added.
 */
export function measurableGame(
  entry: MatchClass,
  requirement: "anyGame" | "fullLineup" | "fullAndTimeline",
): boolean {
  if (requirement === "anyGame") return true;
  if (requirement === "fullLineup") return entry.lineup === "full";
  return entry.lineup === "full" && entry.hasTimeline;
}
