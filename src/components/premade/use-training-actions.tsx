"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { PlayerDiagnosis, Text, TrackingMetric } from "@/lib/premade/individual-diagnosis";
import { TRAINING_METRIC_SPECS, type TrainingMetric } from "@/lib/premade/training";

/** A pessoa e o problema do diagnóstico viram o começo de um objetivo; o resto é decisão da equipe. */
const TRACKING_AS_METRIC: Partial<Record<TrackingMetric, TrainingMetric>> = {
  csDiffAt10: "csDiffAt10",
  visionPerMin: "visionPerMin",
  aloneDeathShare: "aloneDeathShare",
  killParticipation: "killParticipation",
  damagePerDeath: "damagePerDeath",
  deathsPerGame: "deathsPerGame",
  teamDeathsPerGame: "teamDeathsPerGame",
};

export interface TrainingActions {
  /** Abre o formulário já preenchido com o diagnóstico (o "Virar objetivo" do painel). */
  createFrom: (diagnosis: PlayerDiagnosis) => void;
  evaluate: (goalId: string) => Promise<void>;
  archive: (goalId: string) => Promise<void>;
  /** O formulário, para o cliente renderizar onde couber. */
  dialog: React.ReactNode;
  pending: boolean;
}

/**
 * A ponte entre o diagnóstico (§5) e o objetivo de treinamento (§6).
 *
 * O formulário já vem preenchido com o que a análise sabia (métrica, meta sugerida pelo desvio da
 * própria pessoa, exercício sugerido) e deixa a equipe ajustar: o objetivo é uma decisão do time, não
 * uma sugestão automática — por isso nada é criado sem confirmação.
 */
export function useTrainingActions(slug: string): TrainingActions {
  const router = useRouter();
  const t = useTranslations("premade.trainingForm");
  const tDiagnosis = useTranslations("premade.diagnosis");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{
    diagnosis: PlayerDiagnosis;
    metric: TrainingMetric;
    target: string;
    title: string;
    exercise: string;
  } | null>(null);

  const post = useCallback(
    async (body: unknown) => {
      setPending(true);
      try {
        const response = await fetch(`/api/premade/${slug}/training`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) return false;
        router.refresh();
        return true;
      } finally {
        setPending(false);
      }
    },
    [router, slug],
  );

  // O texto do diagnóstico vem em chave + valores (o módulo puro não conhece o idioma), então ainda
  // no campo de preenchimento ele é traduzido: o que a equipe lê e salva é o que ela pode editar.
  // O `id` já é o caminho completo dentro de `premade.diagnosis`.
  const translate = useCallback(
    (entry: Text) =>
      tDiagnosis(
        entry.id as "text.reason.metricRead",
        entry.values as Record<string, string | number>,
      ),
    [tDiagnosis],
  );

  const createFrom = useCallback((diagnosis: PlayerDiagnosis) => {
    const metric =
      TRACKING_AS_METRIC[diagnosis.tracking.metric] ?? "deathsPerGame";
    setDraft({
      diagnosis,
      metric,
      // Nenhum número é inventado: a meta é do time. O campo começa com o valor ATUAL medido, que é
      // o ponto de partida honesto; quem decide a linha de chegada é quem treina.
      target:
        diagnosis.tracking.current === null
          ? ""
          : String(
              Number(
                diagnosis.tracking.current.toFixed(
                  TRAINING_METRIC_SPECS[metric].digits,
                ),
              ),
            ),
      title: `${diagnosis.personName}: ${tDiagnosis(`aspects.${diagnosis.aspect}`)}`,
      exercise: translate(diagnosis.exercise),
    });
  }, [tDiagnosis, translate]);

  const dialog = draft ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 sm:items-center"
    >
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("hint", { person: draft.diagnosis.personName })}
        </p>

        <label className="block space-y-1 text-xs">
          <span className="font-medium">{t("name")}</span>
          <Input
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="font-medium">{t("metric")}</span>
          <Select
            value={draft.metric}
            onChange={(event) =>
              setDraft({ ...draft, metric: event.target.value as TrainingMetric })
            }
            wrapperClassName="w-full"
          >
            {(Object.keys(TRAINING_METRIC_SPECS) as TrainingMetric[]).map((metric) => (
              <option key={metric} value={metric}>
                {t(`metrics.${metric}`)}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1 text-xs">
          <span className="font-medium">{t("target")}</span>
          <Input
            inputMode="decimal"
            value={draft.target}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setDraft({ ...draft, target: event.target.value })
            }
            placeholder={t("targetHint")}
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="font-medium">{t("exercise")}</span>
          <textarea
            value={draft.exercise}
            onChange={(event) =>
              setDraft({ ...draft, exercise: event.target.value })
            }
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={async () => {
              const target = draft.target.trim();
              const created = await post({
                intent: "create",
                goal: {
                  title: draft.title,
                  problem: draft.diagnosis.evidence
                    .map((entry) => entry.label)
                    .join(", "),
                  exercise: draft.exercise,
                  metric: draft.metric,
                  person: draft.diagnosis.person,
                  personName: draft.diagnosis.personName,
                  target: target === "" ? null : Number(target),
                  state: "planned",
                  origin: {
                    aspect: draft.diagnosis.aspect,
                    kind: draft.diagnosis.kind,
                  },
                },
              });
              if (created) setDraft(null);
            }}
          >
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    createFrom,
    evaluate: async (goalId) => {
      await post({ intent: "evaluate", id: goalId });
    },
    archive: async (goalId) => {
      await post({ intent: "archive", id: goalId });
    },
    dialog,
    pending,
  };
}
