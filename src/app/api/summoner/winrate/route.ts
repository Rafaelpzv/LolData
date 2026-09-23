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
} from "@/lib/riot/winrate";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = searchParams.get("region") || "";
    const puuid = searchParams.get("puuid") || "";
    const period = searchParams.get("period");
    const queueId = searchParams.get("queueId") || "";

    if (!region || puuid.length < 20 || !isWinratePeriod(period) || (queueId && !/^\d+$/.test(queueId))) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const { RIOT_API_KEY } = process.env;
    if (!RIOT_API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const now = Date.now();
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
