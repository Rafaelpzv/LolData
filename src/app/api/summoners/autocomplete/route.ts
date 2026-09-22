import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";
import { USE_FIXTURES, fixtureAutocomplete } from "@/lib/fixtures";

const MAX_RESULTS = 8;

// Sugere invocadores já vistos (indexados em match_cache com id "summoner:...").
// Busca global (todas as regiões); o cliente decide/atualiza a região ao escolher.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const raw = (searchParams.get("q") || "").trim().toLowerCase();

    if (USE_FIXTURES) {
      return NextResponse.json(fixtureAutocomplete(raw));
    }

    if (!raw) {
      return NextResponse.json([]);
    }

    // Remove caracteres que funcionam como curinga no ILIKE do PostgREST.
    const cleaned = raw.replace(/[%_*]/g, "");
    const parts = cleaned.split("#");
    const namePart = (parts[0] || "").trim();
    const tagPart = parts.length > 1 ? (parts[1] || "").trim() : "";

    let query = supabaseAdmin
      .from("match_cache")
      .select("id, data, cached_at")
      .like("id", "summoner:%");

    if (parts.length > 1 && namePart && tagPart) {
      // "rifu#dia" -> nome começa com rifu E tag começa com dia (mais preciso).
      query = query
        .like("game_name", `%${namePart}%`)
        .like("tagline", `%${tagPart}%`);
    } else {
      const term = namePart || tagPart;
      if (!term) return NextResponse.json([]);
      query = query.or(
        `game_name.ilike.%${term}%,tagline.ilike.%${term}%`,
      );
    }

    const { data, error } = await query
      .order("cached_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      return NextResponse.json([]);
    }

    const seen = new Set<string>();
    const suggestions: any[] = [];

    for (const row of data as any[]) {
      const d = row?.data;
      if (!d || !d.gameName || !d.tagLine) continue;

      const idKey = `${d.region}:${String(d.gameName).toLowerCase()}:${String(
        d.tagLine,
      ).toLowerCase()}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);

      suggestions.push({
        region: d.region,
        gameName: d.gameName,
        tagLine: d.tagLine,
        puuid: d.puuid,
      });

      if (suggestions.length >= MAX_RESULTS) break;
    }

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}