// src/app/api/rankings/route.ts
import { NextResponse, NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSummonerNameByPuuid } from "@/app/actions/summoner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const SUPABASE_TIMEOUT_MS = 5_000;
const RIOT_FETCH_TIMEOUT_MS = 15_000;

const SUMMONER_CONCURRENCY = 10;
const SUMMONER_BATCH_DELAY_MS = 300;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Riot API helpers
// ---------------------------------------------------------------------------

async function fetchLeague(
  region: string,
  queueType: string,
  tier: "challenger" | "grandmaster" | "master",
) {
  if (!RIOT_API_KEY) {
    throw new Error("RIOT_API_KEY not configured on the server");
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    RIOT_FETCH_TIMEOUT_MS,
  );

  const url =
    `https://${region}.api.riotgames.com/lol/league/v4/` +
    `${tier}leagues/by-queue/${queueType}`;

  const res = await fetch(url, {
    headers: { "X-Riot-Token": RIOT_API_KEY },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    let detail = "";

    try {
      const body = await res.json();

      if (body?.status?.message) {
        detail = ` - ${body.status.message}`;
      }
    } catch {}

    if (res.status === 401) {
      throw new Error(
        `Riot API unauthorized (401).${detail}`,
      );
    }

    if (res.status === 429) {
      throw new Error(
        `Riot API rate limit (429).${detail}`,
      );
    }

    throw new Error(
      `Error fetching ${tier}: ${res.status}${detail}`,
    );
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Summoner name fetching + cache
// ---------------------------------------------------------------------------

interface SummonerNameEntry {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number | null;
  region: string;
}

async function fetchOneSummonerName(
  region: string,
  puuid: string,
): Promise<SummonerNameEntry | null> {
  try {
    const data = await getSummonerNameByPuuid(
      region,
      puuid,
    );

    console.log(
      "[rankings] RIOT/RESOLVER →",
      {
        region,
        puuid,
        name: data?.name,
        tagLine: data?.tagLine,
        profileIconId: data?.profileIconId,
      },
    );

    if (!data?.name || !data?.tagLine) {
      console.warn(
        `[rankings] Could not resolve ${puuid}`,
      );

      return null;
    }

    return {
      puuid,
      gameName: data.name,
      tagLine: data.tagLine,
      profileIconId:
        data.profileIconId ?? null,
      region,
    };
  } catch (error) {
    console.error(
      `[rankings] Failed to resolve ${puuid}:`,
      error,
    );

    return null;
  }
}

// ---------------------------------------------------------------------------
// Summoner names cache
// ---------------------------------------------------------------------------

// PostgREST/.in() com muitos puuids excede o limite de tamanho de URL
// (TypeError: fetch failed). Pagina a consulta em blocos seguros.
const PUUID_CHUNK_SIZE = 50;

async function selectSummonerNamesByPuuids(
  supabase: any,
  puuids: string[],
): Promise<any[]> {
  const rows: any[] = [];

  for (
    let i = 0;
    i < puuids.length;
    i += PUUID_CHUNK_SIZE
  ) {
    const chunk = puuids.slice(
      i,
      i + PUUID_CHUNK_SIZE,
    );

    if (chunk.length === 0) continue;

    const { data, error } = await supabase
      .from("summoner_names_cache")
      .select(
        "puuid, game_name, tag_line, profile_icon_id",
      )
      .in("puuid", chunk);

    if (error) throw error;

    rows.push(...(data ?? []));
  }

  return rows;
}

async function fetchAndCacheSummonerNamesSeparate(
  supabase: any,
  region: string,
  puuids: string[],
): Promise<
  Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId: number | null;
    }
  >
> {
  if (puuids.length === 0) {
    return {};
  }

  let existing: any[] = [];

  try {
    existing =
      (await selectSummonerNamesByPuuids(
        supabase,
        puuids,
      )) ?? [];
  } catch (error) {
    console.error(
      "[summoner_cache] read error:",
      error,
    );
  }

  const valid = (row: any) =>
    Boolean(
      row?.game_name &&
        row.game_name !== "Unknown" &&
        row.game_name !== "Loading…" &&
        row?.tag_line &&
        row.tag_line !== "???" &&
        row?.profile_icon_id != null &&
        Number(row.profile_icon_id) > 0,
    );

  const existingSet = new Set(
    (existing ?? [])
      .filter(valid)
      .map((row: any) => row.puuid),
  );

  const toFetch = puuids.filter(
    (puuid) => !existingSet.has(puuid),
  );

  console.log(
    "[summoner_cache]",
    {
      requested: puuids.length,
      existing: existingSet.size,
      missing: toFetch.length,
    },
  );

  const results: SummonerNameEntry[] = [];

  for (
    let i = 0;
    i < toFetch.length;
    i += SUMMONER_CONCURRENCY
  ) {
    const batch = toFetch.slice(
      i,
      i + SUMMONER_CONCURRENCY,
    );

    const batchResults = await Promise.allSettled(
      batch.map((puuid) =>
        fetchOneSummonerName(region, puuid),
      ),
    );

    for (const result of batchResults) {
      if (
        result.status === "fulfilled" &&
        result.value
      ) {
        results.push(result.value);
      }
    }

    if (
      i + SUMMONER_CONCURRENCY <
      toFetch.length
    ) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          SUMMONER_BATCH_DELAY_MS,
        ),
      );
    }
  }

  // Salva no Supabase
  if (results.length > 0) {
    const rows = results.map((r) => ({
      puuid: r.puuid,
      region: r.region,
      game_name: r.gameName,
      tag_line: r.tagLine,
      profile_icon_id: r.profileIconId,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("summoner_names_cache")
      .upsert(rows, {
        onConflict: "puuid",
      });

    if (error) {
      console.error(
        "[summoner_cache] upsert error:",
        error,
      );
    } else {
      console.log(
        `[summoner_cache] ${results.length} registros salvos no Supabase`,
      );
    }
  }

  // Monta mapa com dados antigos + recém-buscados
  const resultMap: Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId: number | null;
    }
  > = {};

  for (const row of existing ?? []) {
    if (valid(row)) {
      resultMap[row.puuid] = {
        gameName: row.game_name,
        tagLine: row.tag_line,
        profileIconId:
          row.profile_icon_id ?? null,
      };
    }
  }

  for (const row of results) {
    resultMap[row.puuid] = {
      gameName: row.gameName,
      tagLine: row.tagLine,
      profileIconId:
        row.profileIconId,
    };
  }

  return resultMap;
}

// ---------------------------------------------------------------------------
// Ensure all page summoner names exist
// ---------------------------------------------------------------------------

async function ensurePageSummonerNames(
  supabase: any,
  region: string,
  puuids: string[],
): Promise<
  Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId?: number | null;
    }
  >
> {
  if (puuids.length === 0) {
    return {};
  }

  let names =
    await getSummonerNamesFromTable(
      supabase,
      puuids,
    );

  const isComplete = (puuid: string) =>
    Boolean(
      names[puuid]?.gameName &&
        names[puuid]?.tagLine &&
        names[puuid]?.profileIconId != null &&
        Number(names[puuid]?.profileIconId) > 0,
    );

  let missing = puuids.filter(
    (puuid) => !isComplete(puuid),
  );

  for (
    let attempt = 1;
    attempt <= 3 && missing.length > 0;
    attempt++
  ) {
    console.log(
      `[rankings] Fetching ${missing.length} missing summoner names ` +
        `(attempt ${attempt}/3)`,
    );

    const fetched =
      await fetchAndCacheSummonerNamesSeparate(
        supabase,
        region,
        missing,
      );

    names = {
      ...names,
      ...fetched,
    };

    missing = puuids.filter(
      (puuid) => !isComplete(puuid),
    );

    if (
      missing.length > 0 &&
      attempt < 3
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, 500),
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Could not resolve all summoner names: ` +
        `${missing.length}/${puuids.length} missing`,
    );
  }

  return names;
}

// ---------------------------------------------------------------------------
// Build rankings payload
// ---------------------------------------------------------------------------

function buildPayload(
  region: string,
  challenger: any,
  grandmaster: any,
  master: any,
) {
  const sort = (entries: any[]) =>
    (Array.isArray(entries)
      ? entries
      : []
    )
      .slice()
      .sort(
        (a: any, b: any) =>
          b.leaguePoints - a.leaguePoints,
      );

  const challengerEntries = sort(
    challenger.entries,
  );

  const grandmasterEntries = sort(
    grandmaster.entries,
  );

  const masterEntries = sort(
    master.entries,
  );

  const allEntries = [
    ...challengerEntries,
    ...grandmasterEntries,
    ...masterEntries,
  ].sort(
    (a: any, b: any) =>
      b.leaguePoints - a.leaguePoints,
  );

  const regionsUsingThreePages =
    new Set([
      "KR",
      "NA1",
      "EUW1",
      "VN2",
    ]);

  const regionMode =
    regionsUsingThreePages.has(
      region.toUpperCase(),
    )
      ? "three-pages"
      : "two-pages";

  const challengerCutoffPosition =
    regionMode === "three-pages"
      ? 300
      : 200;

  let challengerCutoffLP = 0;

  if (
    allEntries.length >=
    challengerCutoffPosition
  ) {
    challengerCutoffLP =
      allEntries[
        challengerCutoffPosition - 1
      ].leaguePoints;
  } else if (allEntries.length > 0) {
    challengerCutoffLP =
      allEntries[
        allEntries.length - 1
      ].leaguePoints;
  }

  let grandmasterCutoffLP = 0;

  if (regionMode === "three-pages") {
    const globalIndexByPuuid =
      new Map<string, number>(
        allEntries.map(
          (entry: any, index: number) => [
            entry.puuid,
            index,
          ],
        ),
      );

    const relevantGMs =
      grandmasterEntries.filter(
        (entry: any) => {
          const index =
            globalIndexByPuuid.get(
              entry.puuid,
            ) ?? -1;

          return (
            index >=
              challengerCutoffPosition &&
            index < 1000
          );
        },
      );

    grandmasterCutoffLP =
      relevantGMs.length > 0
        ? relevantGMs[
            relevantGMs.length - 1
          ].leaguePoints
        : grandmasterEntries.length > 0
          ? grandmasterEntries[
              grandmasterEntries.length - 1
            ].leaguePoints
          : 0;
  } else {
    grandmasterCutoffLP =
      grandmasterEntries.length > 0
        ? grandmasterEntries[
            grandmasterEntries.length - 1
          ].leaguePoints
        : 0;
  }

  challengerCutoffLP =
    Math.max(challengerCutoffLP, 500);

  grandmasterCutoffLP =
    Math.max(grandmasterCutoffLP, 200);

  const sampleLP = (entries: any[]) => ({
    top: entries.length
      ? entries[0].leaguePoints ?? 0
      : null,

    at200:
      entries.length >= 200
        ? entries[199].leaguePoints ?? 0
        : null,

    at300:
      entries.length >= 300
        ? entries[299].leaguePoints ?? 0
        : null,

    at500:
      entries.length >= 500
        ? entries[499].leaguePoints ?? 0
        : null,

    last: entries.length
      ? entries[entries.length - 1]
          .leaguePoints ?? 0
      : null,

    count: entries.length,
  });

  return {
    allEntries,

    challengerEntries,

    grandmasterEntries,

    masterEntries,

    regionMode,

    cutoffs: {
      challenger: {
        actualCount:
          challengerEntries.length,

        cutoffPosition:
          challengerCutoffPosition,

        cutoffLP:
          challengerCutoffLP,

        sample:
          sampleLP(
            challengerEntries,
          ),
      },

      grandmaster: {
        actualCount:
          grandmasterEntries.length,

        cutoffLP:
          grandmasterCutoffLP,

        sample:
          sampleLP(
            grandmasterEntries,
          ),
      },

      master: {
        actualCount:
          masterEntries.length,

        cutoffLP:
          masterEntries.length
            ? masterEntries[
                masterEntries.length - 1
              ].leaguePoints ?? 0
            : 0,

        sample:
          sampleLP(masterEntries),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Rankings cache - Supabase
// ---------------------------------------------------------------------------

async function getFromSupabase(
  supabase: any,
  cacheKey: string,
) {
  const { data, error } = await supabase
    .from("rankings_cache")
    .select("data, updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.error(
      "[rankings_cache] get error:",
      error,
    );

    return null;
  }

  if (!data) {
    console.log(
      "[rankings_cache] cache MISS:",
      cacheKey,
    );

    return null;
  }

  console.log(
    "[rankings_cache] cache HIT:",
    cacheKey,
  );

  return data as {
    data: any;
    updated_at: string;
  };
}

async function upsertToSupabase(
  supabase: any,
  cacheKey: string,
  region: string,
  queueType: string,
  payload: any,
) {
  const { error } = await supabase
    .from("rankings_cache")
    .upsert(
      {
        cache_key: cacheKey,
        region,
        queue_type: queueType,
        data: payload,
        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict: "cache_key",
      },
    );

  if (error) {
    console.error(
      "[rankings_cache] upsert error:",
      error.message,
    );
  } else {
    console.log(
      "[rankings_cache] cache salvo:",
      cacheKey,
    );
  }
}

// ---------------------------------------------------------------------------
// Get summoner names from separate table
// ---------------------------------------------------------------------------

async function getSummonerNamesFromTable(
  supabase: any,
  puuids: string[],
): Promise<
  Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId: number | null;
    }
  >
> {
  if (puuids.length === 0) {
    return {};
  }

  let data: any[] = [];

  const error = await (async () => {
    try {
      data =
        (await selectSummonerNamesByPuuids(
          supabase,
          puuids,
        )) ?? [];
      return null;
    } catch (err) {
      return err as Error;
    }
  })();

  if (error) {
    console.error(
      "[rankings] SUPABASE summoner_names_cache ERROR:",
      error,
    );

    return {};
  }

  console.log(
    "[rankings] SUPABASE → first 3 rows:",
    data.slice(0, 3),
  );

  const result: Record<
    string,
    {
      gameName: string;
      tagLine: string;
      profileIconId: number | null;
    }
  > = {};

  for (const row of data) {
    result[row.puuid] = {
      gameName: row.game_name,
      tagLine: row.tag_line,
      profileIconId:
        row.profile_icon_id ?? null,
    };
  }

  console.log(
    "[rankings] summonerNames montado:",
    JSON.stringify(
      Object.entries(result).slice(0, 3),
      null,
      2,
    ),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

async function getAllRankings(
  supabase: any,
  region: string,
  queueType: string,
  page: number,
  limit: number,
) {
  // Normaliza a região no cacheKey para evitar entradas duplicadas
  // ("br1-..." vs "BR1-...") de acordo com o case usado na URL.
  const cacheKey =
    `${region.toUpperCase()}-${queueType}`;

  const now = Date.now();

  const cached = await withTimeout(
    getFromSupabase(
      supabase,
      cacheKey,
    ),
    SUPABASE_TIMEOUT_MS,
  );

  // -------------------------------------------------------------------------
  // Cache HIT
  // -------------------------------------------------------------------------

  if (cached) {
    const age =
      now -
      new Date(
        cached.updated_at,
      ).getTime();

    if (age < CACHE_TTL_MS) {
      console.log(
        "[rankings] Usando rankings_cache:",
        {
          cacheKey,
          ageMs: age,
        },
      );

      const pageEntries =
        (
          cached.data?.allEntries ??
          []
        ).slice(
          (page - 1) * limit,
          page * limit,
        );

      const pagePuuids: string[] =
        pageEntries.map(
          (entry: any) =>
            entry.puuid,
        );

      const summonerNames =
        await ensurePageSummonerNames(
          supabase,
          region,
          pagePuuids,
        );

      return {
        payload: cached.data,
        summonerNames,
        fromCache: true,
        updatedAt:
          cached.updated_at,
        ageMs: age,
      };
    }

    console.log(
      "[rankings] rankings_cache expirado:",
      {
        cacheKey,
        ageMinutes: Math.floor(
          age / (1000 * 60),
        ),
      },
    );
  }

  // -------------------------------------------------------------------------
  // Cache MISS / EXPIRED
  // -------------------------------------------------------------------------

  try {
    console.log(
      "[rankings] Buscando rankings da Riot...",
    );

    const [
      challenger,
      grandmaster,
      master,
    ] = await Promise.all([
      fetchLeague(
        region,
        queueType,
        "challenger",
      ),

      fetchLeague(
        region,
        queueType,
        "grandmaster",
      ),

      fetchLeague(
        region,
        queueType,
        "master",
      ),
    ]);

    const payload =
      buildPayload(
        region,
        challenger,
        grandmaster,
        master,
      );

    await upsertToSupabase(
      supabase,
      cacheKey,
      region,
      queueType,
      payload,
    );

    const pageEntries =
      payload.allEntries.slice(
        (page - 1) * limit,
        page * limit,
      );

    const pagePuuids: string[] =
      pageEntries.map(
        (entry: any) =>
          entry.puuid,
      );

    const summonerNames =
      await ensurePageSummonerNames(
        supabase,
        region,
        pagePuuids,
      );

    return {
      payload,
      summonerNames,
      fromCache: false,
      updatedAt:
        new Date().toISOString(),
      ageMs: 0,
    };
  } catch (error) {
    // -----------------------------------------------------------------------
    // Fallback para cache expirado
    // -----------------------------------------------------------------------

    if (cached) {
      console.warn(
        "[rankings] Riot fetch failed, serving stale Supabase cache:",
        error,
      );

      const pageEntries =
        (
          cached.data?.allEntries ??
          []
        ).slice(
          (page - 1) * limit,
          page * limit,
        );

      const pagePuuids: string[] =
        pageEntries.map(
          (entry: any) =>
            entry.puuid,
        );

      const summonerNames =
        await ensurePageSummonerNames(
          supabase,
          region,
          pagePuuids,
        );

      return {
        payload: cached.data,
        summonerNames,
        fromCache: true,
        stale: true,
        updatedAt:
          cached.updated_at,
        ageMs:
          now -
          new Date(
            cached.updated_at,
          ).getTime(),
      };
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
) {
  console.log(
    "🔥🔥🔥 [rankings] GET /api/rankings FOI EXECUTADO 🔥🔥🔥",
  );

  console.log(
    "[rankings] URL:",
    req.nextUrl.toString(),
  );

  try {
    const { searchParams } =
      req.nextUrl;

    const region =
      searchParams.get(
        "region",
      );

    const queueType =
      searchParams.get(
        "queueType",
      ) ||
      "RANKED_SOLO_5x5";

    const page =
      parseInt(
        searchParams.get(
          "page",
        ) || "1",
      );

    const limit =
      parseInt(
        searchParams.get(
          "limit",
        ) || "500",
      );

    console.log(
      "[rankings] PARAMS:",
      {
        region,
        queueType,
        page,
        limit,
      },
    );

    if (!region) {
      return NextResponse.json(
        {
          error:
            "Missing region",
        },
        {
          status: 400,
        },
      );
    }

    if (!RIOT_API_KEY) {
      return NextResponse.json(
        {
          error:
            "RIOT_API_KEY not configured on server",
        },
        {
          status: 500,
        },
      );
    }

    const {
      payload,
      summonerNames,
      fromCache,
      stale,
      updatedAt,
      ageMs,
    } = await getAllRankings(
      supabaseAdmin,
      region,
      queueType,
      page,
      limit,
    );

    const { allEntries } =
      payload;

    const startIndex =
      (page - 1) * limit;

    const endIndex =
      startIndex + limit;

    const paginatedEntries =
      allEntries.slice(
        startIndex,
        endIndex,
      );

    const ageMinutes =
      Math.floor(
        (ageMs ?? 0) /
          (1000 * 60),
      );

    const expiresInMinutes =
      Math.max(
        0,
        Math.floor(
          (CACHE_TTL_MS -
            (ageMs ?? 0)) /
            (1000 * 60),
        ),
      );

    console.log(
      "🔥 [rankings] FINAL → FRONTEND 🔥",
      {
        entries:
          paginatedEntries.length,

        names:
          Object.keys(
            summonerNames,
          ).length,

        firstEntries:
          paginatedEntries
            .slice(0, 3)
            .map(
              (entry: any) => ({
                puuid:
                  entry.puuid,

                leaguePoints:
                  entry.leaguePoints,
              }),
            ),

        firstNames:
          Object.entries(
            summonerNames,
          ).slice(0, 3),
      },
    );

    const response =
      NextResponse.json({
        tier:
          "CHALLENGER+GM+MASTER",

        queue:
          queueType,

        name:
          `${region} Combined Leaderboard`,

        entries:
          paginatedEntries,

        summonerNames,

        pagination: {
          currentPage:
            page,

          totalPages:
            Math.ceil(
              allEntries.length /
                limit,
            ),

          totalEntries:
            allEntries.length,

          entriesPerPage:
            limit,

          hasNextPage:
            endIndex <
            allEntries.length,

          hasPreviousPage:
            page > 1,
        },

        cutoffs:
          payload.cutoffs,

        regionMode:
          payload.regionMode,

        counts: {
          challenger:
            payload
              .challengerEntries
              .length,

          grandmaster:
            payload
              .grandmasterEntries
              .length,

          master:
            payload
              .masterEntries
              .length,
        },

        cache: {
          isFromCache:
            fromCache,

          isStale:
            stale ?? false,

          updatedAt,

          ageInMinutes:
            ageMinutes,

          expiresInMinutes,

          ttlMinutes: 10,
        },
      });

    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate",
    );

    return response;
  } catch (error) {
    console.error(
      "Error in /api/rankings:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch rankings",

        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status:
          error instanceof Error &&
          error.message.includes(
            "Could not resolve all summoner names",
          )
            ? 503
            : 500,
      },
    );
  }
}
