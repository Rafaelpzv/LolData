/** Subset of Riot match-v5 used by the LoL profile (as returned by /api/summoner/matches). */

export interface PerkSelection {
  perk: number;
}

export interface PerkStyle {
  style: number;
  selections?: PerkSelection[];
}

export interface LolParticipant {
  puuid: string;
  championId: number;
  championName: string;
  champLevel?: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  win: boolean;
  goldEarned: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken?: number;
  summonerName?: string;
  teamId: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summoner1Id: number | string;
  summoner2Id: number | string;
  perks?: { styles?: PerkStyle[] };
}

export interface LolMatch {
  metadata: { matchId: string };
  info: {
    gameMode: string;
    queueId: number;
    gameStartTimestamp?: number;
    gameCreation?: number;
    gameDuration: number;
    participants: LolParticipant[];
  };
}

export interface QueueType {
  queueId: number;
  map: string;
  description: string | null;
}

export function participantItems(p: LolParticipant): number[] {
  return [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
}

export function matchTimestamp(match: LolMatch): number | undefined {
  return match.info.gameStartTimestamp ?? match.info.gameCreation;
}
