// Premade metrics over the collected samples. Pure functions: no I/O, no Next, no Supabase.
import { winRate } from "../format";
import { coefficientOfVariation, proportion, type Proportion } from "./stats";

import type {
  AccountOwners,
  PremadeMatchSample,
  PremadeParticipantSample,
} from "./types";

/** Games a minute apart on average, newest last. */
export interface TeamSeriesPoint {
  matchId: string;
  gameCreation: number;
  win: boolean;
}

/**
 * "Session": consecutive games whose gap is at most this long.
 * A premade that plays together usually stops for a while between sessions.
 */
export const SESSION_GAP_MS = 90 * 60 * 1000;
/** Below this many games, conclusions are weak (the confidence label uses it). */
export const SMALL_SAMPLE = 10;

export const OBJECTIVES = ["dragon", "riftHerald", "baron", "tower"] as const;
export type ObjectiveKey = (typeof OBJECTIVES)[number];

export interface ObjectiveGroup {
  games: number;
  /** Games where the team got the objective first. */
  firstGames: number;
  firstRate: number | null;
  /** Average objectives taken per game. */
  averageKills: number | null;
  /** Win rate when the team took at least one, and when it took none. */
  winRateWithCondition: number | null;
  winRateWithoutCondition: number | null;
}

/** How a person is identified in the metrics: their id, or the account when they are unknown. */
export type PersonId = string;

/** The account that played a game, together with the person it belongs to. */
export function participantPerson(
  p: PremadeParticipantSample,
  owners: AccountOwners = {},
): PersonId {
  return p.accountId ?? owners[p.puuid] ?? p.puuid;
}

/**
 * The accounts this game still counts. `getTeamMatches` stamps an account of a removed player with
 * `accountId: null`; leaving that account in would show a game the person left as a five-person game.
 */
function participantsOf(
  match: PremadeMatchSample,
): PremadeMatchSample["participants"] {
  if (match.participants.some((p) => p.accountId === null))
    return match.participants.filter((p) => p.accountId !== null);
  return match.participants;
}

/**
 * Deaths of the ROSTER GROUP per game, one entry per game: the sum of the deaths of the people of
 * the lineup who played that game, each counted once.
 *
 * This is the reference the individual diagnosis compares a person against (§5). It is deliberately
 * not `metrics.kills.deaths` / games: that sums the participants stored for the game, which include
 * the strangers who filled the four-person games AND both sides of some rows, so it measures the
 * side (and then some), not the group. Compared against a side total of 29 deaths a game, no player
 * ever looked heavy, and every death diagnosis came back as "the team's".
 *
 * A game with nobody from the lineup contributes nothing and is not counted.
 */
export function groupDeathsPerGame(
  matches: readonly PremadeMatchSample[],
  owners: AccountOwners = {},
): number | null {
  const perGame: number[] = [];
  for (const match of matches) {
    const people = peopleOfMatch(match, owners);
    if (people.length === 0) continue;
    perGame.push(people.reduce((sum, entry) => sum + entry.participant.deaths, 0));
  }
  const total = perGame.reduce((sum, value) => sum + value, 0);
  return perGame.length > 0 ? total / perGame.length : null;
}

/**
 * Groups the accounts of a match by person: one entry per person that played, in side order.
 * Two accounts of the same person (never on the same game) still end up as one person.
 */
export function peopleOfMatch(
  match: PremadeMatchSample,
  owners: AccountOwners = {},
): { person: PersonId; participant: PremadeParticipantSample }[] {
  const byPerson = new Map<PersonId, PremadeParticipantSample>();
  for (const participant of participantsOf(match)) {
    const person = participantPerson(participant, owners);
    // One person plays one account at a time; keep the first rather than counting twice.
    if (!byPerson.has(person)) byPerson.set(person, participant);
  }
  return [...byPerson.entries()].map(([person, participant]) => ({
    person,
    participant,
  }));
}

export interface IndividualConsistency {
  puuid: PersonId;
  games: number;
  /** Coefficient of variation as a fraction (0.38 = 38%, 0 = identical every game); null when unknown. */
  deaths: number | null;
  cs: number | null;
  gold: number | null;
}

/**
 * Kill participation of one person: (own kills + own assists) over the kills of the WHOLE side they
 * were on (random fillers included), averaged per game. Each game is one observation.
 */
export interface KillParticipation {
  puuid: PersonId;
  /** Games where (kills + assists) / side kills could be computed. */
  games: number;
  /** Mean of the per-game ratio, 0..1. */
  ratio: number | null;
  min: number | null;
  max: number | null;
  /** (Σ own kills + assists) / (Σ side kills) over the same games: the total, not the mean of ratios. */
  aggregate: number | null;
  /** Own kills over the own side's kills, the same games (the assists part alone is 1 - this). */
  killsShare: number | null;
}

export interface PremadeMetrics {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** Win rate with its Wilson interval and its denominator (wins / games). */
  winRateStats: Proportion;
  /** KDA of the five roles, totalled over the games: (Σ kills + Σ assists) / Σ deaths. */
  kills: { kills: number; deaths: number; assists: number };
  /** Collective KDA = (kills + assists) / deaths, from the sums above. */
  kda: number | null;
  /**
   * The same KDA read from the WHOLE side (`info.teams`/participants, fillers included). With fewer
   * than five roster people in a game the two differ, so both are kept and shown side by side.
   */
  sideKills: { kills: number; deaths: number; assists: number } | null;
  sideKda: number | null;
  /** Games whose side assists came from the whole side; the rest fall back to the roster sum. */
  sideAssistGames: number;
  /**
   * Games where the side total is the COMPLETE side (kills, deaths and assists all read from the
   * side). Anything below `games` means the collective KDA is an estimate: the UI must say so.
   */
  sideCompleteGames: number;
  /**
   * Whether the collective KDA can be presented as the team's KDA. It needs EVERY game of the window
   * to have a complete side; a partial sum is never shown as if it were the side's (§2.3).
   */
  sideComplete: boolean;
  killParticipation: KillParticipation[];
  objectives: Record<
    ObjectiveKey,
    Pick<
      ObjectiveGroup,
      "games" | "firstGames" | "firstRate" | "averageKills"
    > & {
      winRateWithCondition: number | null;
      winRateWithoutCondition: number | null;
      /** The two conditions with their samples: `wins with / games with`, never a bare percent. */
      withCondition: Proportion;
      withoutCondition: Proportion;
      /** First-objective rate over the games where the match reported it. */
      firstStats: Proportion;
    }
  >;
  consistency: {
    /** Coefficients of variation, as fractions (0.24 = 24%); null when the mean is zero or one game. */
    team: {
      deaths: number | null;
      gold: number | null;
      xp: number | null;
      cs: number | null;
    };
    /** Games behind each team coefficient (the same sample for all four). */
    games: number;
    individual: IndividualConsistency[];
  };
  /** Per player, only from the games that player was in: champions and lane. */
  players: PlayerProfile[];
  /**
   * How many games still have each number of people from the current lineup (index 3..5).
   * A game missing people keeps counting for the team, but not as a full five-person game.
   */
  presence: { players: number; games: number; wins: number }[];
  /** Associations, never scores: more kills do not "earn" a rating. */
  conversion: {
    /** Turrets per kill, as an association: more kills do not "earn" a turret. */
    killsToTurrets: number | null;
    /** Team turret takedowns per game, the number the ratio above comes from. */
    turretsPerGame: number | null;
    /**
     * Gold per kill: the SIDE's gold (fillers included) over the side's kills, over the games in a
     * band around the median kill count of the window, so wins and losses are compared at the same
     * kill count. Named gold and not efficiency: it mixes farming and fighting.
     */
    winGoldPerKill: number | null;
    lossGoldPerKill: number | null;
    /** Games behind each side of the gold-per-kill comparison (same kill count on both sides). */
    winKillGames?: number;
    lossKillGames?: number;
    /** Games inside the kill band and the median kill count the band was built around. */
    killBandGames?: number;
    killBandMedian?: number;
  };
  /** Games grouped in play sessions, oldest session first. */
  sessions: {
    index: number;
    games: number;
    wins: number;
    start: string;
    end: string;
  }[];
}

function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

/**
 * Coefficient of variation as a FRACTION (0.24 = 24%): sample sd / mean, the definition of
 * `stats.coefficientOfVariation`. 0 when every game is identical, null when it cannot be told
 * (one game, or a mean of zero).
 */
export function variation(values: number[]): number | null {
  return coefficientOfVariation(values);
}

/**
 * Splits a series into sessions in chronological order (oldest first).
 * `onset` marks the first session, where the data starts: its first game may not be the real one.
 */
export function splitSessions(
  games: readonly TeamSeriesPoint[],
): {
  startsAt: number;
  endsAt: number;
  games: number;
  wins: number;
  onset: boolean;
}[] {
  const ordered = [...games].sort((a, b) => a.gameCreation - b.gameCreation);
  const sessions: {
    startsAt: number;
    endsAt: number;
    games: number;
    wins: number;
    onset: boolean;
  }[] = [];

  for (const game of ordered) {
    const current = sessions[sessions.length - 1];
    if (current && game.gameCreation - current.endsAt <= SESSION_GAP_MS) {
      current.endsAt = game.gameCreation;
      current.games += 1;
      if (game.win) current.wins += 1;
      continue;
    }
    sessions.push({
      startsAt: game.gameCreation,
      endsAt: game.gameCreation,
      games: 1,
      wins: game.win ? 1 : 0,
      onset: false,
    });
  }

  if (sessions.length > 0) sessions[0].onset = true;
  return sessions;
}

/** Games grouped by how many people of the lineup were on the team that game. */
export function presenceCounts(
  matches: PremadeMatchSample[],
  owners: AccountOwners = {},
): { players: number; games: number; wins: number }[] {
  const buckets = new Map<
    number,
    { players: number; games: number; wins: number }
  >();
  for (const match of matches) {
    const people = peopleOfMatch(match, owners).length;
    const bucket = buckets.get(people) ?? {
      players: people,
      games: 0,
      wins: 0,
    };
    bucket.games += 1;
    if (match.win) bucket.wins += 1;
    buckets.set(people, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.players - a.players);
}

function playerIds(
  matches: PremadeMatchSample[],
  owners: AccountOwners = {},
): PersonId[] {
  const ids: PersonId[] = [];
  for (const match of matches) {
    for (const p of participantsOf(match)) {
      const person = participantPerson(p, owners);
      if (!ids.includes(person)) ids.push(person);
    }
  }
  return ids;
}

export interface PlayerChampion {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
}

export interface PlayerPosition {
  teamPosition: string;
  games: number;
  wins: number;
}

/** One person, measured only over the games they actually played, all their accounts summed. */
export interface PlayerProfile {
  puuid: PersonId;
  games: number;
  wins: number;
  kda: number | null;
  champions: PlayerChampion[];
  positions: PlayerPosition[];
  mainPosition: PlayerPosition | null;
}

/** Champions and lanes of every person, each one over their own games only (every account). */
export function buildPlayerProfiles(
  matches: PremadeMatchSample[],
  owners: AccountOwners = {},
): PlayerProfile[] {
  return playerIds(matches, owners).map((puuid) => {
    const played = matches.flatMap((match) => {
      const hit = peopleOfMatch(match, owners).find(
        (entry) => entry.person === puuid,
      );
      return hit ? [{ match, participant: hit.participant }] : [];
    });

    const champions: PlayerChampion[] = [];
    const positions: PlayerPosition[] = [];
    for (const { match, participant } of played) {
      const champion = champions.find(
        (c) => c.championId === participant.championId,
      );
      if (champion) {
        champion.games += 1;
        champion.wins += match.win ? 1 : 0;
        champion.kills += participant.kills;
        champion.deaths += participant.deaths;
        champion.assists += participant.assists;
      } else {
        champions.push({
          championId: participant.championId,
          championName: participant.championName,
          games: 1,
          wins: match.win ? 1 : 0,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          kda: null,
        });
      }

      const position = positions.find(
        (p) => p.teamPosition === participant.teamPosition,
      );
      if (position) {
        position.games += 1;
        position.wins += match.win ? 1 : 0;
      } else {
        positions.push({
          teamPosition: participant.teamPosition,
          games: 1,
          wins: match.win ? 1 : 0,
        });
      }
    }

    for (const champion of champions) {
      champion.kda =
        champion.deaths > 0
          ? (champion.kills + champion.assists) / champion.deaths
          : champion.kills + champion.assists;
    }
    champions.sort((a, b) => b.games - a.games || (b.kda ?? 0) - (a.kda ?? 0));
    positions.sort((a, b) => b.games - a.games);

    const kills = played.reduce((sum, x) => sum + x.participant.kills, 0);
    const deaths = played.reduce((sum, x) => sum + x.participant.deaths, 0);
    const assists = played.reduce((sum, x) => sum + x.participant.assists, 0);

    return {
      puuid,
      games: played.length,
      wins: played.filter((x) => x.match.win).length,
      kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
      champions,
      positions,
      mainPosition: positions[0] ?? null,
    };
  });
}

function objectiveGroup(matches: PremadeMatchSample[], key: ObjectiveKey) {
  const withIt = matches.filter((m) => m.objectives[key].kills > 0);
  const withoutIt = matches.filter((m) => m.objectives[key].kills === 0);
  const winsWith = withIt.filter((m) => m.win).length;
  const winsWithout = withoutIt.filter((m) => m.win).length;
  const firstGames = matches.filter((m) => m.objectives[key].first).length;
  const withCondition = proportion(winsWith, withIt.length);
  const withoutCondition = proportion(winsWithout, withoutIt.length);

  return {
    games: matches.length,
    firstGames,
    firstRate: divide(firstGames, matches.length),
    averageKills: average(matches.map((m) => m.objectives[key].kills)),
    // Win rate conditioned on taking at least one objective and on taking none: an association.
    winRateWithCondition:
      withCondition.rate === null ? null : withCondition.rate * 100,
    winRateWithoutCondition:
      withoutCondition.rate === null ? null : withoutCondition.rate * 100,
    withCondition,
    withoutCondition,
    // The match always reports `first` for every objective, so the denominator is the window.
    firstStats: proportion(firstGames, matches.length),
  };
}

export function computeMetrics(
  matches: PremadeMatchSample[],
  owners: AccountOwners = {},
): PremadeMetrics {
  const games = matches.length;
  const wins = matches.filter((m) => m.win).length;
  const players = playerIds(matches, owners);

  const total = (
    pick: (p: PremadeMatchSample["participants"][number]) => number,
  ) =>
    matches.reduce(
      (sum, m) => sum + participantsOf(m).reduce((n, p) => n + pick(p), 0),
      0,
    );

  const kills = total((p) => p.kills);
  const deaths = total((p) => p.deaths);
  const assists = total((p) => p.assists);

  // Kill participation of a person: their kills+assists over the WHOLE side's kills that game (the
  // denomiator is the side, fillers included, never the roster sum: a four-person game would have
  // the roster share of a five-person side as its ceiling). One observation per game.
  const killParticipation: KillParticipation[] = players.map((puuid) => {
    const values: number[] = [];
    let ownTakedowns = 0;
    let ownKills = 0;
    let sideKills = 0;
    for (const match of matches) {
      const hit = peopleOfMatch(match, owners).find(
        (entry) => entry.person === puuid,
      );
      if (!hit) continue;
      const takedowns = hit.participant.kills + hit.participant.assists;
      const ratio = divide(takedowns, match.teamKills);
      if (ratio === null) continue;
      values.push(ratio);
      ownTakedowns += takedowns;
      ownKills += hit.participant.kills;
      sideKills += match.teamKills;
    }
    return {
      puuid,
      games: values.length,
      ratio: average(values),
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      aggregate: divide(ownTakedowns, sideKills),
      killsShare: divide(ownKills, sideKills),
    };
  });

  const objectives = Object.fromEntries(
    OBJECTIVES.map((key) => [key, objectiveGroup(matches, key)]),
  ) as PremadeMetrics["objectives"];

  const perGameTeam = (
    pick: (p: PremadeMatchSample["participants"][number]) => number,
  ) => matches.map((m) => participantsOf(m).reduce((n, p) => n + pick(p), 0));

  const teamDeaths = perGameTeam((p) => p.deaths);
  const teamGold = perGameTeam((p) => p.goldEarned);
  const teamXp = perGameTeam((p) => p.champExperience);
  const teamCs = perGameTeam(
    (p) => p.totalMinionsKilled + p.neutralMinionsKilled,
  );

  const individual: IndividualConsistency[] = players.map((puuid) => {
    const picked = matches.flatMap((m) =>
      peopleOfMatch(m, owners)
        .filter((entry) => entry.person === puuid)
        .map((entry) => entry.participant),
    );
    return {
      puuid,
      games: picked.length,
      deaths: variation(picked.map((p) => p.deaths)),
      cs: variation(
        picked.map((p) => p.totalMinionsKilled + p.neutralMinionsKilled),
      ),
      gold: variation(picked.map((p) => p.goldEarned)),
    };
  });

  const killsPerGame = perGameTeam((p) => p.kills);
  // Turrets belong to the side: `info.teams` is the count, the participants only closed them.
  // Older rows have no side totals, and there the sum of the takedowns is the best that is left.
  const turretsPerGame = matches.map(
    (m) => m.sideObjectives?.turret ?? m.turretTakedowns,
  );

  // Median of the side's kills over the window: the band both outcomes are compared inside.
  const killCounts = matches.map((m) => m.teamKills).sort((a, b) => a - b);
  const medianKills =
    killCounts.length > 0 ? killCounts[Math.floor(killCounts.length / 2)] : 0;
  // Same kill counts, both outcomes: the comparison never blames the team for killing more.
  const killBand = (filter: (m: PremadeMatchSample) => boolean) =>
    matches.filter(
      (m) =>
        filter(m) &&
        Math.abs(m.teamKills - medianKills) <= Math.max(2, medianKills * 0.15),
    );
  const goldPerKillIn = (win: boolean) => {
    const picked = killBand((m) => m.win === win);
    return {
      value: divide(
        picked.reduce((n, m) => n + m.teamGold, 0),
        picked.reduce((n, m) => n + m.teamKills, 0),
      ),
      games: picked.length,
    };
  };
  const winKills = goldPerKillIn(true);
  const lossKills = goldPerKillIn(false);
  const killBandCount = killBand(() => true).length;

  // The side KDA: the side's kills are stored whole, its deaths are the enemy kills (the match's
  // own side deaths total), and its assists are summed over the five participants when the row has
  // them. Games saved before `sideAssists` existed keep their roster assists, and the count of how
  // many games could not be read is kept so the UI never presents a partial sum as the side's.
  //
  // Every roster-side sum here reads `participantsOf`: the account of a removed player carries
  // `accountId: null` and must not be counted as somebody still on the team (the fallback used to).
  let sideKills = 0;
  let sideDeaths = 0;
  let sideAssists = 0;
  let sideAssistGames = 0;
  let sideCompleteGames = 0;
  for (const m of matches) {
    sideKills += m.teamKills;
    sideDeaths +=
      m.teamDeaths ?? participantsOf(m).reduce((n, p) => n + p.deaths, 0);
    if (
      typeof m.sideAssists === "number" &&
      Number.isFinite(m.sideAssists) &&
      m.sideAssists > 0
    ) {
      sideAssists += m.sideAssists;
      sideAssistGames += 1;
      sideCompleteGames += 1;
    } else {
      sideAssists += participantsOf(m).reduce((n, p) => n + p.assists, 0);
    }
  }

  const sessions = splitSessions(
    matches.map((m) => ({
      matchId: m.matchId,
      gameCreation: m.gameCreation,
      win: m.win,
    })),
  );

  return {
    games,
    wins,
    losses: games - wins,
    winRate: winRate(wins, games - wins),
    winRateStats: proportion(wins, games),
    players: buildPlayerProfiles(matches, owners),
    presence: presenceCounts(matches, owners),
    kills: { kills, deaths, assists },
    kda: divide(kills + assists, deaths),
    sideKills:
      sideKills > 0
        ? { kills: sideKills, deaths: sideDeaths, assists: sideAssists }
        : null,
    sideKda: divide(sideKills + sideAssists, sideDeaths),
    sideAssistGames,
    sideCompleteGames,
    // A collective KDA is only "the team's" when every game of the window read the whole side.
    sideComplete: games > 0 && sideCompleteGames === games,
    killParticipation,
    objectives,
    consistency: {
      team: {
        deaths: variation(teamDeaths),
        gold: variation(teamGold),
        xp: variation(teamXp),
        cs: variation(teamCs),
      },
      games,
      individual,
    },
    conversion: {
      killsToTurrets: divide(
        turretsPerGame.reduce((a, b) => a + b, 0),
        killsPerGame.reduce((a, b) => a + b, 0),
      ),
      turretsPerGame: average(turretsPerGame),
      winGoldPerKill: winKills.value,
      lossGoldPerKill: lossKills.value,
      winKillGames: winKills.games,
      lossKillGames: lossKills.games,
      killBandGames: killBandCount,
      killBandMedian: medianKills,
    },
    sessions: sessions.map((session, index) => ({
      index,
      games: session.games,
      wins: session.wins,
      start: new Date(session.startsAt).toISOString(),
      end: new Date(session.endsAt).toISOString(),
    })),
  };
}

/** Compares two windows: the numbers are `after - before`, null when either side has no value. */
export function comparePeriods(before: PremadeMetrics, after: PremadeMetrics) {
  const delta = (a: number | null, b: number | null) =>
    a === null || b === null ? null : b - a;
  return {
    games: after.games,
    winRate: delta(before.winRate, after.winRate),
    kda: delta(before.kda, after.kda),
    deathsPerGame: delta(
      before.games > 0 ? before.kills.deaths / before.games : null,
      after.games > 0 ? after.kills.deaths / after.games : null,
    ),
    dragonFirstRate: delta(
      before.objectives.dragon.firstRate,
      after.objectives.dragon.firstRate,
    ),
    baronFirstRate: delta(
      before.objectives.baron.firstRate,
      after.objectives.baron.firstRate,
    ),
  };
}

/**
 * The two windows of an evolution comparison: the newest `size` games against the `size` before
 * them, plus what each window was played in (dates, patches, lineup size). The formation is part of
 * the answer: a window with four people cannot be read as the five-person team.
 */
export interface PeriodWindow {
  /** Oldest first. */
  games: PremadeMatchSample[];
  /** First and last game of the window (epoch ms), null when empty. */
  from: number | null;
  to: number | null;
}

export interface PeriodContext {
  /**
   * One entry per distinct UTC day of the window, oldest first. It is the period itself, not the
   * patch: Match-V5 does not ship the patch number, and guessing one from the date would be
   * inventing data.
   */
  days: string[];
  /** Share of the side of the roster people per game (3..5); null when empty. */
  averagePeople: number | null;
  fullGames: number;
}

/** Window size used by the evolution comparison when the caller does not choose one. */
export const PERIOD_SIZE = 20;

export function splitPeriods(
  matches: PremadeMatchSample[],
  size: number = PERIOD_SIZE,
): { recent: PeriodWindow; previous: PeriodWindow; size: number } {
  // Newest first, the way the collector and the pages hand them over.
  const ordered = [...matches].sort((a, b) => b.gameCreation - a.gameCreation);
  const span = Math.max(1, Math.trunc(size));
  return {
    recent: windowOf(ordered.slice(0, span)),
    previous: windowOf(ordered.slice(span, span * 2)),
    size: span,
  };
}

function windowOf(games: PremadeMatchSample[]): PeriodWindow {
  const sorted = [...games].sort((a, b) => a.gameCreation - b.gameCreation);
  return {
    games: sorted,
    from: sorted.length > 0 ? sorted[0].gameCreation : null,
    to: sorted.length > 0 ? sorted[sorted.length - 1].gameCreation : null,
  };
}

/** Dates, patches and lineup of one window, said next to every change it is compared on. */
export function periodContext(
  window: PeriodWindow,
  owners: AccountOwners = {},
): PeriodContext {
  const games = window.games;
  const dates = new Set<string>();
  let people = 0;
  let full = 0;
  for (const game of games) {
    // UTC: the day of the game, never the day of the browser's timezone.
    dates.add(new Date(game.gameCreation).toISOString().slice(0, 10));
    const count = peopleOfMatch(game, owners).length;
    people += count;
    if (count >= 5) full += 1;
  }
  return {
    days: [...dates].sort(),
    averagePeople: games.length > 0 ? people / games.length : null,
    fullGames: full,
  };
}
