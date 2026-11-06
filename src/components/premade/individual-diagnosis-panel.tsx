"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Lightbulb, TrendingDown, TrendingUp, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapse } from "@/components/motion/collapse";
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/premade/recommendations";
import {
  classifyDiagnoses,
  type DiagnosisAspect,
  type DiagnosisEvidence,
  type DiagnosisKind,
  type EvidenceLabel,
  type PlayerDiagnosis,
  type SharedResponsibility,
  type Text,
  type TrackingMetric,
} from "@/lib/premade/individual-diagnosis";
import type { TeamPosition } from "@/lib/premade/individual-metrics";
import { fromPercent } from "./format";

/** A confiança como badge, com o texto sempre junto: a cor nunca é a única informação. */
const CONFIDENCE_VARIANT: Record<Confidence, "win" | "warning" | "loss"> = {
  high: "win",
  medium: "warning",
  low: "loss",
};

/**
 * Chave de tradução por função, escrita como literal. A interpolação `roles.${role}` impediria o
 * compilador de checar que a tradução existe; assim, esquecer uma função é erro de build.
 */
const SUPPORTED_ROLE: Record<TeamPosition, `roles.${TeamPosition}`> = {
  TOP: "roles.TOP",
  JUNGLE: "roles.JUNGLE",
  MIDDLE: "roles.MIDDLE",
  BOTTOM: "roles.BOTTOM",
  UTILITY: "roles.UTILITY",
};

const KNOWN_ROLES = new Set<string>(Object.keys(SUPPORTED_ROLE));

/** Mesma ideia para o indicador de acompanhamento de cada diagnóstico. */
const TRACKED_KEY: Record<TrackingMetric, `tracked.${TrackingMetric}`> = {
  csDiffAt10: "tracked.csDiffAt10",
  visionPerMin: "tracked.visionPerMin",
  aloneDeathShare: "tracked.aloneDeathShare",
  killParticipation: "tracked.killParticipation",
  damagePerDeath: "tracked.damagePerDeath",
  deathsPerGame: "tracked.deathsPerGame",
  teamDeathsPerGame: "tracked.teamDeathsPerGame",
};

/** De quem é o problema quando não é desta pessoa (§5, último parágrafo). */
const SHARED_KEY: Record<
  SharedResponsibility,
  | "shared.teamDeaths"
  | "shared.laneStructure"
  | "shared.championNotEstablished"
  | "shared.smallSample"
  | "shared.notMeasured"
> = {
  teamDeaths: "shared.teamDeaths",
  laneStructure: "shared.laneStructure",
  championNotEstablished: "shared.championNotEstablished",
  smallSample: "shared.smallSample",
  notMeasured: "shared.notMeasured",
};

/** A função do contexto, com o nome traduzido; valores que a Riot não registrou ficam de fora. */
function roleLabel(role: string): `roles.${TeamPosition}` | null {
  return KNOWN_ROLES.has(role) ? SUPPORTED_ROLE[role as TeamPosition] : null;
}

/** O rótulo de uma evidência. O `id` vem do módulo puro; a chave literal mantém o lookup tipado. */
function evidenceLabel(label: string): `evidence.${EvidenceLabel}` {
  // Qualquer coisa fora do contrato é erro de programação, não dado: o fallback só evita a tela quebrada.
  return `evidence.${label as EvidenceLabel}`;
}

/**
 * Um texto que o módulo puro entrega como chave + valores, traduzido aqui. O módulo não conhece o
 * idioma do leitor, então ele nunca devolve a frase pronta.
 *
 * O `id` JÁ é o caminho completo dentro de `premade.diagnosis` (`text.reason.*`, `source.*`), e não
 * um trecho a ser completado: prefixar `text.` em tudo transformava `source.games` em
 * `text.source.games`, que não existe, e o painel mostrava a chave em vez da frase.
 */
function renderText(translate: TextTranslator, entry: Text): string {
  return translate(
    entry.id as "text.reason.metricRead",
    entry.values as Record<string, string | number>,
  );
}

/** O que `renderText` precisa do next-intl, sem arrastar o tipo inteiro do hook para a assinatura. */
type TextTranslator = (key: "text.reason.metricRead", values?: Record<string, string | number>) => string;

/** Um valor com a unidade que ele realmente tem: perMin não se lê como percentual. */
function value(entry: DiagnosisEvidence): string {
  if (entry.value === null) return "\u2014";
  switch (entry.unit) {
    case "percent":
      return fromPercent(entry.value, 1);
    case "perMin":
      return entry.value.toFixed(2);
    case "perGame":
      return entry.value.toFixed(2);
    case "ratio":
      return entry.value.toFixed(2);
    default:
      // "points": uma diferença com sinal, que só faz sentido lida como diferença.
      return entry.value > 0
        ? `+${Math.round(entry.value * 10) / 10}`
        : String(Math.round(entry.value * 10) / 10);
  }
}

/**
 * O diagnóstico de uma pessoa (§5.3), com os sete campos.
 *
 * A ordem é deliberada: o aspecto primeiro (o que desenvolver — ou o que já está bom), depois a
 * evidência, e o contexto junto da confiança, porque um número de lane não se lê sem saber função,
 * campeão e amostra (§5.1). O que é do jogador vem antes do que é do time; quando o problema é do
 * grupo, o cartão muda de voz e diz de quem é.
 */
export function IndividualDiagnosis({
  diagnoses,
  /** Chamado quando a equipe quer transformar este diagnóstico em objetivo de treinamento (§6). */
  onCreateGoal,
}: {
  diagnoses: PlayerDiagnosis[];
  onCreateGoal?: (diagnosis: PlayerDiagnosis) => void;
}) {
  const t = useTranslations("premade.diagnosis");
  const { problems, strengths, shared, unmeasured } = classifyDiagnoses(diagnoses);

  if (diagnoses.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Section title={t("problems")} list={problems} onCreateGoal={onCreateGoal} />
      <Section title={t("strengths")} list={strengths} onCreateGoal={onCreateGoal} />
      <Section
        title={t("shared.title")}
        hint={t("shared.hint")}
        list={[...shared, ...unmeasured]}
        onCreateGoal={onCreateGoal}
      />
    </div>
  );
}

function Section({
  title,
  hint,
  list,
  onCreateGoal,
}: {
  title: string;
  hint?: string;
  list: PlayerDiagnosis[];
  onCreateGoal?: (diagnosis: PlayerDiagnosis) => void;
}) {
  // Uma seção vazia não ocupa espaço: o leitor não precisa saber que "não havia força" quando havia.
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((diagnosis) => (
          <li key={`${diagnosis.person}-${diagnosis.aspect}-${diagnosis.kind}`}>
            <DiagnosisCard diagnosis={diagnosis} onCreateGoal={onCreateGoal} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiagnosisCard({
  diagnosis,
  onCreateGoal,
}: {
  diagnosis: PlayerDiagnosis;
  onCreateGoal?: (diagnosis: PlayerDiagnosis) => void;
}) {
  const t = useTranslations("premade.diagnosis");
  const [open, setOpen] = useState(false);
  const kind: DiagnosisKind = diagnosis.kind;
  const evidenceKey = open ? "evidence-details" : "evidence-summary";

  return (
    <Card
      padding="lg"
      className={cn("h-full space-y-3", diagnosis.shared !== null && "border-dashed")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            {kind === "strength" ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            <span>{diagnosis.personName}</span>
            <span aria-hidden>·</span>
            <span>{t("aspect")}</span>
          </p>
          <h4 className="text-sm font-medium">{t(`aspects.${diagnosis.aspect}`)}</h4>
        </div>
        <Badge variant={CONFIDENCE_VARIANT[diagnosis.confidence]}>
          {t(`confidence.${diagnosis.confidence}`)}
        </Badge>
      </div>

      {diagnosis.shared !== null && (
        <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface-sunken px-2 py-1.5 text-2xs text-muted-foreground">
          <Users className="mt-0.5 size-3 shrink-0" aria-hidden />
          {t(SHARED_KEY[diagnosis.shared])}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-2xs font-medium text-muted-foreground">
            {t(evidenceKey)}
          </span>
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <ul className="mt-1 space-y-0.5">
          {diagnosis.evidence.map((entry) => (
            <li
              key={entry.label}
              className="flex flex-wrap items-baseline gap-x-1.5 text-xs"
            >
              <span className="text-muted-foreground">
                {t(evidenceLabel(entry.label))}:
              </span>
              <span className="num font-medium">{value(entry)}</span>
              <span className="text-2xs text-muted-foreground">
                {t(`units.${entry.unit}`)}
              </span>
            </li>
          ))}
        </ul>
        {/* §8.3: as fontes e denominadores ficam guardados atrás da evidência. */}
        <Collapse open={open}>
          <ul className="mt-1 space-y-0.5 text-2xs text-muted-foreground">
            {diagnosis.evidence.map((entry) => (
              <li key={entry.label}>
                {t(evidenceLabel(entry.label))}: {renderText(t, entry.source)}
              </li>
            ))}
          </ul>
        </Collapse>
      </div>

      <div className="grid gap-x-3 gap-y-1.5 border-t border-border pt-2 text-2xs sm:grid-cols-2">
        <div>
          <span className="font-medium text-muted-foreground">
            {t("context")}:{" "}
          </span>
          <span>
            {diagnosis.context.roles.length > 0
              ? diagnosis.context.roles
                  .map((role) => {
                    const key = roleLabel(role);
                    return key ? t(key) : role;
                  })
                  .join(", ")
              : t("noRole")}
          </span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">
            {t("champion")}:{" "}
          </span>
          <span>
            {diagnosis.context.champions[0]
              ? `${diagnosis.context.champions[0].name} (${diagnosis.context.champions[0].games})`
              : "\u2014"}
          </span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">{t("games")}: </span>
          <span className="num">
            {diagnosis.context.games}
            {diagnosis.context.fullGames > 0 &&
              diagnosis.context.fullGames !== diagnosis.context.games && (
                <span className="text-muted-foreground">
                  {" "}
                  · {t("fullGames", { games: diagnosis.context.fullGames })}
                </span>
              )}
          </span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">{t("why")}: </span>
          <span>{renderText(t, diagnosis.confidenceReason)}</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-2">
        <p className="flex items-start gap-1.5 text-xs">
          <Lightbulb
            className="mt-0.5 size-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span>
            <span className="font-medium">{t("exercise")}: </span>
            {renderText(t, diagnosis.exercise)}
          </span>
        </p>
        <p className="text-2xs text-muted-foreground">
          <span className="font-medium">{t("tracking")}: </span>
          {t(TRACKED_KEY[diagnosis.tracking.metric])} (
          <span className="num">
            {diagnosis.tracking.current === null
              ? "\u2014"
              : diagnosis.tracking.unit === "percent"
                ? fromPercent(diagnosis.tracking.current, 1)
                : diagnosis.tracking.current}
          </span>
          )
        </p>
      </div>

      {onCreateGoal && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreateGoal(diagnosis)}
          className="w-full"
        >
          {t("createGoal")}
        </Button>
      )}
    </Card>
  );
}

/** Exportado para o teste do painel conferir que todo aspecto tem rótulo traduzido. */
export const DIAGNOSIS_ASPECTS: DiagnosisAspect[] = [
  "farming",
  "vision",
  "deaths",
  "killParticipation",
  "earlyGame",
  "combat",
];
