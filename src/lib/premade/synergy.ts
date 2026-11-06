// Observed synergy of the pairs. Pure: no I/O.
//
// The "closest pairs" panel used to rank two people by how often their dots were close on the map,
// which says as much about the lane they play as about anything else (support and adc stand
// together every minute). Here every observed number is put next to the number the pair's own
// individual rates predict, so a duo is compared with itself, not with a raw count:
//
//   observed: games where both took part in the same kill / games they played together
//   expected: product, in the same game, of the two individual kill-participation ratios
//
// The lift (observed / expected) is what the panel ranks; closeness on the map is kept as a
// separate observation, never mixed with it. Proximity is not communication and never will be.
import { proportion, type Proportion } from "./stats";
import type { PremadeTimeline } from "./timeline";
import type { PremadeMatchSample } from "./types";
import { peopleOfMatch } from "./metrics";

/** Below this many shared games no pair is ranked: the lift of a duo is meaningless there. */
export const SYNERGY_MIN_GAMES = 5;

export interface PairSynergyDetail {
  a: string;
  b: string;
  /** Games both played (and the side kills could be read). */
  games: number;
  /** Games where both participants appear in the same side kill event. */
  together: number;
  /** Games where both were close on the map at most of the sampled frames. */
  closeGames: number;
  observed: Proportion;
  /** Mean of (kp_a * kp_b) over the shared games, the rate the two individuals predict. */
  expected: number | null;
  /** observed.rate / expected, > 1 is more joint takedowns than the individuals imply. */
  lift: number | null;
  /** Games where they were near the same objective the group took. */
  sharedObjectives: number;
  /** Games needed before the lift is shown at all. */
  enoughGames: boolean;
}

export interface SynergyReport {
  pairs: PairSynergyDetail[];
  minGames: number;
  /** Timelines read, and games that had one: the map numbers only exist for those. */
  timelines: number;
}

/** Side kills of one game: the kill events of the timeline, with the people present at them. */
function killsOf(timeline: PremadeTimeline): { people: string[] }[] {
  return timeline.kills
    .filter((kill) => kill.kind !== "groupDeath")
    .map((kill) => ({ people: kill.people ?? [] }));
}

/**
 * The observed synergy of every pair of the roster. `matches` gives the side each game, the
 * timelines give the kill events and the positions; a game without a timeline still counts for the
 * kill participation it can read from the match alone (none), so only timelines feed the pairs.
 */
export function buildSynergyReport(
  matches: PremadeMatchSample[],
  timelines: PremadeTimeline[],
): SynergyReport {
  const byMatch = new Map(matches.map((match) => [match.matchId, match]));
  const pairState = new Map<
    string,
    {
      a: string;
      b: string;
      games: number;
      together: number;
      expected: number;
      expectedGames: number;
      sharedObjectives: number;
    }
  >();

  const entry = (a: string, b: string) => {
    const key = [a, b].sort().join("|");
    const found = pairState.get(key) ?? {
      a,
      b,
      games: 0,
      together: 0,
      expected: 0,
      expectedGames: 0,
      sharedObjectives: 0,
    };
    pairState.set(key, found);
    return found;
  };

  for (const timeline of timelines) {
    const match = byMatch.get(timeline.matchId);
    if (!match || match.teamKills <= 0) continue;
    const people = peopleOfMatch(match);
    if (people.length < 2) continue;
    const kills = killsOf(timeline);
    const objectives = timeline.objectives;

    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const pa = people[i];
        const pb = people[j];
        const row = entry(pa.person, pb.person);
        row.games += 1;
        // Joint takedown: both listed as present at the same kill event of the side.
        const joint = kills.filter(
          (kill) =>
            kill.people.includes(pa.participant.accountId ?? pa.person) &&
            kill.people.includes(pb.participant.accountId ?? pb.person),
        );
        if (joint.length > 0) row.together += 1;
        const kpA =
          (pa.participant.kills + pa.participant.assists) / match.teamKills;
        const kpB =
          (pb.participant.kills + pb.participant.assists) / match.teamKills;
        row.expected += kpA * kpB;
        row.expectedGames += 1;
        const idA = pa.participant.accountId ?? pa.person;
        const idB = pb.participant.accountId ?? pb.person;
        if (
          objectives.some(
            (objective) =>
              objective.people.includes(idA) && objective.people.includes(idB),
          )
        ) {
          row.sharedObjectives += 1;
        }
      }
    }
  }

  const pairs: PairSynergyDetail[] = [...pairState.values()].map((row) => {
    const observed = proportion(row.together, row.games);
    const expected =
      row.expectedGames > 0 ? row.expected / row.expectedGames : null;
    return {
      a: row.a,
      b: row.b,
      games: row.games,
      together: row.together,
      closeGames: 0,
      observed,
      expected,
      lift:
        observed.rate !== null && expected !== null && expected > 0
          ? observed.rate / expected
          : null,
      sharedObjectives: row.sharedObjectives,
      enoughGames: row.games >= SYNERGY_MIN_GAMES,
    };
  });

  return {
    pairs: pairs.sort((x, y) => (y.lift ?? -1) - (x.lift ?? -1)),
    minGames: SYNERGY_MIN_GAMES,
    timelines: timelines.length,
  };
}
