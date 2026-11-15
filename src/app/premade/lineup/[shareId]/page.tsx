import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LineupView, orderLineup, type LineupPerson } from "@/components/premade/lineup-view";
import { championName } from "@/lib/champions";
import { ALL_MODES_KEY } from "@/lib/premade/collect";
import { accountGamesOf, personCards } from "@/lib/premade/lobby";
import type { AccountRanks } from "@/lib/premade/ranks";
import {
  getAccountRanks,
  getLastUpdate,
  getPlayers,
  getTeamById,
  getTeamMatches,
  getTimelines,
} from "@/lib/premade/repository";
import { getTeamByShareId } from "@/lib/premade/share";
import { buildTeamAnalysis } from "@/lib/premade/team-analysis";
import { loadAnalysisPayload } from "@/lib/premade/analysis-payload";
import { buildQuickDiagnosis } from "@/lib/premade/quick-diagnosis";
import { regionShort } from "@/lib/regions";
import { summonerHref } from "@/lib/summoner-href";

interface LineupPageProps {
  params: Promise<{ shareId: string }>;
  searchParams: Promise<{ queue?: string }>;
}

/** Os modos que o seletor mostra: "todos" (o padrão) e cada fila coletada. */
const MODES = [ALL_MODES_KEY, "flex", "classic"] as const;

/** O filtro de modo da URL: sem ele (ou com um valor inválido) a página junta todos os modos. */
function readQueue(raw: string | undefined): string {
  return MODES.find((mode) => mode === raw) ?? ALL_MODES_KEY;
}

/** The share id is the only key: the slug never appears on this page. */
export async function generateMetadata({ params }: LineupPageProps): Promise<Metadata> {
  const { shareId } = await params;
  const teamId = await getTeamByShareId(shareId).catch(() => null);
  const team = teamId ? await getTeamById(teamId).catch(() => null) : null;
  return { title: team ? `${team.name} (${regionShort(team.region)})` : "Lineup" };
}

/**
 * The shared lineup: read-only, no login, no editing control and no Riot call. Disabled or
 * unknown ids answer 404, and the lookups never touch the slug, so the link cannot be walked back
 * to the editing page.
 */
export default async function LineupPage({ params, searchParams }: LineupPageProps) {
  const { shareId } = await params;
  const { queue: rawQueue } = await searchParams;
  const queueKey = readQueue(rawQueue);
  const teamId = await getTeamByShareId(shareId);
  if (!teamId) notFound();
  const team = await getTeamById(teamId);
  if (!team) notFound();

  // Only cached data: icons and ranks come from the cache the edit page refreshes.
  const [matches, players, ranks, timelines, updatedAt] = await Promise.all([
    // Sem filtro (o padrão) vêm os dois modos juntos; com `?queue=`, só a fila escolhida.
    getTeamMatches(team.id, 1000, {
      queueKey: queueKey === ALL_MODES_KEY ? null : queueKey,
    }),
    getPlayers(team.id),
    getAccountRanks(team.id).catch(() => ({}) as AccountRanks),
    getTimelines(team.id).catch(() => []),
    getLastUpdate(team.id).catch(() => null),
  ]);
  // The same builder the editor uses, so both pages show the same numbers in the same tabs. The
  // training goals are read here too, but never written: the shared lineup has no edit session.
  const payload = await loadAnalysisPayload(team.slug, {
    persistTraining: false,
    queueKey: queueKey === ALL_MODES_KEY ? null : queueKey,
  }).catch(() => null);
  const analysis = payload?.analysis ?? buildTeamAnalysis(matches, players, timelines);
  const metrics = analysis.metrics;
  const depths = analysis.depths;

  // One card per person: the account drawn is the one with the best Flex (else Solo/Duo) rank.
  const cards = personCards(players, ranks, accountGamesOf(matches));
  const people: LineupPerson[] = cards.map((card) => {
    const profile = metrics.players.find((entry) => entry.puuid === card.person);
    const depth = depths.find((entry) => entry.person === card.person);
    const cached = ranks[card.best.account.puuid];
    return {
      card,
      lane: profile?.mainPosition?.teamPosition ?? null,
      laneGames: profile?.mainPosition?.games ?? 0,
      champions: (depth?.champions ?? [])
        .slice()
        .sort((a, b) => b.games - a.games)
        .slice(0, 3)
        .map((champion) => ({
          championId: champion.championId,
          name: championName(champion.championId) ?? champion.championName,
          rate: champion.games > 0 ? (champion.wins / champion.games) * 100 : null,
        })),
      iconId: cached?.profileIconId ?? null,
      level: cached?.summonerLevel ?? null,
      // The flag opens the profile of the account it shows; only this page links out.
      href: summonerHref(team.region, card.best.account.gameName, card.best.account.tagLine),
    };
  });

  return (
    <LineupView
      teamName={team.name}
      region={regionShort(team.region)}
      updatedAt={updatedAt ?? null}
      metrics={metrics}
      people={orderLineup(people)}
      analysis={{
        ...analysis,
        players,
        quick: payload?.quick ?? buildQuickDiagnosis(analysis),
        training: payload?.training ?? [],
      }}
      queueKey={queueKey}
      // Cada modo é uma página: o seletor navega, e a análise é refeita no servidor com o novo modo.
      // "Todos" (o padrão) é a própria URL limpa.
      queueHrefs={Object.fromEntries(
        MODES.map((mode) => [
          mode,
          mode === ALL_MODES_KEY
            ? `/premade/lineup/${shareId}`
            : `/premade/lineup/${shareId}?queue=${mode}`,
        ]),
      )}
    />
  );
}

/** Only the Supabase cache is read here: opening the lineup never calls Riot. */
export const dynamic = "force-dynamic";
