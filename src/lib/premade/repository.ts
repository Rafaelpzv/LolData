// Supabase access for premades. Server-only: every write uses the service-role client.
import { supabaseAdmin } from "@/lib/supabase";

import { PREMADE_MIN_SIZE } from "./members";
import {
  RANK_REFRESH_MS,
  toTier,
  type AccountRanks,
  type RankedQueue,
  type RankQueueCache,
} from "./ranks";
import {
  splitParticipantFields,
  type ParticipantFields,
} from "./participant-fields";
import type { ParticipantPings } from "./types";
import type {
  AccountOwners,
  AccountRank,
  ParticipantDerived,
  PremadeAccount,
  PremadeMatchSample,
  PremadeMember,
  PremadeParticipantSample,
  PremadePlayer,
  PremadeTeam,
  TeamObjectives,
} from "./types";
import type { PremadeTimeline } from "./timeline";

/** Aggregate numbers of the team side stored next to the roster players. */
export interface TeamTotals {
  champLevel: number;
  turretTakedowns: number;
  teamKills: number;
  teamGold: number;
  /** Added with the side KDA: games saved before it simply do not carry the key. */
  teamDeaths?: number;
  sideAssists?: number;
  sideDamage?: number;
}

/** Side aggregates of migration 0010: objectives of the side and the damage of the whole side. */
interface MatchFieldsRow {
  match_id: string;
  side_objectives: PremadeMatchSample["sideObjectives"];
  side_damage: number | null;
  side_damage_taken: number | null;
}

interface MatchRow {
  match_id: string;
  /** The people this game counted; older rows list the accounts that played instead. */
  person_puuids?: string[] | null;
  game_creation: number;
  win: boolean;
  duration: number;
  team_side: number;
  objectives: TeamObjectives;
  team_totals: TeamTotals;
  participants: PremadeParticipantSample[];
  game_version: string | null;
}

/**
 * The side totals of one game, from the participants stored for it. `teamDeaths` and `sideAssists`
 * were computed by the collector and never written (`team_totals` kept only four keys), so a stored
 * game can reach the metrics without them. The side of a Flex game holds exactly five participants,
 * so their sum IS the side total, not a cut of the roster.
 *
 * Returns null when the row does not hold a complete side: a partial sum must never be labelled as
 * the side's (prompt §2.3).
 */
export function sideTotalsFromParticipants(
  participants: readonly Pick<PremadeParticipantSample, "deaths" | "assists">[],
): { teamDeaths: number; sideAssists: number } | null {
  if (participants.length !== 5) return null;
  return {
    teamDeaths: participants.reduce((sum, p) => sum + p.deaths, 0),
    sideAssists: participants.reduce((sum, p) => sum + p.assists, 0),
  };
}

function toMatchSample(
  row: MatchRow,
  fields?: MatchFieldsRow | null,
): PremadeMatchSample {
  const participants = row.participants ?? [];
  // A game stored before the collector persisted the side totals (or before it existed) is
  // reconstructed from what it does have, so the KDA is the side's instead of a roster cut.
  const repaired =
    row.team_totals?.teamDeaths == null || row.team_totals?.sideAssists == null
      ? sideTotalsFromParticipants(participants)
      : null;
  return {
    matchId: row.match_id,
    gameCreation: Number(row.game_creation),
    season: 0,
    win: row.win,
    duration: row.duration,
    teamSide: row.team_side,
    objectives: row.objectives,
    ...row.team_totals,
    // Old rows have no side totals: `undefined` is "not stored", never a zero that would be average.
    teamDeaths: row.team_totals?.teamDeaths ?? repaired?.teamDeaths ?? null,
    teamDamage: row.team_totals?.sideDamage ?? null,
    sideAssists: row.team_totals?.sideAssists ?? repaired?.sideAssists ?? null,
    sideObjectives: fields?.side_objectives ?? null,
    sideDamage: fields?.side_damage ?? null,
    sideDamageTaken: fields?.side_damage_taken ?? null,
    participants,
  };
}

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  created_at: string;
}

interface MemberRow {
  team_id: string;
  puuid: string;
  game_name: string;
  tag_line: string;
  slot: number;
  archived_at: string | null;
}

function toMember(row: MemberRow): PremadeMember {
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    slot: row.slot,
    archived: row.archived_at !== null,
  };
}

/** Active lineup by default; archived members are only kept for collection and history. */
async function getMembers(
  teamId: string,
  includeArchived = false,
): Promise<PremadeMember[]> {
  let query = supabaseAdmin
    .from("premade_team_members")
    .select("team_id, puuid, game_name, tag_line, slot, archived_at")
    .eq("team_id", teamId)
    .order("slot", { ascending: true });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data as MemberRow[] | null)?.map(toMember) ?? [];
}

/** Adds a member after the team exists. The slot is the next free one. */
export async function addMember(
  teamId: string,
  member: { puuid: string; gameName: string; tagLine: string },
): Promise<void> {
  const members = await getMembers(teamId, true);
  const taken = new Set(members.map((m) => m.slot));
  let slot = 0;
  while (taken.has(slot)) slot += 1;

  const { error } = await supabaseAdmin
    .from("premade_team_members")
    .insert({
      team_id: teamId,
      slot,
      game_name: member.gameName,
      tag_line: member.tagLine,
      puuid: member.puuid,
    });
  if (error) throw error;
}

/**
 * Removes a member. Their past games stay: the row is archived so collection still knows the
 * roster of that period. A lineup must always keep at least three players.
 */
export async function removeMember(
  teamId: string,
  puuid: string,
): Promise<void> {
  const active = await getMembers(teamId);
  if (active.length <= PREMADE_MIN_SIZE) throw new Error("rosterTooSmall");

  const { error } = await supabaseAdmin
    .from("premade_team_members")
    .update({ archived_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("puuid", puuid);
  if (error) throw error;
}

export async function createTeam(team: {
  slug: string;
  name: string;
  region: string;
  members: PremadeMember[];
}): Promise<PremadeTeam> {
  const { data, error } = await supabaseAdmin
    .from("premade_teams")
    .insert({ slug: team.slug, name: team.name, region: team.region })
    .select("id, slug, name, region, created_at")
    .single();
  if (error) throw error;
  const row = data as TeamRow;

  const { error: membersError } = await supabaseAdmin
    .from("premade_team_members")
    .insert(
      team.members.map((member) => ({
        team_id: row.id,
        ...toMemberRow(member),
      })),
    );
  if (membersError) {
    // Do not leave a team without its players behind.
    await supabaseAdmin.from("premade_teams").delete().eq("id", row.id);
    throw membersError;
  }

  // One person per registrable slot, each with the account typed on it. The slot is the insert
  // order, so registering three slots leaves the people on slots 0..2.
  for (const member of team.members) {
    await addPlayer(row.id, {
      gameName: member.gameName,
      account: {
        puuid: member.puuid,
        gameName: member.gameName,
        tagLine: member.tagLine,
      },
    });
  }

  return { ...toTeam(row), members: team.members };
}

function toMemberRow(
  member: PremadeMember,
): Omit<MemberRow, "team_id" | "archived_at"> {
  return {
    puuid: member.puuid,
    game_name: member.gameName,
    tag_line: member.tagLine,
    slot: member.slot,
  };
}

function toTeam(row: TeamRow): Omit<PremadeTeam, "members"> {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region,
    createdAt: row.created_at,
  };
}

export async function getTeamBySlug(slug: string): Promise<PremadeTeam | null> {
  const { data, error } = await supabaseAdmin
    .from("premade_teams")
    .select("id, slug, name, region, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TeamRow;
  return { ...toTeam(row), members: await getMembers(row.id) };
}

export async function getTeamById(
  id: string,
  options: { includeArchived?: boolean } = {},
): Promise<PremadeTeam | null> {
  const { data, error } = await supabaseAdmin
    .from("premade_teams")
    .select("id, slug, name, region, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TeamRow;
  return {
    ...toTeam(row),
    members: await getMembers(row.id, options.includeArchived),
  };
}

/**
 * Collected matches of a team, newest first.
 *
 * The database answers "who played this game": every stored row keeps the participants that
 * played it, and each account is resolved to the person that owns it. Games are measured by the
 * people of the CURRENT lineup, so a removed player stops counting even though the row stays
 * stored for history.
 */
export async function getTeamMatches(
  teamId: string,
  limit = 1000,
): Promise<PremadeMatchSample[]> {
  const [{ data, error }, lineage, extra] = await Promise.all([
    supabaseAdmin
      .from("premade_matches")
      .select(
        "match_id, game_creation, win, duration, team_side, objectives, team_totals, participants",
      )
      .eq("team_id", teamId)
      .order("game_creation", { ascending: false })
      .limit(limit),
    accountLineage(teamId),
    getMatchFields(teamId).catch(() => new Map<string, MatchFieldsRow>()),
  ]);
  if (error) throw error;

  return attachParticipantFields(
    teamId,
    ((data as MatchRow[] | null) ?? []).map((row) => {
      const sample = toMatchSample(row, extra.get(row.match_id));
      // Only accounts of people still on the lineup get an accountId: an account of a removed
      // person keeps none, so that game stops counting them without losing the stored history.
      return {
        ...sample,
        participants: sample.participants.map((p) => {
          const person = lineage.get(p.puuid);
          return { ...p, accountId: person ?? null };
        }),
      };
    }),
  );
}

/**
 * Account -> person, for the people still on the lineup. An archived person (or an archived
 * account) is simply absent: their games stay stored but no longer count for the team.
 */
async function accountLineage(teamId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("premade_accounts")
    .select("puuid, player_id, archived_at, premade_players(archived_at)")
    .eq("team_id", teamId);
  if (error) throw error;

  const lineage = new Map<string, string>();
  for (const row of (data as unknown as (AccountRow & {
    premade_players: { archived_at: string | null } | null;
  })[]) ?? []) {
    if (row.archived_at !== null || row.premade_players?.archived_at) continue;
    lineage.set(row.puuid, row.player_id);
  }
  return lineage;
}

/** Games saved before the champion/lane migration: their participants must be fetched again. */
export async function getMatchIdsNeedingChampionData(
  teamId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("premade_matches")
    .select("match_id, participants")
    .eq("team_id", teamId);
  if (error) throw error;

  const needs = (
    (data as Pick<MatchRow, "match_id" | "participants">[] | null) ?? []
  )
    .filter(
      (row) =>
        Array.isArray(row.participants) &&
        row.participants.some((p) => !p?.championId || !p?.teamPosition),
    )
    .map((row) => row.match_id);
  return new Set(needs);
}

export async function getCollectedMatchIds(
  teamId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("premade_matches")
    .select("match_id")
    .eq("team_id", teamId);
  if (error) throw error;
  return new Set(
    (data as { match_id: string }[] | null)?.map((row) => row.match_id) ?? [],
  );
}

/** Idempotent by (team_id, match_id): re-collecting a game refreshes its stored sample. */
export async function saveMatchSamples(
  teamId: string,
  samples: PremadeMatchSample[],
): Promise<void> {
  if (samples.length === 0) return;
  // The depth fields live in their own columns (migration 0010): the participants jsonb keeps the
  // sample the metrics always read, and a re-collection never leaves a half-refreshed row behind.
  const stripped = samples.map((sample) => ({
    ...sample,
    participants: sample.participants.map(
      (participant) => splitParticipantFields(participant).sample,
    ),
  }));
  // The side totals are written from the participants when the caller did not bring them: a game
  // stored without them would make the collective KDA a roster cut (see `sideTotalsFromParticipants`).
  const sideOf = (sample: PremadeMatchSample) =>
    sideTotalsFromParticipants(sample.participants);
  const { error } = await supabaseAdmin.from("premade_matches").upsert(
    stripped.map((sample) => ({
      team_id: teamId,
      match_id: sample.matchId,
      game_creation: sample.gameCreation,
      win: sample.win,
      duration: sample.duration,
      team_side: sample.teamSide,
      objectives: sample.objectives,
      team_totals: {
        champLevel: sample.champLevel,
        turretTakedowns: sample.turretTakedowns,
        teamKills: sample.teamKills,
        teamGold: sample.teamGold,
        // Upsert merges the whole column: the side totals keep every key written before them.
        teamDeaths: sample.teamDeaths ?? sideOf(sample)?.teamDeaths ?? null,
        sideAssists: sample.sideAssists ?? sideOf(sample)?.sideAssists ?? null,
        sideDamage: sample.teamDamage ?? null,
      },
      participants: sample.participants,
      roster_puuids: sample.participants.map((p) => p.puuid),
      // The people, not their accounts: these two accounts of one person are a single entry.
      person_puuids: [
        ...new Set(sample.participants.map((p) => p.accountId ?? p.puuid)),
      ],
      game_version: null,
    })),
    // Keep first_seen_at, overwrite the stored data so repaired games gain champion and lane.
    { onConflict: "team_id,match_id", ignoreDuplicates: false },
  );
  if (error) throw error;

  await saveMatchFields(
    teamId,
    samples.map((sample) => ({
      matchId: sample.matchId,
      sideObjectives: sample.sideObjectives ?? null,
      sideDamage: sample.sideDamage ?? null,
      sideDamageTaken: sample.sideDamageTaken ?? null,
    })),
  );

  await saveParticipantRows(teamId, samples);
}

/**
 * Pings of the participants collected now, written on their existing rows (migration 0012): a game
 * stored before the field existed keeps its row and gains the counters. An update, never an upsert,
 * so a row that does not exist is left for the match collection to create.
 */
export async function saveParticipantPings(
  teamId: string,
  samples: PremadeMatchSample[],
): Promise<void> {
  const entries = samples.flatMap((sample) =>
    sample.participants
      .filter(
        (participant) =>
          participant.pings !== null && participant.pings !== undefined,
      )
      .map((participant) => ({
        matchId: sample.matchId,
        puuid: participant.puuid,
        pings: participant.pings,
      })),
  );
  if (entries.length === 0) return;
  // One call per game (a batch of five participants), not a round trip per person: the function
  // merges `fields.pings` per row and leaves every other field untouched.
  const byGame = new Map<
    string,
    { puuid: string; pings: ParticipantPings }[]
  >();
  for (const entry of entries) {
    byGame.set(entry.matchId, [
      ...(byGame.get(entry.matchId) ?? []),
      { puuid: entry.puuid, pings: entry.pings! },
    ]);
  }
  await Promise.all(
    [...byGame.entries()].map(async ([matchId, rows]) => {
      const { error } = await supabaseAdmin.rpc("premade_set_match_pings", {
        p_team: teamId,
        p_match: matchId,
        p_rows: rows,
      });
      if (error) throw error;
    }),
  );
}

/** Marks the games whose participants already carry their pings (`premade_matches.pings_saved`). */
export async function markPingsSaved(
  teamId: string,
  matchIds: string[],
): Promise<void> {
  if (matchIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("premade_matches")
    .update({ pings_saved: true })
    .eq("team_id", teamId)
    .in("match_id", matchIds);
  if (error) throw error;
}

/** Side aggregates of migration 0010, one row per match. Idempotent by (team, match). */ export async function saveMatchFields(
  teamId: string,
  rows: {
    matchId: string;
    sideObjectives: PremadeMatchSample["sideObjectives"];
    sideDamage: number | null;
    sideDamageTaken: number | null;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from("premade_match_fields").upsert(
    rows.map((row) => ({
      team_id: teamId,
      match_id: row.matchId,
      side_objectives: row.sideObjectives,
      side_damage: row.sideDamage,
      side_damage_taken: row.sideDamageTaken,
      enriched_at: new Date().toISOString(),
    })),
    { onConflict: "team_id,match_id" },
  );
  if (error) throw error;
}

async function getMatchFields(
  teamId: string,
): Promise<Map<string, MatchFieldsRow>> {
  const { data, error } = await supabaseAdmin
    .from("premade_match_fields")
    .select("match_id, side_objectives, side_damage, side_damage_taken")
    .eq("team_id", teamId);
  if (error) throw error;
  return new Map(
    ((data as MatchFieldsRow[] | null) ?? []).map((row) => [row.match_id, row]),
  );
}

/** One row per roster player per game: the champion and lane they played, ready to aggregate. */
async function saveParticipantRows(
  teamId: string,
  samples: PremadeMatchSample[],
): Promise<void> {
  // Timeline derived data only: written straight into `derived`, never into `fields`.
  const derived: DerivedRow[] = [];
  // One upsert per sample: the row and its depth fields travel together. A write that names only
  // the fields would be split by PostgREST into an insert of the missing columns plus an update,
  // and Postgres checks the NOT NULL columns of that insert before the conflict is resolved.
  for (const sample of samples) {
    const rows = sample.participants.map((participant) => {
      const split = splitParticipantFields(participant);
      if (split.derived) {
        derived.push({
          team_id: teamId,
          match_id: sample.matchId,
          puuid: participant.puuid,
          derived: split.derived,
        });
      }
      return {
        team_id: teamId,
        match_id: sample.matchId,
        puuid: participant.puuid,
        account_id: participant.accountId ?? participant.puuid,
        champion_id: participant.championId,
        champion_name: participant.championName,
        team_position: participant.teamPosition,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win: sample.win,
        game_creation: sample.gameCreation,
        // Only the games that brought the fields write them: a lighter fetch leaves them as they are.
        ...(split.fields ? { fields: split.fields } : {}),
      };
    });
    if (rows.length === 0) continue;
    const { error } = await supabaseAdmin
      .from("premade_participants")
      .upsert(rows, { onConflict: "team_id,match_id,puuid" });
    if (error) throw error;
  }

  if (derived.length > 0) {
    const { error: derivedError } = await supabaseAdmin
      .from("premade_participants")
      .upsert(derived, { onConflict: "team_id,match_id,puuid" });
    if (derivedError) throw derivedError;
  }
}

interface DerivedRow {
  team_id: string;
  match_id: string;
  puuid: string;
  derived: ParticipantDerived;
}

/** Games whose participants still lack the depth fields (migration 0010) or their pings (0012). */
export async function getMatchIdsNeedingFields(
  teamId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("premade_participants")
    .select("match_id, fields")
    .eq("team_id", teamId);
  if (error) throw error;

  const needs = new Set<string>();
  for (const row of (data as { match_id: string; fields: unknown }[] | null) ??
    []) {
    const fields = row.fields as Record<string, unknown> | null;
    if (!fields || typeof fields !== "object" || !fields.pings)
      needs.add(row.match_id);
  }
  return needs;
}

/** Games whose participant rows carry no timeline derived data yet (a rebuild reads them again). */
export async function getMatchesMissingDerived(
  teamId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("premade_participants")
    .select("match_id, derived")
    .eq("team_id", teamId);
  if (error) throw error;
  const games = new Map<string, boolean>();
  for (const row of (data as { match_id: string; derived: unknown }[] | null) ??
    []) {
    // A match is complete when at least one of its roster rows carries the derived data.
    games.set(
      row.match_id,
      (games.get(row.match_id) ?? false) ||
        Boolean(row.derived && typeof row.derived === "object"),
    );
  }
  return new Set(
    [...games.entries()]
      .filter(([, done]) => !done)
      .map(([matchId]) => matchId),
  );
}

/** Timeline derived data (build, skills, lane) of a timeline collection batch, by match. */
export async function saveTimelineDerived(
  teamId: string,
  entries: { matchId: string; puuid: string; derived: ParticipantDerived }[],
): Promise<void> {
  if (entries.length === 0) return;
  // An update, never an upsert: the row belongs to the match collection, and an upsert that names
  // only these columns would insert the missing ones as null on a row that does not exist yet.
  for (const entry of entries) {
    const { error } = await supabaseAdmin
      .from("premade_participants")
      .update({ derived: entry.derived })
      .eq("team_id", teamId)
      .eq("match_id", entry.matchId)
      .eq("puuid", entry.puuid);
    if (error) throw error;
  }
}

/** Games Riot did not answer on the re-collection, kept apart from the ones already handled. */
export async function getCollectFailures(
  teamId: string,
): Promise<Map<string, { reason: string; attempts: number }>> {
  const { data, error } = await supabaseAdmin
    .from("premade_collect_failures")
    .select("match_id, reason, attempts")
    .eq("team_id", teamId);
  if (error) throw error;
  return new Map(
    (
      (data as
        { match_id: string; reason: string; attempts: number }[] | null) ?? []
    ).map((row) => [
      row.match_id,
      { reason: row.reason, attempts: row.attempts },
    ]),
  );
}

export async function saveCollectFailures(
  teamId: string,
  failures: { matchId: string; reason: string; status: number | null }[],
  previous: Map<string, { reason: string; attempts: number }>,
): Promise<void> {
  if (failures.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("premade_collect_failures").upsert(
    failures.map((failure) => ({
      team_id: teamId,
      match_id: failure.matchId,
      reason: failure.reason,
      status: failure.status,
      attempts: (previous.get(failure.matchId)?.attempts ?? 0) + 1,
      last_attempt_at: now,
    })),
    { onConflict: "team_id,match_id" },
  );
  if (error) throw error;
}

/** Reads the depth columns of every participant and merges them into the sample. */
async function attachParticipantFields(
  teamId: string,
  matches: PremadeMatchSample[],
): Promise<PremadeMatchSample[]> {
  if (matches.length === 0) return matches;
  interface Row {
    match_id: string;
    puuid: string;
    fields: ParticipantFields | null;
    derived: ParticipantDerived | null;
  }
  // Reads the games as one query per 200 matches: the request stays small on teams with a long history.
  const byKey = new Map<string, Row>();
  for (let index = 0; index < matches.length; index += 200) {
    const ids = matches.slice(index, index + 200).map((match) => match.matchId);
    const { data, error } = await supabaseAdmin
      .from("premade_participants")
      .select("match_id, puuid, fields, derived")
      .eq("team_id", teamId)
      .in("match_id", ids);
    if (error) throw error;
    for (const row of (data as Row[] | null) ?? [])
      byKey.set(`${row.match_id}|${row.puuid}`, row);
  }
  return matches.map((match) => ({
    ...match,
    participants: match.participants.map((participant) => {
      const row = byKey.get(`${match.matchId}|${participant.puuid}`);
      if (!row) return participant;
      const merged: PremadeParticipantSample = { ...participant };
      if (row.fields) Object.assign(merged, row.fields);
      if (row.derived) merged.derived = row.derived;
      return merged;
    }),
  }));
}

interface PlayerRow {
  id: string;
  team_id: string;
  game_name: string;
  slot: number;
  archived_at: string | null;
}

interface AccountRow {
  puuid: string;
  player_id: string;
  team_id: string;
  game_name: string;
  tag_line: string;
  archived_at: string | null;
  created_at: string;
}

function toAccount(row: AccountRow): PremadeAccount {
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    archived: row.archived_at !== null,
  };
}

/**
 * The people of a team with their accounts, newest account last. Archived people and accounts are
 * included by default: they still explain the games already collected.
 */
export async function getPlayers(teamId: string): Promise<PremadePlayer[]> {
  const [
    { data: people, error: peopleError },
    { data: accounts, error: accountsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("premade_players")
      .select("id, team_id, game_name, slot, archived_at")
      .eq("team_id", teamId)
      .order("slot", { ascending: true }),
    supabaseAdmin
      .from("premade_accounts")
      .select(
        "puuid, player_id, team_id, game_name, tag_line, archived_at, created_at",
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
  ]);
  if (peopleError) throw peopleError;
  if (accountsError) throw accountsError;

  const byPlayer = new Map<string, PremadeAccount[]>();
  for (const row of (accounts as AccountRow[] | null) ?? []) {
    byPlayer.set(row.player_id, [
      ...(byPlayer.get(row.player_id) ?? []),
      toAccount(row),
    ]);
  }
  return ((people as PlayerRow[] | null) ?? []).map((row) => ({
    id: row.id,
    gameName: row.game_name,
    slot: row.slot,
    archived: row.archived_at !== null,
    accounts: byPlayer.get(row.id) ?? [],
  }));
}

/** Account -> person for the people still on the lineup: what a game is counted by. */
export async function getAccountOwners(teamId: string): Promise<AccountOwners> {
  const { data, error } = await supabaseAdmin
    .from("premade_accounts")
    .select("puuid, player_id, archived_at")
    .eq("team_id", teamId);
  if (error) throw error;

  const owners: Record<string, string> = {};
  for (const row of (data as
    Pick<AccountRow, "puuid" | "player_id" | "archived_at">[] | null) ?? []) {
    if (row.archived_at === null) owners[row.puuid] = row.player_id;
  }
  return owners;
}

/** Adds a person (optionally with their first account) and answers with the new id. */
export async function addPlayer(
  teamId: string,
  player: {
    gameName: string;
    account?: { puuid: string; gameName: string; tagLine: string };
  },
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("premade_players")
    .select("slot")
    .eq("team_id", teamId);
  if (error) throw error;

  const taken = new Set(
    ((data as { slot: number }[] | null) ?? []).map((row) => row.slot),
  );
  let slot = 0;
  while (taken.has(slot)) slot += 1;

  const { data: created, error: createError } = await supabaseAdmin
    .from("premade_players")
    .insert({ team_id: teamId, game_name: player.gameName, slot })
    .select("id")
    .single();
  if (createError) throw createError;
  const playerId = (created as { id: string }).id;

  if (player.account) {
    try {
      await addAccount(teamId, playerId, player.account);
    } catch (accountError) {
      // A person without an account would never play a game: do not leave it behind.
      await supabaseAdmin.from("premade_players").delete().eq("id", playerId);
      throw accountError;
    }
  }
  return playerId;
}

/** Adds an account to an existing person. The same PUUID may also belong to other teams. */
export async function addAccount(
  teamId: string,
  playerId: string,
  account: { puuid: string; gameName: string; tagLine: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("premade_accounts").upsert(
    {
      puuid: account.puuid,
      player_id: playerId,
      team_id: teamId,
      game_name: account.gameName,
      tag_line: account.tagLine,
      archived_at: null,
    },
    { onConflict: "team_id,puuid" },
  );
  if (error) throw error;
}

/**
 * Removes an account from the lineup for good: the row and the games stored through it are deleted,
 * so the next collection no longer counts them. The person goes away with their last account.
 */
export async function removeAccount(
  teamId: string,
  puuid: string,
): Promise<{ playerRemoved: boolean }> {
  const people = await getPlayers(teamId);
  const person = people.find((p) =>
    p.accounts.some((account) => account.puuid === puuid),
  );
  if (!person) throw new Error("notFound");

  const remaining = person.accounts.filter(
    (account) => account.puuid !== puuid,
  );
  // A person without an account can never play again: the last account takes the person with it.
  if (remaining.length === 0) {
    await deletePlayer(teamId, person.id);
    return { playerRemoved: true };
  }

  const { error } = await supabaseAdmin
    .from("premade_accounts")
    .delete()
    .eq("team_id", teamId)
    .eq("puuid", puuid);
  if (error) throw error;

  await forgetPuuid(teamId, puuid);
  return { playerRemoved: false };
}

/**
 * Deletes a player, their accounts and every game they played for this team: the lineup is what
 * the analysis sees, so a removed player must stop counting everywhere.
 */
export async function deletePlayer(
  teamId: string,
  playerId: string,
): Promise<void> {
  const all = await getPlayers(teamId);
  const target = all.find((p) => p.id === playerId);
  if (!target) throw new Error("notFound");

  if (all.filter((p) => !p.archived).length <= PREMADE_MIN_SIZE)
    throw new Error("rosterTooSmall");

  const puuids = target.accounts.map((account) => account.puuid);
  const { error } = await supabaseAdmin
    .from("premade_players")
    .delete()
    .eq("team_id", teamId)
    .eq("id", playerId);
  if (error) throw error;
  for (const puuid of puuids) await forgetPuuid(teamId, puuid);
}

/**
 * Drops a PUUID from every stored game of the team: its participant row and its place in the
 * match, deleting a game left without anyone of the lineup.
 */
async function forgetPuuid(teamId: string, puuid: string): Promise<void> {
  await supabaseAdmin
    .from("premade_participants")
    .delete()
    .eq("team_id", teamId)
    .eq("puuid", puuid);

  const { data, error } = await supabaseAdmin
    .from("premade_matches")
    .select("match_id, participants")
    .eq("team_id", teamId);
  if (error) throw error;

  for (const row of (data as
    { match_id: string; participants: PremadeParticipantSample[] }[] | null) ??
    []) {
    const before = row.participants ?? [];
    const participants = before.filter(
      (participant) => participant.puuid !== puuid,
    );
    if (participants.length === before.length) continue;

    if (participants.length === 0) {
      await supabaseAdmin
        .from("premade_matches")
        .delete()
        .eq("team_id", teamId)
        .eq("match_id", row.match_id);
      await forgetTimeline(teamId, row.match_id);
      continue;
    }
    await supabaseAdmin
      .from("premade_matches")
      .update({ participants, roster_puuids: participants.map((p) => p.puuid) })
      .eq("team_id", teamId)
      .eq("match_id", row.match_id);
  }
}

export interface ChampionAggregate {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface PositionAggregate {
  teamPosition: string;
  games: number;
  wins: number;
}

export interface PlayerAggregates {
  puuid: string;
  games: number;
  champions: ChampionAggregate[];
  positions: PositionAggregate[];
}

/** Champions most played and the lane most played, per roster player, from the stored sample. */
export function aggregatePlayers(
  matches: PremadeMatchSample[],
): PlayerAggregates[] {
  const players = new Map<string, PlayerAggregates>();

  for (const match of matches) {
    for (const p of match.participants) {
      const entry =
        players.get(p.puuid) ??
        ({
          puuid: p.puuid,
          games: 0,
          champions: [],
          positions: [],
        } as PlayerAggregates);
      entry.games += 1;

      const champion = entry.champions.find(
        (c) => c.championId === p.championId,
      );
      if (champion) {
        champion.games += 1;
        champion.wins += match.win ? 1 : 0;
        champion.kills += p.kills;
        champion.deaths += p.deaths;
        champion.assists += p.assists;
      } else {
        entry.champions.push({
          championId: p.championId,
          championName: p.championName,
          games: 1,
          wins: match.win ? 1 : 0,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        });
      }

      const position = entry.positions.find(
        (x) => x.teamPosition === p.teamPosition,
      );
      if (position) {
        position.games += 1;
        position.wins += match.win ? 1 : 0;
      } else {
        entry.positions.push({
          teamPosition: p.teamPosition,
          games: 1,
          wins: match.win ? 1 : 0,
        });
      }

      players.set(p.puuid, entry);
    }
  }

  for (const entry of players.values()) {
    entry.champions.sort((a, b) => b.games - a.games);
    entry.positions.sort((a, b) => b.games - a.games);
  }
  return [...players.values()];
}
export interface CollectionCursor {
  puuid: string;
  nextStart: number;
  finished: boolean;
  pagesFetched: number;
  /** `startTime` of the next incremental update: games older than this were already listed. */
  epoch: number;
  /**
   * Games an incremental update has already walked, newest first. The next one continues after
   * them: the lists can hold more new games than one page shows, and Riot never serves the gap.
   */
  emitted: number;
  /** When the list of this account last answered something new (0 when it never did). */
  lastListedAt: number;
}

interface CursorRow {
  puuid: string;
  next_start: number;
  finished: boolean;
  pages_fetched: number;
  seen_ids: string[] | null;
  epoch: number | null;
  emitted: number | null;
  last_listed_at: string | null;
}

function toCursor(row: CursorRow): CollectionCursor {
  return {
    puuid: row.puuid,
    nextStart: row.next_start,
    finished: row.finished,
    pagesFetched: row.pages_fetched,
    epoch: Number(row.epoch) || 0,
    emitted: Number(row.emitted) || 0,
    lastListedAt: row.last_listed_at ? Date.parse(row.last_listed_at) || 0 : 0,
  };
}

/** Pagination state of every roster player, keyed by puuid. Missing means "never scanned". */
export async function getCollectionCursors(
  teamId: string,
): Promise<Map<string, CollectionCursor>> {
  const { data, error } = await supabaseAdmin
    .from("premade_collection_cursors")
    .select(
      "puuid, next_start, finished, pages_fetched, seen_ids, epoch, emitted, last_listed_at",
    )
    .eq("team_id", teamId);
  if (error) throw error;
  return new Map(
    ((data as CursorRow[] | null) ?? []).map((row) => [
      row.puuid,
      toCursor(row),
    ]),
  );
}

/** Match ids already seen by a player, including the older, already-scanned part of the history. */
export async function getCursorSeenIds(
  teamId: string,
  puuid: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("premade_collection_cursors")
    .select("seen_ids")
    .eq("team_id", teamId)
    .eq("puuid", puuid)
    .maybeSingle();
  if (error) throw error;
  return (data as { seen_ids: string[] | null } | null)?.seen_ids ?? [];
}

export async function saveCollectionCursor(
  teamId: string,
  puuid: string,
  state: {
    nextStart: number;
    finished: boolean;
    pagesFetched: number;
    epoch?: number;
    emitted?: number;
    listedAt?: number;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("premade_collection_cursors")
    .upsert(
      {
        team_id: teamId,
        puuid,
        next_start: state.nextStart,
        finished: state.finished,
        pages_fetched: state.pagesFetched,
        epoch: state.epoch ?? 0,
        emitted: state.emitted ?? 0,
        last_listed_at: state.listedAt
          ? new Date(state.listedAt).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,puuid" },
    );
  if (error) throw error;
}

/** Who already listed each game: the compact presence table the candidates are decided on. */
export async function getMatchPresence(
  teamId: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabaseAdmin
    .from("premade_match_presence")
    .select("match_id, people")
    .eq("team_id", teamId);
  if (error) throw error;
  return new Map(
    (
      (data as { match_id: string; people: string[] | null }[] | null) ?? []
    ).map((row) => [row.match_id, new Set(row.people ?? [])]),
  );
}

export async function saveMatchPresence(
  teamId: string,
  entries: { matchId: string; people: string[] }[],
): Promise<void> {
  if (entries.length === 0) return;
  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("premade_match_presence").upsert(
    entries.map((entry) => ({
      team_id: teamId,
      match_id: entry.matchId,
      people: entry.people,
      updated_at: updatedAt,
    })),
    { onConflict: "team_id,match_id" },
  );
  if (error) throw error;
}

/** One "Coletar" click: it re-reads every list and keeps the ids it already saw. */
export interface CollectionSession {
  id: string;
  minRoster: number;
  /** Page already read from each account, by PUUID. */
  nextStart: Record<string, number>;
  /** Where each account's list was when the batch stopped (`nextStart` after the last page). */
  accountStart: Record<string, number>;
  /** Match ids each account already listed, by PUUID. */
  ids: Record<string, string[]>;
  /** Games each account listed so far, by PUUID. */
  games: Record<string, number>;
  scansDone: number;
  scansTotal: number;
  /** The lineup (sorted PUUIDs) this session was opened with. */
  rosterKey: string;
  finished: boolean;
  /** Why the last batch stopped, when it did not advance: the client refuses to keep trying. */
  error: string | null;
}

interface SessionRow {
  id: string;
  min_roster: number;
  next_start: Record<string, number> | null;
  account_start: Record<string, number> | null;
  ids: Record<string, string[]> | null;
  games: Record<string, number> | null;
  scans_done: number;
  scans_total: number;
  roster_key: string | null;
  finished_at: string | null;
  error: string | null;
}

function toSession(row: SessionRow): CollectionSession {
  return {
    id: row.id,
    minRoster: row.min_roster,
    nextStart: row.next_start ?? {},
    accountStart: row.account_start ?? {},
    ids: row.ids ?? {},
    games: row.games ?? {},
    scansDone: row.scans_done,
    scansTotal: row.scans_total,
    rosterKey: row.roster_key ?? "",
    finished: row.finished_at !== null,
    error: row.error,
  };
}

const SESSION_COLUMNS =
  "id, min_roster, next_start, account_start, ids, games, scans_done, scans_total, roster_key, finished_at, error";

/** The session still running for the team, or null when the last one already finished. */
export async function getOpenCollectionSession(
  teamId: string,
): Promise<CollectionSession | null> {
  const { data, error } = await supabaseAdmin
    .from("premade_collect_sessions")
    .select(SESSION_COLUMNS)
    .eq("team_id", teamId)
    .is("finished_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toSession(data as SessionRow) : null;
}

/** The session a click works on: the open one, or a new one that scans everything again. */
export async function openCollectionSession(
  teamId: string,
  options: {
    minRoster: number;
    scansTotal: number;
    rosterKey: string;
    restart?: boolean;
  },
): Promise<CollectionSession> {
  if (!options.restart) {
    const open = await getOpenCollectionSession(teamId);
    // A session with another minimum would keep counting games for the wrong rule, and one from
    // another lineup would resume cursors of accounts that are not on it: both restart instead.
    if (
      open &&
      open.minRoster === options.minRoster &&
      open.rosterKey === options.rosterKey
    )
      return open;
    if (open) await finishCollectionSession(open.id);
  }

  const { data, error } = await supabaseAdmin
    .from("premade_collect_sessions")
    .insert({
      team_id: teamId,
      min_roster: options.minRoster,
      scans_total: options.scansTotal,
      roster_key: options.rosterKey,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return toSession(data as SessionRow);
}

export async function saveCollectionSession(
  sessionId: string,
  state: {
    nextStart: Record<string, number>;
    accountStart?: Record<string, number>;
    ids: Record<string, string[]>;
    games: Record<string, number>;
    scansDone: number;
    scansTotal: number;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("premade_collect_sessions")
    .update({
      next_start: state.nextStart,
      ...(state.accountStart ? { account_start: state.accountStart } : {}),
      ids: state.ids,
      games: state.games,
      scans_done: state.scansDone,
      scans_total: state.scansTotal,
      ...(state.error !== undefined ? { error: state.error } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function finishCollectionSession(
  sessionId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("premade_collect_sessions")
    .update({
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

// ---- Timelines (migration 0009): derived data only, never the raw payload. ----

interface TimelineRow {
  match_id: string;
  duration: number;
  end_of_game_result: string | null;
  frame_interval: number;
  gold_series: PremadeTimeline["goldSeries"];
  gold_diff: PremadeTimeline["goldDiff"];
  xp_diff: PremadeTimeline["xpDiff"];
  kills: PremadeTimeline["kills"];
  objectives: PremadeTimeline["objectives"];
  positions: PremadeTimeline["positions"];
  deaths?: PremadeTimeline["deaths"];
  final_stats: PremadeTimeline["finalStats"];
}

/** Stored timelines of the team: what the Timeline metrics and the UI read. */
export async function getTimelines(teamId: string): Promise<PremadeTimeline[]> {
  const { data, error } = await supabaseAdmin
    .from("premade_timelines")
    .select(
      "match_id, duration, end_of_game_result, frame_interval, gold_series, gold_diff, xp_diff, kills, objectives, positions, deaths, final_stats",
    )
    .eq("team_id", teamId);
  if (error) throw error;
  return ((data as TimelineRow[] | null) ?? []).map((row) => ({
    matchId: row.match_id,
    duration: row.duration,
    endOfGameResult: row.end_of_game_result,
    frameInterval: row.frame_interval,
    goldSeries: row.gold_series ?? [],
    goldDiff: row.gold_diff ?? [],
    xpDiff: row.xp_diff ?? [],
    kills: row.kills ?? [],
    objectives: row.objectives ?? [],
    positions: row.positions ?? [],
    deaths: row.deaths ?? [],
    finalStats: row.final_stats,
  }));
}

/** Writes timelines idempotently by (team, match). A game stopped counting takes its timeline along. */
export async function saveTimelines(
  teamId: string,
  timelines: PremadeTimeline[],
  matches: PremadeMatchSample[],
): Promise<void> {
  if (timelines.length === 0) return;
  const byId = new Map(matches.map((match) => [match.matchId, match]));
  const rows = timelines.map((timeline) => ({
    team_id: teamId,
    match_id: timeline.matchId,
    duration: timeline.duration,
    end_of_game_result: timeline.endOfGameResult,
    frame_interval: timeline.frameInterval,
    gold_series: timeline.goldSeries,
    gold_diff: timeline.goldDiff,
    xp_diff: timeline.xpDiff,
    kills: timeline.kills,
    objectives: timeline.objectives,
    positions: timeline.positions,
    deaths: timeline.deaths ?? [],
    final_stats: timeline.finalStats,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from("premade_timelines")
    .upsert(rows, { onConflict: "team_id,match_id" });
  if (error) throw error;

  const series = timelines.flatMap((timeline) => {
    const match = byId.get(timeline.matchId);
    return match
      ? [
          {
            team_id: teamId,
            match_id: timeline.matchId,
            gold_diff: timeline.goldDiff,
            xp_diff: timeline.xpDiff,
            win: match.win,
            seconds: timeline.duration,
          },
        ]
      : [];
  });
  if (series.length > 0) {
    const { error: seriesError } = await supabaseAdmin
      .from("premade_timeline_series")
      .upsert(series, { onConflict: "team_id,match_id" });
    if (seriesError) throw seriesError;
  }
}

/** Games Riot does not answer a timeline for, with how many times they were tried. */
export async function getTimelineFailures(
  teamId: string,
): Promise<Map<string, { reason: string; attempts: number }>> {
  const { data, error } = await supabaseAdmin
    .from("premade_timeline_failures")
    .select("match_id, reason, attempts")
    .eq("team_id", teamId);
  if (error) throw error;
  return new Map(
    (
      (data as
        { match_id: string; reason: string; attempts: number }[] | null) ?? []
    ).map((row) => [
      row.match_id,
      { reason: row.reason, attempts: row.attempts },
    ]),
  );
}

/** Records the failed games: a 404 is kept apart from a transient error that deserves a retry. */
export async function saveTimelineFailures(
  teamId: string,
  failures: { matchId: string; reason: string; status: number | null }[],
  previous: Map<string, { reason: string; attempts: number }>,
): Promise<void> {
  if (failures.length === 0) return;
  const now = new Date().toISOString();
  const rows = failures.map((failure) => ({
    team_id: teamId,
    match_id: failure.matchId,
    reason: failure.reason,
    status: failure.status,
    attempts: (previous.get(failure.matchId)?.attempts ?? 0) + 1,
    last_attempt_at: now,
  }));
  const { error } = await supabaseAdmin
    .from("premade_timeline_failures")
    .upsert(rows, { onConflict: "team_id,match_id" });
  if (error) throw error;
}

// ---- Account ranks (migration 0015): icon, level and elo cached per account, never fetched on render ----

/**
 * Last time the stored data changed for the team: the newest match row, the newest account sync and
 * the newest timeline. Null when nothing was ever stored.
 */
export async function getLastUpdate(teamId: string): Promise<string | null> {
  const results = await Promise.all([
    supabaseAdmin
      .from("premade_matches")
      .select("first_seen_at")
      .eq("team_id", teamId)
      .order("first_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("premade_account_ranks")
      .select("updated_at")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("premade_timelines")
      .select("fetched_at")
      .eq("team_id", teamId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const values = results
    .map((result) =>
      result.error
        ? null
        : (Object.values((result.data as object | null) ?? {})[0] as
            string | null),
    )
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value));
  return values.length === 0
    ? null
    : new Date(Math.max(...values)).toISOString();
}

interface RankRow {
  puuid: string;
  profile_icon_id: number | null;
  summoner_level: number | null;
  queue_type: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
  /** The two queues as they were answered; null on accounts synced before migration 0017. */
  flex_queue_type: string | null;
  flex_tier: string | null;
  flex_division: string | null;
  flex_league_points: number | null;
  flex_wins: number | null;
  flex_losses: number | null;
  solo_queue_type: string | null;
  solo_tier: string | null;
  solo_division: string | null;
  solo_league_points: number | null;
  solo_wins: number | null;
  solo_losses: number | null;
  fetched_at: string | null;
}

/** One queue of a row, or null when that queue was never stored. */
function queueCache(
  queueType: string,
  tier: string | null,
  division: string | null,
  leaguePoints: number | null,
  wins: number | null,
  losses: number | null,
): RankQueueCache | null {
  return tier
    ? {
        tier: toTier(tier),
        division,
        leaguePoints,
        wins,
        losses,
        queueType: queueType as RankedQueue,
      }
    : null;
}

/** Cached portrait of every roster account of the team (archived ones included), by PUUID. */
export async function getAccountRanks(teamId: string): Promise<AccountRanks> {
  const { data, error } = await supabaseAdmin
    .from("premade_account_ranks")
    .select(
      "puuid, profile_icon_id, summoner_level, queue_type, tier, division, league_points, wins, losses, flex_queue_type, flex_tier, flex_division, flex_league_points, flex_wins, flex_losses, solo_queue_type, solo_tier, solo_division, solo_league_points, solo_wins, solo_losses, fetched_at",
    )
    .eq("team_id", teamId);
  if (error) throw error;
  const ranks: Record<string, AccountRank> = {};
  for (const row of (data as RankRow[] | null) ?? []) {
    ranks[row.puuid] = {
      puuid: row.puuid,
      profileIconId: row.profile_icon_id,
      summonerLevel: row.summoner_level,
      queueType: (row.queue_type as AccountRank["queueType"]) ?? null,
      tier: row.tier,
      division: row.division,
      leaguePoints: row.league_points,
      wins: row.wins,
      losses: row.losses,
      flex: queueCache(
        row.flex_queue_type ?? "RANKED_FLEX_SR",
        row.flex_tier,
        row.flex_division,
        row.flex_league_points,
        row.flex_wins,
        row.flex_losses,
      ),
      solo: queueCache(
        row.solo_queue_type ?? "RANKED_SOLO_5x5",
        row.solo_tier,
        row.solo_division,
        row.solo_league_points,
        row.solo_wins,
        row.solo_losses,
      ),
      fetchedAt: row.fetched_at,
    };
  }
  return ranks;
}

/** One account's cached rank row, for the freshness gate of the sync. */
export async function getAccountRank(
  teamId: string,
  puuid: string,
): Promise<{ fetchedAt: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("premade_account_ranks")
    .select("fetched_at")
    .eq("team_id", teamId)
    .eq("puuid", puuid)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { fetchedAt: (data as { fetched_at: string | null }).fetched_at }
    : null;
}

/** The row counts of one queue, in the order saveAccountRank writes them. */
function queueColumns(queue: RankedQueue, rank: RankQueueCache | null) {
  return {
    tier: rank?.tier ?? null,
    division: rank?.division ?? null,
    leaguePoints: rank?.leaguePoints ?? null,
    wins: rank?.wins ?? null,
    losses: rank?.losses ?? null,
    queue,
  };
}

/** Idempotent by (team, puuid): the latest Riot answer replaces the previous one. */
export async function saveAccountRank(
  teamId: string,
  rank: AccountRank,
  syncedAt: Date,
): Promise<void> {
  const flex = queueColumns("RANKED_FLEX_SR", rank.flex);
  const solo = queueColumns("RANKED_SOLO_5x5", rank.solo);
  const { error } = await supabaseAdmin.from("premade_account_ranks").upsert(
    {
      team_id: teamId,
      puuid: rank.puuid,
      profile_icon_id: rank.profileIconId,
      summoner_level: rank.summonerLevel,
      queue_type: rank.queueType,
      tier: rank.tier,
      division: rank.division,
      league_points: rank.leaguePoints,
      wins: rank.wins,
      losses: rank.losses,
      flex_queue_type: flex.queue,
      flex_tier: flex.tier,
      flex_division: flex.division,
      flex_league_points: flex.leaguePoints,
      flex_wins: flex.wins,
      flex_losses: flex.losses,
      solo_queue_type: solo.queue,
      solo_tier: solo.tier,
      solo_division: solo.division,
      solo_league_points: solo.leaguePoints,
      solo_wins: solo.wins,
      solo_losses: solo.losses,
      fetched_at: rank.fetchedAt,
      next_sync_at: new Date(
        syncedAt.getTime() + RANK_REFRESH_MS,
      ).toISOString(),
      updated_at: syncedAt.toISOString(),
    },
    { onConflict: "team_id,puuid" },
  );
  if (error) throw error;
}

/** Roster accounts (active people and accounts) whose rank has to be fetched: all or one. */
export async function getRankSyncTargets(
  teamId: string,
  puuid?: string,
): Promise<string[]> {
  const owners = await getAccountOwners(teamId);
  const targets = Object.keys(owners);
  return puuid ? targets.filter((value) => value === puuid) : targets;
}

/** A timeline stops counting when the game it belongs to leaves the team. */
export async function forgetTimeline(
  teamId: string,
  matchId: string,
): Promise<void> {
  await supabaseAdmin
    .from("premade_timelines")
    .delete()
    .eq("team_id", teamId)
    .eq("match_id", matchId);
  await supabaseAdmin
    .from("premade_timeline_series")
    .delete()
    .eq("team_id", teamId)
    .eq("match_id", matchId);
}
