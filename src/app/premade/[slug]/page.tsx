import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Reveal } from "@/components/motion/reveal";
import { PasswordGate } from "@/components/premade/password-gate";
import { RosterDrawer } from "@/components/premade/roster-section";
import { ShareLineup } from "@/components/premade/share-lineup";
import { TeamView } from "@/components/premade/team-view";
import { UpdateDataButton } from "@/components/premade/update-data-button";
import { DEFAULT_MIN_PEOPLE } from "@/lib/premade/collect";
import { accountGamesOf, personCards } from "@/lib/premade/lobby";
import {
  getAccountRanks,
  getLastUpdate,
  getPlayers,
  getTeamBySlug,
  getTeamMatches,
  getTimelines,
} from "@/lib/premade/repository";
import { loadAnalysisPayload } from "@/lib/premade/analysis-payload";
import { filterByMinPeople } from "@/lib/premade/min-people";
import { buildTeamAnalysis } from "@/lib/premade/team-analysis";


import { regionShort } from "@/lib/regions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ minPeople?: string }>;
}

/**
 * O mínimo de jogadores por partida que a página mostra agora.
 *
 * Vem da URL para que o recorte aconteça no servidor, junto com o resto da análise: filtrar no
 * cliente deixaria as métricas (calculadas com todas as partidas) discordando da lista de partidas.
 * Um valor inválido cai no padrão em vez de derrubar a página.
 */
function readMinPeople(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MIN_PEOPLE;
  return Math.min(5, Math.max(2, Math.trunc(parsed)));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [team, t] = await Promise.all([
    (async () => {
      const { slug } = await params;
      return getTeamBySlug(slug);
    })(),
    getTranslations("premade"),
  ]);
  if (!team) return {};
  return { title: team.name, description: t("metaDescription") };
}

export default async function PremadeTeamPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { minPeople: rawMinPeople } = await searchParams;
  const minPeople = readMinPeople(rawMinPeople);
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const [allMatches, players, ranks, allTimelines, lastUpdate] = await Promise.all([
    getTeamMatches(team.id),
    getPlayers(team.id),
    getAccountRanks(team.id),
    getTimelines(team.id),
    getLastUpdate(team.id),
  ]);
  // O mesmo recorte que a análise usa: a lista de partidas e os números precisam vir do mesmo conjunto.
  const { kept: matches, dropped, bySize } = filterByMinPeople(allMatches, players, minPeople);
  const keptIds = new Set(matches.map((entry) => entry.matchId));
  const timelines = allTimelines.filter((entry) => keptIds.has(entry.matchId));

  // One builder for both pages: the shared lineup shows the same tabs with the same numbers.
  const payload = await loadAnalysisPayload(slug, { persistTraining: true, minPeople });
  const analysis = payload?.analysis ?? buildTeamAnalysis(matches, players, timelines);
  const cards = personCards(players, ranks, accountGamesOf(matches));
  const summaries = Object.fromEntries(
    Object.entries(ranks).map(([puuid, rank]) => [
      puuid,
      { profileIconId: rank?.profileIconId ?? null, summonerLevel: rank?.summonerLevel ?? null },
    ]),
  );

  return (
    <PageShell>
      <PageHeader
        title={team.name}
        description={regionShort(team.region)}
        actions={
          // One control: the row starts with the menu; "Manage" is rendered on that same row, between
          // the menu and the data action (`manage`), so the three buttons share one height and line.
          <UpdateDataButton
            slug={slug}
            minPeople={DEFAULT_MIN_PEOPLE}
            updatedAt={lastUpdate}
            manage={<RosterDrawer slug={slug} players={players} />}
          />
        }
      />

      <Reveal>
        <PasswordGate slug={slug} />
      </Reveal>

      <TeamView
        slug={slug}
        minPeople={minPeople}
        excludedByMinPeople={{ dropped, bySize, total: allMatches.length }}
        data={{
          players,
          cards,
          summaries,
          analysis:
            analysis.metrics.games > 0 && payload
              ? {
                  ...analysis,
                  quick: payload.quick,
                  training: payload.training,
                }
              : null,
        }}
      />

      <Reveal>
        <ShareLineup slug={slug} />
      </Reveal>
    </PageShell>
  );
}
