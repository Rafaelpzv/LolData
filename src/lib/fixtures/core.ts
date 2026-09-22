// Shared helpers for dev fixtures mode (USE_FIXTURES=1).
// Everything here is deterministic: the same inputs always produce the same
// data, so screenshots are reproducible across requests and restarts.

/** Fixed "now" for fixtures: 2026-09-20 22:00 UTC. */
export const FIXTURE_NOW = Date.UTC(2026, 8, 20, 22, 0, 0);

export type Rng = () => number;

/** FNV-1a 32-bit hash. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG, returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// PUUIDs
// ---------------------------------------------------------------------------
// Fixture puuids embed their seed ("fx<seed base36>-...") so any code path
// that only receives a puuid (or a match id built from the seed) can recover
// which persona it belongs to without shared module state.

const PUUID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function puuidFromSeed(seed: number): string {
  const rng = createRng(seed ^ 0x9e3779b9);
  let out = `fx${(seed >>> 0).toString(36)}-`;
  while (out.length < 78) {
    out += PUUID_ALPHABET[Math.floor(rng() * PUUID_ALPHABET.length)];
  }
  return out;
}

export function seedFromPuuid(puuid: string): number {
  const match = /^fx([0-9a-z]+)-/.exec(puuid);
  if (match) {
    const seed = parseInt(match[1], 36);
    if (Number.isFinite(seed)) return seed >>> 0;
  }
  return hashString(puuid);
}

export function riotIdKey(gameName: string, tagLine: string): string {
  return `${gameName}#${tagLine}`.normalize("NFC").toLowerCase();
}

export function seedFromRiotId(gameName: string, tagLine: string): number {
  return hashString(riotIdKey(gameName, tagLine));
}

export function puuidForRiotId(gameName: string, tagLine: string): string {
  return puuidFromSeed(seedFromRiotId(gameName, tagLine));
}

/** Same normalization the actions apply to route params. */
export function decodeRiotSegment(value: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** "br1" -> "BR1", used as the match id prefix / platformId. */
export function platformOf(region: string): string {
  return (region || "br1").toUpperCase();
}
