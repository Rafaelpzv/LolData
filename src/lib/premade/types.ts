// Premade Flex 5x5 domain types. Pure shapes only: they never import Next or Supabase.

/** One team slot, in the order the team was registered (three to five slots). */
export interface PremadeMember {
  puuid: string;
  gameName: string;
  tagLine: string;
  slot: number;
  /** Roster entries added after the team exists can be archived instead of deleted. */
  archived?: boolean;
}

/** One account (Riot ID / PUUID) of a person. An archived account keeps its past games. */
export interface PremadeAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
  archived?: boolean;
}

/** A person: one or more accounts. Games and metrics count people, never accounts. */
export interface PremadePlayer {
  id: string;
  gameName: string;
  slot: number;
  archived?: boolean;
  accounts: PremadeAccount[];
}

/** Last Riot portrait of one account: profile icon and level (Summoner-V4) plus the ranked queue. */
export interface AccountRank {
  puuid: string;
  profileIconId: number | null;
  summonerLevel: number | null;
  /** The queue the tier comes from; null when the account has no ranked entry. */
  queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | null;
  /** "EMERALD", "DIAMOND"… uppercase as Riot sends it. */
  tier: string | null;
  /** "I".."IV"; null for apex tiers and unranked accounts. */
  division: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  /** Both queues as Riot answered them, so the page can switch queues without another call. */
  flex: RankQueueCache | null;
  solo: RankQueueCache | null;
  /** When Riot answered for this account; null when the last attempt failed. */
  fetchedAt: string | null;
}

/** One queue of a cached account, ready to become the displayed rank (declared in ./ranks). */
export type { RankQueueCache } from "./ranks";
import type { RankQueueCache } from "./ranks";

/** Which person a roster account belongs to. Empty: the account is not on the roster. */
export type AccountOwners = Readonly<Record<string, string>>;

export interface PremadeTeam {
  id: string;
  slug: string;
  name: string;
  region: string;
  createdAt: string;
  members: PremadeMember[];
}

/** Objective counts of one team side, from `info.teams[].objectives`. */
export interface TeamObjectives {
  baron: { first: boolean; kills: number };
  champion: { first: boolean; kills: number };
  dragon: { first: boolean; kills: number };
  inhibitor: { first: boolean; kills: number };
  riftHerald: { first: boolean; kills: number };
  tower: { first: boolean; kills: number };
}

/** Every ping counter of a participant (habits, not quality). */
export interface ParticipantPings {
  allInPings: number;
  assistMePings: number;
  basicPings: number;
  commandPings: number;
  dangerPings: number;
  enemyMissingPings: number;
  enemyVisionPings: number;
  getBackPings: number;
  holdPings: number;
  needVisionPings: number;
  onMyWayPings: number;
  pushPings: number;
  retreatPings: number;
  visionClearedPings: number;
}

/** Runes of a participant: keystone, primary and secondary tree, and the three stat shards. */
export interface ParticipantPerks {
  keystone: number;
  primary: number;
  secondary: number;
  shards: number[];
}

/** Damage by type (physical, magic, true) for the damage dealt to champions and taken. */
export interface DamageBreakdown {
  physical: number;
  magic: number;
  true: number;
}

/** Multi-kill counters of one game. */
export interface MultiKills {
  double: number;
  triple: number;
  quadra: number;
  penta: number;
}

/** Objectives the whole side took, from `info.teams[].objectives`: one row per game. */
export interface SideObjectiveTotals {
  turret: number;
  dragon: number;
  baron: number;
  inhibitor: number;
}

/**
 * One roster player in one collected match. Only the fields the metrics read, already
 * normalised away from the Riot payload; null means the field was absent for that match.
 */
export interface PremadeParticipantSample {
  puuid: string;
  /** The person who owns the account; defaults to the puuid when unknown. */
  /** Person that played it; `null` when the lineup no longer counts this account. */
  accountId?: string | null;
  /** Champion played and the lane: stored per game so the analysis can group by both. */
  championId: number;
  championName: string;
  teamPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  champExperience: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  /** Share of the side's damage the participant dealt, 0..1 (Riot sends it as a fraction). */
  damageShare?: number | null;
  /** Gold share of the side, 0..1. */
  goldShare?: number | null;
  /** Objectives the participant personally took: turrets, dragons, barons. */
  turretTakedowns?: number | null;
  dragonTakedowns?: number | null;
  baronTakedowns?: number | null;
  /** Control wards bought and wards destroyed beyond the vision score. */
  visionWardsBoughtInGame?: number | null;
  detectorWardsPlaced?: number | null;
  /** Whether the participant was on the winning side. */
  win?: boolean;
  /** Champion level at the end of the game. */
  champLevel?: number | null;
  /** Kills with the whole team involved: the feeding signal is being caught alone. */
  soloKills?: number | null;
  /** Kills taken with help: a low share of the team's kills hints at isolated play. */
  killParticipation?: number | null;
  pings: ParticipantPings | null;
  // ---- Migration 0010: the rest of what Match-V5 gives per participant. All optional, so a game
  // saved before this migration (or recounted later) keeps working and reads as "no data". ----
  /** Summoner spell ids. */
  summoner1Id?: number | null;
  summoner2Id?: number | null;
  perks?: ParticipantPerks | null;
  /** Final build: item0..item6 (0 is an empty slot). */
  items?: number[];
  /** Kill spree and multi-kills. */
  largestKillingSpree?: number | null;
  largestMultiKill?: number | null;
  multiKills?: MultiKills | null;
  doubleKills?: number | null;
  tripleKills?: number | null;
  quadraKills?: number | null;
  pentaKills?: number | null;
  firstBloodKill?: boolean | null;
  firstBloodAssist?: boolean | null;
  /** Damage taken split by type and what was mitigated. */
  damageTakenBreakdown?: DamageBreakdown | null;
  damageDealtBreakdown?: DamageBreakdown | null;
  damageSelfMitigated?: number | null;
  totalHeal?: number | null;
  totalHealsOnTeammates?: number | null;
  totalDamageShieldedOnTeammates?: number | null;
  timeCCingOthers?: number | null;
  totalTimeSpentDead?: number | null;
  longestTimeSpentLiving?: number | null;
  goldSpent?: number | null;
  /** Objectives: damage to them, and the ones this participant closed by themselves. */
  damageDealtToObjectives?: number | null;
  damageDealtToTurrets?: number | null;
  turretKills?: number | null;
  objectivesStolen?: number | null;
  /** Challenges worth reading; only the keys listed in `type Challenges`. */
  challenges?: Challenges | null;
  /** Values the timeline already derived for this game (first item, skill order, lane lead). */
  derived?: ParticipantDerived | null;
}

/** The challenges stored (see `Challenges` in collect.ts); every one is a per-game number. */
export interface Challenges {
  soloKills?: number | null;
  killParticipation?: number | null;
  goldPerMinute?: number | null;
  damagePerMinute?: number | null;
  visionScorePerMinute?: number | null;
  skillshotsHit?: number | null;
  skillshotsDodged?: number | null;
  stealthWardsPlaced?: number | null;
  controlWardsPlaced?: number | null;
  wardTakedowns?: number | null;
  wardsGuarded?: number | null;
  laneMinionsFirst10Minutes?: number | null;
  maxCsAdvantageOnLaneOpponent?: number | null;
  laningPhaseGoldExpAdvantage?: number | null;
  earlyLaningPhaseGoldExpAdvantage?: number | null;
  takedownOnFirstTurret?: number | null;
  firstTurretKilled?: number | null;
  legendaryCount?: number | null;
  soloBaronKills?: number | null;
  epicMonsterSteals?: number | null;
  turretPlatesTaken?: number | null;
  survivedSingleDigitHpCount?: number | null;
  outnumberedKills?: number | null;
  quickSoloKills?: number | null;
}

/**
 * Fields the Match-V5 timeline adds to a participant. They are saved on the match row by the
 * timeline collection (migration 0010), never in a payload of their own.
 */
export interface ParticipantDerived {
  /** Items in purchase order, each with the second the purchase completed. */
  purchases: { itemId: number; at: number }[];
  /** First finished item (non-component): id and second, null when the game never finished one. */
  firstCompletedItem: { itemId: number; at: number } | null;
  /** Build order: the order the finished items were completed in. */
  completedOrder: number[];
  /** Skill order as slot numbers (1..4), one per level up. */
  skillOrder: number[];
  /** Lane numbers at 10 and 15 minutes against the enemy on the same teamPosition. */
  laning: {
    at: number;
    cs: number;
    xp: number;
    gold: number;
    enemyCs: number;
    enemyXp: number;
    enemyGold: number;
  }[];
}

/**
 * A valid premade match: the queue-440 game where enough roster people shared a side.
 * Timeline fields are deliberately absent: Match Timeline is out of the MVP, but every metric
 * takes this shape, so adding it later does not touch the callers.
 */
export interface PremadeMatchSample {
  matchId: string;
  /** Game end (or start) in epoch ms. */
  gameCreation: number;
  /** Season the game belongs to, for period comparison later. */
  season: number;
  win: boolean;
  duration: number;
  /** 100 or 200, the side the roster played on. */
  teamSide: number;
  objectives: TeamObjectives;
  /** Only what the derived metrics need (e.g. the team's dragon count): small on purpose. */
  champLevel: number;
  turretTakedowns: number;
  /** Kills and gold of the whole side (the roster plus any random fillers). */
  teamKills: number;
  teamGold: number;
  /** Side totals taken from the match, not summed from the roster (they include the fillers). */
  teamDeaths?: number | null;
  teamDamage?: number | null;
  /**
   * Assists of the WHOLE side (fillers included). Match-V5 has no team total for assists, so the
   * collector sums every participant of the side; rows saved before this field fall back to the
   * roster sum, and `collect() === 0` there, which the metrics check before trusting it.
   */
  sideAssists?: number | null;
  teamObjectivesTaken?: {
    turret: number;
    dragon: number;
    baron: number;
    inhibitor: number;
  } | null;
  /** Objectives lost: what the enemy side took over the same game. */
  enemyObjectivesTaken?: {
    turret: number;
    dragon: number;
    baron: number;
    inhibitor: number;
  } | null;
  /** The enemy side's gold, for the actual gold lead. */
  enemyGold?: number | null;
  /** Match mode (CLASSIC only is collected today); kept so a future mode filter is explicit. */
  gameMode?: string | null;
  /** Side totals of the whole team (the roster plus any fillers), from `info.teams[].objectives`. */
  sideObjectives?: SideObjectiveTotals | null;
  /** Seconds from the timeline, when it was collected: the per-minute numbers prefer it. */
  timelineDuration?: number | null;
  /** Damage the whole side dealt to champions and took (fillers included). */
  sideDamage?: number | null;
  sideDamageTaken?: number | null;
  /** PUUIDs of the roster accounts that actually played this game. */
  participants: PremadeParticipantSample[];
}
