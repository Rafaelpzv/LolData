import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

const BATCH_SIZE = 100;

/**
 * Extrai o indice summoner:% a partir de partidas ja cacheadas.
 * Regiao vem do prefixo do matchId (ex.: "BR1_123..." -> br1).
 * Dedupe local por id dentro do lote (upsert faz o dedupe global).
 */
function extractSummonerRows(matches: any[]): any[] {
  const seen = new Set<string>();
  const rows: any[] = [];

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

      rows.push({
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

  return rows;
}

/**
 * Backfill do indice summoner:% a partir das partidas ja em cache.
 *
 * Historico 100% cacheado (rifu#diabo) nunca dispara salvamento de partida
 * NOVA, entao o indice summoner:% fica vazio e o autocomplete retorna [].
 * Este endpoint varre as rows "match:%" existentes, extrai os invocadores
 * e popula o indice de forma idempotente (upsert por id, dedupe por cursor).
 *
 * Uso: GET /api/summoners/backfill  (paginas por cursor; idempotente)
 */
export async function GET(request: NextRequest) {
  try {
    const processAll =
      (request.nextUrl.searchParams.get("all") || "").toLowerCase() === "true";

    const pattern = { like: "match:%" };

    let lastId: string | null = null;
    let scanned = 0 as number;
    let inserted = 0 as number;

    for (;;) {
      let query = supabaseAdmin
        .from("match_cache")
        .select("id, data")
        .like("id", pattern.like)
        .order("id", { ascending: true })
        .limit(BATCH_SIZE);

      if (lastId) {
        query = query.gt("id", lastId);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) break;

      const rows = extractSummonerRows(
        data
          .map((r: any) => r?.data)
          .filter((d: any) => !!d?.metadata?.matchId),
      );

      if (rows.length > 0) {
        await supabaseAdmin.from("match_cache").upsert(rows);
        inserted += rows.length;
      }

      scanned += data.length;
      lastId = data[data.length - 1].id;

      if (data.length < BATCH_SIZE) break;
    }

    return NextResponse.json({ scanned, inserted });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}