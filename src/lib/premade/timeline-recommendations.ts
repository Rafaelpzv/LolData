// Timeline rules -> recommendations. Pure: the text lives in messages/premade.json
// (`premade.recommendations.rules.<code>`), this module only picks keys, evidence and confidence.
import type { Recommendation } from "./recommendations";
import type { Confidence } from "./recommendations";
import {
  SMALL_TIMELINE_SAMPLE,
  type TimelineMetrics,
} from "./timeline-metrics";
import type { PremadePlayer } from "./types";

/** A share of games ahead at 15 minutes whose leads are kept before it counts as holding them. */
const LEAD_HELD = 0.75;
/** Seconds a first dragon/baron/turret is expected before. */
const SLOW_FIRST_DRAGON = 960;
const SLOW_FIRST_TOWER = 1_200;
const SLOW_FIRST_BARON = 1_800;
/** First herald should be contested well before it leaves the map (about 14 minutes in). */
const LATE_FIRST_HERALD = 1_000;
/** Seconds after a kill the group should be taking something. */
const CONVERSION_SLOW = 45;
/** Share of the group deaths that can be expensive before it is a pattern. */
const COSTLY_SHARE = 0.15;
/** Share of the group deaths caught alone. */
const ISOLATED_SHARE = 0.25;
/** Radius, in game units, where the group counts as spread out. */
const GROUPED_RADIUS = 6_000;
const MIN_SAMPLE = 4;

const round = (value: number | null, digits = 0): number | null =>
  value === null ? null : Number(value.toFixed(digits));

function nameOf(players: PremadePlayer[], person: string): string | null {
  const hit = players.find((player) => player.id === person);
  const account =
    hit?.accounts.find((entry) => !entry.archived) ?? hit?.accounts[0];
  return account?.gameName ?? (hit ? hit.gameName : null);
}

/**
 * Rules read over the collected timelines. Everything here is an interpretation of sampled
 * positions and events: no voice, no intent, and no score (PREMADE_TIMELINE.md §7).
 */
export function buildTimelineRecommendations(
  timeline: TimelineMetrics,
  players: PremadePlayer[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const small = timeline.games < SMALL_TIMELINE_SAMPLE;
  const confidence = (level: Confidence): Confidence =>
    small && level !== "low" ? "medium" : small ? "low" : level;

  if (timeline.games === 0) {
    out.push({
      code: "noTimelines",
      kind: "warning",
      evidence: {},
      confidence: "low",
    });
    return out;
  }

  // 1. The curve: a lead that is not kept, or a team that wins from ahead.
  const fifteen = timeline.curve.find((point) => point.minute === 15);
  if (fifteen && fifteen.ahead >= MIN_SAMPLE) {
    const kept = fifteen.winRateAhead ?? 0;
    if (kept / 100 < LEAD_HELD) {
      out.push({
        code: "leadNotKept",
        kind: "warning",
        evidence: {
          ahead: fifteen.ahead,
          winRateAhead: round(kept, 1),
          lost: timeline.throws.lost,
          games: timeline.throws.games,
        },
        confidence: confidence(fifteen.ahead >= 20 ? "high" : "medium"),
      });
    } else if (kept / 100 >= 0.75) {
      out.push({
        code: "strongFromAhead",
        kind: "positive",
        evidence: { ahead: fifteen.ahead, winRateAhead: round(kept, 1) },
        confidence: confidence("medium"),
      });
    }
  }

  // 2. Objective timings: when the group takes them, and what it does after a kill.
  const dragon = timeline.objectives.dragon;
  if (
    dragon.first !== null &&
    dragon.games >= MIN_SAMPLE &&
    dragon.first > SLOW_FIRST_DRAGON
  ) {
    out.push({
      code: "slowDragons",
      kind: "warning",
      evidence: { seconds: round(dragon.first), games: dragon.games },
      confidence: confidence(dragon.games >= 10 ? "high" : "medium"),
    });
  }

  const tower = timeline.objectives.tower;
  const baron = timeline.objectives.baron;
  const slow: string[] = [];
  if (tower.first !== null && tower.first > SLOW_FIRST_TOWER)
    slow.push("tower");
  if (
    baron.first !== null &&
    baron.games >= MIN_SAMPLE &&
    baron.first > SLOW_FIRST_BARON
  )
    slow.push("baron");
  if (slow.length > 0) {
    out.push({
      code: "slowObjectives",
      kind: "warning",
      evidence: {
        tower: round(tower.first),
        baron: round(baron.first),
        towerGames: tower.games,
        baronGames: baron.games,
      },
      confidence: confidence("low"),
    });
  }

  const herald = timeline.objectives.herald;
  if (
    herald.first !== null &&
    herald.games >= MIN_SAMPLE &&
    herald.first > LATE_FIRST_HERALD
  ) {
    out.push({
      code: "lateHerald",
      kind: "warning",
      evidence: { seconds: round(herald.first), games: herald.games },
      confidence: confidence("low"),
    });
  }

  if (
    timeline.conversion.average !== null &&
    timeline.conversion.games >= MIN_SAMPLE &&
    timeline.conversion.average > CONVERSION_SLOW
  ) {
    out.push({
      code: "conversionSlow",
      kind: "warning",
      evidence: {
        seconds: round(timeline.conversion.average),
        kills: timeline.conversion.games,
      },
      confidence: confidence("low"),
    });
  }

  // 3. Deaths: the ones that cost an objective, and the ones caught alone.
  const deaths = timeline.deaths;
  if (deaths.total >= 20 && deaths.costly / deaths.total >= COSTLY_SHARE) {
    out.push({
      code: "costlyDeaths",
      kind: "warning",
      evidence: {
        costly: deaths.costly,
        total: deaths.total,
        perGame: round(deaths.perGame, 1),
        share: round((deaths.costly / deaths.total) * 100, 1),
      },
      confidence: confidence("medium"),
    });
  }
  if (deaths.total >= 20 && deaths.isolated / deaths.total >= ISOLATED_SHARE) {
    out.push({
      code: "isolatedDeaths",
      kind: "warning",
      evidence: {
        isolated: deaths.isolated,
        total: deaths.total,
        share: round((deaths.isolated / deaths.total) * 100, 1),
      },
      confidence: confidence("medium"),
    });
  }

  // 4. Grouping: distance between the group players at every sampled minute.
  if (
    timeline.grouping.groupedShare !== null &&
    timeline.grouping.groupedShare < 35
  ) {
    out.push({
      code: "scattered",
      kind: "warning",
      evidence: {
        grouped: round(timeline.grouping.groupedShare, 1),
        distance: round(timeline.grouping.averageDistance),
        nearKill: round(timeline.grouping.nearKill, 1),
      },
      confidence: confidence("medium"),
    });
  } else if (
    timeline.grouping.groupedShare !== null &&
    timeline.grouping.groupedShare >= 60
  ) {
    out.push({
      code: "watchTogether",
      kind: "positive",
      evidence: {
        grouped: round(timeline.grouping.groupedShare, 1),
        nearKill: round(timeline.grouping.nearKill, 1),
      },
      confidence: confidence("medium"),
    });
  }

  // 5. Who is far from the fights: simple average of the players' own presence.
  const rated = timeline.players.filter(
    (player) => player.presence !== null && player.deaths >= 3,
  );
  if (rated.length >= 3) {
    const mean =
      rated.reduce((sum, player) => sum + (player.presence ?? 0), 0) /
      rated.length;
    const lowest = [...rated].sort(
      (a, b) => (a.presence ?? 0) - (b.presence ?? 0),
    )[0];
    if (mean - (lowest.presence ?? 0) > 10) {
      out.push({
        code: "awayFromFights",
        kind: "warning",
        evidence: {
          player: nameOf(players, lowest.person) ?? lowest.person.slice(0, 6),
          presence: round(lowest.presence, 1),
          average: round(mean, 1),
          distance: round(lowest.averageDistance),
        },
        confidence: confidence("low"),
      });
    }
  }

  return out;
}

/** The radius the grouping metric uses, exported so the UI can explain the number. */
export const GROUPING_RADIUS = GROUPED_RADIUS;
