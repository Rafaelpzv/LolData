// Match-V5 -> PremadeMatchSample. Pure: no I/O, no Next, no Supabase.
import type {
  AccountOwners,
  ParticipantPings,
  PremadeMatchSample,
  PremadeParticipantSample,
  SideObjectiveTotals,
  TeamObjectives,
} from "./types";
import { readParticipantFields } from "./participant-fields";

/** Premade is only ever ranked Flex 5x5. */
export const PREMADE_QUEUE_ID = 440;
/** A full side. A bigger roster can bring more than that across games. */
export const TEAM_SIDE_SIZE = 5;
/** People needed on the same side for a game to count, by default: a full side of the roster. */
export const DEFAULT_MIN_PEOPLE = 5;
/** The minimum the rule accepts: counting anything less stops being a premade analysis. */
export const MIN_PEOPLE_FLOOR = 2;
/** Shorter games are remakes and carry no signal. */
export const REMAKE_SECONDS = 300;

const EMPTY_OBJECTIVE = { first: false, kills: 0 };

const five = (side: number) => side === 100 || side === 200;

/** Clamps a caller-supplied minimum to what a Flex side can hold. */
export function normalizeMinPeople(minPeople: number): number {
  return Math.min(
    TEAM_SIDE_SIZE,
    Math.max(MIN_PEOPLE_FLOOR, Math.trunc(minPeople) || DEFAULT_MIN_PEOPLE),
  );
}

/** The person behind an account. Without a roster (or an unknown account) it is the account itself. */
function personOf(puuid: string, owners?: AccountOwners): string {
  return owners?.[puuid] ?? puuid;
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** How many of each objective a side took, read from `teams[].objectives`. */
function objectiveTotals(
  raw: Record<string, { kills?: unknown }> | null,
): SideObjectiveTotals {
  return {
    turret: num(raw?.["tower"]?.["kills"]),
    dragon: num(raw?.["dragon"]?.["kills"]),
    baron: num(raw?.["baron"]?.["kills"]),
    inhibitor: num(raw?.["inhibitor"]?.["kills"]),
  };
}

/** A number as sent, or null: unlike `num`, a missing field is not a zero. */
function rawNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function objectives(raw: unknown): TeamObjectives {
  const source = (raw ?? {}) as Record<
    string,
    { first?: unknown; kills?: unknown }
  >;
  const pick = (key: keyof TeamObjectives) => {
    const value = source[key];
    if (!value) return EMPTY_OBJECTIVE;
    return { first: bool(value.first), kills: num(value.kills) };
  };
  return {
    baron: pick("baron"),
    champion: pick("champion"),
    dragon: pick("dragon"),
    inhibitor: pick("inhibitor"),
    riftHerald: pick("riftHerald"),
    tower: pick("tower"),
  };
}

function pings(raw: Record<string, unknown>): ParticipantPings | null {
  // Match-V5 sends the counters flat on the participant (`getBackPings`, `dangerPings`...), never
  // nested under `pings`: the nested shape is kept as a fallback for older payloads.
  const nested =
    raw.pings && typeof raw.pings === "object"
      ? (raw.pings as Record<string, unknown>)
      : {};
  const source = { ...nested, ...flatPings(raw) };
  if (Object.keys(source).length === 0) return null;
  return {
    allInPings: num(source.allInPings),
    assistMePings: num(source.assistMePings),
    basicPings: num(source.basicPings),
    commandPings: num(source.commandPings),
    dangerPings: num(source.dangerPings),
    enemyMissingPings: num(source.enemyMissingPings),
    enemyVisionPings: num(source.enemyVisionPings),
    getBackPings: num(source.getBackPings),
    holdPings: num(source.holdPings),
    needVisionPings: num(source.needVisionPings),
    onMyWayPings: num(source.onMyWayPings),
    pushPings: num(source.pushPings),
    retreatPings: num(source.retreatPings),
    visionClearedPings: num(source.visionClearedPings),
  };
}

/** The ping counters of the raw participant, the shape Match-V5 sends. */
function flatPings(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
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
  ]) {
    if (typeof raw[key] === "number") out[key] = raw[key];
  }
  return out;
}

function participant(
  raw: Record<string, unknown>,
  owners?: AccountOwners,
  win?: boolean,
): PremadeParticipantSample {
  const puuid = String(raw.puuid ?? "");
  const challenges = (
    raw.challenges && typeof raw.challenges === "object" ? raw.challenges : {}
  ) as Record<string, unknown>;
  // Solo kills: the participant field when it comes, the challenge otherwise.
  const soloKills = rawNumber(raw.soloKills);
  const fields = readParticipantFields(raw);
  // The depth fields (migration 0010) are stored apart from the sample: the analysis reads them
  // merged, and a game saved before they existed simply has none.
  if (soloKills !== null)
    fields.challenges = { ...(fields.challenges ?? {}), soloKills };
  return {
    ...fields,
    puuid,
    accountId: personOf(puuid, owners),
    championId: num(raw.championId),
    championName: String(raw.championName ?? ""),
    teamPosition: String(raw.teamPosition ?? ""),
    kills: num(raw.kills),
    deaths: num(raw.deaths),
    assists: num(raw.assists),
    goldEarned: num(raw.goldEarned),
    champExperience: num(raw.champExperience),
    totalMinionsKilled: num(raw.totalMinionsKilled),
    neutralMinionsKilled: num(raw.neutralMinionsKilled),
    visionScore: num(raw.visionScore),
    wardsPlaced: num(raw.wardsPlaced),
    wardsKilled: num(raw.wardsKilled),
    totalDamageDealtToChampions: num(raw.totalDamageDealtToChampions),
    totalDamageTaken: num(raw.totalDamageTaken),
    // Shares and objective takedowns are what a rating needs: a total alone says nothing about
    // how much of the side's work the participant did, or whether they finished it.
    damageShare: fraction(raw.teamDamagePercentage),
    goldShare: fraction(challenges.goldTeamShare),
    turretTakedowns: challengeOrNull(
      raw.turretTakedowns ?? challenges.turretTakedowns,
    ),
    dragonTakedowns: challengeOrNull(challenges.dragonTakedowns),
    baronTakedowns: challengeOrNull(
      raw.baronKills ?? challenges.baronTakedowns,
    ),
    visionWardsBoughtInGame: challengeOrNull(raw.visionWardsBoughtInGame),
    detectorWardsPlaced: challengeOrNull(raw.detectorWardsPlaced),
    win,
    champLevel: challengeOrNull(raw.champLevel),
    soloKills: challengeOrNull(challenges.soloKills),
    killParticipation: fraction(challenges.killParticipation),
    pings: pings(raw),
  };
}

/** A 0..1 share, accepting both Riot shapes: 0.37 and 37. */
function fraction(value: unknown): number | null {
  const n = rawNumber(value);
  if (n === null || n < 0) return null;
  // Above 1 it was sent in percent; below it is already a fraction.
  return n > 1 ? n / 100 : n;
}

function challengeOrNull(value: unknown): number | null {
  return rawNumber(value);
}

/**
 * A match only counts when at least `minPeople` distinct roster people are on the same side of a
 * queue-440 game. Accounts are grouped by their owner first: one person with two accounts counts
 * once. The sample keeps only the roster accounts that actually played it.
 * Returns null otherwise (other queue, too few people, remake, missing payload).
 */
export function toMatchSample(
  raw: unknown,
  teamPuuids: readonly string[],
  minPeople: number = DEFAULT_MIN_PEOPLE,
  owners?: AccountOwners,
): PremadeMatchSample | null {
  const match = raw as {
    metadata?: { matchId?: unknown };
    info?: Record<string, unknown>;
  } | null;
  const info = match?.info;
  const matchId = match?.metadata?.matchId;
  if (!info || typeof matchId !== "string" || teamPuuids.length === 0)
    return null;

  if (num(info.queueId) !== PREMADE_QUEUE_ID) return null;
  if (num(info.gameDuration) < REMAKE_SECONDS) return null;

  const required = normalizeMinPeople(minPeople);
  const participants = Array.isArray(info.participants)
    ? (info.participants as Record<string, unknown>[])
    : [];
  const byPuuid = new Map(participants.map((p) => [String(p.puuid ?? ""), p]));
  const roster = [...new Set(teamPuuids)];
  const present = roster.flatMap((puuid) => {
    const player = byPuuid.get(puuid);
    return player ? [player] : [];
  });
  if (present.length === 0) return null;

  // The side where the roster is: the one holding most of them, then the one that holds the team.
  const peopleOnSide = (players: Record<string, unknown>[]) =>
    new Set(
      players.map((player) => personOf(String(player.puuid ?? ""), owners)),
    ).size;
  const bySide = new Map<number, Record<string, unknown>[]>();
  for (const player of present) {
    const side = num(player.teamId);
    bySide.set(side, [...(bySide.get(side) ?? []), player]);
  }
  const side = [...bySide.entries()]
    .filter(([id, players]) => five(id) && peopleOnSide(players) >= required)
    .sort((a, b) => peopleOnSide(b[1]) - peopleOnSide(a[1]))[0]?.[0];
  if (side === undefined) return null;

  const group = present.filter((player) => num(player.teamId) === side);
  if (group.some((p) => p.gameEndedInEarlySurrender === true)) return null;

  const team = (
    Array.isArray(info.teams) ? (info.teams as Record<string, unknown>[]) : []
  ).find((t) => num(t.teamId) === side);

  const teamParticipants = participants.filter((p) => num(p.teamId) === side);
  const teamKills = teamParticipants.reduce((sum, p) => sum + num(p.kills), 0);
  const teamGold = teamParticipants.reduce(
    (sum, p) => sum + num(p.goldEarned),
    0,
  );
  const teamLevels = teamParticipants.reduce(
    (sum, p) => sum + num(p.champLevel),
    0,
  );
  const teamTotals = {
    deaths: teamParticipants.reduce((sum, p) => sum + num(p.deaths), 0),
    damage: teamParticipants.reduce(
      (sum, p) => sum + num(p.totalDamageDealtToChampions),
      0,
    ),
  };
  // The enemy side, for the actual gold lead: the match carries both sides.
  const enemySide = side === 100 ? 200 : 100;
  const enemyParticipants = participants.filter(
    (p) => num(p.teamId) === enemySide,
  );
  const enemyGold =
    enemyParticipants.length > 0
      ? enemyParticipants.reduce((sum, p) => sum + num(p.goldEarned), 0)
      : null;
  const ownObjectives = (team?.objectives ?? null) as Record<
    string,
    { kills?: unknown }
  > | null;
  const enemyTeam = (
    Array.isArray(info.teams) ? (info.teams as Record<string, unknown>[]) : []
  ).find((t) => num(t.teamId) === enemySide);
  const enemyObjectives = (enemyTeam?.objectives ?? null) as Record<
    string,
    { kills?: unknown }
  > | null;

  return {
    matchId,
    gameCreation:
      num(info.gameEndTimestamp) ||
      num(info.gameStartTimestamp) ||
      num(info.gameCreation),
    season: num(info.gameSeasonId) || 0,
    win: bool(group[0]?.win),
    duration: num(info.gameDuration),
    teamSide: side,
    objectives: objectives(team?.objectives),
    champLevel: teamLevels,
    // The team's turrets are the side's, read from `info.teams`, never the sum of the participants.
    turretTakedowns: objectiveTotals(ownObjectives).turret,
    // Team totals only the metrics read; the raw payload is never stored.
    teamKills,
    teamGold,
    // Totals of the whole side, fillers included: the roster is not the only one playing it.
    teamDeaths: teamTotals.deaths,
    teamDamage: teamTotals.damage,
    // Match-V5 gives no team assists: the side's five participants are the only way to total them.
    sideAssists: teamParticipants.reduce((sum, p) => sum + num(p.assists), 0),
    teamObjectivesTaken: objectiveTotals(ownObjectives),
    enemyObjectivesTaken: objectiveTotals(enemyObjectives),
    enemyGold,
    gameMode: typeof info.gameMode === "string" ? info.gameMode : null,
    // Turrets, dragons and barons belong to the side, not to the five people who closed them:
    // summing `turretTakedowns` counted the same tower once per participant.
    sideObjectives: objectiveTotals(ownObjectives),
    sideDamage: teamTotals.damage,
    sideDamageTaken: teamParticipants.reduce(
      (sum, p) => sum + num(p.totalDamageTaken),
      0,
    ),
    // Only the roster accounts present in this game: nobody else is measured.
    participants: group.map((p) => {
      const sample = participant(p, owners, bool(p.win));
      // Riot sends the damage share as a challenge that is not always present: the side total the
      // match already carries is the reliable way to know how much of the work this one did.
      if (sample.damageShare === null && teamTotals.damage > 0) {
        sample.damageShare =
          sample.totalDamageDealtToChampions / teamTotals.damage;
      }
      return sample;
    }),
  };
}

/** Distinct people of the roster that a match would count, on its best side. */
export function peopleOnBestSide(
  raw: unknown,
  teamPuuids: readonly string[],
  owners?: AccountOwners,
): number {
  const info = (raw as { info?: Record<string, unknown> } | null)?.info;
  const participants = Array.isArray(info?.participants)
    ? (info!.participants as Record<string, unknown>[])
    : [];
  const roster = new Set(teamPuuids);
  const bySide = new Map<number, Set<string>>();
  for (const p of participants) {
    const puuid = String(p.puuid ?? "");
    if (!roster.has(puuid)) continue;
    const side = num(p.teamId);
    if (!five(side)) continue;
    const people = bySide.get(side) ?? new Set<string>();
    people.add(personOf(puuid, owners));
    bySide.set(side, people);
  }
  return Math.max(0, ...[...bySide.values()].map((people) => people.size));
}

/** Games counted per minimum, so the UI can show how many games each level brings. */
export type MinPeopleTiers = Record<number, number>;

/** How many downloaded games qualify for each minimum from 2 to 5 people. */
export function tierCounts(
  raw: readonly unknown[],
  teamPuuids: readonly string[],
  owners?: AccountOwners,
): MinPeopleTiers {
  const tiers: MinPeopleTiers = { 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const match of raw) {
    const people = peopleOnBestSide(match, teamPuuids, owners);
    for (const level of Object.keys(tiers).map(Number)) {
      if (people >= level) tiers[level] += 1;
    }
  }
  return tiers;
}

/** Deduplicates a batch of raw matches and keeps only the valid premade games. */
export function collectMatchSamples(
  raw: readonly unknown[],
  teamPuuids: readonly string[],
  minPeople: number = DEFAULT_MIN_PEOPLE,
  owners?: AccountOwners,
): PremadeMatchSample[] {
  const seen = new Set<string>();
  const samples: PremadeMatchSample[] = [];
  for (const match of raw) {
    const sample = toMatchSample(match, teamPuuids, minPeople, owners);
    if (!sample || seen.has(sample.matchId)) continue;
    seen.add(sample.matchId);
    samples.push(sample);
  }
  return samples.sort((a, b) => b.gameCreation - a.gameCreation);
}

/** Why a downloaded game does not qualify. Null means it qualifies. */
export function rejectionReason(
  raw: unknown,
  teamPuuids: readonly string[],
  minPeople: number = DEFAULT_MIN_PEOPLE,
  owners?: AccountOwners,
): string | null {
  const match = raw as {
    metadata?: { matchId?: unknown };
    info?: Record<string, unknown>;
  } | null;
  const info = match?.info;
  if (!info || typeof match?.metadata?.matchId !== "string") return "noPayload";
  if (num(info.queueId) !== PREMADE_QUEUE_ID) return "wrongQueue";
  if (num(info.gameDuration) < REMAKE_SECONDS) return "remake";

  const required = normalizeMinPeople(minPeople);
  const participants = Array.isArray(info.participants)
    ? (info.participants as Record<string, unknown>[])
    : [];
  const roster = new Set(teamPuuids);
  const present = participants.filter((p) => roster.has(String(p.puuid ?? "")));
  const people = new Set(
    present.map((p) => personOf(String(p.puuid ?? ""), owners)),
  );
  if (people.size < required) return "fewRosterPlayers";
  if (peopleOnBestSide(raw, teamPuuids, owners) < required)
    return "rosterSplitAcrossSides";
  if (present.some((p) => p.gameEndedInEarlySurrender === true))
    return "earlySurrender";
  return null;
}
