import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AMERICAS_API_URL = "https://americas.api.riotgames.com";
const EUROPE_API_URL = "https://europe.api.riotgames.com";
const ASIA_API_URL = "https://asia.api.riotgames.com";
const SEA_API_URL = "https://sea.api.riotgames.com";

const TFT_API_KEY =
  process.env.RIOT_TFT_API_KEY || process.env.RIOT_API_KEY;

const matchesSchema = z.object({
  region: z.string().min(1),
  puuid: z.string().min(20),
  start: z.number().default(0),
  count: z.number().min(1).max(100).default(20),
});

const matchCache = new Map<
  string,
  { data: any; expires: number; hasMore: boolean }
>();
const L1_TTL = 5 * 60 * 1000;
const L2_TTL_MINUTES = 30;
const MAX_RIOT_OFFSET = 200;

const DETAIL_BATCH_SIZE = 5;

type RiotFetchOptions = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

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

async function getMatchDetailsBatch(
  matchIds: string[],
): Promise<Map<string, any>> {
  const detailMap = new Map<string, any>();
  if (matchIds.length === 0) return detailMap;

  try {
    const keys = matchIds.map((id) => `tftmatch:${id}`);
    const { data } = await supabaseAdmin
      .from("match_cache")
      .select("id, data")
      .in("id", keys);

    for (const row of data || []) {
      const matchId = (row.id as string).replace("tftmatch:", "");
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
    .filter((m) => m?.metadata?.match_id)
    .map((m) => ({
      id: `tftmatch:${m.metadata.match_id}`,
      data: m,
      cached_at: new Date().toISOString(),
      game_name: null,
      tagline: null,
    }));

  if (rows.length === 0) return;

  await supabaseAdmin.from("match_cache").upsert(rows);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = searchParams.get("region");
    const puuid = searchParams.get("puuid");
    const start = Number(searchParams.get("start") || "0");
    const count = Number(searchParams.get("count") || "20");

    const validatedData = matchesSchema.parse({
      region,
      puuid,
      start,
      count,
    });

    if (!TFT_API_KEY) {
      return NextResponse.json(
        { error: "TFT API key not configured" },
        { status: 500 },
      );
    }

    const l1Key = `tft-matches:${validatedData.region}:${validatedData.puuid}:${validatedData.start}:${validatedData.count}`;
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

    const detailsApiUrl = getRegionalUrl(validatedData.region);

    if (validatedData.start >= MAX_RIOT_OFFSET) {
      return NextResponse.json({ data: [], hasMore: false });
    }

    // ================= FETCH RIOT =================
    const matchIdsUrl = new URL(
      `${detailsApiUrl}/tft/match/v1/matches/by-puuid/${validatedData.puuid}/ids`,
    );
    matchIdsUrl.searchParams.set("start", String(validatedData.start));
    matchIdsUrl.searchParams.set("count", String(validatedData.count));

    const matchIdsResponse = await safeFetch(matchIdsUrl.toString(), {
      headers: { "X-Riot-Token": TFT_API_KEY },
      next: { revalidate: 60 },
    });

    if (!matchIdsResponse.ok) {
      const error = await matchIdsResponse.json();
      return NextResponse.json(
        { error: error.status?.message || "Failed to fetch TFT match IDs" },
        { status: matchIdsResponse.status },
      );
    }

    const matchIdsRaw = await matchIdsResponse.json();
    const matchIds: string[] = Array.isArray(matchIdsRaw) ? matchIdsRaw : [];

    if (matchIds.length === 0) {
      return NextResponse.json({ data: [], cache: "MISS_UPDATE", hasMore: false });
    }

    // Detalhes: primeiro do cache (Supabase), depois da Riot
    const cachedDetailsMap = await getMatchDetailsBatch(matchIds);

    const fromCache: any[] = [];
    const missingIds: string[] = [];

    for (const id of matchIds) {
      const cached = cachedDetailsMap.get(id);
      if (
        cached?.metadata?.match_id &&
        cached?.info?.participants?.length >= 8
      ) {
        fromCache.push(cached);
      } else {
        missingIds.push(id);
      }
    }

    const riotMatches: any[] = [];

    for (let i = 0; i < missingIds.length; i += DETAIL_BATCH_SIZE) {
      const batch = missingIds.slice(i, i + DETAIL_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((id) =>
          safeFetch(`${detailsApiUrl}/tft/match/v1/matches/${id}`, {
            headers: { "X-Riot-Token": TFT_API_KEY },
            next: { revalidate: 86400 },
          }).then((r) => r.json()),
        ),
      );

      riotMatches.push(
        ...results.filter(
          (m: any) => m?.metadata?.match_id && m?.info?.participants,
        ),
      );
    }

    saveMatchDetailsBatch(riotMatches).catch(() => {});

    const data = [...fromCache, ...riotMatches].sort(
      (a, b) => b.info.game_datetime - a.info.game_datetime,
    );

    const hasMore =
      matchIds.length >= validatedData.count &&
      validatedData.start + validatedData.count < MAX_RIOT_OFFSET;

    matchCache.set(l1Key, { data, expires: now + L1_TTL, hasMore });

    return NextResponse.json({
      data,
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