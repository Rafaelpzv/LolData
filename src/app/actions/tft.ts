"use server";

import axios from "axios";

const API_KEY = process.env.RIOT_TFT_API_KEY || process.env.RIOT_API_KEY;
const AMERICAS_URL = "https://americas.api.riotgames.com";
const EUROPE_URL = "https://europe.api.riotgames.com";
const ASIA_URL = "https://asia.api.riotgames.com";
const SEA_URL = "https://sea.api.riotgames.com";

// A API account-v1 é roteada pelo cluster continental (AMERICAS/EUROPE/ASIA/SEA),
// não pela região local. O tft-match-v1 também usa o cluster continental.
function getContinentalBaseUrl(region: string): string {
  const r = region.toLowerCase();
  if (["euw1", "eun1", "ru", "tr1", "me1"].includes(r)) return EUROPE_URL;
  if (["kr", "jp1"].includes(r)) return ASIA_URL;
  if (["oc1", "sg2", "tw2", "vn2"].includes(r)) return SEA_URL;
  return AMERICAS_URL;
}

// Normaliza segmento de Riot ID que pode chegar já percent-encoded
// (Next/Turbopack entrega o param cru) ou já decodificado.
function normalizeRiotSegment(value: string): string {
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Função utilitária para tratar 429 com retry
async function safeAxios<T = any>(
  config: any,
  retries = 3,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios(config);
      return res.data as T;
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        const retryAfter =
          Number(error.response.headers["retry-after"]) || 1;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw error;
    }
  }
  const res = await axios(config);
  return res.data as T;
}

interface TftAccount {
  puuid?: string;
  gameName?: string;
  tagLine?: string;
}

interface TftSummoner {
  id?: string;
  accountId?: string;
  puuid?: string;
  profileIconId?: number;
  summonerLevel?: number;
  name?: string;
}

export interface TftLeagueEntry {
  leagueId?: string;
  queueType?: string;
  tier?: string;
  rank?: string;
  summonerId?: string;
  puuid?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  veteran?: boolean;
  inactive?: boolean;
  freshBlood?: boolean;
  hotStreak?: boolean;
  rating?: number;
  ratedTier?: string;
  ratedDivision?: string;
}

export interface TftSummonerProfile {
  puuid: string;
  name: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
}

// Resolve a conta (account-v1 continental) + summoner TFT regional.
export async function getTftSummonerByRiotId(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<TftSummonerProfile | null> {
  const safeGameName = normalizeRiotSegment(gameName);
  const safeTagLine = normalizeRiotSegment(tagLine);

  // 1. Conta no cluster continental (via Riot ID)
  const accountData = await safeAxios<TftAccount>({
    method: "get",
    url: `${getContinentalBaseUrl(region)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(safeGameName)}/${encodeURIComponent(safeTagLine)}`,
    headers: { "X-Riot-Token": API_KEY },
  });

  if (!accountData?.puuid) {
    throw new Error("PUUID not found for this summoner.");
  }

  const puuid = accountData.puuid;

  // 2. Summoner TFT na região local (tft/summoner/v1)
  let summoner: TftSummoner = {};
  try {
    summoner = await safeAxios<TftSummoner>({
      method: "get",
      url: `https://${region}.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${puuid}`,
      headers: { "X-Riot-Token": API_KEY },
    });
  } catch (error: any) {
    // 404 = conta existe mas não tem perfil TFT na região
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }

  if (!summoner?.puuid) return null;

  return {
    puuid,
    name: accountData.gameName || summoner.name || "unknown",
    tagLine: accountData.tagLine || "???",
    profileIconId: summoner.profileIconId ?? 0,
    summonerLevel: summoner.summonerLevel ?? 0,
  };
}

// Todas as filas ranqueadas do jogador (RANKED_TFT, RATED_TFT, etc.)
export async function getTftLeagueByPuuid(
  region: string,
  puuid: string,
): Promise<TftLeagueEntry[]> {
  if (!puuid) return [];

  try {
    const data = await safeAxios<any[]>({
      method: "get",
      url: `https://${region}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`,
      headers: { "X-Riot-Token": API_KEY },
    });

    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    if (error.response?.status === 404) {
      return []; // não jogou ranqueada
    }
    console.error(
      "[tft] Erro getTftLeagueByPuuid:",
      error.response?.status,
      error.response?.data || error.message || error,
    );
    throw new Error("Falha ao buscar ranqueada TFT");
  }
}

// Lista de ids de partidas TFT (rota continental)
export async function getTftMatchIds(
  region: string,
  puuid: string,
  count = 20,
): Promise<string[]> {
  if (!puuid) return [];

  try {
    return await safeAxios<string[]>({
      method: "get",
      url: `${getContinentalBaseUrl(region)}/tft/match/v1/matches/by-puuid/${puuid}/ids`,
      headers: { "X-Riot-Token": API_KEY },
      params: { count },
    });
  } catch (error: any) {
    console.error(
      "[tft] Erro getTftMatchIds:",
      error.response?.status,
      error.response?.data || error.message || error,
    );
    throw new Error("Falha ao buscar partidas TFT");
  }
}

// Detalhe de uma partida TFT (rota continental)
export async function getTftMatchById(
  region: string,
  matchId: string,
): Promise<any> {
  return safeAxios<any>({
    method: "get",
    url: `${getContinentalBaseUrl(region)}/tft/match/v1/matches/${matchId}`,
    headers: { "X-Riot-Token": API_KEY },
  });
}