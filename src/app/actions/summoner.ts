"use server";

import axios from "axios";

const API_KEY = process.env.RIOT_API_KEY;
const BASE_URL = "https://americas.api.riotgames.com";
const EUROPE_URL = "https://europe.api.riotgames.com";
const ASIA_URL = "https://asia.api.riotgames.com";
const SEA_URL = "https://sea.api.riotgames.com";

// A API account-v1 é roteada pelo cluster continental (AMERICAS/EUROPE/ASIA/SEA),
// não pela região local. Usar sempre "americas" quebra EUW/KR/JP/OCE/etc.
function getAccountClusterBaseUrl(region: string): string {
  const r = region.toLowerCase();
  if (["euw1", "eun1", "ru", "tr1", "me1"].includes(r)) return EUROPE_URL;
  if (["kr", "jp1"].includes(r)) return ASIA_URL;
  if (["oc1", "sg2", "tw2", "vn2"].includes(r)) return SEA_URL;
  return BASE_URL;
}

interface RiotAccount {
  puuid: string;
  gameName?: string;
  tagLine?: string;
  profileIconId?: number;
  summonerLevel?: number;
  revisionDate?: number;
  name?: string;
}

interface Summoner {
  puuid: string;
  name: string;
  tagLine: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

// Função utilitária para tratar 429 com retry
async function safeAxios<T = any>(config: any, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios(config);
      return res.data as T;
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        const retryAfter = Number(error.response.headers["retry-after"]) || 1;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw error;
    }
  }
  const res = await axios(config);
  return res.data as T;
}

// ================================================================
// 🔥 CORREÇÃO: Usa BASE_URL (continental) para summoner por PUUID
// ================================================================
export async function getSummonerNameByPuuid(
  region: string,
  puuid: string,
): Promise<Summoner | null> {
  if (!puuid) return null;

  try {
    const [summonerResponse, accountResponse] = await Promise.allSettled([
      safeAxios<RiotAccount>({
        method: "get",
        url: `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        headers: { "X-Riot-Token": API_KEY },
      }),

      safeAxios<RiotAccount>({
        method: "get",
        url: `${getAccountClusterBaseUrl(region)}/riot/account/v1/accounts/by-puuid/${puuid}`,
        headers: { "X-Riot-Token": API_KEY },
      }),
    ]);

    const summoner =
      summonerResponse.status === "fulfilled"
        ? summonerResponse.value
        : null;

    const account =
      accountResponse.status === "fulfilled"
        ? accountResponse.value
        : null;

    if (!account && !summoner) {
      console.error("[RIOT] Nenhum dado encontrado para:", puuid);
      return null;
    }

    return {
      puuid,

      name:
        account?.gameName ||
        summoner?.name ||
        "unknown",

      tagLine:
        account?.tagLine ||
        "unknown",

      profileIconId:
        summoner?.profileIconId ?? 0,

      revisionDate:
        summoner?.revisionDate ?? Date.now(),

      summonerLevel:
        summoner?.summonerLevel ?? 0,
    };
  } catch (error: any) {
    console.error(
      "[RIOT] Erro getSummonerNameByPuuid:",
      error.response?.status,
      error.response?.data || error.message || error,
    );

    return null;
  }
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

// ================================================================
// 🔥 CORREÇÃO: getSummonerByRiotId também usa BASE_URL para o summoner
// ================================================================
export async function getSummonerByRiotId(
  region: string,
  gameName: string,
  tagLine: string,
) {
  const safeGameName = normalizeRiotSegment(gameName);
  const safeTagLine = normalizeRiotSegment(tagLine);

  // 1. Busca a conta no cluster continental correto (account-v1 é roteado por cluster)
  const accountData = await safeAxios<RiotAccount>({
    method: "get",
    url: `${getAccountClusterBaseUrl(region)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(safeGameName)}/${encodeURIComponent(safeTagLine)}`,
    headers: { "X-Riot-Token": API_KEY },
  });

  if (!accountData?.puuid) {
    throw new Error("PUUID not found for this summoner.");
  }

  const puuid = accountData.puuid;

  // 2. Tenta buscar o summoner na região fornecida
  try {
    const profileData = await safeAxios<RiotAccount>({
      method: "get",
      url: `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      headers: { "X-Riot-Token": API_KEY },
    });

    console.log(profileData.profileIconId)

    return {
      puuid,
      name: profileData.name || profileData.gameName || accountData.gameName,
      tagLine: accountData.tagLine || "???",
      profileIconId: profileData.profileIconId || 0,
      summonerLevel: profileData.summonerLevel || 0,
      revisionDate: Date.now(),
    };
  } catch (error: any) {
    // Se for 404, retorna null (não encontrado)
    if (error.response?.status === 404) {
      return null;
    }
    // Outros erros (429, 500, etc.) lançam exceção
    throw error;
  }
}

// ================================================================
// Funções locais (permanecem com região local)
// ================================================================
export async function getChampionMasteries(region: string, puuid: string) {
  try {
    return await safeAxios({
      method: "get",
      url: `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`,
      headers: { "X-Riot-Token": API_KEY },
    });
  } catch {
    throw new Error("Falha ao buscar maestrias");
  }
}

export async function getMatchHistory(region: string, puuid: string) {
  try {
    let apiUrl = BASE_URL;
    if (["euw1", "eun1", "ru", "tr1", "me1"].includes(region))
      apiUrl = EUROPE_URL;
    else if (["kr", "jp1"].includes(region)) apiUrl = ASIA_URL;
    else if (["oc1", "sg2", "tw2", "vn2"].includes(region)) apiUrl = SEA_URL;

    const matchIds = await safeAxios<string[]>({
      method: "get",
      url: `${apiUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
      headers: { "X-Riot-Token": API_KEY },
      params: { start: 0, count: 10 },
    });

    const matches = await Promise.all(
      matchIds.map((id) =>
        safeAxios({
          method: "get",
          url: `${apiUrl}/lol/match/v5/matches/${id}`,
          headers: { "X-Riot-Token": API_KEY },
        }),
      ),
    );

    return matches;
  } catch (error: any) {
    console.error(
      "❌ Erro em getMatchHistory:",
      error.response?.data || error.message || error,
    );
    throw new Error("Failed to fetch match history");
  }
}

export async function getMatchHistoryByQueue(
  region: string,
  puuid: string,
  queueId: string,
) {
  try {
    let apiUrl = BASE_URL;
    if (["euw1", "eun1", "ru", "tr1", "me1"].includes(region))
      apiUrl = EUROPE_URL;
    else if (["kr", "jp1"].includes(region)) apiUrl = ASIA_URL;
    else if (["oc1", "sg2", "tw2", "vn2"].includes(region)) apiUrl = SEA_URL;

    const matchIds = await safeAxios<string[]>({
      method: "get",
      url: `${apiUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
      headers: { "X-Riot-Token": API_KEY },
      params: { start: 0, count: 10, queue: queueId },
    });

    return await Promise.all(
      matchIds.map((id) =>
        safeAxios({
          method: "get",
          url: `${apiUrl}/lol/match/v5/matches/${id}`,
          headers: { "X-Riot-Token": API_KEY },
        }),
      ),
    );
  } catch {
    throw new Error("Failed to fetch match history");
  }
}

export async function getQueueTypes() {
  try {
    return await safeAxios({
      method: "get",
      url: "https://static.developer.riotgames.com/docs/lol/queues.json",
    });
  } catch {
    throw new Error("Falha ao buscar tipos de fila");
  }
}

export async function getRankedByPuuid(region: string, puuid: string) {
  if (!puuid) throw new Error("Summoner PUUID not provided");

  const data = await safeAxios<any[]>({
    method: "get",
    url: `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
    headers: { "X-Riot-Token": API_KEY },
  });

  return Array.isArray(data) ? data : [];
}
