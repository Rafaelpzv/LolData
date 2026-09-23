import { normalizeRegion } from "./regions";

export type Game = "lol" | "tft";

export type ParsedRiotId =
  | { ok: true; gameName: string; tagLine: string }
  | { ok: false; error: "invalidRiotId" };

const clean = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[⁦-⁩​-‍﻿]/g, "") // bidi isolates / zero-width chars pasted from the client
    .replace(/\s+/g, " ")
    .trim();

/** Parses "Name#TAG". Both parts are required. */
export function parseRiotId(input: string): ParsedRiotId {
  const parts = clean(input).split("#");
  if (parts.length !== 2) return { ok: false, error: "invalidRiotId" };
  const [gameName, tagLine] = parts.map(clean);
  if (!gameName || !tagLine) return { ok: false, error: "invalidRiotId" };
  return { ok: true, gameName, tagLine };
}

/** Profile URL for a player. Region is lowercased in profile routes. */
export function profileHref(
  game: Game,
  region: string,
  gameName: string,
  tagLine: string,
): string {
  const r = normalizeRegion(region).toLowerCase();
  const name = encodeURIComponent(gameName);
  const tag = encodeURIComponent(tagLine);
  return game === "tft" ? `/tft/${r}/${name}/${tag}` : `/lol/${r}/${name}/${tag}/all/all`;
}

/**
 * Decodes a dynamic route segment exactly once. Next 16 (Turbopack) may hand params over still
 * percent-encoded; other versions decode them. Normalizes both cases.
 */
export function decodeParamOnce(value: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}
