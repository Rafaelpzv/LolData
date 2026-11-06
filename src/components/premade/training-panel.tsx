"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, MinusCircle, Target, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/premade/recommendations";
import {
  TRAINING_METRIC_SPECS,
  displayedState,
  type GoalEvaluation,
  type TrainingGoal,
  type TrainingState,
  type TrainingVerdict,
} from "@/lib/premade/training";
import { fromPercent } from "./format";

const STATE_VARIANT: Record<TrainingState, "win" | "warning" | "loss" | "outline"> = {
  achieved: "win",
  running: "warning",
  missed: "loss",
  inconclusive: "outline",
  planned: "outline",
};

const VERDICT_VARIANT: Record<TrainingVerdict, "win" | "warning" | "loss" | "outline"> = {
  consistent: "win",
  positiveButInconclusive: "warning",
  noChange: "outline",
  worse: "loss",
  initialGainLost: "warning",
  notEnoughGames: "outline",
};

const CONFIDENCE_VARIANT: Record<Confidence, "win" | "warning" | "loss"> = {
  high: "win",
  medium: "warning",
  low: "loss",
};

/** Um número da métrica com a unidade que ela tem de verdade. */
function formatMetric(metric: TrainingGoal["metric"], value: number | null): string {
  if (value === null) return "\u2014";
  const spec = TRAINING_METRIC_SPECS[metric];
  const digits = spec.digits;
  // `fromPercent` só aceita 0 ou 1 casa (a unidade do painel); o resto usa `toFixed` da própria régua.
  if (spec.unit === "percent") return fromPercent(value, digits >= 1 ? 1 : 0);
  const text = value.toFixed(digits);
  return spec.unit === "points" && value > 0 ? `+${text}` : text;
}

function StateIcon({ state }: { state: TrainingState }) {
  const className = "size-4 shrink-0";
  if (state === "achieved") return <CheckCircle2 className={className} aria-hidden />;
  if (state === "missed") return <XCircle className={className} aria-hidden />;
  if (state === "inconclusive") return <MinusCircle className={className} aria-hidden />;
  return <CircleDashed className={className} aria-hidden />;
}

/**
 * O painel de treinamento (§6): cada objetivo com o estado lido dos dados.
 *
 * O estado nunca é escolhido pela equipe depois que existem partidas: `displayedState` devolve o
 * que os dados dizem. A meta "atingida" é um fato conferido contra o número, e o veredito é sobre a
 * EVOLUÇÃO — nunca sobre a causa (§6.3: "o treino funcionou" não é uma leitura honesta de dois
 * jogos).
 */
export function TrainingPanel({
  goals,
  onCreate,
  onEvaluate,
  onArchive,
}: {
  goals: { goal: TrainingGoal; evaluation: GoalEvaluation | null }[];
  onCreate?: () => void;
  onEvaluate?: (goalId: string) => void;
  onArchive?: (goalId: string) => void;
}) {
  const t = useTranslations("premade.training");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Target className="size-4 text-muted-foreground" aria-hidden />
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        {onCreate && (
          <Button size="sm" onClick={onCreate}>
            {t("new")}
          </Button>
        )}
      </div>

      {goals.length === 0 ? (
        <Card padding="lg">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {goals.map(({ goal, evaluation }) => {
            // O estado que a equipe escolheu vale até existir leitura; depois, só os dados.
            const state = displayedState(goal, evaluation);
            const open = expanded === goal.id;
            return (
              <li key={goal.id}>
                <Card padding="lg" className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-2xs text-muted-foreground">
                        {goal.personName ?? t("team")}
                      </p>
                      <h3 className="text-sm font-medium">{goal.title}</h3>
                    </div>
                    <Badge variant={STATE_VARIANT[state]}>
                      <span className="mr-1 inline-flex align-middle">
                        <StateIcon state={state} />
                      </span>
                      {t(`states.${state}`)}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-2xs sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">{t("metric")}</dt>
                      <dd>{t(`metrics.${goal.metric}`)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("baseline")}</dt>
                      <dd className="num">{formatMetric(goal.metric, evaluation?.baseline ?? null)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("current")}</dt>
                      <dd className="num">{formatMetric(goal.metric, evaluation?.current ?? null)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("target")}</dt>
                      <dd className="num">
                        {goal.target === null
                          ? t("noTarget")
                          : formatMetric(goal.metric, goal.target)}
                        {evaluation?.targetReached === true && (
                          <span className="ml-1 text-2xs text-win">{t("reached")}</span>
                        )}
                        {evaluation?.targetReached === false && (
                          <span className="ml-1 text-2xs text-muted-foreground">
                            {t("notReached")}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {evaluation ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-2xs">
                        <Badge variant={VERDICT_VARIANT[evaluation.verdict]}>
                          {t(`verdicts.${evaluation.verdict}`)}
                        </Badge>
                        <Badge variant={CONFIDENCE_VARIANT[evaluation.confidence]}>
                          {t(`confidence.${evaluation.confidence}`)}
                        </Badge>
                        <span className="num text-muted-foreground">
                          {t("windows", {
                            before: evaluation.baselineGames,
                            after: evaluation.windowGames,
                          })}
                        </span>
                      </div>
                      {evaluation.low !== null && evaluation.high !== null && (
                        <p className="num text-2xs text-muted-foreground">
                          {t("interval", {
                            low: formatMetric(goal.metric, evaluation.low),
                            high: formatMetric(goal.metric, evaluation.high),
                          })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-2xs text-muted-foreground">{t("noWindow")}</p>
                  )}

                  {goal.exercise && (
                    <p className="text-xs">
                      <span className="font-medium text-muted-foreground">
                        {t("exercise")}:{" "}
                      </span>
                      {goal.exercise}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {onEvaluate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEvaluate(goal.id)}
                      >
                        {t("evaluate")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(open ? null : goal.id)}
                      aria-expanded={open}
                    >
                      {t(open ? "hideHistory" : "showHistory", {
                        count: goal.evaluations.length,
                      })}
                    </Button>
                    {onArchive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onArchive(goal.id)}
                      >
                        {t("archive")}
                      </Button>
                    )}
                  </div>

                  {open && (
                    <div className="space-y-1 border-t border-border pt-2">
                      <p className="text-2xs font-medium text-muted-foreground">
                        {t("history")}
                      </p>
                      {goal.evaluations.length === 0 ? (
                        <p className="text-2xs text-muted-foreground">{t("noHistory")}</p>
                      ) : (
                        <ul className="space-y-0.5 text-2xs">
                          {goal.evaluations.map((entry) => (
                            <li
                              key={entry.at}
                              className={cn("flex flex-wrap gap-x-2")}
                            >
                              <span className="num text-muted-foreground">
                                {new Date(entry.at).toLocaleDateString()}
                              </span>
                              <span>{t(`verdicts.${entry.verdict}`)}</span>
                              <span className="num">
                                {formatMetric(goal.metric, entry.current)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="pt-1 text-2xs text-muted-foreground">
                        {t("source", { source: t(`sources.${goal.metric}`) })}
                      </p>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
