// src/app/api/tft/rankings/route.ts
import { NextResponse, NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSummonerNameByPuuid } from "@/app/actions/summoner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RIOT_API_KEY = process.env.RIOT_TFT_API_KEY || process.env.RIOT_API_KEY;

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
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Riot API helpers (TFT)
// ---------------------------------------------------------------------------

async function fetchTftLeague(
  region: string,
  tier: "challenger" | "grandmaster" | "master",
) {
  if (!RIOT_API_KEY) {
    throw new Error("RIOT_TFT_API_KEY not configured on the server");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RIOT_FETCH_TIMEOUT_MS,
  );

  const url =
    `https://${region}.api.riotgames.com/tft/league/v1/${tier}`;

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
    throw new Error(`Error fetching tft ${tier}: ${res.status}${detail}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Summoner names cache (mesmo fluxo do LoL)
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
    const data = await getSummonerNameByPuuid(region, puuid);

    if (!data?.name || !data?.tagLine) {
      return null;
    }

    return {
      puuid,
      gameName: data.name,
      tagLine: data.tagLine,
      profileIconId: data.profileIconId ?? null,
      region,
    };
  } catch (error) {
    console.error(`[tft/rankings] Failed to resolve ${puuid}:`, error);
    return null;
  }
}

const PUUID_CHUNK_SIZE = 50;

async function selectSummonerNamesByPuuids(
  supabase: any,
  puuids: string[],
): Promise<any[]> {
  const rows: any[] = [];

  for (let i = 0; i < puuids.length; i += PUUID_CHUNK_SIZE) {
    const chunk = puuids.slice(i, i + PUUID_CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const { data, error } = await supabase
      .from("summoner_names_cache")
      .select("puuid, game_name, tag_line, profile_icon_id")
      .in("puuid", chunk);

    if (error) throw error;
    rows.push(...(data ?? []));
  }

  return rows;
}

async function getSummonerNamesFromTable(
  supabase: any,
  puuids: string[],
): Promise<
  Record<
    string,
    { gameName: string; tagLine: string; profileIconId: number | null }
  >
> {
  if (puuids.length === 0) return {};

  let data: any[] = [];
  try {
    data = (await selectSummonerNamesByPuuids(supabase, puuids)) ?? [];
  } catch (error) {
    console.error("[tft/rankings] SUPABASE summoner_names_cache ERROR:", error);
    return {};
  }

  const result: Record<
    string,
    { gameName: string; tagLine: string; profileIconId: number | null }
  > = {};

  for (const row of data) {
    result[row.puuid] = {
      gameName: row.game_name,
      tagLine: row.tag_line,
      profileIconId: row.profile_icon_id ?? null,
    };
  }

  return result;
}

async function fetchAndCacheSummonerNames(
  supabase: any,
  region: string,
  puuids: string[],
): Promise<
  Record<
    string,
    { gameName: string; tagLine: string; profileIconId: number | null }
  >
> {
  if (puuids.length === 0) return {};

  let existing: any[] = [];
  try {
    existing = (await selectSummonerNamesByPuuids(supabase, puuids)) ?? [];
  } catch (error) {
    console.error("[tft/rankings] summoner_cache read error:", error);
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

  const toFetch = puuids.filter((puuid) => !existingSet.has(puuid));

  const results: SummonerNameEntry[] = [];

  for (let i = 0; i < toFetch.length; i += SUMMONER_CONCURRENCY) {
    const batch = toFetch.slice(i, i + SUMMONER_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((puuid) => fetchOneSummonerName(region, puuid)),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }

    if (i + SUMMONER_CONCURRENCY < toFetch.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, SUMMONER_BATCH_DELAY_MS),
      );
    }
  }

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
      .upsert(rows, { onConflict: "puuid" });

    if (error) {
      console.error("[tft/rankings] summoner_cache upsert error:", error);
    }
  }

  const resultMap: Record<
    string,
    { gameName: string; tagLine: string; profileIconId: number | null }
  > = {};

  for (const row of existing ?? []) {
    if (valid(row)) {
      resultMap[row.puuid] = {
        gameName: row.game_name,
        tagLine: row.tag_line,
        profileIconId: row.profile_icon_id ?? null,
      };
    }
  }

  for (const row of results) {
    resultMap[row.puuid] = {
      gameName: row.gameName,
      tagLine: row.tagLine,
      profileIconId: row.profileIconId,
    };
  }

  return resultMap;
}

async function ensurePageSummonerNames(
  supabase: any,
  region: string,
  puuids: string[],
): Promise<
  Record<
    string,
    { gameName: string; tagLine: string; profileIconId?: number | null }
  >
> {
  if (puuids.length === 0) return {};

  let names = await getSummonerNamesFromTable(supabase, puuids);

  const isComplete = (puuid: string) =>
    Boolean(
      names[puuid]?.gameName &&
        names[puuid]?.tagLine &&
        names[puuid]?.profileIconId != null &&
        Number(names[puuid]?.profileIconId) > 0,
    );

  let missing = puuids.filter((puuid) => !isComplete(puuid));

  for (let attempt = 1; attempt <= 3 && missing.length > 0; attempt++) {
    const fetched = await fetchAndCacheSummonerNames(
      supabase,
      region,
      missing,
    );

    names = { ...names, ...fetched };
    missing = puuids.filter((puuid) => !isComplete(puuid));

    if (missing.length > 0 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Could not resolve all summoner names: ${missing.length}/${puuids.length} missing`,
    );
  }

  return names;
}

// ---------------------------------------------------------------------------
// Build payload (Challenger + GM + Master combinados por LP)
// ---------------------------------------------------------------------------

function buildPayload(region: string, challenger: any, grandmaster: any, master: any) {
  const sort = (entries: any[]) =>
    (Array.isArray(entries) ? entries : []).slice().sort(
      (a: any, b: any) => b.leaguePoints - a.leaguePoints,
    );

  const challengerEntries = sort(challenger?.entries);
  const grandmasterEntries = sort(grandmaster?.entries);
  const masterEntries = sort(master?.entries);

  const allEntries = [...challengerEntries, ...grandmasterEntries, ...masterEntries]
    .sort((a: any, b: any) => b.leaguePoints - a.leaguePoints);

  const regionsUsingThreePages = new Set(["KR", "NA1", "EUW1", "VN2"]);
  const regionMode = regionsUsingThreePages.has(region.toUpperCase())
    ? "three-pages"
    : "two-pages";

  const challengerCutoffPosition = regionMode === "three-pages" ? 300 : 200;

  let challengerCutoffLP = 0;
  if (allEntries.length >= challengerCutoffPosition) {
    challengerCutoffLP = allEntries[challengerCutoffPosition - 1].leaguePoints;
  } else if (allEntries.length > 0) {
    challengerCutoffLP = allEntries[allEntries.length - 1].leaguePoints;
  }

  let grandmasterCutoffLP = 0;
  if (regionMode === "three-pages") {
    const globalIndexByPuuid = new Map<string, number>(
      allEntries.map((entry: any, index: number) => [entry.puuid, index]),
    );
    const relevantGMs = grandmasterEntries.filter((entry: any) => {
      const index = globalIndexByPuuid.get(entry.puuid) ?? -1;
      return index >= challengerCutoffPosition && index < 1000;
    });
    grandmasterCutoffLP =
      relevantGMs.length > 0
        ? relevantGMs[relevantGMs.length - 1].leaguePoints
        : grandmasterEntries.length > 0
          ? grandmasterEntries[grandmasterEntries.length - 1].leaguePoints
          : 0;
  } else {
    grandmasterCutoffLP =
      grandmasterEntries.length > 0
        ? grandmasterEntries[grandmasterEntries.length - 1].leaguePoints
        : 0;
  }

  challengerCutoffLP = Math.max(challengerCutoffLP, 500);
  grandmasterCutoffLP = Math.max(grandmasterCutoffLP, 200);

  const sampleLP = (entries: any[]) => ({
    top: entries.length ? entries[0].leaguePoints ?? 0 : null,
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
        cutoffLP:
          masterEntries.length > 0
            ? masterEntries[masterEntries.length - 1].leaguePoints ?? 0
            : 0,
        sample: sampleLP(masterEntries),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Rankings cache - Supabase
// ---------------------------------------------------------------------------

async function getFromSupabase(supabase: any, cacheKey: string) {
  const { data, error } = await supabase
    .from("rankings_cache")
    .select("data, updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.error("[tft/rankings_cache] get error:", error);
    return null;
  }

  if (!data) return null;

  return data as { data: any; updated_at: string };
}

async function upsertToSupabase(
  supabase: any,
  cacheKey: string,
  region: string,
  payload: any,
) {
  const { error } = await supabase
    .from("rankings_cache")
    .upsert(
      {
        cache_key: cacheKey,
        region,
        queue_type: "RANKED_TFT",
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );

  if (error) {
    console.error("[tft/rankings_cache] upsert error:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

async function getAllRankings(
  supabase: any,
  region: string,
  page: number,
  limit: number,
) {
  const cacheKey = `TFT-${region.toUpperCase()}`;

  const now = Date.now();
  const cached = await withTimeout(
    getFromSupabase(supabase, cacheKey),
    SUPABASE_TIMEOUT_MS,
  );

  if (cached) {
    const age = now - new Date(cached.updated_at).getTime();

    if (age < CACHE_TTL_MS) {
      const pageEntries = (cached.data?.allEntries ?? []).slice(
        (page - 1) * limit,
        page * limit,
      );
      const pagePuuids: string[] = pageEntries.map((entry: any) => entry.puuid);

      const summonerNames = await ensurePageSummonerNames(
        supabase,
        region,
        pagePuuids,
      );

      return {
        payload: cached.data,
        summonerNames,
        fromCache: true,
        updatedAt: cached.updated_at,
        ageMs: age,
      };
    }
  }

  try {
    const [challenger, grandmaster, master] = await Promise.all([
      fetchTftLeague(region, "challenger"),
      fetchTftLeague(region, "grandmaster"),
      fetchTftLeague(region, "master"),
    ]);

    const payload = buildPayload(region, challenger, grandmaster, master);

    await upsertToSupabase(supabase, cacheKey, region, payload);

    const pageEntries = payload.allEntries.slice(
      (page - 1) * limit,
      page * limit,
    );
    const pagePuuids: string[] = pageEntries.map((entry: any) => entry.puuid);

    const summonerNames = await ensurePageSummonerNames(
      supabase,
      region,
      pagePuuids,
    );

    return {
      payload,
      summonerNames,
      fromCache: false,
      updatedAt: new Date().toISOString(),
      ageMs: 0,
    };
  } catch (error) {
    if (cached) {
      console.warn(
        "[tft/rankings] Riot fetch failed, serving stale Supabase cache:",
        error,
      );

      const pageEntries = (cached.data?.allEntries ?? []).slice(
        (page - 1) * limit,
        page * limit,
      );
      const pagePuuids: string[] = pageEntries.map((entry: any) => entry.puuid);

      const summonerNames = await ensurePageSummonerNames(
        supabase,
        region,
        pagePuuids,
      );

      return {
        payload: cached.data,
        summonerNames,
        fromCache: true,
        stale: true,
        updatedAt: cached.updated_at,
        ageMs: now - new Date(cached.updated_at).getTime(),
      };
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const region = searchParams.get("region");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "500");

    if (!region) {
      return NextResponse.json({ error: "Missing region" }, { status: 400 });
    }

    if (!RIOT_API_KEY) {
      return NextResponse.json(
        { error: "RIOT_TFT_API_KEY not configured on server" },
        { status: 500 },
      );
    }

    const { payload, summonerNames, fromCache, stale, updatedAt, ageMs } =
      await getAllRankings(supabaseAdmin, region, page, limit);

    const { allEntries } = payload;

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = allEntries.slice(startIndex, endIndex);

    const ageMinutes = Math.floor((ageMs ?? 0) / (1000 * 60));
    const expiresInMinutes = Math.max(
      0,
      Math.floor((CACHE_TTL_MS - (ageMs ?? 0)) / (1000 * 60)),
    );

    const response = NextResponse.json({
      tier: "CHALLENGER+GM+MASTER",
      queue: "RANKED_TFT",
      name: `${region} TFT Combined Leaderboard`,
      entries: paginatedEntries,
      summonerNames,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(allEntries.length / limit),
        totalEntries: allEntries.length,
        entriesPerPage: limit,
        hasNextPage: endIndex < allEntries.length,
        hasPreviousPage: page > 1,
      },
      cutoffs: payload.cutoffs,
      regionMode: payload.regionMode,
      counts: {
        challenger: payload.challengerEntries.length,
        grandmaster: payload.grandmasterEntries.length,
        master: payload.masterEntries.length,
      },
      cache: {
        isFromCache: fromCache,
        isStale: stale ?? false,
        updatedAt,
        ageInMinutes: ageMinutes,
        expiresInMinutes,
        ttlMinutes: 10,
      },
    });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    console.error("Error in /api/tft/rankings:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch TFT rankings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}