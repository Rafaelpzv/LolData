import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import {
  fetchInBatches,
  getMatchDetailsBatch,
  getRegionalUrl,
  safeFetch,
  saveMatchDetailsBatch,
} from "@/lib/riot/match-v5";

const matchesSchema = z.object({
  region: z.string().min(1),
  puuid: z.string().min(20),
  queueId: z.string().default("").transform(Number),
  start: z.number().default(0),
  count: z.number().default(20),
  championId: z.string().optional(),
  championName: z.string().optional(),
});

/** One inspected page of the CLASSIC sweep: what is left to walk and the games that matched. */
interface SweepL1 {
  data: any;
  expires: number;
  hasMore: boolean;
  kept: any[];
  nextOffset: number;
}

const matchCache = new Map<
  string,
  { data: any; expires: number; hasMore: boolean } | SweepL1
>();
const L1_TTL = 5 * 60 * 1000;
const L2_TTL_MINUTES = 30;
const MAX_RIOT_OFFSET = 200;

const DETAIL_BATCH_SIZE = 20;

/**
 * O filtro da partida CLASSIC (fila 710), o modo que o cliente mostra como "CLASSIC / Ranked 5s".
 *
 * A lista de ids do Riot responde pela "display queue" da partida: um jogo CLASSIC entra pelo 400
 * (normal), pelo 480 (Quickplay) ou pela ARAM 450, e não pelo 710. Pedir `queue=710` volta vazio.
 * Por isso o filtro varre os ids de todas as filas e deixa passar só o detalhe cujo `queueId` é 710.
 */
const CLASSIC_QUEUE_ID = 710;

export function isClassicModeQueue(queueId: string): boolean {
  return Number(queueId) === CLASSIC_QUEUE_ID;
}

/**
 * O filtro conferido contra a fila que o detalhe da partida carrega (`info.queueId`, não
 * `gameMode`: TODO jogo CLASSIC tem `gameMode: "CLASSIC"`). Sem `queueId` no detalhe, cai no
 * `gameMode`, para uma partida antiga sem fila ainda ser encontrada pelo nome do modo.
 */
export function matchesQueueFilter(match: any, queueId: string): boolean {
  if (!queueId) return true;
  const queue = Number(match?.info?.queueId);
  if (Number.isFinite(queue) && queue > 0) return queue === Number(queueId);
  return String(match?.info?.gameMode ?? "").toUpperCase() === queueId;
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

    const championKey = (championName || championId).toLowerCase();
    const isFilteringByChampion = !!championKey && championKey !== "all";

    // A filter of the CLASSIC mode (710) is read from a sweep of every queue, because Riot answers
    // no game for `queue=710`. The sweep keeps its own L1 cache (offset + the ids already inspected)
    // and its own L2 key, so it never pollutes the per-queue history stored by the other filters.
    const isClassicMode = isClassicModeQueue(queueId);
    // The sweep stores every match it inspected (kept or not) and where it stood in the list.
    const SWEEP_STEP = 20;
    const sweepCacheKey = (key: string) =>
      `matches:${region}:${puuid}:classic-sweep:${key}`;

    // cacheKey do Supabase/L2 — não inclui start, representa o histórico acumulado
    const baseCacheKey = isClassicMode
      ? sweepCacheKey("all")
      : `matches:${region}:${puuid}:${queueId || "all"}:all`;
    const cacheKey = isFilteringByChampion
      ? `matches:${region}:${puuid}:${queueId || "all"}:${championKey}`
      : baseCacheKey;

    // FIX: L1 cache inclui `start` para não servir a página errada.
    //
    // Antes, todas as páginas usavam a mesma chave no L1. A chamada start=20
    // sobrescrevia o L1 com as partidas 20-40, e a próxima chamada start=40
    // recebia essas partidas erradas como cache hit.
    //
    // A varredura da fila CLASSIC guarda no L1, por página, as compatíveis e onde a varredura parou:
    // refazer uma página já inspirada não custa nenhuma chamada ao Riot.
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
    // Only the CLASSIC sweep reads it: where the sweep stood when it last stopped.
    let classicOffset = 0;

    if (supabaseCached) {
      existingMatches = supabaseCached.matches || [];
      riotOffset = supabaseCached.riotOffset ?? existingMatches.length;
      classicOffset = supabaseCached.classicOffset ?? 0;
    }

    // ================= BASE CACHE REUSE (filtro de campeão) =================
    if (isFilteringByChampion && !isClassicMode && existingMatches.length < start + count) {
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
    // The sweep walks with a fixed step, so the offset stored with it is exact on every stop.
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

      // A CLASSIC game (queue 710) is answered for the mode queues it belongs to, never for 710: the
      // display queue and the legendary ones come back under `queue`. Asking the list with
      // `queue=710` returns nothing, so this branch walks every queue and keeps what the mode matches.
      matchIdsUrl.searchParams.set(
        "start",
        String(isClassicMode ? classicOffset + currentStart : currentStart),
      );
      matchIdsUrl.searchParams.set(
        "count",
        String(isClassicMode ? SWEEP_STEP : PAGE_SIZE),
      );

      if (queueId && !isClassicMode) {
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
          if (!matchesQueueFilter(match, queueId)) return false;
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

      if (!isClassicMode && collectedMatches.length >= count) break;
      if (matchIds.length < PAGE_SIZE) break;
    }

    // ================= CLASSIC SWEEP =================
    // The sweep walks every queue; what the detail says it is decides. A page that brought no
    // matching game is stored as-is: the next call resumes after it, so no id is paid twice.
    if (isClassicMode) {
      const swept = [...existingMatches, ...collectedMatches].filter(
        (match, index, self) =>
          index ===
          self.findIndex((m) => m.metadata.matchId === match.metadata.matchId),
      );
      // Newest first, the order of the list the sweep walked (the ids come newest first).
      swept.sort((a, b) => b.info.gameCreation - a.info.gameCreation);
      const kept = isFilteringByChampion
        ? swept.filter((match: any) => {
            const participant = match.info?.participants?.find(
              (p: any) => p.puuid === puuid,
            );
            return (
              !!participant &&
              participantMatchesChampion(participant, championName, championId)
            );
          })
        : swept;
      const page = kept.slice(start, start + count);
      const classicHasMore =
        kept.length > start + count ||
        (!hitOffsetLimit && classicOffset + currentStart < MAX_RIOT_OFFSET);

      // Empty at the front without reaching the end is a transient miss: do not store it.
      if (swept.length > 0) {
        saveToSupabase(
          cacheKey,
          { matches: swept, classicOffset: classicOffset + currentStart },
          gameName,
          tagLine,
        ).catch(() => {});
        matchCache.set(l1Key, {
          data: page,
          expires: now + L1_TTL,
          hasMore: classicHasMore,
          kept,
          nextOffset: classicOffset + currentStart,
        });
      }

      return NextResponse.json({
        data: page,
        cache: "MISS_UPDATE",
        hasMore: classicHasMore,
      });
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
