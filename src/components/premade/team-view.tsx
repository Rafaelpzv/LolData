"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_MIN_PEOPLE } from "@/lib/premade/collect";
import type { PlayerCard } from "@/lib/premade/lobby";
import type { PremadePlayer } from "@/lib/premade/types";

import type { PremadeAnalysisProps, Tab } from "./premade-analysis";
import { PremadeAnalysis } from "./premade-analysis";
import { PlayerStrip, type RankSummary } from "./player-strip";
import { useTrainingActions } from "./use-training-actions";

type AnalysisData = Omit<
  PremadeAnalysisProps,
  | "selected"
  | "tab"
  | "onTabChange"
  | "minPeople"
  | "onMinPeopleChange"
  | "players"
>;

/** What the page hands to the client: the strip and the analysis share the selection. */
export interface TeamViewData {
  players: PremadePlayer[];
  cards: PlayerCard[];
  summaries: Record<string, RankSummary | undefined>;
  analysis: AnalysisData | null;
}

/**
 * The team page as one client island: the lobby strip selects a person, and a click on a card opens
 * the Individual tab on them. The data bar and "Gerenciar" live in the header (server side).
 */
export function TeamView({
  data,
  minPeople,
  excludedByMinPeople,
  slug,
}: {
  data: TeamViewData;
  minPeople: number;
  /**
   * O que o filtro de mínimo escondeu, calculado no servidor. Existe para a interface poder dizer
   * "N partidas fora do recorte" em vez de encolher a lista em silêncio.
   */
  excludedByMinPeople?: { dropped: number; total: number; bySize: Record<number, number> };
  /** Slug da equipe: as ações de treinamento escrevem por ele. */
  slug?: string;
}) {
  const t = useTranslations("premade.roster");
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  // A escrita só existe com slug (a escalação compartilhada é somente leitura).
  const training = useTrainingActions(slug ?? "");

  /**
   * Trocar o mínimo refaz a análise no servidor.
   *
   * Não é estado local: as métricas, as recomendações, o diagnóstico e a lista de partidas vêm todos
   * do mesmo recorte, então quem decide tem de ser o servidor. Guardar o número aqui só mudava o
   * rótulo do seletor e deixava a página mostrando partidas de 2 pessoas com o filtro em 5.
   */
  const changeMinPeople = (value: number) => {
    const params = new URLSearchParams(window.location.search);
    if (value === DEFAULT_MIN_PEOPLE) params.delete("minPeople");
    else params.set("minPeople", String(value));
    const query = params.toString();
    router.push(query ? `?${query}` : "?", { scroll: false });
  };

  const current = data.cards.some((card) => card.person === selected)
    ? selected
    : (data.cards[0]?.person ?? null);

  return (
    <>
      <PlayerStrip
        cards={data.cards}
        summaries={data.summaries}
        selected={current}
        onSelect={(person) => {
          setSelected(person);
          setTab("individual");
        }}
      />

      {data.analysis ? (
        <>
          <PremadeAnalysis
            {...data.analysis}
            players={data.players}
            selected={current}
            tab={tab}
            onTabChange={setTab}
            minPeople={minPeople}
            onMinPeopleChange={changeMinPeople}
            excludedByMinPeople={excludedByMinPeople}
            onCreateGoal={slug ? training.createFrom : undefined}
            onEvaluateGoal={slug ? training.evaluate : undefined}
            onArchiveGoal={slug ? training.archive : undefined}
          />
          {slug ? training.dialog : null}
        </>
      ) : (
        <div className="space-y-3">
          <Card>
            <EmptyState
              icon={Users}
              title={t("empty")}
              description={t("emptyHint")}
            />
          </Card>
        </div>
      )}
    </>
  );
}
