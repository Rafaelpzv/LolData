// Statistical rules -> recommendations. Pure: the text lives in messages/premade.json,
// this module only picks keys, evidence and confidence.
import { pairedInsight, sides, singleInsight, type Insight } from "./insights";
import type { PersonId, PremadeMetrics } from "./metrics";
import { SMALL_SAMPLE, peopleOfMatch, splitPeriods } from "./metrics";
import { proportion, sampleBand } from "./stats";
import type { TimelineMetrics } from "./timeline-metrics";
import type { AccountOwners, PremadeMatchSample, PremadePlayer } from "./types";

/** Every recommendation code. Each maps to a message under `premade.recommendations.rules.<code>`. */
export const RECOMMENDATION_CODES = [
  "smallSample",
  "lowWinRate",
  "dragonFirstLow",
  "dragonFirstHigh",
  "baronConversion",
  "towerConversion",
  "heraldLow",
  "fewTowers",
  "manyDeaths",
  "deathsVolatile",
  "kpGapHigh",
  "kpGapLow",
  "pingAssistMe",
  "pingDanger",
  "recentSlide",
  "recentRise",
  "stableDeaths",
  // Timeline: how the group plays the game, not how it ends.
  "leadNotKept",
  "strongFromAhead",
  "slowDragons",
  "slowObjectives",
  "lateHerald",
  "costlyDeaths",
  "isolatedDeaths",
  "scattered",
  "watchTogether",
  "conversionSlow",
  "awayFromFights",
  "noTimelines",
  // Individual: the person's own habits, read from the depth fields and the timelines.
  "buildVariation",
  "replyPings",
  "laneFarm",
  "visionLow",
  "visionHigh",
  "csClimbing",
  "csFalling",
  "deathsClimbing",
  "kdaClimbing",
] as const;

export type RecommendationCode = (typeof RECOMMENDATION_CODES)[number];

export type Confidence = "low" | "medium" | "high";

export interface Recommendation {
  code: RecommendationCode;
  kind: "warning" | "positive";
  /** The numbers behind the claim, so the UI can show them next to the advice. */
  evidence: Record<string, number | string | null>;
  confidence: Confidence;
  /** Games the claim was read from: always shown, so no advice hides its sample. */
  games?: number | null;
  /** The player a rule is about, when it names one (the UI shows the name from the roster). */
  person?: string | null;
}

/** Assists per game that hint a player keeps calling for help (habit, never quality). */
const ASSIST_ME_PER_GAME = 15;
const DANGER_PINGS_PER_GAME = 20;
const KP_GAP = 0.15;
const DRAGON_FIRST_THRESHOLD = 0.35;
const DRAGON_FIRST_MIN_SAMPLE = 3;
/** Games needed on BOTH sides of any conditioned comparison (with the objective vs. without). */
export const MIN_CONDITION_GAMES = 5;
/** Games per window of the evolution comparison (same size, newest first). */
export const TREND_WINDOW = 20;

const pct = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10;

/** The display name of a person: their first active account, or the id when unknown. */
function playerName(players: PremadePlayer[], person: PersonId): string | null {
  const hit = players.find((p) => p.id === person);
  const account = hit?.accounts.find((a) => !a.archived) ?? hit?.accounts[0];
  return account?.gameName ?? (hit ? hit.gameName : null);
}

/**
 * Adds the sample every claim was read from, and the timeline coverage when it lagged.
 * Called once after every rule ran; nothing is hidden behind a rule without its n.
 */
export function withSampleLedger(
  recommendations: Recommendation[],
  timelineGames = 0,
  totalGames = 0,
): Recommendation[] {
  // The timeline coverage is about the timelines, not about the window: said only when it lagged.
  const coverage =
    timelineGames > 0 && totalGames > 0 && timelineGames < totalGames
      ? [
          {
            code: "noTimelines" as RecommendationCode,
            kind: "warning" as const,
            evidence: { games: timelineGames, total: totalGames },
            confidence: "low" as const,
            games: timelineGames,
          },
        ]
      : [];
  return [...recommendations, ...coverage].map((rec) => ({
    ...rec,
    games: rec.games ?? totalGames,
  }));
}

/**
 * Builds the team's recommendations from the whole window.
 * Small samples never produce strong conclusions: they cap the confidence at "low".
 */
export function buildRecommendations(
  metrics: PremadeMetrics,
  matches: PremadeMatchSample[],
  players: PremadePlayer[],
  owners: AccountOwners = {},
  timelineGames = 0,
  totalGames = 0,
): Recommendation[] {
  const out: Recommendation[] = [];
  const push = (rec: Recommendation) => out.push(rec);
  const small = metrics.games < SMALL_SAMPLE;
  const confidence = (level: Confidence): Confidence =>
    small && level === "high" ? "medium" : small ? "low" : level;

  if (small) {
    push({
      code: "smallSample",
      kind: "warning",
      evidence: { games: metrics.games, needed: SMALL_SAMPLE },
      confidence: "low",
    });
  }

  if (metrics.winRate !== null && metrics.winRate < 50) {
    push({
      code: "lowWinRate",
      kind: "warning",
      evidence: {
        winRate: pct(metrics.winRate),
        games: metrics.games,
        wins: `${metrics.wins}/${metrics.games}`,
        // The interval makes "below 50%" verifiable: if it includes 50%, the sample cannot tell.
        interval:
          metrics.winRateStats.low === null
            ? null
            : `${Math.round(metrics.winRateStats.low * 100)}-${Math.round((metrics.winRateStats.high ?? 0) * 100)}%`,
      },
      confidence: confidence(metrics.games >= 20 ? "high" : "medium"),
    });
  }

  // First dragon: the sample behind the rate is the games of the window, and the extremely low
  // rates always carry it, so a 5% over 20 games and a 5% over 3 look different.
  const dragon = metrics.objectives.dragon;
  if (dragon.firstRate !== null && dragon.games >= DRAGON_FIRST_MIN_SAMPLE) {
    if (dragon.firstRate < DRAGON_FIRST_THRESHOLD) {
      push({
        code: "dragonFirstLow",
        kind: "warning",
        evidence: {
          rate: pct(dragon.firstRate * 100),
          games: dragon.games,
          total: metrics.games,
          first: `${dragon.firstGames}/${dragon.games}`,
          winRateWith: pct(dragon.winRateWithCondition),
        },
        confidence: confidence(
          dragon.games >= SMALL_SAMPLE / 2 ? "medium" : "low",
        ),
      });
    } else if (
      dragon.winRateWithCondition !== null &&
      dragon.winRateWithoutCondition !== null &&
      dragon.withCondition.total >= MIN_CONDITION_GAMES &&
      dragon.withoutCondition.total >= MIN_CONDITION_GAMES &&
      dragon.withCondition.rate! > dragon.withoutCondition.rate!
    ) {
      push({
        code: "dragonFirstHigh",
        kind: "positive",
        evidence: {
          rate: pct(dragon.firstRate * 100),
          games: dragon.firstGames,
          winRateWith: pct(dragon.winRateWithCondition),
          winRateWithout: pct(dragon.winRateWithoutCondition),
          withIt: `${dragon.withCondition.successes}/${dragon.withCondition.total}`,
          withoutIt: `${dragon.withoutCondition.successes}/${dragon.withoutCondition.total}`,
        },
        confidence: confidence("medium"),
      });
    }
  }

  // "Objectives do not turn into wins": only said when both sides of the comparison have a sample
  // and the difference is bigger than the intervals allow it to be.
  if (
    dragon.firstStats.rate !== null &&
    dragon.firstStats.rate >= 0.5 &&
    dragon.withCondition.total >= MIN_CONDITION_GAMES &&
    dragon.withoutCondition.total >= MIN_CONDITION_GAMES &&
    dragon.withCondition.rate !== null &&
    metrics.winRate !== null &&
    dragon.withCondition.rate * 100 <= metrics.winRate
  ) {
    push({
      code: "baronConversion",
      kind: "warning",
      evidence: {
        dragonFirst: pct(dragon.firstStats.rate * 100),
        firstGames: `${dragon.firstGames}/${dragon.firstStats.total}`,
        winRateWithDragon: pct(dragon.winRateWithCondition),
        withGames: dragon.withCondition.total,
        winRate: pct(metrics.winRate),
        games: metrics.games,
      },
      confidence: confidence("medium"),
    });
  }

  // The objective the team takes but does not win with: an association, read on its own sample.
  const tower = metrics.objectives.tower;
  const towerCondition = sides(
    tower.withCondition.successes,
    tower.withCondition.total,
    tower.withoutCondition.successes,
    tower.withoutCondition.total,
  );
  if (
    tower.withCondition.total >= MIN_CONDITION_GAMES &&
    tower.withoutCondition.total >= 3
  ) {
    const gap =
      (towerCondition.withIt.rate ?? 0) - (towerCondition.withoutIt.rate ?? 0);
    if (gap >= 0.2) {
      push({
        code: "towerConversion",
        kind: "positive",
        evidence: {
          withIt: `${tower.withCondition.successes}/${tower.withCondition.total}`,
          withoutIt: `${tower.withoutCondition.successes}/${tower.withoutCondition.total}`,
          gap: pct(gap * 100),
        },
        confidence: confidence(
          tower.withCondition.total >= 20 ? "medium" : "low",
        ),
      });
    }
  }

  const herald = metrics.objectives.riftHerald;
  if (
    herald.firstRate !== null &&
    herald.firstRate < 0.3 &&
    herald.games >= DRAGON_FIRST_MIN_SAMPLE
  ) {
    push({
      code: "heraldLow",
      kind: "warning",
      evidence: { rate: pct(herald.firstRate * 100), games: herald.games },
      confidence: confidence("medium"),
    });
  }

  // Conversion: kills and towers. The count is the side's (info.teams), the same one the summary
  // shows, so the two numbers always agree; it is an association, never "kills earn towers".
  if (
    metrics.conversion.killsToTurrets !== null &&
    metrics.conversion.turretsPerGame !== null &&
    metrics.conversion.killsToTurrets < 0.6
  ) {
    push({
      code: "fewTowers",
      kind: "warning",
      evidence: {
        towersPerKill:
          Math.round(metrics.conversion.killsToTurrets * 100) / 100,
        towersPerGame: pct(metrics.conversion.turretsPerGame),
        games: metrics.games,
      },
      confidence: confidence("medium"),
    });
  }

  // Side deaths, not the roster's: a game with three people of the lineup has three deaths, not
  // the side's, and the "many deaths" claim is about the side the team plays on.
  const deathsPerGame =
    metrics.games > 0
      ? (metrics.sideKills?.deaths ?? metrics.kills.deaths) / metrics.games
      : null;
  if (deathsPerGame !== null && deathsPerGame > 20) {
    push({
      code: "manyDeaths",
      kind: "warning",
      evidence: { deathsPerGame: pct(deathsPerGame), games: metrics.games },
      confidence: confidence("medium"),
    });
  }

  const teamDeathsVariation = metrics.consistency.team.deaths;
  if (teamDeathsVariation !== null && teamDeathsVariation > 0.4) {
    push({
      code: "deathsVolatile",
      kind: "warning",
      evidence: { variation: pct(teamDeathsVariation * 100) },
      confidence: confidence("medium"),
    });
  }

  // Synergy: the player whose kill participation is far from the team's average.
  const rated = metrics.killParticipation.filter((k) => k.ratio !== null);
  if (rated.length >= 3) {
    const mean = rated.reduce((n, k) => n + (k.ratio ?? 0), 0) / rated.length;
    const sorted = [...rated].sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    if (mean - (lowest.ratio ?? 0) > KP_GAP) {
      push({
        code: "kpGapLow",
        kind: "warning",
        evidence: {
          player: playerName(players, lowest.puuid) ?? null,
          kp: pct((lowest.ratio ?? 0) * 100),
          average: pct(mean * 100),
        },
        confidence: confidence("medium"),
      });
    }
    if ((highest.ratio ?? 0) - mean > KP_GAP) {
      push({
        code: "kpGapHigh",
        kind: "positive",
        evidence: {
          player: playerName(players, highest.puuid) ?? null,
          kp: pct((highest.ratio ?? 0) * 100),
          average: pct(mean * 100),
        },
        confidence: confidence("medium"),
      });
    }
  }

  // Communication: pings are habits, not quality. Said explicitly in the UI copy.
  const withPings = matches.filter((m) => m.participants.some((p) => p.pings));
  if (withPings.length > 0) {
    // Pings are summed over the person's accounts too: both accounts are the same habit.
    const pingTotal = (
      person: PersonId,
      pick: "assistMePings" | "dangerPings",
    ) =>
      withPings.reduce(
        (total, m) =>
          total +
          peopleOfMatch(m, owners)
            .filter((entry) => entry.person === person)
            .reduce(
              (sum, entry) => sum + (entry.participant.pings?.[pick] ?? 0),
              0,
            ),
        0,
      );
    const perPlayer = metrics.killParticipation.map((k) => ({
      puuid: k.puuid,
      assistMe: pingTotal(k.puuid, "assistMePings") / withPings.length,
      danger: pingTotal(k.puuid, "dangerPings") / withPings.length,
    }));

    const topAssistMe = [...perPlayer].sort(
      (a, b) => b.assistMe - a.assistMe,
    )[0];
    if (topAssistMe && topAssistMe.assistMe >= ASSIST_ME_PER_GAME) {
      push({
        code: "pingAssistMe",
        kind: "warning",
        evidence: {
          player: playerName(players, topAssistMe.puuid) ?? null,
          perGame: Math.round(topAssistMe.assistMe),
        },
        confidence: confidence("low"),
      });
    }

    const topDanger = [...perPlayer].sort((a, b) => b.danger - a.danger)[0];
    if (topDanger && topDanger.danger >= DANGER_PINGS_PER_GAME) {
      push({
        code: "pingDanger",
        kind: "warning",
        evidence: {
          player: playerName(players, topDanger.puuid) ?? null,
          perGame: Math.round(topDanger.danger),
        },
        confidence: confidence("low"),
      });
    }
  }

  // Evolution: the newest window against the one before it, both of the same size. Two blocks of
  // three games move by 33 points on a single game, so a change is only said when both windows have
  // at least MIN_CONDITION_GAMES and the two Wilson intervals do not overlap (a conservative test:
  // overlapping intervals say the change is smaller than the uncertainty).
  const periods = splitPeriods(matches, TREND_WINDOW);
  const recentRate = proportion(
    periods.recent.games.filter((m) => m.win).length,
    periods.recent.games.length,
  );
  const previousRate = proportion(
    periods.previous.games.filter((m) => m.win).length,
    periods.previous.games.length,
  );
  if (
    recentRate.total >= MIN_CONDITION_GAMES &&
    previousRate.total >= MIN_CONDITION_GAMES &&
    recentRate.low !== null &&
    recentRate.high !== null &&
    previousRate.low !== null &&
    previousRate.high !== null
  ) {
    const evidence = {
      recent: pct((recentRate.rate ?? 0) * 100),
      previous: pct((previousRate.rate ?? 0) * 100),
      recentGames: recentRate.total,
      previousGames: previousRate.total,
      recentWins: recentRate.successes,
      previousWins: previousRate.successes,
    };
    if (recentRate.high < previousRate.low) {
      push({
        code: "recentSlide",
        kind: "warning",
        evidence,
        confidence: confidence("medium"),
      });
    } else if (recentRate.low > previousRate.high) {
      push({
        code: "recentRise",
        kind: "positive",
        evidence,
        confidence: confidence("medium"),
      });
    }
  }

  // Stable team deaths is a pattern worth keeping.
  if (
    teamDeathsVariation !== null &&
    teamDeathsVariation <= 0.25 &&
    metrics.games >= 5
  ) {
    push({
      code: "stableDeaths",
      kind: "positive",
      evidence: {
        variation: pct(teamDeathsVariation * 100),
        games: metrics.games,
      },
      confidence: confidence("medium"),
    });
  }

  // Timeline coverage: the individual readings only exist for the games with a timeline, so the
  // gap is said out loud instead of hiding it (the sample is the timelines read).
  if (timelineGames > 0 && totalGames > 0 && timelineGames < totalGames) {
    push({
      code: "noTimelines",
      kind: "warning",
      evidence: { games: timelineGames, total: totalGames },
      confidence: "low",
      games: timelineGames,
    });
  }

  return out.map((rec) => ({ ...rec, games: rec.games ?? metrics.games }));
}

/**
 * Timeline rules with the evidence shape the panel promises. Each one needs its own minimum
 * sample and says the association it observed, never a cause. The rules that need a threshold the
 * data cannot justify are left to `buildTimelineRecommendations`, whose caveats stay as they were.
 */
export function buildTimelineInsights(
  timeline: TimelineMetrics | null,
): Insight[] {
  if (!timeline || timeline.games === 0) {
    return [
      {
        code: "noTimelines",
        kind: "coverage",
        band: "insufficient",
        evidence: {},
      },
    ];
  }
  const out: Insight[] = [];
  const push = (insight: Insight | null) => {
    if (insight) out.push(insight);
  };

  // 1. Presence around the objectives against the games without it: an association of the same games.
  const { withPresence, withoutPresence } = timeline.presenceAssociation;
  if (
    withPresence.games >= MIN_CONDITION_GAMES &&
    withoutPresence.games >= MIN_CONDITION_GAMES
  ) {
    const withIt = proportion(withPresence.wins, withPresence.games);
    const withoutIt = proportion(withoutPresence.wins, withoutPresence.games);
    push(
      pairedInsight(
        withIt.rate === null || withoutIt.rate === null
          ? ""
          : withIt.rate >= withoutIt.rate
            ? "objectivePresenceHelps"
            : "objectivePresenceWeak",
        withIt.rate === null || withoutIt.rate === null
          ? "observed"
          : withIt.rate >= withoutIt.rate
            ? "positive"
            : "observed",
        withIt,
        withoutIt,
        {
          near: `${timeline.preparation.dragon.averageNear?.toFixed(1) ?? "—"}`,
          players: 3,
        },
      ),
    );
  }

  // 2. Gold at 15: the wins of the games ahead against the games behind, both intervals with n.
  const fifteen = timeline.gold.markers.find((marker) => marker.minute === 15);
  if (
    fifteen &&
    fifteen.aheadGames >= MIN_CONDITION_GAMES &&
    fifteen.behindGames >= MIN_CONDITION_GAMES
  ) {
    const ahead = proportion(fifteen.aheadWins, fifteen.aheadGames);
    const behind = proportion(fifteen.behindWins, fifteen.behindGames);
    push(
      pairedInsight(
        ahead.rate !== null && ahead.rate >= 0.5 ? "leadHeld" : "leadLost",
        ahead.rate !== null && ahead.rate >= 0.5 ? "positive" : "observed",
        ahead,
        behind,
        { lead: 1_000 },
      ),
    );
  }

  // 3. Convincing deaths: the share of the group's deaths followed by an enemy objective.
  const deaths = timeline.deaths;
  const costly = proportion(deaths.costly, deaths.total);
  if (costly.total >= 20 && (costly.rate ?? 0) >= 0.15) {
    push(
      singleInsight("costlyDeaths", "observed", costly, {
        isolated: proportion(deaths.isolated, deaths.total).total,
      }),
    );
  }

  // 4. Isolated deaths: the share of deaths with no ally nearby (never an "error", a situation).
  const isolated = proportion(deaths.isolated, deaths.total);
  if (isolated.total >= 20 && (isolated.rate ?? 0) >= 0.25) {
    push(
      singleInsight("isolatedDeaths", "observed", isolated, {
        costly: proportion(deaths.costly, deaths.total).total,
      }),
    );
  }

  // 5. Grouping: the share of the sampled frames where the whole group was inside the radius.
  const grouping = timeline.grouping;
  if (grouping.groupedShare !== null && grouping.frames >= 30) {
    const value = proportion(
      Math.round((grouping.groupedShare / 100) * grouping.frames),
      grouping.frames,
    );
    if (
      (grouping.groupedShare < 35 || grouping.groupedShare >= 60) &&
      value.rate !== null
    ) {
      push(
        singleInsight(
          grouping.groupedShare < 35 ? "scattered" : "grouped",
          grouping.groupedShare < 35 ? "observed" : "positive",
          value,
          {
            radius: grouping.radius,
            nearKill: grouping.nearKill?.toFixed(1) ?? null,
          },
        ),
      );
    }
  }

  // 6. A kill that does not become an objective, read on the kills that had no objective after.
  const conversion = timeline.conversion;
  if (conversion.kills >= 20 && conversion.games >= 3) {
    push({
      code: "conversionSlow",
      kind: "observed",
      band: sampleBand(conversion.games) ?? "insufficient",
      evidence: {
        median:
          conversion.median === null ? null : Math.round(conversion.median),
        games: conversion.games,
        kills: conversion.kills,
        window: 45,
      },
    });
  }

  return out;
}
