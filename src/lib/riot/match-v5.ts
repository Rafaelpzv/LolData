// Shared Riot match-v5 helpers (regional routing, 429 retry, Supabase match detail cache).
import { supabaseAdmin } from "@/lib/supabase";

const AMERICAS_API_URL = "https://americas.api.riotgames.com";
const EUROPE_API_URL = "https://europe.api.riotgames.com";
const ASIA_API_URL = "https://asia.api.riotgames.com";
const SEA_API_URL = "https://sea.api.riotgames.com";

export type RiotFetchOptions = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

export async function fetchInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map((fn) => fn());
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

export async function safeFetch(
  url: string,
  options: RiotFetchOptions,
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 1;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
  return await fetch(url, options);
}

export function getRegionalUrl(region: string): string {
  const r = region.toLowerCase();
  if (["euw1", "eun1", "ru", "tr1", "me1"].some((k) => r.includes(k)))
    return EUROPE_API_URL;
  if (["jp1", "kr"].some((k) => r.includes(k))) return ASIA_API_URL;
  if (["oc1", "tw2", "vn2", "sg2"].some((k) => r.includes(k)))
    return SEA_API_URL;
  return AMERICAS_API_URL;
}

export async function getMatchDetailsBatch(
  matchIds: string[],
): Promise<Map<string, any>> {
  const detailMap = new Map<string, any>();
  if (matchIds.length === 0) return detailMap;

  try {
    const keys = matchIds.map((id) => `match:${id}`);
    const { data } = await supabaseAdmin
      .from("match_cache")
      .select("id, data")
      .in("id", keys);

    for (const row of data || []) {
      const matchId = (row.id as string).replace("match:", "");
      detailMap.set(matchId, row.data);
    }
  } catch {
    // cache miss silencioso
  }

  return detailMap;
}

export async function saveMatchDetailsBatch(matches: any[]): Promise<void> {
  if (matches.length === 0) return;

  const rows = matches
    .filter((m) => m?.metadata?.matchId)
    .map((m) => ({
      id: `match:${m.metadata.matchId}`,
      data: m,
      cached_at: new Date().toISOString(),
      game_name: null,
      tagline: null,
    }));

  if (rows.length === 0) return;

  await supabaseAdmin.from("match_cache").upsert(rows);

  // Índice para autocomplete: guarda cada invocador visto em uma partida.
  // A região vem do prefixo do matchId (ex.: "BR1_123..." -> br1).
  const seen = new Set<string>();
  const summonerRows: any[] = [];

  for (const m of matches) {
    const matchId = m?.metadata?.matchId;
    if (!matchId) continue;
    const region = String(matchId).split("_")[0].toLowerCase();

    for (const p of m?.info?.participants || []) {
      const name = p?.riotIdGameName;
      const tag = p?.riotIdTagline;
      if (!name || !tag) continue;

      const key = `summoner:${region}:${name.toLowerCase()}:${tag.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      summonerRows.push({
        id: key,
        data: {
          region,
          gameName: name,
          tagLine: tag,
          puuid: p.puuid,
          championId: p.championId,
        },
        game_name: name.toLowerCase(),
        tagline: tag.toLowerCase(),
        cached_at: new Date().toISOString(),
      });
    }
  }

  if (summonerRows.length > 0) {
    await supabaseAdmin.from("match_cache").upsert(summonerRows);
  }
}
