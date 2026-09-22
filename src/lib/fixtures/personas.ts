import {
  createRng,
  hashString,
  pick,
  puuidFromSeed,
  randInt,
  riotIdKey,
  seedFromRiotId,
} from "./core";

export interface FixtureRank {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
}

export interface FixturePersona {
  seed: number;
  puuid: string;
  gameName: string;
  tagLine: string;
  /** Lowercase platform id used by the autocomplete ("br1", "kr"...). */
  region: string;
  profileIconId: number;
  summonerLevel: number;
  solo: FixtureRank | null;
  flex: FixtureRank | null;
  tft: FixtureRank | null;
  /** Set for the special "nomatches" persona. */
  noMatches?: boolean;
}

// Real profile icon ids (verified to exist on CommunityDragon).
export const PROFILE_ICONS = [
  29, 4568, 5367, 6, 588, 4834, 1, 7, 23, 3478, 4655, 5212, 6270, 685, 1665,
  4644,
] as const;

type PersonaSeedData = Omit<FixturePersona, "seed" | "puuid">;

const rank = (
  tier: string,
  division: string,
  leaguePoints: number,
  wins: number,
  losses: number,
  hotStreak = false,
): FixtureRank => ({ tier, rank: division, leaguePoints, wins, losses, hotStreak });

// Hand-picked roster: canonical profile + names that stress the UI
// (accents, CJK/Hangul, Greek, spaces, 16-char names, 3-char names, 0W/0L).
const ROSTER_DATA: PersonaSeedData[] = [
  {
    gameName: "Faker", tagLine: "KR1", region: "kr", profileIconId: 6, summonerLevel: 842,
    solo: rank("CHALLENGER", "I", 1432, 312, 241, true),
    flex: rank("GRANDMASTER", "I", 402, 61, 48),
    tft: rank("MASTER", "I", 188, 74, 66),
  },
  {
    gameName: "Ñandú", tagLine: "BR1", region: "br1", profileIconId: 4568, summonerLevel: 311,
    solo: rank("GRANDMASTER", "I", 655, 201, 180),
    flex: null,
    tft: rank("DIAMOND", "II", 45, 30, 28, true),
  },
  {
    gameName: "LongestNameEver1", tagLine: "0001", region: "br1", profileIconId: 5367, summonerLevel: 97,
    solo: rank("MASTER", "I", 87, 150, 149),
    flex: rank("EMERALD", "III", 12, 20, 25),
    tft: null,
  },
  {
    gameName: "Zer0Wins", tagLine: "000", region: "br1", profileIconId: 29, summonerLevel: 30,
    solo: rank("MASTER", "I", 0, 0, 0),
    flex: null,
    tft: rank("GOLD", "IV", 0, 0, 0),
  },
  {
    gameName: "εxεcutor", tagLine: "GR1", region: "euw1", profileIconId: 588, summonerLevel: 188,
    solo: rank("DIAMOND", "I", 99, 88, 70),
    flex: rank("PLATINUM", "II", 50, 14, 12),
    tft: rank("EMERALD", "I", 76, 41, 40),
  },
  {
    gameName: "시우", tagLine: "KR1", region: "kr", profileIconId: 4834, summonerLevel: 523,
    solo: rank("CHALLENGER", "I", 1988, 402, 300),
    flex: null,
    tft: rank("CHALLENGER", "I", 1210, 190, 120),
  },
  {
    gameName: "ゆめ", tagLine: "JP1", region: "jp1", profileIconId: 1665, summonerLevel: 264,
    solo: rank("GRANDMASTER", "I", 512, 170, 151),
    flex: null,
    tft: null,
  },
  {
    gameName: "Kai Sa Main", tagLine: "BR1", region: "br1", profileIconId: 685, summonerLevel: 402,
    solo: rank("CHALLENGER", "I", 1105, 280, 233),
    flex: rank("MASTER", "I", 140, 40, 31),
    tft: null,
  },
  {
    gameName: "xX_Sn1per_Xx", tagLine: "BR1", region: "br1", profileIconId: 3478, summonerLevel: 155,
    solo: rank("MASTER", "I", 233, 170, 160),
    flex: null,
    tft: rank("PLATINUM", "III", 33, 18, 22),
  },
  {
    gameName: "Ana", tagLine: "BR1", region: "br1", profileIconId: 1, summonerLevel: 61,
    solo: rank("GRANDMASTER", "I", 590, 120, 99, true),
    flex: null,
    tft: null,
  },
  {
    gameName: "Pão de Queijo", tagLine: "BR1", region: "br1", profileIconId: 7, summonerLevel: 377,
    solo: rank("CHALLENGER", "I", 1320, 350, 290),
    flex: null,
    tft: rank("MASTER", "I", 12, 60, 58),
  },
  {
    gameName: "Caçador", tagLine: "BRZ", region: "br1", profileIconId: 23, summonerLevel: 219,
    solo: rank("MASTER", "I", 311, 99, 90),
    flex: null,
    tft: null,
  },
  {
    gameName: "Jungle Diff", tagLine: "TOP", region: "br1", profileIconId: 4655, summonerLevel: 140,
    solo: rank("EMERALD", "II", 64, 70, 66),
    flex: null,
    tft: null,
  },
  {
    gameName: "TiltProof", tagLine: "2026", region: "br1", profileIconId: 5212, summonerLevel: 88,
    solo: rank("DIAMOND", "IV", 20, 44, 50),
    flex: rank("DIAMOND", "III", 71, 30, 22),
    tft: rank("DIAMOND", "IV", 5, 19, 20),
  },
  {
    gameName: "SmurfQueen", tagLine: "UwU", region: "br1", profileIconId: 6270, summonerLevel: 34,
    solo: rank("GRANDMASTER", "I", 701, 60, 18, true),
    flex: null,
    tft: null,
  },
  {
    gameName: "MidOrFeed", tagLine: "BR1", region: "br1", profileIconId: 4644, summonerLevel: 301,
    solo: rank("MASTER", "I", 150, 200, 199),
    flex: null,
    tft: null,
  },
  {
    gameName: "Crocodilo", tagLine: "BR1", region: "br1", profileIconId: 29, summonerLevel: 77,
    solo: rank("PLATINUM", "I", 88, 90, 93),
    flex: null,
    tft: rank("GOLD", "I", 70, 25, 30),
  },
  {
    gameName: "GankPlz", tagLine: "LAS", region: "la2", profileIconId: 588, summonerLevel: 199,
    solo: rank("DIAMOND", "II", 40, 101, 97),
    flex: null,
    tft: null,
  },
  {
    gameName: "NoFlash4U", tagLine: "NA1", region: "na1", profileIconId: 4568, summonerLevel: 256,
    solo: rank("MASTER", "I", 45, 130, 122),
    flex: null,
    tft: null,
  },
  {
    gameName: "Ashwalker", tagLine: "EUW", region: "euw1", profileIconId: 5367, summonerLevel: 412,
    solo: rank("GRANDMASTER", "I", 610, 240, 211),
    flex: null,
    tft: rank("GRANDMASTER", "I", 590, 100, 88),
  },
];

function toPersona(data: PersonaSeedData): FixturePersona {
  const seed = seedFromRiotId(data.gameName, data.tagLine);
  return { ...data, seed, puuid: puuidFromSeed(seed) };
}

export const ROSTER: FixturePersona[] = ROSTER_DATA.map(toPersona);

export const CANONICAL_PERSONA = ROSTER[0];

const ROSTER_BY_KEY = new Map(
  ROSTER.map((p) => [riotIdKey(p.gameName, p.tagLine), p]),
);
const ROSTER_BY_SEED = new Map(ROSTER.map((p) => [p.seed, p]));

// Special gameNames (any tagLine) to preview empty / error states.
export const SPECIAL_NOT_FOUND = "notfound";
export const SPECIAL_UNRANKED = "unranked";
export const SPECIAL_NO_MATCHES = "nomatches";
const NO_MATCHES_SEED = 7;

const TIERS_BELOW_MASTER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND",
] as const;
const DIVISIONS = ["IV", "III", "II", "I"] as const;

function generatedRank(seed: number): FixtureRank {
  const rng = createRng(seed ^ 0x51ed270b);
  const tier = pick(rng, TIERS_BELOW_MASTER);
  const wins = randInt(rng, 20, 180);
  const losses = randInt(rng, 20, 180);
  return rank(tier, pick(rng, DIVISIONS), randInt(rng, 0, 99), wins, losses);
}

/**
 * Resolves any Riot ID to a persona. Roster names return their hand-written
 * data; any other name gets a deterministic generated profile. Returns null
 * for the special "notfound" gameName.
 */
export function resolvePersona(
  gameName: string,
  tagLine: string,
  region = "br1",
): FixturePersona | null {
  const lower = gameName.normalize("NFC").toLowerCase();
  if (lower === SPECIAL_NOT_FOUND) return null;

  const known = ROSTER_BY_KEY.get(riotIdKey(gameName, tagLine));
  if (known) return known;

  if (lower === SPECIAL_NO_MATCHES) {
    return {
      seed: NO_MATCHES_SEED,
      puuid: puuidFromSeed(NO_MATCHES_SEED),
      gameName,
      tagLine,
      region: region.toLowerCase(),
      profileIconId: 29,
      summonerLevel: 1,
      solo: null,
      flex: null,
      tft: null,
      noMatches: true,
    };
  }

  const seed = seedFromRiotId(gameName, tagLine);
  const rng = createRng(seed);
  const unranked = lower === SPECIAL_UNRANKED;
  return {
    seed,
    puuid: puuidFromSeed(seed),
    gameName,
    tagLine,
    region: region.toLowerCase(),
    profileIconId: pick(rng, PROFILE_ICONS),
    summonerLevel: randInt(rng, 30, 700),
    solo: unranked ? null : generatedRank(seed),
    flex: unranked || rng() < 0.5 ? null : generatedRank(seed + 1),
    tft: unranked || rng() < 0.4 ? null : generatedRank(seed + 2),
  };
}

/** Finds a roster persona (or the no-matches persona) from a puuid seed. */
export function personaBySeed(seed: number): FixturePersona | undefined {
  if (seed === NO_MATCHES_SEED) {
    return resolvePersona(SPECIAL_NO_MATCHES, "0000") ?? undefined;
  }
  return ROSTER_BY_SEED.get(seed);
}

// ---------------------------------------------------------------------------
// Generated names for leaderboards / filler participants
// ---------------------------------------------------------------------------

const NAME_PREFIXES = [
  "Shadow", "Dark", "Lil", "Mr", "Neo", "Sir", "Kami", "Blue", "Ice", "Toxic",
  "Silent", "Lucky", "Hyper", "Dr", "Rei do", "Não", "El", "Coração",
] as const;
const NAME_CORES = [
  "Fox", "Mid", "Jungler", "Rider", "Ghost", "Wolf", "Viper", "Tempest", "Zeca",
  "Tigrinho", "Lobo", "Pixel", "Nova", "Kaiser", "Ronin", "Sombra", "Raio",
  "Açaí", "Dragão", "Yone", "Kindred", "Baron",
] as const;
const NAME_SUFFIXES = [
  "", "", "", "1", "7", "99", "BR", "x", "GG", "TTV", "Jr", " II", "2k",
] as const;
const TAGS = [
  "BR1", "BR1", "BR1", "0001", "KR1", "2077", "TTV", "GG", "LOL", "NA1", "ñ",
  "BRZ", "666", "777", "SUP",
] as const;

export function generatedRiotId(seed: number): { gameName: string; tagLine: string } {
  const rng = createRng(seed ^ 0x2545f491);
  const usePrefix = rng() < 0.55;
  const raw = `${usePrefix ? pick(rng, NAME_PREFIXES) + (rng() < 0.3 ? " " : "") : ""}${pick(
    rng,
    NAME_CORES,
  )}${pick(rng, NAME_SUFFIXES)}`;
  const gameName = raw.slice(0, 16).trim() || "Invocador";
  return { gameName, tagLine: pick(rng, TAGS) };
}

/** Stable seed for a string key (re-exported for fixture modules). */
export const seedOf = hashString;
