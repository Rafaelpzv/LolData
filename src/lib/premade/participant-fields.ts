// The extra per-participant fields of Match-V5 (migration 0010), kept in one place because the
// collection, the re-collection and the repository all have to agree on the exact key names.
// Pure: no I/O, no Next, no Supabase.
import type {
  Challenges,
  DamageBreakdown,
  MultiKills,
  ParticipantDerived,
  ParticipantPerks,
  ParticipantPings,
  PremadeParticipantSample,
} from "./types";

/**
 * Challenges stored. Every one is a per-game number the analysis uses; anything else Riot sends
 * (SWARM/Nexus Blitz counters, achievement flags) is dropped instead of bloating the row.
 */
export const CHALLENGE_KEYS = [
  "soloKills",
  "killParticipation",
  "goldPerMinute",
  "damagePerMinute",
  "visionScorePerMinute",
  "skillshotsHit",
  "skillshotsDodged",
  "stealthWardsPlaced",
  "controlWardsPlaced",
  "wardTakedowns",
  "wardsGuarded",
  "laneMinionsFirst10Minutes",
  "maxCsAdvantageOnLaneOpponent",
  "laningPhaseGoldExpAdvantage",
  "earlyLaningPhaseGoldExpAdvantage",
  "takedownOnFirstTurret",
  "firstTurretKilled",
  "legendaryCount",
  "soloBaronKills",
  "epicMonsterSteals",
  "turretPlatesTaken",
  "survivedSingleDigitHpCount",
  "outnumberedKills",
  "quickSoloKills",
] as const satisfies readonly (keyof Challenges)[];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function breakdown(source: Record<string, unknown>): DamageBreakdown | null {
  const physical = num(
    source.physicalDamageToChampions ??
      source.physicalDamageTaken ??
      source.physicalDamageDealt,
  );
  const magic = num(
    source.magicDamageToChampions ??
      source.magicDamageTaken ??
      source.magicDamageDealt,
  );
  const trueDamage = num(
    source.trueDamageToChampions ??
      source.trueDamageTaken ??
      source.trueDamageDealt,
  );
  if (physical === null && magic === null && trueDamage === null) return null;
  return { physical: physical ?? 0, magic: magic ?? 0, true: trueDamage ?? 0 };
}

/** Only the stat fields the analysis reads, or null when the row has nothing worth storing. */
export interface ParticipantFields {
  summoner1Id: number | null;
  summoner2Id: number | null;
  perks: ParticipantPerks | null;
  items: number[];
  largestKillingSpree: number | null;
  largestMultiKill: number | null;
  multiKills: MultiKills | null;
  doubleKills: number | null;
  tripleKills: number | null;
  quadraKills: number | null;
  pentaKills: number | null;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  damageTakenBreakdown: DamageBreakdown | null;
  damageDealtBreakdown: DamageBreakdown | null;
  damageSelfMitigated: number | null;
  totalHeal: number | null;
  totalHealsOnTeammates: number | null;
  totalDamageShieldedOnTeammates: number | null;
  timeCCingOthers: number | null;
  totalTimeSpentDead: number | null;
  longestTimeSpentLiving: number | null;
  goldSpent: number | null;
  damageDealtToObjectives: number | null;
  damageDealtToTurrets: number | null;
  turretKills: number | null;
  objectivesStolen: number | null;
  challenges: Challenges | null;
  /** Counters of every ping kind, when the game answered with them (migration 0012). */
  pings: ParticipantPings | null;
}

export function readPerks(raw: unknown): ParticipantPerks | null {
  const perks = raw as {
    statPerks?: Record<string, unknown>;
    styles?: {
      description?: unknown;
      style?: unknown;
      selections?: { perk?: unknown }[];
    }[];
  } | null;
  if (!perks) return null;
  const styles = Array.isArray(perks.styles) ? perks.styles : [];
  const primary = styles.find((style) => style.description === "primaryStyle");
  const secondary = styles.find((style) => style.description === "subStyle");
  const keystone = Number(primary?.style) > 0 ? keystoneOf(primary) : null;
  if (keystone === null && !primary) return null;
  return {
    keystone: keystone ?? 0,
    primary: Number(primary?.style) || 0,
    secondary: Number(secondary?.style) || 0,
    shards: [
      num(perks.statPerks?.offense) ?? 0,
      num(perks.statPerks?.flex) ?? 0,
      num(perks.statPerks?.defense) ?? 0,
    ],
  };
}

/** The first selected perk of the primary tree is the keystone. */
function keystoneOf(
  style: { selections?: { perk?: unknown }[] } | undefined,
): number | null {
  const first = Array.isArray(style?.selections)
    ? style?.selections[0]
    : undefined;
  return num(first?.perk);
}

/** The challenges worth keeping, ignoring the achievement and mode counters. */
export function readChallenges(raw: unknown): Challenges | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  let found = false;
  for (const key of CHALLENGE_KEYS) {
    const value = num(source[key]);
    if (value === null) continue;
    out[key] = value;
    found = true;
  }
  return found ? (out as Challenges) : null;
}

/** Everything Match-V5 gives about one participant that the sample still lacked. */
export function readParticipantFields(
  raw: Record<string, unknown>,
): ParticipantFields {
  const challenges = (
    raw.challenges && typeof raw.challenges === "object" ? raw.challenges : {}
  ) as Record<string, unknown>;
  return {
    summoner1Id: num(raw.summoner1Id),
    summoner2Id: num(raw.summoner2Id),
    perks: readPerks(raw.perks),
    items: Array.from(
      { length: 7 },
      (_, index) => num(raw[`item${index}`]) ?? 0,
    ),
    largestKillingSpree: num(raw.largestKillingSpree),
    largestMultiKill: num(raw.largestMultiKill),
    multiKills: {
      double: num(raw.doubleKills) ?? 0,
      triple: num(raw.tripleKills) ?? 0,
      quadra: num(raw.quadraKills) ?? 0,
      penta: num(raw.pentaKills) ?? 0,
    },
    doubleKills: num(raw.doubleKills),
    tripleKills: num(raw.tripleKills),
    quadraKills: num(raw.quadraKills),
    pentaKills: num(raw.pentaKills),
    firstBloodKill: raw.firstBloodKill === true,
    firstBloodAssist: raw.firstBloodAssist === true,
    damageTakenBreakdown: breakdown({
      physicalDamageTaken: raw.physicalDamageTaken,
      magicDamageTaken: raw.magicDamageTaken,
      trueDamageTaken: raw.trueDamageTaken,
    }),
    damageDealtBreakdown: breakdown({
      physicalDamageToChampions: raw.physicalDamageDealtToChampions,
      magicDamageToChampions: raw.magicDamageDealtToChampions,
      trueDamageToChampions: raw.trueDamageDealtToChampions,
    }),
    damageSelfMitigated: num(raw.damageSelfMitigated),
    totalHeal: num(raw.totalHeal),
    totalHealsOnTeammates: num(raw.totalHealsOnTeammates),
    totalDamageShieldedOnTeammates: num(raw.totalDamageShieldedOnTeammates),
    timeCCingOthers: num(raw.timeCCingOthers),
    totalTimeSpentDead: num(raw.totalTimeSpentDead),
    longestTimeSpentLiving: num(raw.longestTimeSpentLiving),
    goldSpent: num(raw.goldSpent),
    damageDealtToObjectives: num(raw.damageDealtToObjectives),
    damageDealtToTurrets: num(raw.damageDealtToTurrets),
    turretKills: num(raw.turretKills),
    objectivesStolen: num(raw.objectivesStolen),
    challenges: readChallenges(challenges),
    pings: (raw.pings && typeof raw.pings === "object"
      ? raw.pings
      : null) as ParticipantPings | null,
  };
}

/** A game whose stored participants already carry the fields (so it is never fetched again). */
export function hasFields(
  row: { fields?: unknown } | null | undefined,
): boolean {
  return Boolean(row && row.fields && typeof row.fields === "object");
}

/** The sample without the depth fields, and those fields on their own. */
export function splitParticipantFields(participant: PremadeParticipantSample): {
  sample: PremadeParticipantSample;
  fields: ParticipantFields | null;
  derived: ParticipantDerived | null;
} {
  const { derived, ...rest } = participant;
  const sample = { ...rest } as PremadeParticipantSample;
  const fields: Partial<ParticipantFields> = {};
  const target = fields as Record<string, unknown>;
  const source = rest as unknown as Record<string, unknown>;
  for (const key of PARTICIPANT_FIELD_KEYS) {
    if (key in source && source[key] !== undefined) target[key] = source[key];
    delete (sample as unknown as Record<string, unknown>)[key];
  }
  const hasAny = PARTICIPANT_FIELD_KEYS.some((key) => key in fields);
  return {
    sample,
    fields: hasAny ? (fields as ParticipantFields) : null,
    derived: derived ?? null,
  };
}

/** The keys `splitParticipantFields` moves into the dedicated jsonb column. */
export const PARTICIPANT_FIELD_KEYS = [
  "summoner1Id",
  "summoner2Id",
  "perks",
  "items",
  "largestKillingSpree",
  "largestMultiKill",
  "multiKills",
  "doubleKills",
  "tripleKills",
  "quadraKills",
  "pentaKills",
  "firstBloodKill",
  "firstBloodAssist",
  "damageTakenBreakdown",
  "damageDealtBreakdown",
  "damageSelfMitigated",
  "totalHeal",
  "totalHealsOnTeammates",
  "totalDamageShieldedOnTeammates",
  "timeCCingOthers",
  "totalTimeSpentDead",
  "longestTimeSpentLiving",
  "goldSpent",
  "damageDealtToObjectives",
  "damageDealtToTurrets",
  "turretKills",
  "objectivesStolen",
  "challenges",
  "pings",
] as const satisfies readonly (keyof ParticipantFields)[];
