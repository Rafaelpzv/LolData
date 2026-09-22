import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { USE_FIXTURES, fixtureMatches } from "@/lib/fixtures";

const AMERICAS_API_URL = "https://americas.api.riotgames.com";
const EUROPE_API_URL = "https://europe.api.riotgames.com";
const ASIA_API_URL = "https://asia.api.riotgames.com";
const SEA_API_URL = "https://sea.api.riotgames.com";

const matchesSchema = z.object({
  region: z.string().min(1),
  puuid: z.string().min(20),
  queueId: z.string().default("").transform(Number),
  start: z.number().default(0),
  count: z.number().default(20),
  championId: z.string().optional(),
  championName: z.string().optional(),
});

const matchCache = new Map<
  string,
  { data: any; expires: number; hasMore: boolean }
>();
const L1_TTL = 5 * 60 * 1000;
const L2_TTL_MINUTES = 30;
const MAX_RIOT_OFFSET = 200;

const DETAIL_BATCH_SIZE = 20;

type RiotFetchOptions = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

async function fetchInBatches<T>(
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

async function safeFetch(
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

function getRegionalUrl(region: string): string {
  const r = region.toLowerCase();
  if (["euw1", "eun1", "ru", "tr1", "me1"].some((k) => r.includes(k)))
    return EUROPE_API_URL;
  if (["jp1", "kr"].some((k) => r.includes(k))) return ASIA_API_URL;
  if (["oc1", "tw2", "vn2", "sg2"].some((k) => r.includes(k)))
    return SEA_API_URL;
  return AMERICAS_API_URL;
}

// Filtra por championId (numérico) OU por nome, para suportar
// tanto os antigos slugs ("kaisa") quanto o novo formato por id ("103").
function participantMatchesChampion(
  participant: any,
  championName: string,
  championId: string,
): boolean {
  if (championName) {
    if (participant.championName?.toLowerCase() === championName.toLowerCase())
      return true;
    if (String(participant.championId) === championName) return true;
  }
  if (championId && String(participant.championId) === championId) return true;
  return false;
}

async function getFromSupabase(cacheKey: string): Promise<any | null> {
  try {
    const { data } = await supabaseAdmin
      .from("match_cache")
      .select("data, cached_at")
      .eq("id", cacheKey)
      .maybeSingle();

    if (!data) return null;

    const ageMinutes =
      (Date.now() - new Date(data.cached_at).getTime()) / 60000;

    if (ageMinutes > L2_TTL_MINUTES) return null;

    return data.data;
  } catch {
    return null;
  }
}

async function saveToSupabase(
  cacheKey: string,
  value: any,
  gameName?: string,
  tagLine?: string,
): Promise<void> {
  await supabaseAdmin.from("match_cache").upsert({
    id: cacheKey,
    data: value,
    cached_at: new Date().toISOString(),
    game_name: gameName || null,
    tagline: tagLine || null,
  });
}

async function getMatchDetailsBatch(
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

async function saveMatchDetailsBatch(matches: any[]): Promise<void> {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = searchParams.get("region");
    const puuid = searchParams.get("puuid");
    const start = Number(searchParams.get("start") || "0");
    const count = Number(searchParams.get("count") || "20");
    const queueId = searchParams.get("queueId") || "";
    const championName = searchParams.get("championName") || "";
    const championId = searchParams.get("championId") || "";
    const gameName = searchParams.get("gameName") || "";
    const tagLine = searchParams.get("tagLine") || "";

    if (USE_FIXTURES) {
      return NextResponse.json(
        fixtureMatches({
          region: region || "",
          puuid: puuid || "",
          start,
          count,
          queueId,
          championId,
          championName,
          gameName,
          tagLine,
        }),
      );
    }

    const championKey = (championName || championId).toLowerCase();
    const isFilteringByChampion = !!championKey && championKey !== "all";

    // cacheKey do Supabase/L2 — não inclui start, representa o histórico acumulado
    const baseCacheKey = `matches:${region}:${puuid}:${queueId || "all"}:all`;
    const cacheKey = isFilteringByChampion
      ? `matches:${region}:${puuid}:${queueId || "all"}:${championKey}`
      : baseCacheKey;

    // FIX: L1 cache inclui `start` para não servir a página errada.
    //
    // Antes, todas as páginas usavam a mesma chave no L1. A chamada start=20
    // sobrescrevia o L1 com as partidas 20-40, e a próxima chamada start=40
    // recebia essas partidas erradas como cache hit.
    const l1Key = `${cacheKey}:${start}`;
    const now = Date.now();

    // ================= L1 CACHE (in-memory) =================
    const l1 = matchCache.get(l1Key);
    if (l1 && l1.expires > now) {
      return NextResponse.json({
        data: l1.data,
        cache: "L1_HIT",
        hasMore: l1.hasMore,
      });
    }

    // ================= L2 CACHE (Supabase) =================
    const supabaseCached = await getFromSupabase(cacheKey);

    let existingMatches: any[] = [];
    let riotOffset = 0;

    if (supabaseCached) {
      existingMatches = supabaseCached.matches || [];
      riotOffset = supabaseCached.riotOffset ?? existingMatches.length;
    }

    // ================= BASE CACHE REUSE (filtro de campeão) =================
    if (isFilteringByChampion && existingMatches.length < start + count) {
      const baseCached = await getFromSupabase(baseCacheKey);

      if (baseCached) {
        const baseMatches: any[] = baseCached.matches || [];
        const baseRiotOffset: number =
          baseCached.riotOffset ?? baseMatches.length;

        const champFromBase = baseMatches.filter((match: any) => {
          const participant = match.info?.participants?.find(
            (p: any) => p.puuid === puuid,
          );
          if (!participant) return false;
          return participantMatchesChampion(
            participant,
            championName,
            championId,
          );
        });

        const merged = [...existingMatches, ...champFromBase].filter(
          (match, index, self) =>
            index ===
            self.findIndex(
              (m) => m.metadata.matchId === match.metadata.matchId,
            ),
        );

        existingMatches = merged;

        if (baseRiotOffset > riotOffset) {
          riotOffset = baseRiotOffset;
        }
      }
    }

    // ================= FULL CACHE HIT =================
    if (existingMatches.length >= start + count) {
      const paginated = existingMatches.slice(start, start + count);
      matchCache.set(l1Key, {
        data: paginated,
        expires: now + L1_TTL,
        hasMore:
          existingMatches.length > start + count ||
          riotOffset < MAX_RIOT_OFFSET,
      });
      return NextResponse.json({
        data: paginated,
        cache: "FULL_CACHE",
        // Há mais se o histórico acumulado vai além do que o cliente pediu
        hasMore:
          existingMatches.length > start + count ||
          riotOffset < MAX_RIOT_OFFSET,
      });
    }

    // ================= FETCH RIOT =================
    const validatedData = matchesSchema.parse({
      region,
      puuid,
      start,
      queueId,
      count,
      championId,
      championName,
    });

    const { RIOT_API_KEY } = process.env;
    if (!RIOT_API_KEY) {
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 },
      );
    }

    const detailsApiUrl = getRegionalUrl(validatedData.region);

    const PAGE_SIZE = isFilteringByChampion ? 50 : count;
    const MAX_PAGES = isFilteringByChampion ? 5 : 1;

    const collectedMatches: any[] = [];
    let currentStart = riotOffset;
    let hitOffsetLimit = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (currentStart >= MAX_RIOT_OFFSET) {
        hitOffsetLimit = true;
        break;
      }

      const matchIdsUrl = new URL(
        `${detailsApiUrl}/lol/match/v5/matches/by-puuid/${validatedData.puuid}/ids`,
      );

      matchIdsUrl.searchParams.set("start", String(currentStart));
      matchIdsUrl.searchParams.set("count", String(PAGE_SIZE));

      if (queueId) {
        matchIdsUrl.searchParams.set("queue", String(queueId));
      }

      const matchIdsResponse = await safeFetch(matchIdsUrl.toString(), {
        headers: { "X-Riot-Token": RIOT_API_KEY },
        next: { revalidate: 60 },
      });

      if (!matchIdsResponse.ok) {
        const error = await matchIdsResponse.json();
        return NextResponse.json(
          { error: error.status?.message || "Failed to fetch match IDs" },
          { status: matchIdsResponse.status },
        );
      }

      const matchIdsRaw = await matchIdsResponse.json();

      if (!Array.isArray(matchIdsRaw) || matchIdsRaw.length === 0) break;

      const matchIds: string[] = matchIdsRaw;

      const existingIds = new Set(
        existingMatches.map((m: any) => m.metadata?.matchId),
      );
      const newMatchIds = matchIds.filter((id) => !existingIds.has(id));

      if (newMatchIds.length > 0) {
        const cachedDetailsMap = await getMatchDetailsBatch(newMatchIds);

        const fromSupabaseDetails: any[] = [];
        const trulyNewMatchIds: string[] = [];

        for (const id of newMatchIds) {
          if (cachedDetailsMap.has(id)) {
            const cached = cachedDetailsMap.get(id);
            // Se participants não tem riotIdGameName, cache antigo — rebaixa da Riot
            const hasNgc = cached?.info?.participants?.every(
              (p: any) => p.riotIdGameName !== undefined,
            );
            if (hasNgc) {
              fromSupabaseDetails.push(cached);
            } else {
              trulyNewMatchIds.push(id);
            }
          } else {
            trulyNewMatchIds.push(id);
          }
        }

        let riotMatchDetails: any[] = [];

        if (trulyNewMatchIds.length > 0) {
          const matchDetailsPromises = trulyNewMatchIds.map(
            (matchId: string) => () =>
              safeFetch(`${detailsApiUrl}/lol/match/v5/matches/${matchId}`, {
                headers: { "X-Riot-Token": RIOT_API_KEY },
                next: { revalidate: 86400 },
              }).then((res) => res.json()),
          );

          const raw = await fetchInBatches(
            matchDetailsPromises,
            DETAIL_BATCH_SIZE,
          );

          riotMatchDetails = raw.filter(
            (m: any) => m?.metadata?.matchId && m?.info?.participants,
          );

          saveMatchDetailsBatch(riotMatchDetails).catch(() => {});
        }

        const allDetails = [
          ...fromSupabaseDetails.filter(
            (m: any) => m?.metadata?.matchId && m?.info?.participants,
          ),
          ...riotMatchDetails,
        ];

        const filtered = allDetails.filter((match: any) => {
          const participant = match.info?.participants?.find(
            (p: any) => p.puuid === validatedData.puuid,
          );
          if (!participant) return false;
          if (!isFilteringByChampion) return true;
          return participantMatchesChampion(
            participant,
            championName,
            championId,
          );
        });

        collectedMatches.push(...filtered);
      }

      currentStart += matchIds.length;

      if (collectedMatches.length >= count) break;
      if (matchIds.length < PAGE_SIZE) break;
    }

    // ================= MERGE =================
    const mergedMatches = [...existingMatches, ...collectedMatches].filter(
      (match, index, self) =>
        index ===
        self.findIndex((m) => m.metadata.matchId === match.metadata.matchId),
    );

    mergedMatches.sort((a, b) => b.info.gameCreation - a.info.gameCreation);

    const finalMatches = mergedMatches.slice(start, start + count);

    // hasMore = verdadeiro se há mais partidas no histórico acumulado
    // OU se ainda não chegamos no limite de offset da Riot
    const hasMore =
      mergedMatches.length > start + count ||
      (!hitOffsetLimit && currentStart < MAX_RIOT_OFFSET);

    // ================= SAVE =================
    // Se a página veio vazia (start > 0) sem ter chegado ao fim, é um miss
    // transitório (ex.: leitura falha do cache/fetch) — NÃO gravar essa
    // degradação no cache, para a próxima tentativa refazer do zero.
    if (finalMatches.length > 0 || start === 0) {
      saveToSupabase(
        cacheKey,
        { matches: mergedMatches, riotOffset: currentStart },
        gameName,
        tagLine,
      ).catch(() => {});
    }

    if (finalMatches.length > 0 || start === 0) {
      matchCache.set(l1Key, {
        data: finalMatches,
        expires: now + L1_TTL,
        hasMore,
      });
    }

    return NextResponse.json({
      data: finalMatches,
      cache: "MISS_UPDATE",
      hasMore,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
