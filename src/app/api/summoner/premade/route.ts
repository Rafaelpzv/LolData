import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { getPremadeMatchesForPuuid, getTeamsByPuuid } from "@/lib/premade/repository";
import {
  fetchInBatches,
  getMatchDetailsBatch,
  getRegionalUrl,
  safeFetch,
  saveMatchDetailsBatch,
} from "@/lib/riot/match-v5";

/**
 * GET /api/summoner/premade — as partidas que o jogador jogou com as premades dele.
 *
 * A lista vem de `premade_matches` (o que cada time já coletou), então o Riot só é chamado para o
 * detalhe das partidas: o mesmo formato do `/api/summoner/matches`, e o mesmo cache, para o cartão
 * da partida ser idêntico ao do histórico.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  region: z.string().min(1),
  puuid: z.string().min(20),
});

const DETAIL_BATCH_SIZE = 20;
/** Sem time cadastrado não há o que buscar; o chamador usa isso para esconder a aba. */
interface TeamRef {
  id: string;
  name: string;
  slug: string;
}

export async function GET(request: NextRequest) {
  const parsed = schema.safeParse({
    region: request.nextUrl.searchParams.get("region") ?? "",
    puuid: request.nextUrl.searchParams.get("puuid") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const { region, puuid } = parsed.data;

  let teams: TeamRef[] = [];
  let matches: Awaited<ReturnType<typeof getPremadeMatchesForPuuid>> = [];
  try {
    teams = await getTeamsByPuuid(puuid);
    if (teams.length === 0) {
      return NextResponse.json({ data: [], teams: [], hasMore: false });
    }
    matches = await getPremadeMatchesForPuuid(teams, puuid);
  } catch (error) {
    console.error("[premade] leitura das partidas do jogador falhou:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const byId = new Map(matches.map((match) => [match.matchId, match]));
  const ids = matches.map((match) => match.matchId);
  const details = new Map<string, any>();

  // O cache do perfil: as partidas que ele já abriu não custam outra chamada ao Riot.
  for (const [id, data] of await getMatchDetailsBatch(ids)) details.set(id, data);

  const base = getRegionalUrl(region);
  const headers = { "X-Riot-Token": process.env.RIOT_API_KEY ?? "" };
  await fetchInBatches(
    ids
      .filter((id) => !details.has(id))
      .map((id) => async () => {
        try {
          const res = await safeFetch(
            `${base}/lol/match/v5/matches/${encodeURIComponent(id)}`,
            { headers, cache: "no-store" },
          );
          if (!res.ok) return;
          details.set(id, await res.json());
        } catch {
          // Uma partida sem detalhe só não aparece; o resto da lista continua.
        }
      }),
    DETAIL_BATCH_SIZE,
  );
  await saveMatchDetailsBatch([...details.values()]).catch(() => {});

  // A ordem e o time de cada partida vêm do registro do time, não da resposta da API.
  const data = ids
    .filter((id) => details.has(id))
    .map((id) => {
      const match = byId.get(id)!;
      return {
        ...details.get(id),
        premade: {
          teamName: match.teamName,
          teamSlug: match.teamSlug,
        },
      };
    });

  return NextResponse.json({
    data,
    teams: teams.map((team) => ({ name: team.name, slug: team.slug })),
    hasMore: false,
  });
}
