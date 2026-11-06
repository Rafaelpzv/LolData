// Individual rules -> recommendations. Pure: the text lives in messages/premade.json under
// `premade.recommendations.rules.<code>`, this module only picks keys, evidence and confidence.
// Every rule names its sample, its evidence and a caveat: with fewer than `SMALL_SAMPLE` games the
// confidence never goes above "low", and nothing here scores or grades a player.
import type {
  Confidence,
  Recommendation,
  RecommendationCode,
} from "./recommendations";
import {
  GET_BACK_PER_GAME,
  LANE_CS_BEHIND,
  LOW_CONFIDENCE_GAMES,
  SMALL_DERIVED_SAMPLE,
  VISION_LOW_SHARE,
  type PlayerDepth,
} from "./individual-metrics";

/** Individual rules. Each maps to `premade.recommendations.rules.<code>` in every locale. */
export const INDIVIDUAL_RECOMMENDATION_CODES = [
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

export type IndividualRecommendationCode =
  (typeof INDIVIDUAL_RECOMMENDATION_CODES)[number];

const round = (value: number | null, digits = 1): number | null =>
  value === null ? null : Number(value.toFixed(digits));

/**
 * The individual rules of the whole roster. The recommendation carries the person so the UI shows
 * the name from the roster, and the page adds it to the text.
 */
export function buildIndividualRecommendations(
  depths: PlayerDepth[],
  names: Map<string, string>,
): Recommendation[] {
  const out: Recommendation[] = [];
  const push = (
    code: IndividualRecommendationCode,
    kind: "warning" | "positive",
    depth: PlayerDepth,
    evidence: Record<string, number | string | null>,
    confirmation: Confidence,
  ) => {
    const games =
      typeof evidence.games === "number" ? evidence.games : depth.games;
    // Nothing is said strongly from a handful of games, whatever the rule.
    const small =
      depth.games < LOW_CONFIDENCE_GAMES || games < LOW_CONFIDENCE_GAMES;
    out.push({
      code: code as RecommendationCode,
      kind,
      evidence: {
        ...evidence,
        player: names.get(depth.person) ?? depth.person.slice(0, 6),
        games,
        lane: "lane",
      },
      confidence: small ? "low" : confirmation,
      games,
      person: depth.person,
    });
  };

  for (const depth of depths) {
    if (depth.games === 0) continue;

    // 1. A build that is not the one this group wins with: the same champion, two builds, two win rates.
    for (const champion of depth.champions) {
      const common = champion.build.order;
      if (!common || common.items.length < 3) continue;
      const share = common.games / Math.max(1, champion.buildWinRate.games);
      if (share < 0.6 || champion.buildWinRate.games < LOW_CONFIDENCE_GAMES)
        continue;
      if (
        (champion.buildWinRate.other ?? 0) >
        (champion.buildWinRate.withBuild ?? 0) + 20
      ) {
        push(
          "buildVariation",
          "warning",
          depth,
          {
            champion: champion.championName,
            withBuild: round(champion.buildWinRate.withBuild),
            other: round(champion.buildWinRate.other),
            games: champion.games,
          },
          champion.games >= 8 ? "medium" : "low",
        );
      }
    }

    // 2. Calling the retreat a lot (reply pings) and still dying a lot.
    const replies = depth.pings.perGame.getBackPings;
    if (
      replies !== null &&
      replies >= GET_BACK_PER_GAME &&
      depth.pings.replySplitGames > 0 &&
      (depth.pings.deathsWithReplies ?? 0) >
        (depth.pings.deathsWithoutReplies ?? 0) + 0.5
    ) {
      push(
        "replyPings",
        "warning",
        depth,
        {
          perGame: round(replies),
          with: round(depth.pings.deathsWithReplies),
          without: round(depth.pings.deathsWithoutReplies),
          games: depth.pings.games,
        },
        "low",
      );
    }

    // 3. Farming behind the lane opponent at 10 minutes.
    if (
      depth.early.laneGames >= SMALL_DERIVED_SAMPLE &&
      (depth.early.at10.csDiff ?? 0) <= -LANE_CS_BEHIND
    ) {
      push(
        "laneFarm",
        "warning",
        depth,
        {
          cs: round(depth.early.at10.cs),
          diff: round(depth.early.at10.csDiff),
          games: depth.early.laneGames,
        },
        depth.early.laneGames >= 15 ? "medium" : "low",
      );
    }

    // 4. Vision far from the same lane's, in either direction. The comparison is per lane: a
    //    support and a mid laner never have the same vision, and comparing them says nothing.
    const vision = depth.vision.visionPerMin;
    const lane = depth.vision.laneAveragePerMin;
    if (
      vision !== null &&
      lane !== null &&
      lane > 0 &&
      depth.vision.laneGames >= SMALL_DERIVED_SAMPLE
    ) {
      const share = vision / lane;
      if (share < VISION_LOW_SHARE) {
        push(
          "visionLow",
          "warning",
          depth,
          {
            vision: round(vision, 2),
            team: round(lane, 2),
            lane: "lane",
            games: depth.vision.games,
          },
          depth.vision.games >= 15 ? "medium" : "low",
        );
      } else if (share > 1.35) {
        push(
          "visionHigh",
          "positive",
          depth,
          {
            vision: round(vision, 2),
            team: round(lane, 2),
            lane: "lane",
            games: depth.vision.games,
          },
          depth.vision.games >= 15 ? "medium" : "low",
        );
      }
    }

    // 5. Trend: only said with a previous window to compare against.
    const trend = depth.trend;
    if (trend.previousGames >= LOW_CONFIDENCE_GAMES) {
      if ((trend.deltas.csPerMin ?? 0) >= 0.8) {
        push(
          "csClimbing",
          "positive",
          depth,
          {
            delta: round(trend.deltas.csPerMin, 2),
            games: trend.recentGames + trend.previousGames,
          },
          "low",
        );
      } else if ((trend.deltas.csPerMin ?? 0) <= -0.8) {
        push(
          "csFalling",
          "warning",
          depth,
          {
            delta: round(trend.deltas.csPerMin, 2),
            games: trend.recentGames + trend.previousGames,
          },
          "low",
        );
      }
      if ((trend.deltas.deathsPerGame ?? 0) >= 1) {
        push(
          "deathsClimbing",
          "warning",
          depth,
          {
            delta: round(trend.deltas.deathsPerGame),
            games: trend.recentGames + trend.previousGames,
          },
          "low",
        );
      }
      if ((trend.deltas.kda ?? 0) >= 1) {
        push(
          "kdaClimbing",
          "positive",
          depth,
          {
            delta: round(trend.deltas.kda, 2),
            games: trend.recentGames + trend.previousGames,
          },
          "low",
        );
      }
    }
  }
  return out;
}
