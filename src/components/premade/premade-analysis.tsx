"use client";

import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { PremadeMetrics } from "@/lib/premade/metrics";
import type { TeamRatings } from "@/lib/premade/score";
import type { PremadePlayer } from "@/lib/premade/types";
import type { Recommendation } from "@/lib/premade/recommendations";
import type { Insight } from "@/lib/premade/insights";
import type { DimensionReport } from "@/lib/premade/dimensions";
import type { MatchSets } from "@/lib/premade/integrity";
import type { GameReport, TeamAnalysis } from "@/lib/premade/team-analysis";
import type { SynergyReport } from "@/lib/premade/synergy";
import { buildIndividualRecommendations } from "@/lib/premade/individual-recommendations";
import type { PlayerDepth } from "@/lib/premade/individual-metrics";
import type { PlayerDiagnosis } from "@/lib/premade/individual-diagnosis";
import type { QuickDiagnosis } from "@/lib/premade/quick-diagnosis";
import type { GoalEvaluation, TrainingGoal } from "@/lib/premade/training";
import { QuickDiagnosisCard } from "./quick-diagnosis-panel";
import { TrainingPanel } from "./training-panel";
import { CollectivePanel } from "./collective-panel";
import { DimensionsPanel } from "./dimensions-panel";
import { EvolutionPanel, type SeriesGame } from "./evolution-panel";
import { IndividualPanel, ParticipationSection } from "./individual-panel";
import { InsightList } from "./insight-card";
import { IntegrityPanel } from "./integrity-panel";
import { MatchReportPanel } from "./match-report-panel";
import { PatternsPanel } from "./patterns-panel";
import { MinPeoplePicker } from "./min-people-picker";
import { Recommendations } from "./recommendations";
import { ScoreNote } from "./team-score";
import { TeamSummary } from "./team-summary";
import { TimelinePanel, type MatchTimeline } from "./timeline-panel";
import { TimelineExplorer } from "./timeline-explorer";
import {
  SMALL_TIMELINE_SAMPLE,
  type TimelineMetrics,
} from "@/lib/premade/timeline-metrics";

type Tab =
  | "overview"
  | "individual"
  | "collective"
  | "training"
  | "evolution"
  | "matches"
  | "patterns";

const TABS: Tab[] = [
  "overview",
  "individual",
  "collective",
  "training",
  "evolution",
  "matches",
  "patterns",
];

/** The timelines of the team, already read into metrics by the page. */
export interface TimelineData {
  metrics: TimelineMetrics;
  games: MatchTimeline[];
}

/** Everything the four tabs read. The pages build it once; both pages pass the same shape. */
export interface AnalysisData {
  players: PremadePlayer[];
  metrics: PremadeMetrics;
  ratings: TeamRatings;
  recommendations: Recommendation[];
  insights: Insight[];
  dimensions: DimensionReport;
  synergy: SynergyReport;
  series: SeriesGame[];
  timeline: TimelineData;
  /** Per-person depth (migration 0010 fields + timeline derived data). */
  depths: PlayerDepth[];
  /** The individual diagnosis of every person (§5). */
  diagnoses: PlayerDiagnosis[];

  /** The one-screen diagnosis (§8.1): state, strengths, problems, trend, data quality. */
  quick: QuickDiagnosis & { activeGoals: number };
  /** Training goals with today's reading (§6). Empty when the team has none yet. */
  training: { goal: TrainingGoal; evaluation: GoalEvaluation | null }[];
  /** Per-game post-game analysis, newest first (§3). */
  reports: GameReport[];
  /** Recurring habits and the dispersion of deaths (§4). */
  patterns: TeamAnalysis["patterns"];
  /** The lineup and data sets the window splits into, so no number hides its population. */
  integrity: MatchSets;
  /** The period and the lineup behind the numbers. */
  window: {
    games: number;
    from: number | null;
    to: number | null;
    fullGames: number;
    days: string[];
  };
}

export interface PremadeAnalysisProps extends AnalysisData {
  /** Person selected in the strip; the Individual tab shows only them. */
  selected: string | null;
  /** Called when the person changes from inside the tabs (the shared lineup has its own picker). */
  onSelect?: (person: string) => void;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Minimum people per match: it changes the analysis, so it lives next to the tabs. */
  minPeople: number;
  onMinPeopleChange: (value: number) => void;
  /**
   * O que o mínimo escondeu. Sem isto o seletor parece não ter efeito: a lista encolhe e a página
   * não diz por quê. Calculado no servidor, do mesmo recorte que gerou os números.
   */
  excludedByMinPeople?: { dropped: number; total: number; bySize: Record<number, number> };
  /** Turns a diagnosis into a training goal (§6). Absent on the read-only shared lineup. */
  onCreateGoal?: (diagnosis: PlayerDiagnosis) => void;
  onEvaluateGoal?: (goalId: string) => void;
  onArchiveGoal?: (goalId: string) => void;
}

export type { Tab };

/**
 * The analysis: overview (period, evidence-first observations, summary and the per-dimension
 * scores), individual (one person at a time), collective (objectives, preparation, gold curve,
 * synergy) and evolution (two windows). The tab and the selected person are controlled by the page,
 * so a click on the strip opens the Individual tab on that person.
 */
export function PremadeAnalysis({
  players,
  metrics,
  ratings,
  recommendations,
  insights,
  dimensions,
  synergy,
  series,
  timeline,
  depths,
  diagnoses,
  quick,
  training,
  reports,
  patterns,
  integrity,
  window,
  selected,
  onSelect,
  tab,
  onTabChange,
  minPeople,
  onMinPeopleChange,
  excludedByMinPeople,
  onCreateGoal,
  onEvaluateGoal,
  onArchiveGoal,
}: PremadeAnalysisProps) {
  const t = useTranslations("premade.tabs");

  // The individual rules are appended to the team's: one list, each with its sample.
  const individual = buildIndividualRecommendations(
    depths,
    new Map(
      players.map((player) => [
        player.id,
        player.accounts.find((a) => !a.archived)?.gameName ?? player.gameName,
      ]),
    ),
  );
  const all = [...recommendations, ...individual];
  const named = players.map((player) => ({
    id: player.id,
    name:
      player.accounts.find((account) => !account.archived)?.gameName ??
      player.gameName,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<Tab>
          label={t("label")}
          value={tab}
          onChange={onTabChange}
          options={TABS.map((value) => ({ value, label: t(value) }))}
        />
        <MinPeoplePicker value={minPeople} onChange={onMinPeopleChange} />
      </div>

      {/* O seletor precisa dizer o que ficou de fora: sem isto, a lista menor parece não ter efeito. */}
      {excludedByMinPeople && excludedByMinPeople.dropped > 0 && (
        <p className="text-2xs text-muted-foreground">
          {t("excludedByMinPeople", {
            kept: excludedByMinPeople.total - excludedByMinPeople.dropped,
            total: excludedByMinPeople.total,
            min: minPeople,
          })}
        </p>
      )}

      {tab === "overview" && (
        <div className="space-y-6">
          {/* §8.3: a resposta vem antes das ferramentas. O diagnóstico rápido é a primeira coisa. */}
          <QuickDiagnosisCard
            quick={quick}
            onOpenLimitations={() =>
              document
                .getElementById("integrity")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <TeamSummary metrics={metrics} window={window} />
          <IntegrityPanel integrity={integrity} games={metrics.games} />
          <InsightList insights={insights} players={named} />
          <DimensionsPanel report={dimensions} />
          <ScoreNote ratings={ratings} players={named} />
          <Recommendations recommendations={all} />
        </div>
      )}
      {tab === "individual" && (
        <div className="space-y-4">
          <IndividualPanel
            metrics={metrics}
            players={players}
            ratings={ratings}
            depths={depths}
            diagnoses={diagnoses}
            selected={selected}
            onSelect={onSelect}
            onCreateGoal={onCreateGoal}
          />
          <ParticipationSection metrics={metrics} players={players} />
        </div>
      )}
      {tab === "collective" && (
        <div className="space-y-6">
          <CollectivePanel metrics={metrics} />
          {/* §8.4: a timeline navegável vem antes dos agregados: é por ela que se chega ao "quando". */}
          <TimelineExplorer games={timeline.games} players={named} />
          <TimelinePanel
            metrics={timeline.metrics}
            games={timeline.games}
            players={players}
            smallSample={SMALL_TIMELINE_SAMPLE}
            synergy={synergy}
          />
        </div>
      )}
      {tab === "training" && (
        <TrainingPanel
          goals={training}
          onCreate={onCreateGoal ? () => onTabChange("individual") : undefined}
          onEvaluate={onEvaluateGoal}
          onArchive={onArchiveGoal}
        />
      )}
      {tab === "matches" && <MatchReportPanel games={reports} />}
      {tab === "patterns" && <PatternsPanel patterns={patterns} />}
      {tab === "evolution" && (
        <div className="space-y-6">
          <EvolutionPanel
            metrics={metrics}
            series={series}
            report={dimensions}
          />
        </div>
      )}
    </div>
  );
}
