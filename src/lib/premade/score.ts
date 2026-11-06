// Team and player ratings on a 0..10 scale, with one decimal.
//
// The rules, in order of importance:
//  1. A rating never replaces a number: every score comes with the metric that produced it.
//  2. Metrics are normalised against a reference band (a floor and a target), so a score means
//     "how close to a good value", never "how big the raw number is".
//  3. A small sample shrinks the score towards the neutral 5,5: a 3-game streak cannot earn a 9.
//  4. Winning is a dimension of its own, never folded into the others by surprise.
// Pure module: no I/O, no Next, no Supabase.
import type { PersonId, PremadeMetrics, PlayerProfile } from "./metrics";
import { peopleOfMatch, variation } from "./metrics";
import type { PremadeMatchSample } from "./types";

/** Neutral value: below it the team is under the line, above it over. */
export const NEUTRAL_SCORE = 5.5;
/** Games needed before a rating is taken at face value. */
export const FULL_CONFIDENCE_GAMES = 20;
/** Every rating is shown with one decimal, never rounded to look precise. */
export const SCORE_DECIMALS = 1;

/**
 * Reference bands, calibrated against the teams this app has collected. Flex carries random
 * fillers, so "bad" here is bad for Flex, not for a disciplined Clash team: the numbers to compare
 * against are the other Flex teams in the database, never a pro team.
 */
export const TEAM_BANDS = {
  /** Win rate in percent. */
  winRate: [30, 65],
  /** First dragon rate, as a fraction. */
  firstDragon: [0.2, 0.6],
  /** First tower rate, as a fraction. */
  firstTower: [0.3, 0.7],
  /** Dragons taken per game. */
  dragonsPerGame: [1.2, 3.2],
  /** Barons taken per game. */
  baronsPerGame: [0.1, 0.8],
  /** Turrets taken per game: the collected teams sit between 12.9 and 14.8. */
  turretsPerGame: [7, 16],
  /** Deaths per game: measured 12.7 on the steadiest team and 29.5 on the one that bleeds. */
  deathsPerGame: [12, 30],
  /** Gold per kill: above the top of the band the team farms without finishing. */
  goldPerKill: [1200, 2600],
  /** Win rate in games where a dragon was taken, in percent. */
  winRateWithDragon: [30, 75],
  /** Variation between games, in percent: 15% is steady, 55% is a different team each game. */
  variation: [15, 55],
  /** People of the lineup per game. */
  presence: [3, 5],
} as const;

export const PLAYER_BANDS = {
  /** Win rate in percent. */
  winRate: [30, 65],
  kda: [1.5, 5],
  deathsPerGame: [3, 8],
  /** CS per minute: the collected lineups average 5.8 to 6.5 across the five people. */
  csPerMin: [3.5, 8],
  /** Vision score per minute: those lineups average around 1.1. */
  visionPerMin: [0.6, 2.2],
  /** Kill participation, as a fraction. */
  killParticipation: [0.4, 0.8],
  /** Share of the side's damage. */
  damageShare: [0.12, 0.32],
  /** Share of the side's gold: taking too much of it is not automatically good. */
  goldShare: [0.15, 0.35],
} as const;

export interface ScorePart {
  /** Message code under `premade.score.parts.<key>`. */
  key: string;
  /** 0..10, already rounded; NaN when the metric is missing (the part is then dropped). */
  score: number;
  /** How much this part weighs in the final score (weights sum to 1). */
  weight: number;
  /** The raw numbers behind the score, for the tooltip/line under it. */
  evidence: Record<string, number | null>;
}

export interface Rating {
  /** 0..10 with one decimal. */
  score: number;
  /** 0..1: how much data stands behind it (drives how far it was pulled to the neutral). */
  confidence: number;
  parts: ScorePart[];
}

/**
 * Maps a value onto 0..10 using a band: `low` scores 0, `high` scores 10, and values in between
 * are linear. Above `high` the score saturates at 10 (it cannot get better than "good enough"),
 * below `low` at 0.
 */
export function band(value: number | null, low: number, high: number): number {
  if (value === null || !Number.isFinite(value) || high === low) return NaN;
  const t = (value - low) / (high - low);
  return Math.min(10, Math.max(0, t * 10));
}

/**
 * Inverse band: a smaller value is better (deaths, gold given). `low` scores 10, `high` scores 0.
 */
export function inverseBand(
  value: number | null,
  low: number,
  high: number,
): number {
  const score = band(value, low, high);
  return Number.isNaN(score) ? NaN : 10 - score;
}

/**
 * Pulls a score towards the neutral when the sample is small. Ten games give ~52% of the way, so
 * a small sample can still call attention but never declares a strong team.
 */
export function shrink(score: number, games: number): number {
  const factor = games / (games + FULL_CONFIDENCE_GAMES / 2);
  return NEUTRAL_SCORE + (score - NEUTRAL_SCORE) * factor;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Weighted mean of the parts that exist; weights are renormalised over the missing ones. */
function combine(parts: ScorePart[], games: number): Rating {
  const available = parts.filter((part) => Number.isFinite(part.score));
  if (available.length === 0)
    return { score: NEUTRAL_SCORE, confidence: 0, parts };
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  const raw = available.reduce(
    (sum, part) => sum + part.score * (part.weight / totalWeight),
    0,
  );
  return {
    score: round1(shrink(Math.min(10, Math.max(0, raw)), games)),
    confidence: Math.min(1, games / FULL_CONFIDENCE_GAMES),
    parts: available.map((part) => ({ ...part, score: round1(part.score) })),
  };
}

const per = (value: number, games: number): number | null =>
  games > 0 ? value / games : null;

/**
 * The team's rating. Seven parts, each one a different question about the same games:
 * did they win, did they finish games, did they control the map, did they stay alive,
 * did they convert gold into kills, did they do it without help from lucky drafts (consistency),
 * and did they do it with the whole lineup together.
 */
export function teamRating(
  metrics: PremadeMetrics,
  matches: PremadeMatchSample[],
): Rating {
  const games = metrics.games;
  if (games === 0) return { score: NEUTRAL_SCORE, confidence: 0, parts: [] };

  const deathsPerGame = per(metrics.kills.deaths, games);
  const killsPerGame = per(metrics.kills.kills, games);
  const goldPerGame = per(
    matches.reduce((n, m) => n + m.teamGold, 0),
    games,
  );
  const turretsPerGame = metrics.conversion.turretsPerGame;
  const dragonPerGame = metrics.objectives.dragon.averageKills;
  const baronPerGame = metrics.objectives.baron.averageKills;
  const firstDragon = metrics.objectives.dragon.firstRate;
  const turretFirst = metrics.objectives.tower.firstRate;

  // Gold into kills: a high gold-per-kill means the team farms but does not finish.
  const goldPerKill =
    killsPerGame && killsPerGame > 0 ? (goldPerGame ?? 0) / killsPerGame : null;
  // Dragons and barons converted into wins, not just taken.
  const objectiveWinRate = metrics.objectives.dragon.winRateWithCondition;

  const parts: ScorePart[] = [
    {
      key: "winRate",
      weight: 0.3,
      score: band(metrics.winRate, ...TEAM_BANDS.winRate),
      evidence: { winRate: metrics.winRate, games },
    },
    {
      key: "objectives",
      weight: 0.15,
      score: mean([
        band(firstDragon, ...TEAM_BANDS.firstDragon),
        band(turretFirst, ...TEAM_BANDS.firstTower),
        band(dragonPerGame, ...TEAM_BANDS.dragonsPerGame),
        band(baronPerGame, ...TEAM_BANDS.baronsPerGame),
      ]),
      evidence: {
        firstDragon: firstDragon === null ? null : firstDragon * 100,
        dragonPerGame,
        baronPerGame,
        turretFirst: turretFirst === null ? null : turretFirst * 100,
      },
    },
    {
      key: "turrets",
      weight: 0.12,
      score: band(turretsPerGame, ...TEAM_BANDS.turretsPerGame),
      evidence: { turretsPerGame },
    },
    {
      key: "deaths",
      weight: 0.15,
      score: inverseBand(deathsPerGame, ...TEAM_BANDS.deathsPerGame),
      evidence: { deathsPerGame },
    },
    {
      key: "conversion",
      weight: 0.12,
      score: mean([
        inverseBand(goldPerKill, ...TEAM_BANDS.goldPerKill),
        band(objectiveWinRate, ...TEAM_BANDS.winRateWithDragon),
      ]),
      evidence: { goldPerKill, winRateWithDragon: objectiveWinRate },
    },
    {
      key: "consistency",
      weight: 0.08,
      // Lower variation is better: 15% from game to game is steady, 55% is a different team.
      score: mean(
        (["deaths", "gold", "xp"] as const).map((key) => {
          const v = metrics.consistency.team[key];
          return v === null
            ? NaN
            : inverseBand(v * 100, ...TEAM_BANDS.variation);
        }),
      ),
      evidence: {
        deaths:
          metrics.consistency.team.deaths === null
            ? null
            : metrics.consistency.team.deaths * 100,
        gold:
          metrics.consistency.team.gold === null
            ? null
            : metrics.consistency.team.gold * 100,
        xp:
          metrics.consistency.team.xp === null
            ? null
            : metrics.consistency.team.xp * 100,
      },
    },
    {
      key: "presence",
      weight: 0.08,
      // A rating built mostly from 3-person games says little about the real five-person team.
      score: band(averagePresence(metrics), ...TEAM_BANDS.presence),
      evidence: { averagePresence: averagePresence(metrics) },
    },
  ];

  return combine(parts, games);
}

/** Mean number of lineup people per game: a proxy for "how much of the real team played". */
export function averagePresence(metrics: PremadeMetrics): number | null {
  const games = metrics.presence.reduce((n, bucket) => n + bucket.games, 0);
  if (games === 0) return null;
  return (
    metrics.presence.reduce(
      (n, bucket) => n + bucket.players * bucket.games,
      0,
    ) / games
  );
}

function mean(values: number[]): number {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return NaN;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

/** Per-player rating over the games that player was in, all their accounts summed. */
export function playerRating(
  profile: PlayerProfile,
  matches: PremadeMatchSample[],
  metrics: PremadeMetrics,
): Rating {
  const person: PersonId = profile.puuid;
  const played = matches.flatMap((match) => {
    const hit = peopleOfMatch(match).find((entry) => entry.person === person);
    return hit ? [{ match, participant: hit.participant }] : [];
  });
  const games = played.length;
  if (games === 0) return { score: NEUTRAL_SCORE, confidence: 0, parts: [] };

  const sum = (pick: (p: (typeof played)[number]["participant"]) => number) =>
    played.reduce((n, entry) => n + pick(entry.participant), 0);

  const kda = profile.kda;
  const deathsPerGame = sum((p) => p.deaths) / games;
  const csPerMin =
    played.reduce(
      (n, entry) =>
        n +
        entry.participant.totalMinionsKilled +
        entry.participant.neutralMinionsKilled,
      0,
    ) /
    Math.max(
      1,
      played.reduce((n, entry) => n + entry.match.duration / 60, 0),
    );
  const visionPerMin =
    sum((p) => p.visionScore) /
    Math.max(
      1,
      played.reduce((n, entry) => n + entry.match.duration / 60, 0),
    );
  const killsPerGame = sum((p) => p.kills) / games;
  const assistsPerGame = sum((p) => p.assists) / games;

  // Share-based numbers only exist for games collected after the shares were stored: they are
  // averaged over the games that have them, never filled with a zero.
  const shares = (
    pick: (
      p: (typeof played)[number]["participant"],
    ) => number | null | undefined,
  ) => {
    const values = played.flatMap((entry) => {
      const value = pick(entry.participant);
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    });
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  };
  const damageShare = shares((p) => p.damageShare);
  const goldShare = shares((p) => p.goldShare);
  const kp =
    metrics.killParticipation.find((k) => k.puuid === person)?.ratio ?? null;
  const ownDeaths = variation(played.map((entry) => entry.participant.deaths));

  const synergy = mean([
    kp === null ? NaN : band(kp, ...PLAYER_BANDS.killParticipation),
    damageShare === null ? NaN : band(damageShare, ...PLAYER_BANDS.damageShare),
    goldShare === null
      ? NaN
      : inverseBand(goldShare, ...PLAYER_BANDS.goldShare),
  ]);

  const parts: ScorePart[] = [
    {
      key: "winRate",
      weight: 0.22,
      score: band(
        games > 0 ? (profile.wins / games) * 100 : null,
        ...PLAYER_BANDS.winRate,
      ),
      evidence: {
        winRate: games > 0 ? (profile.wins / games) * 100 : null,
        games,
      },
    },
    {
      key: "kda",
      weight: 0.22,
      score: band(kda, ...PLAYER_BANDS.kda),
      evidence: { kda, killsPerGame, assistsPerGame },
    },
    {
      key: "deaths",
      weight: 0.16,
      score: inverseBand(deathsPerGame, ...PLAYER_BANDS.deathsPerGame),
      evidence: {
        deathsPerGame,
        variation: ownDeaths === null ? null : ownDeaths * 100,
      },
    },
    {
      key: "farm",
      weight: 0.13,
      score: band(csPerMin, ...PLAYER_BANDS.csPerMin),
      evidence: { csPerMin },
    },
    {
      key: "vision",
      weight: 0.13,
      score: band(visionPerMin, ...PLAYER_BANDS.visionPerMin),
      evidence: { visionPerMin },
    },
    {
      key: "synergy",
      weight: 0.14,
      score: synergy,
      evidence: {
        killParticipation: kp === null ? null : kp * 100,
        damageShare: damageShare === null ? null : damageShare * 100,
        goldShare: goldShare === null ? null : goldShare * 100,
      },
    },
  ];

  return combine(parts, games);
}

/** Everything the overview needs, computed once per render. */
export interface TeamRatings {
  team: Rating;
  players: { person: PersonId; rating: Rating }[];
}

export function computeRatings(
  metrics: PremadeMetrics,
  matches: PremadeMatchSample[],
): TeamRatings {
  return {
    team: teamRating(metrics, matches),
    players: metrics.players.map((profile) => ({
      person: profile.puuid,
      rating: playerRating(profile, matches, metrics),
    })),
  };
}
