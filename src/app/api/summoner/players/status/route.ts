import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const L2_TTL_MINUTES = 30;

// Retorna se o histórico acumulado de um puuid já está salvo e válido
// no Supabase (mesma chave/TTL que /api/summoner/matches usa no L2).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = (searchParams.get("region") || "").toLowerCase();
    const puuid = searchParams.get("puuid") || "";

    if (!region || !puuid) {
      return NextResponse.json(
        { error: "region and puuid are required" },
        { status: 400 },
      );
    }

    const cacheKey = `matches:${region}:${puuid}:all:all`;

    const { data, error } = await supabaseAdmin
      .from("match_cache")
      .select("data, cached_at")
      .eq("id", cacheKey)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ exists: false, count: 0 });
    }

    const ageMinutes =
      (Date.now() - new Date(data.cached_at).getTime()) / 60000;

    if (ageMinutes > L2_TTL_MINUTES) {
      return NextResponse.json({ exists: false, count: 0 });
    }

    const count = (data.data?.matches?.length as number) || 0;

    return NextResponse.json({ exists: count > 0, count });
  } catch {
    return NextResponse.json({ exists: false, count: 0 });
  }
}