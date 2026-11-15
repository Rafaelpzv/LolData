import { NextRequest, NextResponse } from "next/server";

import {
  fetchInBatches,
  getMatchDetailsBatch,
  getRegionalUrl,
  safeFetch,
  saveMatchDetailsBatch,
} from "@/lib/riot/match-v5";
import {
  MAX_MATCHES,
  aggregateWinrate,
  isWinratePeriod,
  periodRange,
  type WinrateGame,
  type WinratePeriod,
} from "@/lib/riot/winrate";
import { getPremadeMatchesForPuuid, getTeamsByPuuid } from "@/lib/premade/repository";

/** Small parallel batches keep bursts well under the dev key limit (20 req / s). */
const DETAIL_BATCH_SIZE = 5;
/** Games shorter than this are remakes and do not count. */
const REMAKE_SECONDS = 300;

const CACHE_HEADERS = { "Cache-Control": "private, max-age=60" };

function toGame(match: any, puuid: string): WinrateGame | null {
  const info = match?.info;
  const p = info?.participants?.find((x: any) => x.puuid === puuid);
  if (!p) return null;
  if ((info.gameDuration ?? 0) < REMAKE_SECONDS || p.gameEndedInEarlySurrender) return null;
  const ts = info.gameEndTimestamp ?? info.gameStartTimestamp ?? info.gameCreation;
  if (!ts) return null;
  return { ts, win: p.win === true };
}

/**
 * A mesma série, limitada às partidas que as premades do jogador coletaram.
 *
 * O recorte vem do banco (quem são os jogos) e o cache de detalhes dá data e resultado. Só o que não
 * está no cache é buscado no Riot, em lotes pequenos, como faz o resto das rotas do perfil.
 */
async function premadeWinrate(
  region: string,
  puuid: string,
  period: WinratePeriod,
  queueId: string,
  now: number,
) {
  const teams = await getTeamsByPuuid(puuid);
  if (teams.length === 0) return aggregateWinrate([], period, now, false);

  const collected = await getPremadeMatchesForPuuid(teams, puuid);
  const { from } = periodRange(period, now);
  // Jogos fora do período não entram na série: não há por que buscar o detalhe deles. A data aqui é
  // só um corte grosso (o fim da partida); o limite exato é o que o agregador aplica depois.
  const inRange = collected
    .filter((match) => !queueId || match.queueId === Number(queueId))
    .filter((match) => match.gameCreation >= from)
    .map((match) => match.matchId);
  if (inRange.length === 0) return aggregateWinrate([], period, now, false);

  const details = new Map<string, any>();
  for (const [id, data] of await getMatchDetailsBatch(inRange)) details.set(id, data);

  const missing = inRange.filter((id) => !details.get(id)?.info?.participants);
  const fetched = await fetchInBatches(
    missing.map(
      (id) => () =>
        safeFetch(`${getRegionalUrl(region)}/lol/match/v5/matches/${id}`, {
          headers: { "X-Riot-Token": process.env.RIOT_API_KEY ?? "" },
          next: { revalidate: 86400 },
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
    ),
    DETAIL_BATCH_SIZE,
  );
  const riotDetails = fetched.filter((m: any) => m?.metadata?.matchId && m?.info?.participants);
  saveMatchDetailsBatch(riotDetails).catch(() => {});

  const games: WinrateGame[] = [];
  for (const match of [...details.values(), ...riotDetails]) {
    const game = toGame(match, puuid);
    if (game) games.push(game);
  }
  return aggregateWinrate(games, period, now, false);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = searchParams.get("region") || "";
    const puuid = searchParams.get("puuid") || "";
    const period = searchParams.get("period");
    const queueId = searchParams.get("queueId") || "";
    // "premade=1": a série é só das partidas que as premades do jogador coletaram.
    const premadeOnly = searchParams.get("premade") === "1";

    if (!region || puuid.length < 20 || !isWinratePeriod(period) || (queueId && !/^\d+$/.test(queueId))) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const { RIOT_API_KEY } = process.env;
    if (!RIOT_API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const now = Date.now();

    if (premadeOnly) {
      // A lista de partidas do jogador com as premades dele é o recorte: nada é pedido ao Riot para
      // decidir QUAIS jogos são. O detalhe (data, vitória) sai do mesmo cache do histórico.
      const result = await premadeWinrate(region, puuid, period, queueId, now);
      return NextResponse.json(result, { headers: CACHE_HEADERS });
    }
    const { from } = periodRange(period, now);
    const apiUrl = getRegionalUrl(region);

    // One ids call: the MAX_MATCHES most recent games of the period.
    const idsUrl = new URL(`${apiUrl}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`);
    idsUrl.searchParams.set("startTime", String(Math.floor(from / 1000)));
    idsUrl.searchParams.set("start", "0");
    idsUrl.searchParams.set("count", String(MAX_MATCHES));
    if (queueId) idsUrl.searchParams.set("queue", queueId);

    const idsRes = await safeFetch(idsUrl.toString(), {
      headers: { "X-Riot-Token": RIOT_API_KEY },
      next: { revalidate: 60 },
    });
    if (!idsRes.ok) {
      const error = await idsRes.json().catch(() => null);
      return NextResponse.json(
        { error: error?.status?.message || "Failed to fetch match IDs" },
        { status: idsRes.status },
      );
    }
    const idsRaw = await idsRes.json();
    const matchIds: string[] = Array.isArray(idsRaw) ? idsRaw : [];
    // Riot caps count at 100, so a full page means the period may hold more games.
    const truncated = matchIds.length >= MAX_MATCHES;

    // Details: Supabase match cache first, Riot for the rest.
    const cached = await getMatchDetailsBatch(matchIds);
    const missing = matchIds.filter((id) => !cached.get(id)?.info?.participants);

    const fetched = await fetchInBatches(
      missing.map(
        (id) => () =>
          safeFetch(`${apiUrl}/lol/match/v5/matches/${id}`, {
            headers: { "X-Riot-Token": RIOT_API_KEY },
            next: { revalidate: 86400 },
          })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
      ),
      DETAIL_BATCH_SIZE,
    );
    const riotDetails = fetched.filter((m: any) => m?.metadata?.matchId && m?.info?.participants);
    saveMatchDetailsBatch(riotDetails).catch(() => {});

    const games: WinrateGame[] = [];
    for (const match of [...cached.values(), ...riotDetails]) {
      const game = toGame(match, puuid);
      if (game) games.push(game);
    }

    return NextResponse.json(aggregateWinrate(games, period, now, truncated), { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Winrate route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
