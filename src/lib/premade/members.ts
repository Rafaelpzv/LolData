// Team registration rules: a premade is a set of people, each with one or more accounts.
import { z } from "zod";

import { normalizeRegion, REGIONS } from "../../lib/regions";
import { parseRiotId } from "../../lib/riot-id";

import type {
  AccountOwners,
  PremadeAccount,
  PremadeMember,
  PremadePlayer,
} from "./types";

/** A team needs three people at least: a trio is the smallest premade that still shares a side. */
export const PREMADE_MIN_SIZE = 3;
/** A full premade is five people: the registration form offers this many slots. */
export const PREMADE_SIZE = 5;

const RIOT_ID_MAX = 32;

function optionalName(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;
  return value.length <= RIOT_ID_MAX ? value : null;
}

export const createPremadePayloadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.replace(/\s+/g, " ")),
  region: z
    .string()
    .transform((value) => normalizeRegion(value))
    .refine((value) => REGIONS.some((r) => r.code === value)),
  // A trio is enough; five is the ceiling of a Flex side.
  riotIds: z.array(z.string()).min(PREMADE_MIN_SIZE).max(PREMADE_SIZE),
});

export type CreatePremadePayload = z.infer<typeof createPremadePayloadSchema>;

/** A player the Riot lookup resolved, in registration order. */
export interface ResolvedPlayer {
  slot: number;
  puuid: string;
  gameName: string;
  tagLine: string;
}

/**
 * Stable, URL-safe team handle: "Rifu Squad" -> "rifu-squad-482910".
 *
 * The numeric suffix is what makes a slug unguessable, and the team page is readable by anyone
 * holding the link (the password only guards editing). Four digits meant 10k possibilities per
 * name; six makes the guess 100x harder. Slugs already stored keep their shorter suffix.
 */
export function teamSlug(name: string): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "team";
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `${base}-${suffix}`;
}

export type BuildMembersError = "duplicatePlayers";

/**
 * Turns the resolved players into the members of a team: three to five of them.
 * Returns the error key instead of a translated string: the caller owns the text.
 */
export function buildMembers(
  players: ResolvedPlayer[],
):
  | { ok: true; members: PremadeMember[] }
  | { ok: false; error: BuildMembersError } {
  if (players.length < PREMADE_MIN_SIZE || players.length > PREMADE_SIZE) {
    return { ok: false, error: "duplicatePlayers" };
  }

  const seen = new Set<string>();
  const members: PremadeMember[] = [];

  for (const player of players) {
    const gameName = optionalName(player.gameName);
    const tagLine = optionalName(player.tagLine);
    // Riot resolved the account: a missing name means a bad payload, not a console error.
    if (!gameName || !tagLine || !player.puuid)
      return { ok: false, error: "duplicatePlayers" };
    if (seen.has(player.puuid)) return { ok: false, error: "duplicatePlayers" };
    seen.add(player.puuid);
    members.push({ puuid: player.puuid, gameName, tagLine, slot: player.slot });
  }

  members.sort((a, b) => a.slot - b.slot);
  return { ok: true, members };
}

/** The accounts of a person that still count for new games. */
export function accountsActive(player: PremadePlayer): PremadeAccount[] {
  return player.accounts.filter((account) => !account.archived);
}

/** The roster people that are still on the lineup. */
export function activePlayers(
  players: readonly PremadePlayer[],
): PremadePlayer[] {
  return players.filter((player) => !player.archived);
}

/**
 * Every active account of the roster, mapped to the person that owns it. Two accounts of the same
 * person map to the same id, which is what makes a game count people instead of accounts.
 */
export function accountOwners(
  players: readonly PremadePlayer[],
): AccountOwners {
  const owners: Record<string, string> = {};
  for (const player of activePlayers(players)) {
    for (const account of accountsActive(player))
      owners[account.puuid] = player.id;
  }
  return owners;
}

/** The accounts that are actually collected: every player, archived or not, so history stays. */
export function rosterPuuids(players: readonly PremadePlayer[]): string[] {
  return players.flatMap((player) =>
    player.accounts.map((account) => account.puuid),
  );
}

/** Display name of a person: the first account on the roster. */
export function playerLabel(player: PremadePlayer): string {
  return (
    (accountsActive(player)[0] ?? player.accounts[0])?.gameName ??
    player.gameName
  );
}

/** Which person a Riot ID belongs to, or null when it is not on the roster yet. Idempotent. */
export function ownerOf(
  puuid: string,
  players: readonly PremadePlayer[],
): PremadePlayer | null {
  return (
    players.find((player) =>
      player.accounts.some((account) => account.puuid === puuid),
    ) ?? null
  );
}

/**
 * The form allows one field to hold "a#tag, b#tag, ..." so every ID can be pasted at once.
 * Comma, semicolon or newline separated; a stray trailing separator is ignored.
 */
export function splitRiotIdInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((part) => parseRiotId(part))
    .filter(
      (parsed): parsed is { ok: true; gameName: string; tagLine: string } =>
        parsed.ok,
    )
    .map(({ gameName, tagLine }) => `${gameName}#${tagLine}`);
}
