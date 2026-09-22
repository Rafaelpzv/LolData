import { FIXTURE_NOW, createRng, hashString, randInt, type Rng } from "./core";
import {
  PROFILE_ICONS,
  ROSTER,
  generatedRiotId,
  resolvePersona,
} from "./personas";

interface LeaderboardEntry {
  puuid: string;
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

interface SummonerName {
  gameName: string;
  tagLine: string;
  profileIconId: number | null;
}

interface Leaderboard {
  entries: LeaderboardEntry[];
  names: Record<string, SummonerName>;
  challengerCount: number;
  grandmasterCount: number;
  masterCount: number;
  regionMode: "three-pages" | "two-pages";
}

const boardCache = new Map<string, Leaderboard>();

const THREE_PAGE_REGIONS = new Set(["KR", "NA1", "EUW1", "VN2"]);

// Roster players pinned to the top of page 1 so unicode / long / 0W-0L names
// are always on screen. Index = 0-based leaderboard position.
const PINNED_POSITIONS = [0, 2, 3, 5, 7, 9, 12, 16, 21, 30];

/**
 * Descending LP ladder: challenger -> grandmaster -> master. Ties are allowed
 * (a decrement of 0), as on real ladders.
 */
function buildLeaderboard(key: string, region: string, isTft: boolean): Leaderboard {
  const cached = boardCache.get(key);
  if (cached) return cached;
  const seed = hashString(key);
  const rng = createRng(seed);
  const regionMode = THREE_PAGE_REGIONS.has(region.toUpperCase()) ? "three-pages" : "two-pages";

  const challengerCount = regionMode === "three-pages" ? 300 : 200;
  const grandmasterCount = 250;
  const masterCount = 150;
  const total = challengerCount + grandmasterCount + masterCount;

  const topLp = (isTft ? 1650 : 1750) + randInt(rng, 0, 350);
  const challengerFloor = isTft ? 820 : 900;
  const grandmasterFloor = isTft ? 380 : 430;

  const step = (from: number, to: number, count: number) => ((from - to) / count) * 2;

  const names: Record<string, SummonerName> = {};
  const usedIds = new Set<string>();
  const pinned = ROSTER.slice(0, PINNED_POSITIONS.length);
  const entries: LeaderboardEntry[] = [];
  let lp = topLp;

  for (let i = 0; i < total; i++) {
    const inChallenger = i < challengerCount;
    const inGrandmaster = !inChallenger && i < challengerCount + grandmasterCount;
    const decrement = inChallenger
      ? step(topLp, challengerFloor, challengerCount)
      : inGrandmaster
        ? step(challengerFloor, grandmasterFloor, grandmasterCount)
        : step(grandmasterFloor, 0, masterCount);
    if (i > 0) lp = Math.max(0, lp - Math.round(decrement * rng()));

    const pinIndex = PINNED_POSITIONS.indexOf(i);
    const identity = pinIndex >= 0 ? pinned[pinIndex] : uniqueGenerated(rng, usedIds);
    usedIds.add(`${identity.gameName}#${identity.tagLine}`.toLowerCase());
    const persona = resolvePersona(identity.gameName, identity.tagLine, region);
    const puuid = persona?.puuid ?? `fx-rank-${i}`;

    const isZeroGames = identity.gameName === "Zer0Wins";
    const games = inChallenger ? randInt(rng, 250, 900) : randInt(rng, 120, 600);
    const winRate = (inChallenger ? 0.53 : 0.5) + rng() * 0.1;
    const wins = isZeroGames ? 0 : Math.round(games * winRate);
    const losses = isZeroGames ? 0 : games - wins;

    entries.push({
      puuid,
      leaguePoints: lp,
      rank: "I",
      wins,
      losses,
      veteran: games > 600,
      inactive: false,
      freshBlood: games < 150,
      hotStreak: rng() < 0.12,
    });
    names[puuid] = {
      gameName: identity.gameName,
      tagLine: identity.tagLine,
      profileIconId: persona?.profileIconId ?? PROFILE_ICONS[i % PROFILE_ICONS.length],
    };
  }

  const board: Leaderboard = { entries, names, challengerCount, grandmasterCount, masterCount, regionMode };
  boardCache.set(key, board);
  return board;
}

function uniqueGenerated(rng: Rng, used: Set<string>) {
  for (let attempt = 0; ; attempt++) {
    const id = generatedRiotId(Math.floor(rng() * 0xffffffff));
    const key = `${id.gameName}#${id.tagLine}`.toLowerCase();
    if (!used.has(key)) return id;
    if (attempt > 5) {
      const tagLine = String(1000 + (used.size % 9000));
      return { gameName: id.gameName, tagLine };
    }
  }
}

function sampleLP(entries: LeaderboardEntry[]) {
  const at = (n: number) => (entries.length >= n ? entries[n - 1].leaguePoints : null);
  return {
    top: entries.length ? entries[0].leaguePoints : null,
    at200: at(200),
    at300: at(300),
    at500: at(500),
    last: entries.length ? entries[entries.length - 1].leaguePoints : null,
    count: entries.length,
  };
}

interface RankingsParams {
  region: string;
  page: number;
  limit: number;
}

/** Mirrors the JSON body built by the rankings route handlers. */
function rankingsBody(
  board: Leaderboard,
  params: RankingsParams,
  meta: { queue: string; name: string },
) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, params.limit || 500);
  const { entries, challengerCount, grandmasterCount } = board;

  const challengerEntries = entries.slice(0, challengerCount);
  const grandmasterEntries = entries.slice(challengerCount, challengerCount + grandmasterCount);
  const masterEntries = entries.slice(challengerCount + grandmasterCount);

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const pageEntries = entries.slice(startIndex, endIndex);

  const summonerNames: Record<string, SummonerName> = {};
  for (const entry of pageEntries) summonerNames[entry.puuid] = board.names[entry.puuid];

  const challengerCutoffPosition = challengerCount;
  const challengerCutoffLP = Math.max(entries[challengerCutoffPosition - 1].leaguePoints, 500);
  const grandmasterCutoffLP = Math.max(
    grandmasterEntries[grandmasterEntries.length - 1]?.leaguePoints ?? 0,
    200,
  );

  return {
    tier: "CHALLENGER+GM+MASTER",
    queue: meta.queue,
    name: meta.name,
    entries: pageEntries,
    summonerNames,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(entries.length / limit),
      totalEntries: entries.length,
      entriesPerPage: limit,
      hasNextPage: endIndex < entries.length,
      hasPreviousPage: page > 1,
    },
    cutoffs: {
      challenger: {
        actualCount: challengerEntries.length,
        cutoffPosition: challengerCutoffPosition,
        cutoffLP: challengerCutoffLP,
        sample: sampleLP(challengerEntries),
      },
      grandmaster: {
        actualCount: grandmasterEntries.length,
        cutoffLP: grandmasterCutoffLP,
        sample: sampleLP(grandmasterEntries),
      },
      master: {
        actualCount: masterEntries.length,
        cutoffLP: masterEntries[masterEntries.length - 1]?.leaguePoints ?? 0,
        sample: sampleLP(masterEntries),
      },
    },
    regionMode: board.regionMode,
    counts: {
      challenger: challengerEntries.length,
      grandmaster: grandmasterEntries.length,
      master: masterEntries.length,
    },
    cache: {
      isFromCache: true,
      isStale: false,
      updatedAt: new Date(FIXTURE_NOW - 4 * 60_000).toISOString(),
      ageInMinutes: 4,
      expiresInMinutes: 6,
      ttlMinutes: 10,
    },
  };
}

/** Body of GET /api/rankings. */
export function fixtureRankings(params: RankingsParams & { queueType: string }) {
  const region = params.region.toUpperCase();
  const board = buildLeaderboard(`lol:${region}:${params.queueType}`, region, false);
  return rankingsBody(board, params, {
    queue: params.queueType,
    name: `${params.region} Combined Leaderboard`,
  });
}

/** Body of GET /api/tft/rankings. */
export function fixtureTftRankings(params: RankingsParams) {
  const region = params.region.toUpperCase();
  const board = buildLeaderboard(`tft:${region}`, region, true);
  return rankingsBody(board, params, {
    queue: "RANKED_TFT",
    name: `${params.region} TFT Combined Leaderboard`,
  });
}
