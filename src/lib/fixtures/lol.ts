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
  type FixturePersona,
  type FixtureRank,
} from "./personas";

// ---------------------------------------------------------------------------
// Static data (real Riot ids so CDN images resolve)
// ---------------------------------------------------------------------------

type Position = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
type Kit = "ap" | "adc" | "bruiser" | "lethality" | "crit" | "enchanter" | "tank";

interface Champion {
  id: number;
  /** DDragon key, as match-v5 `championName` returns it. */
  key: string;
  position: Position;
  kit: Kit;
}

const CHAMPIONS: Champion[] = [
  { id: 266, key: "Aatrox", position: "TOP", kit: "bruiser" },
  { id: 875, key: "Sett", position: "TOP", kit: "bruiser" },
  { id: 122, key: "Darius", position: "TOP", kit: "bruiser" },
  { id: 86, key: "Garen", position: "TOP", kit: "bruiser" },
  { id: 897, key: "KSante", position: "TOP", kit: "tank" },
  { id: 58, key: "Renekton", position: "TOP", kit: "bruiser" },
  { id: 64, key: "LeeSin", position: "JUNGLE", kit: "bruiser" },
  { id: 62, key: "MonkeyKing", position: "JUNGLE", kit: "bruiser" },
  { id: 104, key: "Graves", position: "JUNGLE", kit: "lethality" },
  { id: 234, key: "Viego", position: "JUNGLE", kit: "bruiser" },
  { id: 254, key: "Vi", position: "JUNGLE", kit: "bruiser" },
  { id: 103, key: "Ahri", position: "MIDDLE", kit: "ap" },
  { id: 157, key: "Yasuo", position: "MIDDLE", kit: "crit" },
  { id: 84, key: "Akali", position: "MIDDLE", kit: "ap" },
  { id: 238, key: "Zed", position: "MIDDLE", kit: "lethality" },
  { id: 1, key: "Annie", position: "MIDDLE", kit: "ap" },
  { id: 134, key: "Syndra", position: "MIDDLE", kit: "ap" },
  { id: 61, key: "Orianna", position: "MIDDLE", kit: "ap" },
  { id: 517, key: "Sylas", position: "MIDDLE", kit: "ap" },
  { id: 222, key: "Jinx", position: "BOTTOM", kit: "adc" },
  { id: 145, key: "Kaisa", position: "BOTTOM", kit: "adc" },
  { id: 81, key: "Ezreal", position: "BOTTOM", kit: "adc" },
  { id: 51, key: "Caitlyn", position: "BOTTOM", kit: "adc" },
  { id: 412, key: "Thresh", position: "UTILITY", kit: "tank" },
  { id: 89, key: "Leona", position: "UTILITY", kit: "tank" },
  { id: 111, key: "Nautilus", position: "UTILITY", kit: "tank" },
  { id: 99, key: "Lux", position: "UTILITY", kit: "enchanter" },
  { id: 267, key: "Nami", position: "UTILITY", kit: "enchanter" },
  { id: 235, key: "Senna", position: "UTILITY", kit: "enchanter" },
];

const CHAMPION_BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c]));

/** Champions the profile owner rotates through (the ones the brief asked for). */
const OWNER_POOL = [103, 64, 157, 222, 412, 266, 84, 875, 145, 238, 62, 1];

const POSITIONS: Position[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

// Completed items per kit, in build order (all verified in ddragon 16.18).
const ITEMS: Record<Kit, number[]> = {
  ap: [3020, 6653, 4645, 3089, 3157, 3135, 3165, 4646],
  adc: [3006, 3031, 3094, 3072, 3036, 6672, 3046, 3085],
  bruiser: [3047, 3071, 3053, 6333, 3074, 6610, 3161, 3111],
  lethality: [3158, 6692, 3142, 6694, 3179, 3814, 6676, 3071],
  crit: [3006, 3031, 6672, 3153, 3046, 3072, 3026, 3033],
  enchanter: [3009, 3504, 2065, 3107, 3222, 6616, 3190, 4629],
  tank: [3047, 3068, 3075, 3065, 3742, 3143, 3110, 3869],
};

const SPELLS: Record<Position, [number, number][]> = {
  TOP: [[4, 12], [4, 14], [12, 4]],
  JUNGLE: [[4, 11], [11, 4]],
  MIDDLE: [[4, 14], [4, 12], [21, 4], [4, 21]],
  BOTTOM: [[4, 7], [7, 4], [4, 21]],
  UTILITY: [[4, 14], [4, 3], [14, 4]],
};

interface RunePage {
  primary: number;
  keystones: number[];
  minors: number[];
  secondary: number;
  secondaryMinors: number[];
}

const RUNES: Record<Kit, RunePage[]> = {
  ap: [
    { primary: 8100, keystones: [8112], minors: [8139, 8140, 8135], secondary: 8200, secondaryMinors: [8226, 8237] },
    { primary: 8200, keystones: [8229], minors: [8226, 8210, 8237], secondary: 8300, secondaryMinors: [8304, 8347] },
  ],
  adc: [
    { primary: 8000, keystones: [8005, 8008], minors: [9111, 9104, 8014], secondary: 8100, secondaryMinors: [8139, 8135] },
    { primary: 8000, keystones: [8021], minors: [9101, 9104, 8017], secondary: 8300, secondaryMinors: [8304, 8345] },
  ],
  bruiser: [
    { primary: 8000, keystones: [8010], minors: [9111, 9105, 8299], secondary: 8400, secondaryMinors: [8444, 8453] },
    { primary: 8400, keystones: [8437], minors: [8446, 8444, 8242], secondary: 8000, secondaryMinors: [9111, 9105] },
  ],
  lethality: [
    { primary: 8100, keystones: [8112], minors: [8143, 8140, 8106], secondary: 8000, secondaryMinors: [9111, 8014] },
  ],
  crit: [
    { primary: 8000, keystones: [8008, 8010], minors: [9111, 9104, 8014], secondary: 8400, secondaryMinors: [8444, 8473] },
  ],
  enchanter: [
    { primary: 8200, keystones: [8214], minors: [8226, 8210, 8236], secondary: 8300, secondaryMinors: [8304, 8347] },
    { primary: 8300, keystones: [8351], minors: [8304, 8345, 8347], secondary: 8200, secondaryMinors: [8226, 8210] },
  ],
  tank: [
    { primary: 8400, keystones: [8465, 8439], minors: [8463, 8473, 8453], secondary: 8300, secondaryMinors: [8304, 8347] },
    { primary: 8300, keystones: [8351], minors: [8304, 8345, 8347], secondary: 8400, secondaryMinors: [8463, 8473] },
  ],
};

interface QueueInfo {
  queueId: number;
  map: string;
  description: string | null;
  notes: string | null;
}

/** Shape of static.developer.riotgames.com/docs/lol/queues.json. */
const QUEUES: QueueInfo[] = [
  { queueId: 0, map: "Custom games", description: null, notes: null },
  { queueId: 400, map: "Summoner's Rift", description: "5v5 Draft Pick games", notes: null },
  { queueId: 420, map: "Summoner's Rift", description: "5v5 Ranked Solo games", notes: null },
  { queueId: 430, map: "Summoner's Rift", description: "5v5 Blind Pick games", notes: null },
  { queueId: 440, map: "Summoner's Rift", description: "5v5 Ranked Flex games", notes: null },
  { queueId: 450, map: "Howling Abyss", description: "5v5 ARAM games", notes: null },
  { queueId: 490, map: "Summoner's Rift", description: "Normal (Quickplay)", notes: null },
  { queueId: 1700, map: "Rings of Wrath", description: "Arena", notes: null },
  { queueId: 1090, map: "Convergence", description: "Teamfight Tactics games", notes: null },
  { queueId: 1100, map: "Convergence", description: "Ranked Teamfight Tactics games", notes: null },
];

const DEFAULT_QUEUE_MIX = [420, 420, 420, 420, 420, 420, 440, 440, 450, 490];

const MATCH_POOL_SIZE = 40;
const CHAMPION_FILTER_POOL_SIZE = 14;

// ---------------------------------------------------------------------------
// Match generation (match-v5 shape)
// ---------------------------------------------------------------------------

function gameModeFor(queueId: number): string {
  if (queueId === 450) return "ARAM";
  if (queueId === 1700) return "CHERRY";
  return "CLASSIC";
}

function mapIdFor(queueId: number): number {
  if (queueId === 450) return 12;
  if (queueId === 1700) return 30;
  return 11;
}

interface Slot {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
  champion: Champion;
  position: Position;
  teamId: 100 | 200;
}

function buildItems(rng: Rng, kit: Kit, minutes: number, position: Position) {
  const completed = Math.max(1, Math.min(6, Math.floor(minutes / 6.5) + randInt(rng, -1, 0)));
  const pool = ITEMS[kit];
  const items = pool.slice(0, completed);
  // Early/short games keep a potion or control ward in the bag.
  if (items.length < 6 && rng() < 0.5) items.push(minutes < 20 ? 2003 : 2055);
  while (items.length < 6) items.push(0);
  // Occasionally shuffle an empty slot into the middle, like real inventories.
  const shuffled = rng() < 0.3 ? shuffle(rng, items) : items;
  const trinket =
    position === "UTILITY" || position === "JUNGLE"
      ? 3364
      : minutes > 25 && rng() < 0.4
        ? 3363
        : 3340;
  return [...shuffled, trinket];
}

function buildPerks(rng: Rng, kit: Kit) {
  const page = pick(rng, RUNES[kit]);
  const keystone = pick(rng, page.keystones);
  return {
    statPerks: { defense: 5011, flex: 5008, offense: pick(rng, [5005, 5008, 5007]) },
    styles: [
      {
        description: "primaryStyle",
        selections: [keystone, ...page.minors].map((perk) => ({
          perk,
          var1: randInt(rng, 200, 2400),
          var2: 0,
          var3: 0,
        })),
        style: page.primary,
      },
      {
        description: "subStyle",
        selections: page.secondaryMinors.map((perk) => ({
          perk,
          var1: randInt(rng, 0, 900),
          var2: 0,
          var3: 0,
        })),
        style: page.secondary,
      },
    ],
  };
}

function buildParticipant(
  rng: Rng,
  slot: Slot,
  win: boolean,
  seconds: number,
  queueId: number,
  forcedKda?: [number, number, number],
) {
  const minutes = seconds / 60;
  const { champion, position } = slot;
  const kit = champion.kit;
  const isSupport = position === "UTILITY";
  const isJungle = position === "JUNGLE";
  const isAram = queueId === 450;
  const carry = kit === "ap" || kit === "adc" || kit === "crit" || kit === "lethality";

  const [kills, deaths, assists] = forcedKda ?? [
    randInt(rng, isSupport ? 0 : 1, Math.round((carry ? 0.55 : 0.3) * minutes * (win ? 1.1 : 0.7))),
    randInt(rng, win ? 0 : 2, Math.round(minutes * (win ? 0.2 : 0.35))),
    randInt(rng, 2, Math.round(minutes * (isSupport ? 0.75 : 0.45))),
  ];

  const csPerMin = isAram ? 3.5 : isSupport ? 1.1 : isJungle ? 1.6 : 7 + rng() * 2.2;
  const totalMinionsKilled = Math.round(minutes * csPerMin);
  const neutralMinionsKilled = isJungle && !isAram ? Math.round(minutes * (4.8 + rng())) : randInt(rng, 0, 12);

  const dmgPerMin = isSupport ? 350 + rng() * 250 : carry ? 850 + rng() * 650 : 600 + rng() * 400;
  const takenPerMin = kit === "tank" ? 1300 + rng() * 500 : 700 + rng() * 450;
  const goldPerMin = isSupport ? 260 + rng() * 40 : 360 + rng() * 110 + (win ? 30 : 0);
  const visionPerMin = isAram ? 0 : isSupport ? 1.9 + rng() * 0.8 : isJungle ? 1 + rng() * 0.4 : 0.5 + rng() * 0.4;
  const [spell1, spell2] = isAram ? pick(rng, [[4, 32], [4, 7], [32, 14]] as [number, number][]) : pick(rng, SPELLS[position]);
  const items = buildItems(rng, kit, minutes, position);
  const totalDamageDealtToChampions = Math.round(minutes * dmgPerMin);
  const goldEarned = Math.round(minutes * goldPerMin);

  return {
    allInPings: randInt(rng, 0, 4),
    assistMePings: randInt(rng, 0, 6),
    assists,
    baronKills: 0,
    bountyLevel: 0,
    champExperience: Math.round(minutes * 620),
    champLevel: Math.min(18, Math.round(6 + minutes / 2.4)),
    championId: champion.id,
    championName: champion.key,
    championTransform: 0,
    consumablesPurchased: randInt(rng, 1, 8),
    damageDealtToBuildings: Math.round(minutes * (isSupport ? 60 : 180) * rng()),
    damageDealtToObjectives: Math.round(minutes * (isJungle ? 900 : 200) * rng()),
    damageSelfMitigated: Math.round(minutes * takenPerMin * 0.8),
    deaths,
    detectorWardsPlaced: isAram ? 0 : randInt(rng, 0, isSupport ? 9 : 3),
    doubleKills: kills > 6 ? randInt(rng, 0, 2) : 0,
    firstBloodAssist: false,
    firstBloodKill: false,
    firstTowerAssist: false,
    firstTowerKill: false,
    gameEndedInEarlySurrender: false,
    gameEndedInSurrender: seconds < 25 * 60,
    goldEarned,
    goldSpent: Math.round(goldEarned * (0.85 + rng() * 0.12)),
    individualPosition: isAram ? "Invalid" : position,
    inhibitorKills: win ? randInt(rng, 0, 1) : 0,
    inhibitorTakedowns: win ? randInt(rng, 0, 2) : 0,
    inhibitorsLost: win ? 0 : randInt(rng, 0, 2),
    item0: items[0],
    item1: items[1],
    item2: items[2],
    item3: items[3],
    item4: items[4],
    item5: items[5],
    item6: items[6],
    itemsPurchased: randInt(rng, 12, 30),
    killingSprees: Math.floor(kills / 3),
    kills,
    lane: isAram ? "NONE" : position === "UTILITY" || position === "BOTTOM" ? "BOTTOM" : position,
    largestCriticalStrike: kit === "adc" || kit === "crit" ? randInt(rng, 600, 1900) : 0,
    largestKillingSpree: Math.min(kills, randInt(rng, 0, 8)),
    largestMultiKill: kills > 0 ? randInt(rng, 1, Math.min(4, kills)) : 0,
    longestTimeSpentLiving: randInt(rng, 180, Math.max(181, Math.round(seconds * 0.6))),
    magicDamageDealt: Math.round(minutes * dmgPerMin * (kit === "ap" || kit === "enchanter" ? 4 : 0.6)),
    magicDamageDealtToChampions: Math.round(totalDamageDealtToChampions * (kit === "ap" || kit === "enchanter" ? 0.85 : 0.1)),
    magicDamageTaken: Math.round(minutes * takenPerMin * 0.4),
    neutralMinionsKilled,
    nexusKills: 0,
    nexusLost: win ? 0 : 1,
    nexusTakedowns: win ? 1 : 0,
    objectivesStolen: 0,
    objectivesStolenAssists: 0,
    participantId: 0,
    pentaKills: 0,
    perks: buildPerks(rng, kit),
    physicalDamageDealt: Math.round(minutes * dmgPerMin * (kit === "ap" ? 0.8 : 5)),
    physicalDamageDealtToChampions: Math.round(totalDamageDealtToChampions * (kit === "ap" || kit === "enchanter" ? 0.1 : 0.8)),
    physicalDamageTaken: Math.round(minutes * takenPerMin * 0.5),
    placement: 0,
    profileIcon: slot.profileIconId,
    puuid: slot.puuid,
    quadraKills: 0,
    riotIdGameName: slot.gameName,
    riotIdTagline: slot.tagLine,
    role: isAram ? "SOLO" : position === "BOTTOM" ? "CARRY" : position === "UTILITY" ? "SUPPORT" : position === "JUNGLE" ? "NONE" : "SOLO",
    sightWardsBoughtInGame: 0,
    spell1Casts: randInt(rng, 20, 200),
    spell2Casts: randInt(rng, 10, 120),
    spell3Casts: randInt(rng, 10, 120),
    spell4Casts: randInt(rng, 2, 20),
    summoner1Casts: randInt(rng, 1, 8),
    summoner1Id: spell1,
    summoner2Casts: randInt(rng, 1, 8),
    summoner2Id: spell2,
    summonerId: `fx-summoner-${slot.puuid.slice(2, 14)}`,
    summonerLevel: slot.summonerLevel,
    // Riot no longer fills summonerName for Riot ID accounts.
    summonerName: "",
    teamEarlySurrendered: false,
    teamId: slot.teamId,
    teamPosition: isAram ? "" : position,
    timeCCingOthers: randInt(rng, 5, kit === "tank" ? 90 : 35),
    timePlayed: seconds,
    totalAllyJungleMinionsKilled: isJungle ? Math.round(neutralMinionsKilled * 0.8) : 0,
    totalDamageDealt: Math.round(minutes * dmgPerMin * 6),
    totalDamageDealtToChampions,
    totalDamageShieldedOnTeammates: kit === "enchanter" ? Math.round(minutes * 250) : 0,
    totalDamageTaken: Math.round(minutes * takenPerMin),
    totalEnemyJungleMinionsKilled: isJungle ? randInt(rng, 0, 20) : 0,
    totalHeal: Math.round(minutes * (kit === "enchanter" ? 320 : 120)),
    totalHealsOnTeammates: kit === "enchanter" ? Math.round(minutes * 180) : 0,
    totalMinionsKilled,
    totalTimeCCDealt: randInt(rng, 20, 600),
    totalTimeSpentDead: deaths * randInt(rng, 15, 40),
    totalUnitsHealed: kit === "enchanter" ? randInt(rng, 3, 8) : 1,
    tripleKills: kills > 10 ? randInt(rng, 0, 1) : 0,
    trueDamageDealt: Math.round(minutes * dmgPerMin * 0.3),
    trueDamageDealtToChampions: Math.round(totalDamageDealtToChampions * 0.05),
    trueDamageTaken: Math.round(minutes * takenPerMin * 0.1),
    turretKills: win ? randInt(rng, 0, 3) : randInt(rng, 0, 1),
    turretTakedowns: win ? randInt(rng, 1, 6) : randInt(rng, 0, 2),
    turretsLost: win ? randInt(rng, 0, 5) : randInt(rng, 5, 11),
    unrealKills: 0,
    visionScore: Math.round(minutes * visionPerMin),
    visionWardsBoughtInGame: isAram ? 0 : randInt(rng, 0, isSupport ? 10 : 3),
    wardsKilled: isAram ? 0 : randInt(rng, 0, isSupport ? 12 : 5),
    wardsPlaced: isAram ? 0 : Math.round(minutes * (isSupport ? 1.2 : 0.35)),
    win,
  };
}

interface OwnerIdentity {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
  seed: number;
}

function ownerIdentity(
  puuid: string,
  gameName?: string,
  tagLine?: string,
): OwnerIdentity {
  const seed = seedFromPuuid(puuid);
  const persona = personaBySeed(seed);
  if (persona) return { ...persona, puuid };

  const fallback = generatedRiotId(seed);
  const resolved = resolvePersona(
    gameName ? decodeRiotSegment(gameName) : fallback.gameName,
    tagLine ? decodeRiotSegment(tagLine) : fallback.tagLine,
  );
  return {
    puuid,
    seed,
    gameName: resolved?.gameName ?? fallback.gameName,
    tagLine: resolved?.tagLine ?? fallback.tagLine,
    profileIconId: resolved?.profileIconId ?? 29,
    summonerLevel: resolved?.summonerLevel ?? 100,
  };
}

function otherPlayers(rng: Rng, ownerPuuid: string, count: number) {
  const roster = shuffle(
    rng,
    ROSTER.filter((p) => p.puuid !== ownerPuuid),
  );
  const out: Array<Pick<FixturePersona, "puuid" | "gameName" | "tagLine" | "profileIconId" | "summonerLevel">> = [];
  // Mostly roster players (so their profiles are clickable with rich data),
  // topped up with generated names.
  for (let i = 0; i < count; i++) {
    if (i < roster.length && rng() < 0.7) {
      out.push(roster[i]);
    } else {
      const seed = Math.floor(rng() * 0xffffffff);
      const id = generatedRiotId(seed);
      const resolved = resolvePersona(id.gameName, id.tagLine);
      out.push({
        puuid: resolved?.puuid ?? puuidFromSeed(seed),
        gameName: id.gameName,
        tagLine: id.tagLine,
        profileIconId: resolved?.profileIconId ?? 29,
        summonerLevel: resolved?.summonerLevel ?? 100,
      });
    }
  }
  return out;
}

function buildLolMatch(
  owner: OwnerIdentity,
  index: number,
  startTimestamp: number,
  seconds: number,
  queueId: number,
  ownerChampionId: number,
  region: string,
) {
  const rng = createRng((owner.seed ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const platform = platformOf(region);

  // Owner result: fixed extremes for the two newest games, then ~55% wins.
  const ownerWin = index === 0 ? true : index === 1 ? false : rng() < 0.55;
  const forcedKda: [number, number, number] | undefined =
    index === 0 ? [14, 0, 9] : index === 1 ? [1, 9, 3] : undefined;

  const ownerChampion = CHAMPION_BY_ID.get(ownerChampionId) ?? CHAMPIONS[11];
  const ownerTeam: 100 | 200 = rng() < 0.5 ? 100 : 200;

  const others = otherPlayers(rng, owner.puuid, 9);
  const usedChampions = new Set([ownerChampion.id]);
  const slots: Slot[] = [];

  let otherIndex = 0;
  for (const teamId of [100, 200] as const) {
    for (const position of POSITIONS) {
      if (teamId === ownerTeam && position === ownerChampion.position) {
        slots.push({ ...owner, champion: ownerChampion, position, teamId });
        continue;
      }
      const candidates = CHAMPIONS.filter(
        (c) => c.position === position && !usedChampions.has(c.id),
      );
      const champion = pick(rng, candidates.length ? candidates : CHAMPIONS);
      usedChampions.add(champion.id);
      slots.push({ ...others[otherIndex++], champion, position, teamId });
    }
  }

  const participants = slots.map((slot, i) => {
    const win = slot.teamId === ownerTeam ? ownerWin : !ownerWin;
    const isOwner = slot.puuid === owner.puuid;
    const p = buildParticipant(rng, slot, win, seconds, queueId, isOwner ? forcedKda : undefined);
    return { ...p, participantId: i + 1 };
  });

  const teamKills = (teamId: number) =>
    participants.filter((p) => p.teamId === teamId).reduce((sum, p) => sum + p.kills, 0);

  const teams = [100, 200].map((teamId) => {
    const win = teamId === ownerTeam ? ownerWin : !ownerWin;
    return {
      bans: shuffle(rng, CHAMPIONS)
        .filter((c) => !usedChampions.has(c.id))
        .slice(0, 5)
        .map((c, pickTurn) => ({ championId: c.id, pickTurn: pickTurn + (teamId === 100 ? 1 : 6) })),
      objectives: {
        baron: { first: win, kills: win && seconds > 25 * 60 ? 1 : 0 },
        champion: { first: teamId === ownerTeam, kills: teamKills(teamId) },
        dragon: { first: win, kills: win ? randInt(rng, 2, 4) : randInt(rng, 0, 2) },
        horde: { first: !win, kills: randInt(rng, 0, 3) },
        inhibitor: { first: win, kills: win ? randInt(rng, 1, 2) : 0 },
        riftHerald: { first: win, kills: win ? 1 : 0 },
        tower: { first: win, kills: win ? randInt(rng, 6, 11) : randInt(rng, 1, 5) },
      },
      teamId,
      win,
    };
  });

  const gameId = 3_000_000_000 + ((owner.seed % 50_000_000) * 50 + index);
  return {
    metadata: {
      dataVersion: "2",
      matchId: `${platform}_${gameId}`,
      participants: participants.map((p) => p.puuid),
    },
    info: {
      endOfGameResult: "GameComplete",
      gameCreation: startTimestamp - 45_000,
      gameDuration: seconds,
      gameEndTimestamp: startTimestamp + seconds * 1000,
      gameId,
      gameMode: gameModeFor(queueId),
      gameName: `teambuilder-match-${gameId}`,
      gameStartTimestamp: startTimestamp,
      gameType: "MATCHED_GAME",
      gameVersion: "16.18.707.1234",
      mapId: mapIdFor(queueId),
      participants,
      platformId: platform,
      queueId,
      teams,
      tournamentCode: "",
    },
  };
}

export interface FixtureMatchesParams {
  region: string;
  puuid: string;
  start?: number;
  count?: number;
  queueId?: string | number;
  championId?: string;
  championName?: string;
  gameName?: string;
  tagLine?: string;
}

function championFilterId(championId?: string, championName?: string): number | null {
  for (const raw of [championId, championName]) {
    if (!raw || raw.toLowerCase() === "all") continue;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const byKey = CHAMPIONS.find((c) => c.key.toLowerCase() === raw.toLowerCase());
    if (byKey) return byKey.id;
  }
  return null;
}

/**
 * Full match-v5 history for a puuid, newest first. A queue filter pins every
 * game to that queue; a champion filter pins the owner's champion and
 * shortens the pool (as a real filtered history would be).
 */
export function fixtureLolMatchPool(params: FixtureMatchesParams) {
  const owner = ownerIdentity(params.puuid, params.gameName, params.tagLine);
  if (personaBySeed(owner.seed)?.noMatches) return [];

  const queueFilter = Number(params.queueId) || null;
  const championFilter = championFilterId(params.championId, params.championName);
  const size = championFilter ? CHAMPION_FILTER_POOL_SIZE : MATCH_POOL_SIZE;

  const timeline = createRng(owner.seed ^ 0x27d4eb2f);
  const matches = [];
  let cursor = FIXTURE_NOW - randInt(timeline, 20, 90) * 60_000;

  for (let i = 0; i < size; i++) {
    const seconds =
      i === 2 ? 15 * 60 + 12 : i === 3 ? 44 * 60 + 7 : randInt(timeline, 21 * 60, 38 * 60);
    const queueId = queueFilter ?? pick(timeline, DEFAULT_QUEUE_MIX);
    const championId =
      championFilter ?? OWNER_POOL[(i + (owner.seed % OWNER_POOL.length)) % OWNER_POOL.length];

    cursor -= seconds * 1000;
    matches.push(
      buildLolMatch(owner, i, cursor, seconds, queueId, championId, params.region),
    );
    // Gap before the previous game: short breaks, with a night off every ~7 games.
    cursor -= (i % 7 === 6 ? randInt(timeline, 9, 14) * 60 : randInt(timeline, 3, 55)) * 60_000;
  }
  return matches;
}

/** Body of GET /api/summoner/matches. */
export function fixtureMatches(params: FixtureMatchesParams) {
  const start = Math.max(0, Number(params.start) || 0);
  const count = Math.max(1, Number(params.count) || 20);
  const pool = fixtureLolMatchPool(params);
  return {
    data: pool.slice(start, start + count),
    cache: "FIXTURE",
    hasMore: start + count < pool.length,
  };
}

// ---------------------------------------------------------------------------
// Server action fixtures (actions/summoner.ts)
// ---------------------------------------------------------------------------

export function fixtureSummonerByRiotId(region: string, gameName: string, tagLine: string) {
  const persona = resolvePersona(decodeRiotSegment(gameName), decodeRiotSegment(tagLine), region);
  if (!persona) return null;
  return {
    puuid: persona.puuid,
    name: persona.gameName,
    tagLine: persona.tagLine,
    profileIconId: persona.profileIconId,
    summonerLevel: persona.summonerLevel,
    revisionDate: FIXTURE_NOW,
  };
}

export function fixtureSummonerNameByPuuid(region: string, puuid: string) {
  if (!puuid) return null;
  const seed = seedFromPuuid(puuid);
  const persona = personaBySeed(seed);
  const id = persona ?? generatedRiotId(seed);
  return {
    puuid,
    name: id.gameName,
    tagLine: id.tagLine,
    profileIconId: persona?.profileIconId ?? 29,
    revisionDate: FIXTURE_NOW,
    summonerLevel: persona?.summonerLevel ?? 100,
  };
}

function leagueEntry(puuid: string, queueType: string, r: FixtureRank, seed: number) {
  return {
    leagueId: `fx-league-${queueType.toLowerCase()}-${seed % 1000}`,
    queueType,
    tier: r.tier,
    rank: r.rank,
    puuid,
    summonerId: `fx-summoner-${puuid.slice(2, 14)}`,
    leaguePoints: r.leaguePoints,
    wins: r.wins,
    losses: r.losses,
    veteran: r.wins + r.losses > 400,
    inactive: false,
    freshBlood: r.wins + r.losses < 60,
    hotStreak: r.hotStreak ?? false,
  };
}

function personaForPuuid(puuid: string): FixturePersona | null {
  const seed = seedFromPuuid(puuid);
  const known = personaBySeed(seed);
  if (known) return known;
  const id = generatedRiotId(seed);
  const generated = resolvePersona(id.gameName, id.tagLine);
  return generated ? { ...generated, puuid, seed } : null;
}

/** league-v4 entries/by-puuid. */
export function fixtureRankedByPuuid(region: string, puuid: string) {
  const persona = personaForPuuid(puuid);
  if (!persona) return [];
  const out = [];
  if (persona.solo) out.push(leagueEntry(puuid, "RANKED_SOLO_5x5", persona.solo, persona.seed));
  if (persona.flex) out.push(leagueEntry(puuid, "RANKED_FLEX_SR", persona.flex, persona.seed));
  return out;
}

/** champion-mastery-v4 by-puuid, sorted by points (desc). */
export function fixtureChampionMasteries(region: string, puuid: string) {
  const seed = seedFromPuuid(puuid);
  const rng = createRng(seed ^ 0x165667b1);
  const champions = shuffle(rng, CHAMPIONS).slice(0, 10);
  let points = randInt(rng, 900_000, 2_400_000);
  return champions.map((c, i) => {
    const championPoints = i === champions.length - 1 ? randInt(rng, 3_000, 9_000) : points;
    points = Math.round(points * (0.35 + rng() * 0.45));
    const championLevel = Math.max(1, Math.min(60, Math.floor(championPoints / 45_000) + 1));
    return {
      puuid,
      championId: c.id,
      championLevel,
      championPoints,
      lastPlayTime: FIXTURE_NOW - randInt(rng, 1, 60) * 86_400_000,
      championPointsSinceLastLevel: randInt(rng, 0, 11_000),
      championPointsUntilNextLevel: randInt(rng, 0, 11_000),
      markRequiredForNextLevel: 2,
      tokensEarned: randInt(rng, 0, 2),
      championSeasonMilestone: randInt(rng, 0, 4),
      nextSeasonMilestone: { requireGradeCounts: { "A-": 1 }, rewardMarks: 1, bonus: false, totalGamesRequires: 1 },
    };
  });
}

export function fixtureQueueTypes() {
  return QUEUES;
}

/** getMatchHistory / getMatchHistoryByQueue return up to 10 full matches. */
export function fixtureMatchHistory(region: string, puuid: string, queueId?: string) {
  return fixtureLolMatchPool({ region, puuid, queueId }).slice(0, 10);
}

