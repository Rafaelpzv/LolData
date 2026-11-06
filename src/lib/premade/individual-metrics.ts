// Per-player depth metrics over the collected samples (migration 0010 fields + timeline derived
// data). Pure functions: no I/O, no Next, no Supabase. Every number is an average over the games
// that actually carry it, next to the sample it was read from, and nothing is invented: a game
// stored before the fields existed simply does not count towards them.
import type {
  AccountOwners,
  PremadeMatchSample,
  PremadeParticipantSample,
} from "./types";
import type { TimelineDeath } from "./timeline";
import {
  peopleOfMatch,
  type PlayerProfile,
  type PremadeMetrics,
} from "./metrics";

/** Below this many games a champion (or a pairing) is shown with a low-confidence note. */
export const LOW_CONFIDENCE_GAMES = 3;
/** Below this many timelines the early-game and death readings are weak. */
export const SMALL_DERIVED_SAMPLE = 5;
/** Reply pings (get back) per game that count as a habit of calling a retreat. */
export const GET_BACK_PER_GAME = 8;
/** A player's vision per minute below this share of the team's average is low. */
export const VISION_LOW_SHARE = 0.75;
/** CS behind the lane opponent at 10 minutes that counts as a farming problem. */
export const LANE_CS_BEHIND = 15;
/** Games per window of the trend comparison. */
export const TREND_WINDOW = 10;

export const PING_KINDS = [
  "allInPings",
  "assistMePings",
  "basicPings",
  "commandPings",
  "dangerPings",
  "enemyMissingPings",
  "enemyVisionPings",
  "getBackPings",
  "holdPings",
  "needVisionPings",
  "onMyWayPings",
  "pushPings",
  "retreatPings",
  "visionClearedPings",
] as const;
export type PingKind = (typeof PING_KINDS)[number];

export type DeathPhase = "early" | "mid" | "late";
export type DeathRegion = "top" | "mid" | "bot" | "jungle" | "river" | "base";

/** One death of a roster person, read from a stored timeline. */
export interface PlayerDeathEvent {
  /** Seconds since the game started. */
  at: number;
  /** The roster person who died, null when a filler died. */
  person: string | null;
  /** No other roster person within the timeline's nearby distance. */
  alone: boolean;
  /** The enemy turned it into an objective within the timeline's window. */
  costly: boolean;
  region: DeathRegion;
}

/** Turns the stored timeline deaths into the per-player shape the metrics read. */
export function deathEvents(
  deaths: readonly TimelineDeath[] | undefined,
): PlayerDeathEvent[] {
  return (deaths ?? []).map((death) => ({
    at: death.at,
    person: death.person,
    alone: death.near <= 1,
    costly: death.costly,
    region: regionOf(death),
  }));
}

/** Brutal Deaths of one collected game, by match id: the metric reads phase, region and company. */
export type TimelineDeathMap = ReadonlyMap<string, readonly PlayerDeathEvent[]>;

/** A quantity averaged over the games that carry it. */
export interface Average {
  games: number;
  value: number | null;
}

export interface ChampionItem {
  itemId: number;
  games: number;
  wins: number;
}

export interface ChampionBuild {
  /** First finished item, by how often it came first, and the average minute it did. */
  firstItem: { itemId: number; games: number; at: number | null } | null;
  /** The most common order of the finished items, with how many games followed it. */
  order: { items: number[]; games: number } | null;
}

export interface ChampionDetail {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  csPerMin: number | null;
  damagePerMin: number | null;
  goldPerMin: number | null;
  lowConfidence: boolean;
  /** Items the build ended with, most bought first. */
  items: ChampionItem[];
  build: ChampionBuild;
  /** Keystone and the two trees, the most played pairing. */
  runes: {
    keystone: number;
    primary: number;
    secondary: number;
    games: number;
  } | null;
  /** Summoner spells, the most played pair. */
  spells: { spells: [number, number]; games: number } | null;
  /** Skill order, the most common first six levels. */
  skills: { order: number[]; games: number } | null;
  /** Win rate of the games that followed the commonest build, against the rest. */
  buildWinRate: {
    withBuild: number | null;
    other: number | null;
    games: number;
  };
}

export interface PlayerSummary {
  games: number;
  wins: number;
  winRate: number | null;
  kda: number | null;
  killParticipation: number | null;
  damagePerMin: number | null;
  goldPerMin: number | null;
  csPerMin: number | null;
  visionPerMin: number | null;
  deathsPerGame: number | null;
  deadTimeShare: number | null;
}

export interface PlayerPings {
  /** Average per game of each ping (games with pings only). */
  perGame: Record<PingKind, number | null>;
  /** All pings per game. */
  total: number | null;
  games: number;
  /** The average total of the other roster people of the same side. */
  teamTotal: number | null;
  /** Games where the player pinged more than those people. */
  aboveTeam: number;
  /** Deaths per game in the third of the games with the most reply pings, and in the rest. */
  deathsWithReplies: number | null;
  deathsWithoutReplies: number | null;
  replySplitGames: number;
}

export interface EarlyGame {
  games: number;
  /** Lane numbers at 10 and 15 minutes: the player's own CS and the difference to the opponent. */
  at10: {
    cs: number | null;
    csDiff: number | null;
    xpDiff: number | null;
    goldDiff: number | null;
  };
  at15: {
    cs: number | null;
    csDiff: number | null;
    xpDiff: number | null;
    goldDiff: number | null;
  };
  firstBlood: { games: number; kills: number; assists: number };
  /** Deaths before 10:00 per game, over the games that have a timeline. Null when none has. */
  deathsBefore10: number | null;
  /** Games the deaths before 10 were read from (games with a timeline). */
  deathsBefore10Games: number;
  /** Games where the lane numbers could be read (a timeline and both frames). */
  laneGames: number;
}

export interface PlayerVision {
  games: number;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWards: number | null;
  visionPerMin: number | null;
  teamPerMin: number | null;
  /** The other roster people who played the same lane, over their own games. */
  laneAveragePerMin: number | null;
  laneGames: number;
}

export interface PlayerCombat {
  games: number;
  damagePerDeath: number | null;
  damageTakenPerGame: number | null;
  mitigatedPerGame: number | null;
  ccPerGame: number | null;
  healingPerGame: number | null;
  shieldingPerGame: number | null;
  multikills: number;
  largestSpree: number | null;
  soloKills: number | null;
  deadTimeShare: number | null;
  survivedLongest: number | null;
}

export interface DeathBreakdown {
  /** Deaths read from the timelines of the games the player was in. */
  total: number;
  byPhase: Record<DeathPhase, number>;
  byRegion: Record<DeathRegion, number>;
  alone: number;
  /**
   * Percent (0..100), like every other `*Share`/`*Participation` of this module; the one exception
   * is `summary.killParticipation`, a fraction (0..1). The name says the unit so the UI cannot
   * multiply it by 100 twice.
   */
  aloneShare: number | null;
  costly: number;
  /** Percent (0..100), same as `aloneShare`. */
  costlyShare: number | null;
  /** Games with a timeline read. */
  games: number;
}

export interface PlayerObjectives {
  games: number;
  dragonParticipation: number | null;
  baronParticipation: number | null;
  towerParticipation: number | null;
  damageToObjectivesPerGame: number | null;
  damageToTurretsPerGame: number | null;
  stolen: number;
  turretKillsPerGame: number | null;
}

export interface PlayerTrend {
  recentGames: number;
  previousGames: number;
  /** Recent window minus the previous one (win rate in points, deaths negative is better). */
  deltas: {
    winRate: number | null;
    kda: number | null;
    csPerMin: number | null;
    visionPerMin: number | null;
    deathsPerGame: number | null;
    damagePerMin: number | null;
  };
}

export interface PlayerSynergy {
  person: string;
  games: number;
  wins: number;
  winRate: number | null;
  kda: number | null;
}

export type TeamPosition =
  | "TOP"
  | "JUNGLE"
  | "MIDDLE"
  | "BOTTOM"
  | "UTILITY";

export interface PlayerDepth {
  person: string;
  summary: PlayerSummary;
  champions: ChampionDetail[];
  pings: PlayerPings;
  early: EarlyGame;
  vision: PlayerVision;
  combat: PlayerCombat;
  deaths: DeathBreakdown;
  objectives: PlayerObjectives;
  trend: PlayerTrend;
  synergy: { best: PlayerSynergy[]; worst: PlayerSynergy[] };
  /** Games that brought the depth fields, and the ones with a timeline. */
  fieldGames: number;
  derivedGames: number;
  games: number;
  /**
   * Riot's `teamPosition` values the person played, most played first. Required by the §5.1
   * context: no metric of this module is readable without the role it was played in.
   */
  roles: string[];
}

/** The games a person played, each with that person's participant row. */
export function playedGames(
  matches: PremadeMatchSample[],
  person: string,
  owners: AccountOwners = {},
): { match: PremadeMatchSample; participant: PremadeParticipantSample }[] {
  return matches.flatMap((match) => {
    const hit = peopleOfMatch(match, owners).find(
      (entry) => entry.person === person,
    );
    return hit ? [{ match, participant: hit.participant }] : [];
  });
}

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
const divide = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const number = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Average of a pick over the entries that carry it, with how many were read. */
function averageOf<T>(
  items: T[],
  pick: (item: T) => number | null | undefined,
): Average {
  const values = items.flatMap((item) => {
    const value = number(pick(item));
    return value === null ? [] : [value];
  });
  return { games: values.length, value: average(values) };
}

/** Game length in minutes: the timeline's duration wins over the match's when both exist. */
export function minutesOf(match: PremadeMatchSample): number {
  const seconds = match.timelineDuration ?? match.duration;
  return seconds > 0 ? seconds / 60 : 0;
}

/** Everything the Individual tab reads about one person. */
export function computePlayerDepth(
  person: string,
  matches: PremadeMatchSample[],
  profile: PlayerProfile | undefined,
  metrics: PremadeMetrics,
  owners: AccountOwners = {},
  deathsByMatch: TimelineDeathMap = new Map(),
): PlayerDepth {
  const played = playedGames(matches, person, owners);
  const games = played.length;
  const wins = played.filter((entry) => entry.match.win).length;
  const sum = (pick: (participant: PremadeParticipantSample) => number) =>
    played.reduce((total, entry) => total + pick(entry.participant), 0);
  const minutes = played.reduce(
    (total, entry) => total + minutesOf(entry.match),
    0,
  );

  const kills = sum((p) => p.kills);
  const deaths = sum((p) => p.deaths);
  const assists = sum((p) => p.assists);
  const kp =
    metrics.killParticipation.find((entry) => entry.puuid === person)?.ratio ??
    null;

  const summary: PlayerSummary = {
    games,
    wins,
    winRate: games > 0 ? (wins / games) * 100 : null,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    killParticipation: kp,
    damagePerMin: divide(
      sum((p) => p.totalDamageDealtToChampions),
      minutes,
    ),
    goldPerMin: divide(
      sum((p) => p.goldEarned),
      minutes,
    ),
    csPerMin: divide(
      sum((p) => p.totalMinionsKilled + p.neutralMinionsKilled),
      minutes,
    ),
    visionPerMin: divide(
      sum((p) => p.visionScore),
      minutes,
    ),
    deathsPerGame: divide(deaths, games),
    deadTimeShare: deadTimeShare(played),
  };

  const championIds = [
    ...new Set(played.map((entry) => entry.participant.championId)),
  ];
  const champions = championIds
    .map((championId) =>
      championDetail(
        championId,
        played.filter((entry) => entry.participant.championId === championId),
      ),
    )
    .sort((a, b) => b.games - a.games || (b.kda ?? 0) - (a.kda ?? 0));
  void deathsByMatch;

  return {
    person,
    summary,
    champions,
    pings: playerPings(played, person, owners),
    early: playerEarly(played, deathsByMatch),
    vision: playerVision(played, matches, person, owners),
    combat: playerCombat(played),
    deaths: playerDeaths(played, deathsByMatch),
    objectives: playerObjectives(played),
    trend: playerTrend(played),
    synergy: playerSynergy(matches, person, owners),
    fieldGames: played.filter(
      (entry) =>
        entry.participant.perks != null || entry.participant.items != null,
    ).length,
    derivedGames: played.filter((entry) => entry.participant.derived != null)
      .length,
    games,
    roles: rolesOf(played),
  };
}

/**
 * The roles the person played, most played first. A person who filled different lanes is not a
 * single profile, and the §5.1 context has to say so instead of averaging the lanes together.
 */
function rolesOf(
  played: { participant: PremadeParticipantSample }[],
): TeamPosition[] {
  const counts = new Map<TeamPosition, number>();
  for (const { participant } of played) {
    const role = participant.teamPosition as TeamPosition | undefined;
    if (!role) continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([role]) => role);
}

/** Share of the game time the player spent dead. */
export function deadTimeShare(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
): number | null {
  let dead = 0;
  let total = 0;
  for (const { match, participant } of played) {
    const time = number(participant.totalTimeSpentDead);
    if (time === null) continue;
    const seconds = match.timelineDuration ?? match.duration;
    if (seconds <= 0) continue;
    dead += time;
    total += seconds;
  }
  return total > 0 ? (dead / total) * 100 : null;
}

/** The champion pick, with its items, build, runes, spells and skill order. */
export function championDetail(
  championId: number,
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
): ChampionDetail {
  const games = played.length;
  const wins = played.filter((entry) => entry.match.win).length;
  const kills = played.reduce((sum, entry) => sum + entry.participant.kills, 0);
  const deaths = played.reduce(
    (sum, entry) => sum + entry.participant.deaths,
    0,
  );
  const assists = played.reduce(
    (sum, entry) => sum + entry.participant.assists,
    0,
  );
  const minutes = played.reduce(
    (sum, entry) => sum + minutesOf(entry.match),
    0,
  );

  // Final items: one count per game and item.
  const itemCounts = new Map<number, { games: number; wins: number }>();
  for (const { match, participant } of played) {
    for (const itemId of new Set(
      (participant.items ?? []).filter((id) => id > 0),
    )) {
      const entry = itemCounts.get(itemId) ?? { games: 0, wins: 0 };
      entry.games += 1;
      if (match.win) entry.wins += 1;
      itemCounts.set(itemId, entry);
    }
  }
  const items = [...itemCounts.entries()]
    .map(([itemId, tally]) => ({
      itemId,
      games: tally.games,
      wins: tally.wins,
    }))
    .sort((a, b) => b.games - a.games);

  // Build from the timeline: the first finished item and the most common order.
  const withDerived = played.filter((entry) => entry.participant.derived);
  const firsts = new Map<number, { games: number; at: number[] }>();
  const orders = new Map<string, { items: number[]; games: number }>();
  for (const { participant } of withDerived) {
    const derived = participant.derived!;
    if (derived.firstCompletedItem) {
      const entry = firsts.get(derived.firstCompletedItem.itemId) ?? {
        games: 0,
        at: [],
      };
      entry.games += 1;
      entry.at.push(derived.firstCompletedItem.at);
      firsts.set(derived.firstCompletedItem.itemId, entry);
    }
    if (derived.completedOrder.length > 0) {
      const key = derived.completedOrder.join("-");
      const entry = orders.get(key) ?? {
        items: derived.completedOrder,
        games: 0,
      };
      entry.games += 1;
      orders.set(key, entry);
    }
  }
  const order =
    [...orders.values()].sort((a, b) => b.games - a.games)[0] ?? null;
  let buildGames = 0;
  let buildWins = 0;
  if (order) {
    const key = order.items.join("-");
    for (const { match, participant } of withDerived) {
      if (participant.derived?.completedOrder.join("-") !== key) continue;
      buildGames += 1;
      if (match.win) buildWins += 1;
    }
  }
  // The first item by how often it came first; its average minute tells when the build completed.
  const firstItem = [...firsts.entries()].sort(
    (a, b) => b[1].games - a[1].games,
  )[0];

  const mostCommon = <T>(
    entries: T[],
    key: (entry: T) => string | null,
  ): { entry: T; games: number } | null => {
    const counts = new Map<string, { entry: T; games: number }>();
    for (const entry of entries) {
      const id = key(entry);
      if (!id) continue;
      const found = counts.get(id);
      counts.set(id, { entry, games: (found?.games ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.games - a.games)[0] ?? null;
  };

  const runePick = mostCommon(
    played.flatMap((entry) =>
      entry.participant.perks ? [entry.participant.perks] : [],
    ),
    (perks) => `${perks.keystone}-${perks.primary}-${perks.secondary}`,
  );
  const spellPick = mostCommon(
    played.flatMap((entry) => {
      const a = number(entry.participant.summoner1Id);
      const b = number(entry.participant.summoner2Id);
      return a && b ? [{ spells: [a, b] as [number, number] }] : [];
    }),
    (entry) => entry.spells.join("-"),
  );
  const skillPick = mostCommon(
    played.flatMap((entry) => {
      const order = (entry.participant.derived?.skillOrder ?? []).slice(0, 6);
      return order.length === 6 ? [{ order }] : [];
    }),
    (entry) => entry.order.join(""),
  );

  return {
    championId,
    championName: played[0]?.participant.championName ?? "",
    games,
    wins,
    kills,
    deaths,
    assists,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    csPerMin: divide(
      played.reduce(
        (sum, entry) =>
          sum +
          entry.participant.totalMinionsKilled +
          entry.participant.neutralMinionsKilled,
        0,
      ),
      minutes,
    ),
    damagePerMin: divide(
      played.reduce(
        (sum, entry) => sum + entry.participant.totalDamageDealtToChampions,
        0,
      ),
      minutes,
    ),
    goldPerMin: divide(
      played.reduce((sum, entry) => sum + entry.participant.goldEarned, 0),
      minutes,
    ),
    lowConfidence: games < LOW_CONFIDENCE_GAMES,
    items: items.slice(0, 6),
    build: {
      firstItem: firstItem
        ? {
            itemId: firstItem[0],
            games: firstItem[1].games,
            at: average(firstItem[1].at),
          }
        : null,
      order: order ? { items: order.items, games: order.games } : null,
    },
    runes: runePick ? { ...runePick.entry, games: runePick.games } : null,
    spells: spellPick
      ? { spells: spellPick.entry.spells, games: spellPick.games }
      : null,
    skills: skillPick
      ? { order: skillPick.entry.order, games: skillPick.games }
      : null,
    buildWinRate: {
      withBuild: buildGames > 0 ? (buildWins / buildGames) * 100 : null,
      other:
        withDerived.length - buildGames > 0
          ? ((withDerived.filter((entry) => entry.match.win).length -
              buildWins) /
              (withDerived.length - buildGames)) *
            100
          : null,
      games: withDerived.length,
    },
  };
}

/** Pings per game of a person, against the other roster people of their own side. */
export function playerPings(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
  person: string,
  owners: AccountOwners = {},
): PlayerPings {
  const withPings = played.filter((entry) => entry.participant.pings);
  const totalOf = (pings: NonNullable<PremadeParticipantSample["pings"]>) =>
    PING_KINDS.reduce((sum, kind) => sum + pings[kind], 0);

  const perGame = Object.fromEntries(
    PING_KINDS.map((kind) => [
      kind,
      average(withPings.flatMap((entry) => [entry.participant.pings![kind]])),
    ]),
  ) as Record<PingKind, number | null>;

  let teamSum = 0;
  let teamGames = 0;
  let aboveTeam = 0;
  for (const { match } of withPings) {
    const others = peopleOfMatch(match, owners).filter(
      (entry) => entry.person !== person && entry.participant.pings,
    );
    const otherAverage = average(
      others.map((entry) => totalOf(entry.participant.pings!)),
    );
    if (otherAverage === null) continue;
    teamSum += otherAverage;
    teamGames += 1;
    const own = played.find((entry) => entry.match.matchId === match.matchId)
      ?.participant.pings;
    if (own && totalOf(own) > otherAverage) aboveTeam += 1;
  }

  // Reply pings (get back) split against deaths: a habit, read with the standing caveat.
  const sorted = [...withPings].sort(
    (a, b) =>
      b.participant.pings!.getBackPings - a.participant.pings!.getBackPings ||
      b.match.gameCreation - a.match.gameCreation,
  );
  const third = Math.max(1, Math.floor(sorted.length / 3));
  const replies = sorted.slice(0, third);
  const rest = sorted.slice(third);

  return {
    perGame,
    total: average(withPings.map((entry) => totalOf(entry.participant.pings!))),
    games: withPings.length,
    teamTotal: teamGames > 0 ? teamSum / teamGames : null,
    aboveTeam,
    deathsWithReplies: average(
      replies.map((entry) => entry.participant.deaths),
    ),
    deathsWithoutReplies: average(
      rest.map((entry) => entry.participant.deaths),
    ),
    replySplitGames: withPings.length >= 3 ? replies.length + rest.length : 0,
  };
}

/** Lane numbers at 10 and 15 minutes against the lane opponent, plus the early deaths. */
export function playerEarly(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
  deathsByMatch: TimelineDeathMap = new Map(),
): EarlyGame {
  const lanes = played.flatMap((entry) =>
    (entry.participant.derived?.laning ?? []).map((lane) => ({
      lane,
      match: entry.match,
    })),
  );
  const at = (minute: number) =>
    lanes.filter((entry) => entry.lane.at === minute * 60);
  const build = (minute: number) => {
    const picked = at(minute);
    return {
      cs: average(picked.map((entry) => entry.lane.cs)),
      csDiff: average(
        picked.map((entry) => entry.lane.cs - entry.lane.enemyCs),
      ),
      xpDiff: average(
        picked.map((entry) => entry.lane.xp - entry.lane.enemyXp),
      ),
      goldDiff: average(
        picked.map((entry) => entry.lane.gold - entry.lane.enemyGold),
      ),
    };
  };

  // The timeline keeps the group's kill events, which is where the early first blood is read.
  const firstBloods = played.filter(
    (entry) =>
      entry.participant.firstBloodKill || entry.participant.firstBloodAssist,
  );
  // Deaths before 10:00, from the timelines of the games this player was in. It used to be read from
  // a pick that always answered null, so the field silently never existed.
  const earlyDeaths = played.flatMap((entry) => {
    const deaths = deathsByMatch.get(entry.match.matchId);
    if (!deaths) return [];
    return deaths.filter(
      (death) =>
        death.person !== null &&
        (death.person === entry.participant.puuid ||
          death.person === entry.participant.accountId) &&
        death.at < 600,
    );
  });
  const timelineGames = played.filter((entry) =>
    deathsByMatch.has(entry.match.matchId),
  ).length;

  return {
    games: played.length,
    at10: build(10),
    at15: build(15),
    firstBlood: {
      games: firstBloods.length,
      kills: played.filter((entry) => entry.participant.firstBloodKill).length,
      assists: played.filter((entry) => entry.participant.firstBloodAssist)
        .length,
    },
    // Only a game with a timeline can answer "how many deaths before 10 minutes": no timeline is a
    // missing observation, never a zero.
    deathsBefore10: timelineGames > 0 ? earlyDeaths.length / timelineGames : null,
    deathsBefore10Games: timelineGames,
    // Games the lane comparison was actually read from (a timeline and both frames), not the games
    // played: the two numbers are different and the denominator has to be the real one.
    laneGames: lanes.length,
  };
}

/** Vision score of the whole side in a game, the five participants the match counted. */
function sideVision(match: PremadeMatchSample): number {
  return match.participants.reduce(
    (sum, participant) => sum + participant.visionScore,
    0,
  );
}

/** The player's own vision per minute, and the side's over those games. */
export function playerVision(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
  matches: PremadeMatchSample[],
  person: string,
  owners: AccountOwners = {},
): PlayerVision {
  const minutes = played.reduce(
    (total, entry) => total + minutesOf(entry.match),
    0,
  );
  const visionPerMin = divide(
    played.reduce((sum, entry) => sum + entry.participant.visionScore, 0),
    minutes,
  );
  const byId = new Map(matches.map((match) => [match.matchId, match]));
  // The same side of the same games, the strangers who filled it included: `sideVision` already
  // sums every participant the match counted, so the window is exactly the side's.
  let teamVision = 0;
  let teamMinutes = 0;
  let laneVision = 0;
  let laneMinutes = 0;
  const positions = new Set(
    played.map((entry) => entry.participant.teamPosition).filter(Boolean),
  );
  for (const { match } of played) {
    const same = byId.get(match.matchId);
    if (!same) continue;
    teamVision += sideVision(same);
    teamMinutes += minutesOf(same);
  }
  // The same lane over every stored game, so a support never looks blind next to a mid laner.
  for (const same of matches) {
    for (const entry of peopleOfMatch(same, owners)) {
      if (
        entry.person === person ||
        !positions.has(entry.participant.teamPosition)
      )
        continue;
      laneVision += entry.participant.visionScore;
      laneMinutes += minutesOf(same);
    }
  }

  return {
    games: played.length,
    wardsPlaced: averageOf(played, (entry) => entry.participant.wardsPlaced)
      .value,
    wardsKilled: averageOf(played, (entry) => entry.participant.wardsKilled)
      .value,
    controlWards: averageOf(
      played,
      (entry) => entry.participant.visionWardsBoughtInGame,
    ).value,
    visionPerMin,
    teamPerMin: divide(teamVision, teamMinutes),
    laneAveragePerMin: laneMinutes > 0 ? divide(laneVision, laneMinutes) : null,
    laneGames: matches.filter((same) =>
      same.participants.some((entry) => positions.has(entry.teamPosition)),
    ).length,
  };
}

/** Damage, tanking, crowd control, multi-kills and time dead. */
export function playerCombat(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
): PlayerCombat {
  const deaths = played.reduce(
    (sum, entry) => sum + entry.participant.deaths,
    0,
  );
  const damage = played.reduce(
    (sum, entry) => sum + entry.participant.totalDamageDealtToChampions,
    0,
  );
  const multikills = played.reduce((sum, entry) => {
    const multi = entry.participant.multiKills;
    return multi
      ? sum + multi.double + multi.triple + multi.quadra + multi.penta
      : sum;
  }, 0);

  return {
    games: played.length,
    damagePerDeath: divide(damage, deaths),
    damageTakenPerGame: averageOf(
      played,
      (entry) => entry.participant.totalDamageTaken,
    ).value,
    mitigatedPerGame: averageOf(
      played,
      (entry) => entry.participant.damageSelfMitigated,
    ).value,
    ccPerGame: averageOf(played, (entry) => entry.participant.timeCCingOthers)
      .value,
    healingPerGame: averageOf(played, (entry) => entry.participant.totalHeal)
      .value,
    shieldingPerGame: averageOf(
      played,
      (entry) => entry.participant.totalDamageShieldedOnTeammates,
    ).value,
    multikills,
    largestSpree: averageOf(
      played,
      (entry) => entry.participant.largestKillingSpree,
    ).value,
    soloKills: averageOf(
      played,
      (entry) => entry.participant.challenges?.soloKills,
    ).value,
    deadTimeShare: deadTimeShare(played),
    survivedLongest: averageOf(
      played,
      (entry) => entry.participant.longestTimeSpentLiving,
    ).value,
  };
}

/** Deaths by phase and region, read from the timelines of the games the player was in. */
export function playerDeaths(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
  deathsByMatch: TimelineDeathMap = new Map(),
): DeathBreakdown {
  const byPhase: Record<DeathPhase, number> = { early: 0, mid: 0, late: 0 };
  const byRegion: Record<DeathRegion, number> = {
    top: 0,
    mid: 0,
    bot: 0,
    jungle: 0,
    river: 0,
    base: 0,
  };
  let total = 0;
  let alone = 0;
  let costly = 0;
  let games = 0;

  for (const { match, participant } of played) {
    const deaths = deathsByMatch.get(match.matchId);
    if (!deaths) continue;
    games += 1;
    const duration = match.timelineDuration ?? match.duration;
    const own = deaths.filter(
      (death) =>
        death.person !== null &&
        (death.person === participant.puuid ||
          death.person === participant.accountId),
    );
    for (const death of own) {
      total += 1;
      // Early until 30% of the game, late after 70%: the same split the Timeline tab explains.
      byPhase[
        duration > 0 && death.at < 0.3 * duration
          ? "early"
          : duration > 0 && death.at >= 0.7 * duration
            ? "late"
            : "mid"
      ] += 1;
      byRegion[death.region] += 1;
      if (death.alone) alone += 1;
      if (death.costly) costly += 1;
    }
  }

  return {
    total,
    byPhase,
    byRegion,
    alone,
    aloneShare: total > 0 ? (alone / total) * 100 : null,
    costly,
    costlyShare: total > 0 ? (costly / total) * 100 : null,
    games,
  };
}

/** Share of the side's dragons, barons and turrets the player closed themselves. */
export function playerObjectives(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
): PlayerObjectives {
  const participation = (
    kind: "turretTakedowns" | "dragonTakedowns" | "baronTakedowns",
  ) => {
    let own = 0;
    let side = 0;
    for (const { match, participant } of played) {
      const total =
        kind === "turretTakedowns"
          ? (match.sideObjectives?.turret ?? match.turretTakedowns)
          : kind === "dragonTakedowns"
            ? (match.sideObjectives?.dragon ?? match.objectives.dragon.kills)
            : (match.sideObjectives?.baron ?? match.objectives.baron.kills);
      if (total <= 0) continue;
      own += Math.min(number(participant[kind]) ?? 0, total);
      side += total;
    }
    return divide(own, side) === null ? null : (own / side) * 100;
  };

  return {
    games: played.length,
    dragonParticipation: participation("dragonTakedowns"),
    baronParticipation: participation("baronTakedowns"),
    towerParticipation: participation("turretTakedowns"),
    damageToObjectivesPerGame: averageOf(
      played,
      (entry) => entry.participant.damageDealtToObjectives,
    ).value,
    damageToTurretsPerGame: averageOf(
      played,
      (entry) => entry.participant.damageDealtToTurrets,
    ).value,
    stolen: played.reduce(
      (sum, entry) => sum + (number(entry.participant.objectivesStolen) ?? 0),
      0,
    ),
    turretKillsPerGame: averageOf(
      played,
      (entry) => entry.participant.turretKills,
    ).value,
  };
}

/** The last N games against the N before them, on the numbers a player can change. */
export function playerTrend(
  played: {
    match: PremadeMatchSample;
    participant: PremadeParticipantSample;
  }[],
  window = TREND_WINDOW,
): PlayerTrend {
  const ordered = [...played].sort(
    (a, b) => b.match.gameCreation - a.match.gameCreation,
  );
  const recent = ordered.slice(0, window);
  const previous = ordered.slice(window, window * 2);
  const stats = (entries: typeof played) => {
    const games = entries.length;
    const minutes = entries.reduce(
      (sum, entry) => sum + minutesOf(entry.match),
      0,
    );
    const kills = entries.reduce(
      (sum, entry) => sum + entry.participant.kills,
      0,
    );
    const deaths = entries.reduce(
      (sum, entry) => sum + entry.participant.deaths,
      0,
    );
    const assists = entries.reduce(
      (sum, entry) => sum + entry.participant.assists,
      0,
    );
    return {
      winRate:
        games > 0
          ? (entries.filter((entry) => entry.match.win).length / games) * 100
          : null,
      kda: deaths > 0 ? (kills + assists) / deaths : null,
      csPerMin: divide(
        entries.reduce(
          (sum, entry) =>
            sum +
            entry.participant.totalMinionsKilled +
            entry.participant.neutralMinionsKilled,
          0,
        ),
        minutes,
      ),
      visionPerMin: divide(
        entries.reduce((sum, entry) => sum + entry.participant.visionScore, 0),
        minutes,
      ),
      deathsPerGame: divide(deaths, games),
      damagePerMin: divide(
        entries.reduce(
          (sum, entry) => sum + entry.participant.totalDamageDealtToChampions,
          0,
        ),
        minutes,
      ),
    };
  };
  const now = stats(recent);
  const before = stats(previous);
  const delta = (a: number | null, b: number | null) =>
    a === null || b === null ? null : a - b;
  return {
    recentGames: recent.length,
    previousGames: previous.length,
    deltas: {
      winRate: delta(now.winRate, before.winRate),
      kda: delta(now.kda, before.kda),
      csPerMin: delta(now.csPerMin, before.csPerMin),
      visionPerMin: delta(now.visionPerMin, before.visionPerMin),
      deathsPerGame: delta(now.deathsPerGame, before.deathsPerGame),
      damagePerMin: delta(now.damagePerMin, before.damagePerMin),
    },
  };
}

/** Win rate and KDA with every other person, over the games they shared. */
export function playerSynergy(
  matches: PremadeMatchSample[],
  person: string,
  owners: AccountOwners = {},
  minimum = 3,
): { best: PlayerSynergy[]; worst: PlayerSynergy[] } {
  const byPartner = new Map<
    string,
    {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();
  for (const match of matches) {
    const people = peopleOfMatch(match, owners);
    const me = people.find((entry) => entry.person === person);
    if (!me) continue;
    for (const other of people) {
      if (other.person === person) continue;
      const entry = byPartner.get(other.person) ?? {
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      entry.games += 1;
      if (match.win) entry.wins += 1;
      entry.kills += me.participant.kills;
      entry.deaths += me.participant.deaths;
      entry.assists += me.participant.assists;
      byPartner.set(other.person, entry);
    }
  }
  const ranking = [...byPartner.entries()]
    .filter(([, entry]) => entry.games >= minimum)
    .map(([partner, entry]) => ({
      person: partner,
      games: entry.games,
      wins: entry.wins,
      winRate: (entry.wins / entry.games) * 100,
      kda:
        entry.deaths > 0
          ? (entry.kills + entry.assists) / entry.deaths
          : entry.kills + entry.assists,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.kda - a.kda);
  return {
    best: ranking.slice(0, 3),
    worst: [...ranking].reverse().slice(0, 3),
  };
}

/** Region of a map position, from the lanes and the jungle quadrants the Rift is drawn on. */
export function regionOf(point: { x: number; y: number } | null): DeathRegion {
  if (!point) return "jungle";
  const { x, y } = point;
  const nearRiver = Math.abs(x - y) < 2_600;
  const underOwnBase = Math.hypot(x - 500, y - 14_500) < 2_000;
  if (underOwnBase) return "base";
  if (nearRiver) return "river";
  if (x > 10_000 && y < 10_000) return "bot";
  if (x < 5_500 && y < 5_500) return "top";
  if (Math.abs(x - 7_500) < 2_500 && Math.abs(y - 7_500) < 2_500) return "mid";
  if (y > 12_000 && x > 5_000 && x < 10_000) return "mid";
  if (x > 2_000 && x < 6_000 && y > 3_000 && y < 8_000) return "top";
  if (x > 9_000 && x < 13_500 && y > 6_000 && y < 11_000) return "bot";
  return "jungle";
}
