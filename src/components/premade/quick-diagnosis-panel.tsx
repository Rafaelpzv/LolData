"use client";

import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Database,
  Target,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/premade/recommendations";
import type {
  QuickDiagnosis,
  QuickFactor,
  QuickFactorArea,
} from "@/lib/premade/quick-diagnosis";
import { fromPercent } from "./format";

const CONFIDENCE_VARIANT: Record<Confidence, "win" | "warning" | "loss"> = {
  high: "win",
  medium: "warning",
  low: "loss",
};

/**
 * §8.1: um valor com a unidade real. `percentPoints` é diferença entre duas porcentagens e por isso
 * tem sinal — um "+8" que fosse lido como "8%" seria outro número.
 */
function evidenceText(entry: QuickFactor["evidence"][number]): string {
  if (entry.raw === null) return "\u2014";
  switch (entry.unit) {
    case "percent":
      return fromPercent(entry.raw, 0);
    case "percentPoints":
      return `${entry.raw > 0 ? "+" : ""}${Math.round(entry.raw * 10) / 10}`;
    case "seconds":
      return `${Math.round(entry.raw)}s`;
    case "ratio":
      return entry.raw.toFixed(2);
    case "count":
      return String(Math.round(entry.raw));
    default:
      return entry.raw.toFixed(2);
  }
}


/** O rótulo de cada evidência: as chaves que `quick-diagnosis.ts` emite, sem nenhuma outra. */
const EVIDENCE_KEY = {
  people: "evidence.people",
  games: "evidence.games",
  improved: "evidence.improved",
  worsened: "evidence.worsened",
} as const;

function evidenceLabel(label: string): (typeof EVIDENCE_KEY)[keyof typeof EVIDENCE_KEY] {
  // A chave vem do módulo puro; qualquer coisa fora do contrato é um erro de programação, não dado.
  return EVIDENCE_KEY[label as keyof typeof EVIDENCE_KEY] ?? EVIDENCE_KEY.people;
}

/**
 * O rótulo de um fator. O `id` vem do módulo puro e o next-intl só aceita chave literal, então o
 * painel guarda o mapa completo: um fator novo sem tradução é erro de build, não texto na tela.
 */
/**
 * As métricas que a tendência pode citar, por dimensão.
 *
 * A chave de um fator de tendência é `trend.<dimensão>.<métrica>`, e a métrica vem do motor. Sem esta
 * lista, qualquer métrica caía num rótulo errado (o primeiro caso real foi
 * `trend.objectiveControl.firstHerald` aparecendo como "Farm na rota"). Uma métrica nova sem entrada
 * aqui avisa no console em desenvolvimento e usa o rótulo da dimensão.
 */
const TREND_METRICS: Record<string, readonly string[]> = {
  objectiveControl: [
    "firstDragon",
    "firstHerald",
    "firstBaron",
    "firstTower",
    "dragonsPerGame",
    "baronsPerGame",
    "towersPerGame",
  ],
  objectivePreparation: [
    "dragonPresence",
    "averagePresence",
    "groupedShare",
    "playersAtKills",
    "playersAtObjective",
  ],
  conversion: ["killToObjective", "turretsPerKill", "goldAt15", "winRateAhead15", "comebackRate"],
  synchronization: ["isolatedDeathShare", "deathsBeforeObjective", "groupedShare"],
  consistency: ["deathsPerGame", "teamDeathsVariation", "teamGoldVariation", "killToObjective"],
  individual: ["kda", "killParticipationGap", "deathsPerGame"],
  map: ["towersPerGame", "baronsPerGame", "dragonsPerGame"],
};

const FACTOR_KEY = {
  "problem.farming": "factors.problem.farming",
  "problem.vision": "factors.problem.vision",
  "problem.deaths": "factors.problem.deaths",
  "problem.killParticipation": "factors.problem.killParticipation",
  "problem.earlyGame": "factors.problem.earlyGame",
  "problem.combat": "factors.problem.combat",
  "strength.farming": "factors.strength.farming",
  "strength.vision": "factors.strength.vision",
  "strength.deaths": "factors.strength.deaths",
  "strength.killParticipation": "factors.strength.killParticipation",
  "strength.earlyGame": "factors.strength.earlyGame",
  "strength.combat": "factors.strength.combat",
  "trend.objectiveControl": "factors.trend.objectiveControl",
  "trend.objectivePreparation": "factors.trend.objectivePreparation",
  "trend.conversion": "factors.trend.conversion",
  "trend.synchronization": "factors.trend.synchronization",
  "trend.consistency": "factors.trend.consistency",
  "trend.individual": "factors.trend.individual",
  "trend.map": "factors.trend.map",
  // Uma entrada por métrica, gerada da lista acima: a mesma métrica pode aparecer em mais de uma
  // dimensão, e cada combinação precisa do próprio rótulo.
  ...Object.fromEntries(
    Object.entries(TREND_METRICS).flatMap(([dimension, metrics]) =>
      metrics.map((metric) => [`trend.${dimension}.${metric}`, `factors.trend.${metric}`]),
    ),
  ),
} as const;

type FactorTextKey = (typeof FACTOR_KEY)[keyof typeof FACTOR_KEY];

/** A unidade de uma evidência: literal, para o compilador conferir que a tradução existe. */
const UNIT_LITERAL = {
  perGame: "units.perGame",
  percent: "units.percent",
  percentPoints: "units.percentPoints",
  seconds: "units.seconds",
  count: "units.count",
  ratio: "units.ratio",
} as const;

/**
 * O texto de um fator.
 *
 * O `id` vem do módulo puro. Quando ele não está no mapa, cair no rótulo de farming mostraria a frase
 * ERRADA (foi o que aconteceu com `trend.objectiveControl.firstHerald`, que aparecia como "Farm na
 * rota"). O fallback agora usa a DIMENSÃO que o próprio id carrega — `trend.<dimensão>.<métrica>` —
 * então na pior hipótese o rótulo é genérico e do assunto certo, nunca de outro assunto. O aviso no
 * console continua para o caso aparecer durante o desenvolvimento.
 */
function factorText(id: string): FactorTextKey {
  const key = FACTOR_KEY[id as keyof typeof FACTOR_KEY];
  if (key) return key;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[quick-diagnosis] fator sem tradução: ${id}`);
  }
  const dimension = id.split(".")[1];
  const byDimension = dimension
    ? FACTOR_KEY[`trend.${dimension}` as keyof typeof FACTOR_KEY]
    : undefined;
  return byDimension ?? "factors.problem.farming";
}

function FactorRow({ factor }: { factor: QuickFactor }) {
  const t = useTranslations("premade.quick");
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{t(factorText(factor.id))}</span>
        <Badge variant={CONFIDENCE_VARIANT[factor.confidence]}>
          {t(`confidence.${factor.confidence}`)}
        </Badge>
        <span className="num text-2xs text-muted-foreground">
          {t("sample", { games: factor.sample.games, total: factor.sample.total })}
        </span>
      </div>
      {factor.people.length > 0 && (
        <p className="text-2xs text-muted-foreground">
          {t("byPeople", { names: factor.people.join(", ") })}
        </p>
      )}
      {factor.source && (
        <p className="num text-2xs text-muted-foreground">
          {t("where", { after: factor.source.after, before: factor.source.before })}
        </p>
      )}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {factor.evidence.map((entry) => (
          <li key={entry.label} className="num">
            {t(evidenceLabel(entry.label))}{" "}
            <span className="font-medium text-foreground">{evidenceText(entry)}</span>{" "}
            {t(UNIT_LITERAL[entry.unit])}
            {entry.interval &&
              entry.interval.low !== null &&
              entry.interval.high !== null && (
                <span className="ml-1">
                  ({evidenceText({ ...entry, raw: entry.interval.low })} a{" "}
                  {evidenceText({ ...entry, raw: entry.interval.high })})
                </span>
              )}
          </li>
        ))}
      </ul>
    </li>
  );
}

function Group({
  title,
  icon,
  factors,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  factors: QuickFactor[];
  tone?: string;
}) {
  if (factors.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className={cn("flex items-center gap-1.5 text-xs font-semibold", tone)}>
        {icon}
        {title}
      </h3>
      <ul className="space-y-2">
        {factors.map((factor) => (
          <FactorRow key={factor.id} factor={factor} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Nível 1 da análise (§8.1): o diagnóstico rápido.
 *
 * Responde, sem nota geral, as perguntas do começo da página: estamos melhorando, o que está
 * funcionando, o que não está, e o dado sustenta isso? A qualidade dos dados vem junto dos fatores,
 * não num rodapé, porque um resumo confiante sobre amostra pequena é pior que resumo nenhum.
 */
export function QuickDiagnosisCard({
  quick,
  onOpenLimitations,
}: {
  quick: QuickDiagnosis & { activeGoals: number };
  onOpenLimitations?: () => void;
}) {
  const t = useTranslations("premade.quick");
  const stateKey = quick.state;

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-2xs font-medium text-muted-foreground">{t("eyebrow")}</p>
          <h2 className="text-lg font-semibold leading-tight">{t(`state.${stateKey}`)}</h2>
          <p className="text-xs text-muted-foreground">{t(`stateHint.${stateKey}`)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            <Database className="mr-1 size-3" aria-hidden />
            {t("dataGames", { games: quick.data.games })}
          </Badge>
          <Badge variant="outline">
            <Target className="mr-1 size-3" aria-hidden />
            {t("activeGoals", { count: quick.activeGoals })}
          </Badge>
          {onOpenLimitations && (
            <button
              type="button"
              onClick={onOpenLimitations}
              className="text-2xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("seeLimitations")}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Group
          title={t("problemsTitle")}
          icon={<AlertTriangle className="size-3.5 text-muted-foreground" aria-hidden />}
          factors={quick.problems}
        />
        <Group
          title={t("strengthsTitle")}
          icon={<TrendingUp className="size-3.5 text-muted-foreground" aria-hidden />}
          factors={quick.strengths}
        />
        <Group
          title={t("trendTitle")}
          icon={<ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />}
          factors={quick.trend}
        />
      </div>

      {quick.problems.length === 0 &&
        quick.strengths.length === 0 &&
        quick.trend.length === 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("nothingYet", { games: quick.data.games })}
          </p>
        )}

      {/* §2 e §8.4: o que a janela conseguiu ler fica à vista, não escondido atrás de um número. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground">
        <span className="num">
          {t("quality.full", {
            full: quick.data.fullGames,
            games: quick.data.games,
          })}
        </span>
        <span className="num">
          {t("quality.timeline", { games: quick.data.timelineGames })}
        </span>
        <span className="num">
          {t("quality.both", { games: quick.data.fullWithTimelineGames })}
        </span>
        {quick.data.withSubstitutes > 0 && (
          <span className="num">
            {t("quality.substitutes", { games: quick.data.withSubstitutes })}
          </span>
        )}
        {quick.data.unattributed > 0 && (
          <span className="num">
            {t("quality.unattributed", { games: quick.data.unattributed })}
          </span>
        )}
      </div>

      {quick.data.thinAreas.length > 0 && (
        <p className="text-2xs text-muted-foreground">
          {t("quality.thin", {
            areas: quick.data.thinAreas
              .map((area: QuickFactorArea) => t(`areas.${area}`))
              .join(", "),
          })}
        </p>
      )}
    </Card>
  );
}
