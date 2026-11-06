"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DEFAULT_MIN_PEOPLE } from "@/lib/premade/collect";
import type { TeamAnalysis } from "@/lib/premade/team-analysis";
import type { PremadePlayer } from "@/lib/premade/types";

import { PremadeAnalysis, type Tab } from "./premade-analysis";
import type { AnalysisData } from "./premade-analysis";

/**
 * The shared lineup with the same four tabs as the editor: overview, individual, collective and
 * evolution. Nothing here writes: the numbers come from the stored data, and the person is picked
 * inside the Individual tab (there is no roster strip on this page).
 */
export function LineupAnalysis({
  players,
  analysis,
}: {
  players: PremadePlayer[];
  /** A análise da equipe com o diagnóstico rápido e os objetivos de treinamento já montados. */
  analysis: Omit<TeamAnalysis, "groupDeathsPerGame"> &
    Pick<AnalysisData, "quick" | "training">;
}) {
  const t = useTranslations("premade.roster");
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [minimum, setMinimum] = useState(DEFAULT_MIN_PEOPLE);

  if (analysis.metrics.games === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title={t("empty")}
          description={t("emptyHint")}
        />
      </Card>
    );
  }

  const current = analysis.metrics.players.some(
    (profile) => profile.puuid === selected,
  )
    ? selected
    : (analysis.metrics.players[0]?.puuid ?? null);

  return (
    <PremadeAnalysis
      {...analysis}
      players={players}
      // A escalação compartilhada é somente leitura: nenhum "virar objetivo", nenhum arquivar.
      onCreateGoal={undefined}
      onEvaluateGoal={undefined}
      onArchiveGoal={undefined}
      selected={current}
      onSelect={setSelected}
      tab={tab}
      onTabChange={setTab}
      minPeople={minimum}
      onMinPeopleChange={setMinimum}
    />
  );
}
