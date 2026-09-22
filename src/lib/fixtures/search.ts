import { ROSTER } from "./personas";

const MAX_RESULTS = 8;

/** Body of GET /api/summoners/autocomplete (same matching rules as the route). */
export function fixtureAutocomplete(q: string) {
  const raw = (q || "").trim().toLowerCase();
  if (!raw) return [];

  const parts = raw.replace(/[%_*]/g, "").split("#");
  const namePart = (parts[0] || "").trim();
  const tagPart = parts.length > 1 ? (parts[1] || "").trim() : "";

  const matches = ROSTER.filter((p) => {
    const name = p.gameName.toLowerCase();
    const tag = p.tagLine.toLowerCase();
    if (parts.length > 1 && namePart && tagPart) {
      return name.includes(namePart) && tag.includes(tagPart);
    }
    const term = namePart || tagPart;
    return Boolean(term) && (name.includes(term) || tag.includes(term));
  });

  return matches.slice(0, MAX_RESULTS).map((p) => ({
    region: p.region,
    gameName: p.gameName,
    tagLine: p.tagLine,
    puuid: p.puuid,
  }));
}

/** Body of GET /api/summoner/players/status. Always "cached" so expanding a
 * match card does not start the background history warm-up loop. */
export function fixturePlayerStatus() {
  return { exists: true, count: 40 };
}

/** Body of GET /api/summoners/backfill. */
export function fixtureBackfill() {
  return { scanned: 0, inserted: 0 };
}
