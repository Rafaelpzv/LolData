import {
  FIXTURE_NOW,
  createRng,
  decodeRiotSegment,
  platformOf,
  pick,
  puuidFromSeed,
  randInt,
  seedFromPuuid,
  shuffle,
  type Rng,
} from "./core";
import {
  ROSTER,
  generatedRiotId,
  personaBySeed,
  resolvePersona,
} from "./personas";

// Set 15 data: unit character_ids match ddragon's `img/tft-champion/<id>.png`
// (Set 16+ images use splash filenames that don't match a character_id).
const TFT_SET = 15;

const UNITS: Array<[id: string, cost: number]> = [
  ["TFT15_Aatrox", 1], ["TFT15_Ezreal", 1], ["TFT15_Garen", 1], ["TFT15_Kalista", 1],
  ["TFT15_Kayle", 1], ["TFT15_Kennen", 1], ["TFT15_Lucian", 1], ["TFT15_Malphite", 1],
  ["TFT15_Naafiri", 1], ["TFT15_Rell", 1], ["TFT15_Sivir", 1], ["TFT15_Syndra", 1], ["TFT15_Zac", 1],
  ["TFT15_DrMundo", 2], ["TFT15_Gangplank", 2], ["TFT15_Janna", 2], ["TFT15_Jhin", 2],
  ["TFT15_KaiSa", 2], ["TFT15_Katarina", 2], ["TFT15_Kobuko", 2], ["TFT15_Lux", 2],
  ["TFT15_Rakan", 2], ["TFT15_Shen", 2], ["TFT15_Vi", 2], ["TFT15_Xayah", 2], ["TFT15_XinZhao", 2],
  ["TFT15_Ahri", 3], ["TFT15_Caitlyn", 3], ["TFT15_Darius", 3], ["TFT15_Jayce", 3],
  ["TFT15_KogMaw", 3], ["TFT15_Lulu", 3], ["TFT15_Malzahar", 3], ["TFT15_Neeko", 3],
  ["TFT15_Rammus", 3], ["TFT15_Senna", 3], ["TFT15_Smolder", 3], ["TFT15_Swain", 3],
  ["TFT15_Udyr", 3], ["TFT15_Viego", 3], ["TFT15_Yasuo", 3], ["TFT15_Ziggs", 3],
  ["TFT15_Akali", 4], ["TFT15_Ashe", 4], ["TFT15_JarvanIV", 4], ["TFT15_Jinx", 4],
  ["TFT15_KSante", 4], ["TFT15_Karma", 4], ["TFT15_Leona", 4], ["TFT15_Poppy", 4],
  ["TFT15_Ryze", 4], ["TFT15_Samira", 4], ["TFT15_Sett", 4], ["TFT15_Volibear", 4], ["TFT15_Yuumi", 4],
  ["TFT15_Braum", 5], ["TFT15_Ekko", 5], ["TFT15_Gwen", 5], ["TFT15_LeeSin", 5],
  ["TFT15_Seraphine", 5], ["TFT15_TwistedFate", 5], ["TFT15_Varus", 5], ["TFT15_Yone", 5], ["TFT15_Zyra", 5],
];

// Riot's `rarity` is not cost-1 for 4/5 costs.
const RARITY_BY_COST: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 4, 5: 6 };

const TRAITS: Array<[id: string, breakpoints: number[]]> = [
  ["TFT15_BattleAcademia", [3, 5, 7]],
  ["TFT15_StarGuardian", [2, 3, 4, 5, 6, 7, 8, 9, 10]],
  ["TFT15_SoulFighter", [2, 4, 6, 8]],
  ["TFT15_SupremeCells", [2, 3, 4]],
  ["TFT15_SentaiRanger", [3, 5, 7]],
  ["TFT15_Luchador", [2, 4]],
  ["TFT15_GemForce", [3, 5, 7, 10]],
  ["TFT15_TheCrew", [1, 2, 3, 4, 5]],
  ["TFT15_Bastion", [2, 4, 6]],
  ["TFT15_Destroyer", [2, 4, 6]],
  ["TFT15_DragonFist", [1]],
  ["TFT15_Edgelord", [2, 4, 6]],
  ["TFT15_Empyrean", [2, 3, 4, 5]],
  ["TFT15_Heavyweight", [2, 4, 6]],
  ["TFT15_Spellslinger", [2, 4, 6]],
  ["TFT15_Juggernaut", [2, 4, 6]],
  ["TFT15_Sniper", [2, 3, 4, 5]],
  ["TFT15_Protector", [2, 4, 6]],
  ["TFT15_Duelist", [2, 4, 6]],
  ["TFT15_Strategist", [2, 3, 4, 5]],
  ["TFT15_Prodigy", [2, 3, 4, 5]],
  ["TFT15_OldMentor", [1, 4]],
  ["TFT15_ElTigre", [1]],
  ["TFT15_Rosemother", [1]],
];

const AUGMENTS = [
  "TFT15_Augment_BattleAcademiaCrest",
  "TFT15_Augment_ProtectorCrest",
  "TFT15_Augment_ChallengerCirclet",
  "TFT15_Augment_SoulFighterCirclet",
  "TFT15_Augment_BattleAcademia_TransferStudents",
  "TFT15_Augment_MalphiteCarry",
  "TFT15_Augment_NeekoCarry",
  "TFT15_Augment_Juggernaut_Indomitable",
  "TFT_Augment_BranchingOut",
  "TFT_Augment_WorthTheWaitGold",
  "TFT_Augment_CalledShot",
  "TFT_Augment_Flexible",
  "TFT_Augment_ThornPlatedArmor",
  "TFT_Augment_UpwardMobility",
  "TFT_Augment_PatienceIsAVirtue",
  "TFT_Augment_HighVoltage",
  "TFT_Augment_HardCommit",
  "TFT_Augment_DuoQueue",
];

const ITEM_NAMES = [
  "TFT_Item_InfinityEdge", "TFT_Item_JeweledGauntlet", "TFT_Item_GuinsoosRageblade",
  "TFT_Item_WarmogsArmor", "TFT_Item_Bloodthirster", "TFT_Item_GargoyleStoneplate",
  "TFT_Item_SpearOfShojin", "TFT_Item_ArchangelsStaff", "TFT_Item_Redemption",
  "TFT_Item_TitansResolve", "TFT_Item_HextechGunblade", "TFT_Item_LastWhisper",
  "TFT_Item_Quicksilver", "TFT_Item_RedBuff", "TFT_Item_StatikkShiv",
  "TFT_Item_UnstableConcoction", "TFT_Item_Deathblade", "TFT_Item_MadredsBloodrazor",
  "TFT_Item_BrambleVest", "TFT_Item_DragonsClaw", "TFT_Item_IonicSpark",
  "TFT_Item_Morellonomicon", "TFT_Item_RabadonsDeathcap", "TFT_Item_NightHarvester",
  "TFT_Item_GuardianAngel", "TFT_Item_ThiefsGloves", "TFT_Item_SpectralGauntlet",
  "TFT_Item_PowerGauntlet", "TFT_Item_Leviathan", "TFT_Item_AdaptiveHelm",
];

/** Owner placements for the 30-game pool: covers 1..8 several times. */
const OWNER_PLACEMENTS = [
  1, 4, 2, 7, 3, 8, 5, 1, 6, 2, 4, 3, 8, 1, 5, 2, 7, 4, 3, 6, 2, 1, 5, 8, 4, 3, 6, 2, 7, 1,
];

const TFT_POOL_SIZE = OWNER_PLACEMENTS.length;

// ---------------------------------------------------------------------------
// Match generation (tft-match-v1 shape)
// ---------------------------------------------------------------------------

function buildUnits(rng: Rng, level: number, placement: number) {
  const count = Math.max(4, Math.min(10, level + (rng() < 0.2 ? 1 : 0)));
  // Better placements skew toward higher cost units and more 3-stars.
  const maxCost = placement <= 2 ? 5 : placement <= 5 ? 4 : 3;
  const candidates = shuffle(
    rng,
    UNITS.filter(([, cost]) => cost <= maxCost),
  ).slice(0, count);

  return candidates
    .sort((a, b) => a[1] - b[1])
    .map(([characterId, cost], i) => {
      const starRoll = rng();
      const tier =
        cost <= 2 && starRoll < (placement <= 4 ? 0.45 : 0.2)
          ? 3
          : starRoll < 0.65
            ? 2
            : 1;
      const itemCount = i >= candidates.length - 3 ? randInt(rng, 1, 3) : rng() < 0.2 ? 1 : 0;
      const itemNames = shuffle(rng, ITEM_NAMES).slice(0, itemCount);
      return {
        character_id: characterId,
        // The live API returns itemNames; TftMatchList still reads the legacy
        // numeric `items`, so provide both (only its length is used).
        itemNames,
        items: itemNames.map((_, k) => 10 + k),
        name: "",
        rarity: RARITY_BY_COST[cost],
        tier,
      };
    });
}

function buildTraits(rng: Rng, placement: number) {
  const count = randInt(rng, 5, 9);
  const chosen = shuffle(rng, TRAITS).slice(0, count);
  return chosen
    .map(([name, breakpoints], i) => {
      // One inactive trait, one chromatic for good boards, rest bronze..gold.
      const inactive = i === chosen.length - 1;
      const tierTotal = breakpoints.length;
      const tierCurrent = inactive
        ? 0
        : i === 0 && placement <= 3
          ? tierTotal
          : randInt(rng, 1, Math.max(1, Math.min(tierTotal, 2)));
      const numUnits = inactive
        ? Math.max(1, breakpoints[0] - 1)
        : breakpoints[Math.max(0, tierCurrent - 1)];
      const style = inactive
        ? 0
        : tierTotal === 1
          ? 3
          : tierCurrent === tierTotal
            ? 4
            : Math.min(3, tierCurrent);
      return {
        name,
        num_units: numUnits,
        style,
        tier_current: tierCurrent,
        tier_total: tierTotal,
      };
    })
    .sort((a, b) => b.style - a.style || b.num_units - a.num_units);
}

function buildTftParticipant(
  rng: Rng,
  identity: { puuid: string; gameName: string; tagLine: string },
  placement: number,
  gameLength: number,
) {
  const level = placement <= 2 ? randInt(rng, 9, 10) : placement <= 5 ? randInt(rng, 8, 9) : randInt(rng, 6, 8);
  const eliminatedAt = placement === 1 ? gameLength : gameLength * (0.55 + (8 - placement) * 0.06);
  return {
    augments: shuffle(rng, AUGMENTS).slice(0, 3),
    companion: {
      content_ID: "fx-companion",
      item_ID: randInt(rng, 1, 60),
      skin_ID: randInt(rng, 1, 40),
      species: pick(rng, ["PetTFTAvatar", "PetChibiAhri", "PetChibiJinx", "PetSprite"]),
    },
    gold_left: randInt(rng, 0, 60),
    last_round: placement === 1 ? randInt(rng, 38, 42) : 44 - placement * 2 - randInt(rng, 0, 2),
    level,
    missions: { PlayerScore2: randInt(rng, 60, 200) },
    placement,
    players_eliminated: placement === 1 ? randInt(rng, 2, 4) : randInt(rng, 0, placement <= 4 ? 2 : 1),
    puuid: identity.puuid,
    riotIdGameName: identity.gameName,
    riotIdTagline: identity.tagLine,
    time_eliminated: eliminatedAt + rng(),
    total_damage_to_players:
      placement <= 2 ? randInt(rng, 120, 190) : placement <= 4 ? randInt(rng, 70, 130) : randInt(rng, 15, 80),
    traits: buildTraits(rng, placement),
    units: buildUnits(rng, level, placement),
    win: placement <= 4,
  };
}

function tftMatchId(region: string, seed: number, index: number) {
  return `${platformOf(region)}_${seed}${String(index).padStart(3, "0")}`;
}

function parseTftMatchId(matchId: string): { seed: number; index: number } | null {
  const match = /^[A-Z0-9]+_(\d+)(\d{3})$/.exec(matchId);
  if (!match) return null;
  return { seed: Number(match[1]) >>> 0, index: Number(match[2]) };
}

function ownerTimeline(seed: number) {
  const rng = createRng(seed ^ 0x3c6ef372);
  const out: Array<{ end: number; length: number }> = [];
  let cursor = FIXTURE_NOW - randInt(rng, 10, 60) * 60_000;
  for (let i = 0; i < TFT_POOL_SIZE; i++) {
    // Riot sends a float; kept integral so "Xm Ys" renders cleanly in QA.
    const length = randInt(rng, 1500, 2350);
    out.push({ end: cursor, length });
    cursor -= Math.round(length * 1000) + (i % 6 === 5 ? randInt(rng, 9, 14) * 3_600_000 : randInt(rng, 2, 50) * 60_000);
  }
  return out;
}

function buildTftMatch(region: string, ownerPuuid: string, index: number) {
  const seed = seedFromPuuid(ownerPuuid);
  const rng = createRng((seed ^ Math.imul(index + 1, 0xc2b2ae35)) >>> 0);
  const { end, length } = ownerTimeline(seed)[index];

  const persona = personaBySeed(seed);
  const ownerId = persona ?? generatedRiotId(seed);
  const owner = { puuid: ownerPuuid, gameName: ownerId.gameName, tagLine: ownerId.tagLine };

  const others = shuffle(rng, ROSTER.filter((p) => p.puuid !== ownerPuuid)).slice(0, 7);
  const ownerPlacement = OWNER_PLACEMENTS[index % OWNER_PLACEMENTS.length];
  const otherPlacements = shuffle(
    rng,
    [1, 2, 3, 4, 5, 6, 7, 8].filter((p) => p !== ownerPlacement),
  );

  const participants = [
    buildTftParticipant(rng, owner, ownerPlacement, length),
    ...others.map((p, i) => buildTftParticipant(rng, p, otherPlacements[i], length)),
  ];

  const matchId = tftMatchId(region, seed, index);
  return {
    metadata: {
      data_version: "6",
      match_id: matchId,
      participants: participants.map((p) => p.puuid),
    },
    info: {
      endOfGameResult: "GameComplete",
      gameCreation: end - Math.round(length * 1000),
      gameId: Number(matchId.split("_")[1]),
      game_datetime: end,
      game_length: length,
      game_version: "Linux Version 15.18.707.1234 (Sep 10 2025/12:00:00) [PUBLIC] <Releases/15.18>",
      mapId: 22,
      participants,
      queueId: 1100,
      queue_id: 1100,
      tft_game_type: "standard",
      tft_set_core_name: `TFTSet${TFT_SET}`,
      tft_set_number: TFT_SET,
    },
  };
}

function isNoMatchesPuuid(puuid: string) {
  return Boolean(personaBySeed(seedFromPuuid(puuid))?.noMatches);
}

// ---------------------------------------------------------------------------
// Public fixture builders
// ---------------------------------------------------------------------------

/** Body of GET /api/tft/matches. */
export function fixtureTftMatches(params: {
  region: string;
  puuid: string;
  start?: number;
  count?: number;
}) {
  const start = Math.max(0, Number(params.start) || 0);
  const count = Math.max(1, Math.min(100, Number(params.count) || 20));
  const total = isNoMatchesPuuid(params.puuid) ? 0 : TFT_POOL_SIZE;
  const end = Math.min(total, start + count);
  const data = [];
  for (let i = start; i < end; i++) {
    data.push(buildTftMatch(params.region, params.puuid, i));
  }
  return { data, cache: "FIXTURE", hasMore: end < total };
}

export function fixtureTftSummonerByRiotId(region: string, gameName: string, tagLine: string) {
  const persona = resolvePersona(decodeRiotSegment(gameName), decodeRiotSegment(tagLine), region);
  if (!persona) return null;
  return {
    puuid: persona.puuid,
    name: persona.gameName,
    tagLine: persona.tagLine,
    profileIconId: persona.profileIconId,
    summonerLevel: persona.summonerLevel,
  };
}

export function fixtureTftLeagueByPuuid(region: string, puuid: string) {
  if (!puuid) return [];
  const seed = seedFromPuuid(puuid);
  const persona = personaBySeed(seed) ?? (() => {
    const id = generatedRiotId(seed);
    return resolvePersona(id.gameName, id.tagLine) ?? undefined;
  })();
  const r = persona?.tft;
  if (!r) return [];
  const entries: Array<{
    queueType: string;
    puuid: string;
    wins: number;
    losses: number;
    leagueId?: string;
    tier?: string;
    rank?: string;
    summonerId?: string;
    leaguePoints?: number;
    veteran?: boolean;
    inactive?: boolean;
    freshBlood?: boolean;
    hotStreak?: boolean;
    ratedTier?: string;
    ratedRating?: number;
  }> = [
    {
      leagueId: `fx-tft-league-${seed % 1000}`,
      queueType: "RANKED_TFT",
      tier: r.tier,
      rank: r.rank,
      puuid,
      summonerId: `fx-summoner-${puuid.slice(2, 14)}`,
      leaguePoints: r.leaguePoints,
      wins: r.wins,
      losses: r.losses,
      veteran: r.wins + r.losses > 200,
      inactive: false,
      freshBlood: r.wins + r.losses < 30,
      hotStreak: r.hotStreak ?? false,
    },
  ];
  // Hyper Roll uses rated tiers instead of divisions.
  if (seed % 2 === 0) {
    entries.push({
      queueType: "RANKED_TFT_TURBO",
      ratedTier: pick(createRng(seed), ["GRAY", "GREEN", "BLUE", "PURPLE", "ORANGE"]),
      ratedRating: randInt(createRng(seed + 1), 400, 4200),
      puuid,
      wins: randInt(createRng(seed + 2), 5, 80),
      losses: randInt(createRng(seed + 3), 5, 80),
    });
  }
  return entries;
}

export function fixtureTftMatchIds(region: string, puuid: string, count = 20) {
  if (!puuid || isNoMatchesPuuid(puuid)) return [];
  const seed = seedFromPuuid(puuid);
  const total = Math.min(TFT_POOL_SIZE, Math.max(0, count));
  return Array.from({ length: total }, (_, i) => tftMatchId(region, seed, i));
}

export function fixtureTftMatchById(region: string, matchId: string) {
  const parsed = parseTftMatchId(matchId);
  if (!parsed || parsed.index >= TFT_POOL_SIZE) {
    throw new Error(`Fixture TFT match not found: ${matchId}`);
  }
  return buildTftMatch(region, puuidFromSeed(parsed.seed), parsed.index);
}
