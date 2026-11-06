import { NextRequest, NextResponse } from "next/server";

import { getRegionalUrl, safeFetch } from "@/lib/riot/match-v5";
import { PREMADE_QUEUE_ID } from "@/lib/premade/collect";
import { getTeamBySlug, getTeamMatches } from "@/lib/premade/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Same caps the collector uses, so the diagnosis measures what the collection can see. */
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

interface Params {
  params: Promise<{ slug: string }>;
}

interface PlayerHistory {
  flexGames: number;
  pages: number;
  oldestMatchId: string | null;
  newestMatchId: string | null;
  oldestDate: number | null;
  newestDate: number | null;
  exhausted: boolean;
  stoppedBy: "end" | "maxPages" | "error";
}

async function history(base: string, puuid: string, headers: HeadersInit): Promise<PlayerHistory & { ids: string[] }> {
  const ids: string[] = [];
  let pages = 0;
  let exhausted = false;
  let failed = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`);
    url.searchParams.set("queue", String(PREMADE_QUEUE_ID));
    url.searchParams.set("start", String(page * PAGE_SIZE));
    url.searchParams.set("count", String(PAGE_SIZE));
    const res = await safeFetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) {
      failed = true;
      break;
    }
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body) || body.length === 0) {
      exhausted = true;
      break;
    }
    ids.push(...(body as string[]));
    pages += 1;
    if (body.length < PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  return {
    ids,
    flexGames: ids.length,
    pages,
    oldestMatchId: ids.at(-1) ?? null,
    newestMatchId: ids[0] ?? null,
    oldestDate: null,
    newestDate: null,
    exhausted,
    stoppedBy: failed ? "error" : exhausted ? "end" : "maxPages",
  };
}

/** GET /api/premade/[slug]/diagnostic — where the collected games are being lost. Dev only. */
export async function GET(_request: NextRequest, { params }: Params) {
  // Never reachable in production. This route fans out to hundreds of Riot calls per request
  // (one history sweep per player plus up to `scan` match details), so an open endpoint here
  // would burn the API key's rate limit for the whole app. A previous version let `?force=1`
  // through in production, which made it public; there is no such escape hatch now.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "devOnly" }, { status: 404 });
  }

  const { slug } = await params;
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "riotUnavailable" }, { status: 500 });

  const headers = { "X-Riot-Token": apiKey };
  const base = getRegionalUrl(team.region);
  const puuids = team.members.map((member) => member.puuid);

  // a) One by-puuid/ids sweep per roster player, with the same caps the collector uses.
  const players: (PlayerHistory & { puuid: string })[] = [];
  const union = new Set<string>();
  for (const puuid of puuids) {
    const { ids, ...rest } = await history(base, puuid, headers);
    for (const id of ids) union.add(id);
    players.push({ puuid, ...rest });
  }

  // c) How many roster players shared a side in each game of the union (caps the details).
  const scanLimit = Math.min(union.size, Number(_request.nextUrl.searchParams.get("scan") ?? 200));
  const ids = [...union].sort((a, b) => b.localeCompare(a)).slice(0, scanLimit);
  const depth = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, "5+": 0 } as Record<string, number>;
  let oldestDate: number | null = null;
  let newestDate: number | null = null;

  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const details = await Promise.all(
      chunk.map(async (id) => {
        const res = await safeFetch(`${base}/lol/match/v5/matches/${encodeURIComponent(id)}`, {
          headers,
          cache: "no-store",
        });
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as Record<string, any> | null;
        return (body?.info ?? null) as Record<string, any> | null;
      }),
    );

    for (const info of details) {
      if (!info) continue;
      const created = Number(info.gameCreation ?? 0);
      if (oldestDate === null || created < oldestDate) oldestDate = created;
      if (newestDate === null || created > newestDate) newestDate = created;

      const bySide = new Map<number, number>();
      for (const participant of info.participants as Record<string, unknown>[]) {
        if (!puuids.includes(String(participant.puuid ?? ""))) continue;
        const side = Number(participant.teamId ?? 0);
        bySide.set(side, (bySide.get(side) ?? 0) + 1);
      }
      const best = Math.max(0, ...bySide.values());
      depth[best >= 5 ? "5+" : String(best)] += 1;
    }
  }

  const stored = await getTeamMatches(team.id, 1000);

  return NextResponse.json({
    slug: team.slug,
    players,
    unionGames: union.size,
    scanLimit,
    dateRange: oldestDate && newestDate ? { oldest: oldestDate, newest: newestDate } : null,
    depth,
    discardedFour: depth["4"],
    stored: stored.length,
    storedMissingChampion: stored.filter((m) =>
      m.participants.some((p) => !p.championName || !p.teamPosition || !p.championId),
    ).length,
  });
}
