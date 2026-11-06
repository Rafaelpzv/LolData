/**
 * Acompanhamento de treinamento (§6): o ciclo de objetivo, exercício e avaliação.
 *
 * O fluxo do §6.1 é o que este módulo implementa, em ordem: identificação de um problema (vem de um
 * diagnóstico do §5), definição de um objetivo, escolha de um exercício, registro do início, coleta
 * das próximas partidas, comparação com o desempenho anterior, avaliação e atualização do estado.
 *
 * Três regras governam o cálculo:
 *
 *  1. §6.3: a linha de base são as partidas ANTES do início, a janela seguinte são as partidas
 *     POSTERIORES. As partidas jogadas no mesmo dia do início ficam de fora da linha de base e da
 *     janela: não se sabe se o exercício valia nelas.
 *  2. §6.3 e §7: a comparação usa o mesmo `compareWindows` do resto da análise — média, desvio,
 *     erro-padrão de Welch, intervalo de 95% e a mesma régua de ruído. Nada de limite fixo.
 *  3. §6.3: "não declare que o treinamento causou a melhora". A saída é `verdict` ("evolução
 *     consistente observada", "tendência positiva, mas ainda inconclusiva"...), nunca causalidade.
 *
 * Puro: sem I/O, sem Supabase, sem Next.
 */
import { WINDOWS } from "./config";
import { compareWindows, type ChangeAnalysis } from "./inference";
import type { Confidence } from "./recommendations";
import { mean, standardDeviation } from "./stats";

/** As métricas que podem ser acompanhadas: cada uma existe de verdade nos dados coletados. */
export const TRAINING_METRICS = [
  "csDiffAt10",
  "visionPerMin",
  "aloneDeathShare",
  "killParticipation",
  "damagePerDeath",
  "deathsPerGame",
  "teamDeathsPerGame",
] as const;

export type TrainingMetric = (typeof TRAINING_METRICS)[number];

/** Como cada métrica é lida, inclusive qual direção é melhor. */
export interface TrainingMetricSpec {
  unit: "points" | "perMin" | "percent" | "perGame";
  /** +1: maior é melhor; -1: menor é melhor. Nunca 0: uma métrica sem lado bom não vira meta. */
  direction: 1 | -1;
  /** Decimais para apresentar o valor. */
  digits: number;
}

/**
 * Onde cada métrica vive, para o leitor conferir (§8.3). A frase fica nas mensagens
 * (`premade.training.sources.<métrica>`), não aqui: o módulo é puro e não escolhe idioma.
 */
export const TRAINING_METRIC_SPECS: Record<TrainingMetric, TrainingMetricSpec> = {
  csDiffAt10: {
    unit: "points",
    direction: 1,
    digits: 1,
  },
  visionPerMin: {
    unit: "perMin",
    direction: 1,
    digits: 2,
  },
  aloneDeathShare: {
    unit: "percent",
    direction: -1,
    digits: 0,
  },
  killParticipation: {
    unit: "percent",
    direction: 1,
    digits: 0,
  },
  damagePerDeath: {
    unit: "points",
    direction: 1,
    digits: 0,
  },
  deathsPerGame: {
    unit: "perGame",
    direction: -1,
    digits: 2,
  },
  teamDeathsPerGame: {
    unit: "perGame",
    direction: -1,
    digits: 2,
  },
};

/**
 * Estados do §6.2. `planned` e `running` são escolha da equipe; `achieved`, `missed` e
 * `inconclusive` são LIDOS dos dados depois que há partidas posteriores — a equipe não marca o
 * próprio objetivo como atingido, senão o acompanhamento vira opinião.
 */
export const TRAINING_STATES = [
  "planned",
  "running",
  "achieved",
  "missed",
  "inconclusive",
] as const;

export type TrainingState = (typeof TRAINING_STATES)[number];

/** Um objetivo de treinamento, como está guardado. */
export interface TrainingGoal {
  id: string;
  teamId: string;
  /** Pessoa do elenco, ou null quando o objetivo é do time. */
  person: string | null;
  personName: string | null;
  title: string;
  /** O problema que motivou o objetivo (por que ele existe). */
  problem: string;
  metric: TrainingMetric;
  /** Valor da linha de base no momento da criação; a avaliação recalculá-la-á do histórico. */
  baseline: number | null;
  /** Meta, quando faz sentido. Null = "evoluir na direção certa", sem número. */
  target: number | null;
  startsAt: number;
  exercise: string;
  /** `planned` ou `running`, escolhido pela equipe. */
  state: "planned" | "running";
  /** Diagnóstico do §5 que originou o objetivo, quando veio de uma sugestão da análise. */
  origin: { aspect: string; kind: "problem" | "strength" } | null;
  /**
   * Arquivado: saiu da lista de objetivos ativos, mas o histórico de treino continua. Nunca é
   * apagado — "estamos realmente melhorando depois de treinar?" é uma pergunta com passado.
   */
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  /** Histórico de avaliações, mais recente primeiro. */
  evaluations: GoalEvaluation[];
}

/** Uma leitura do objetivo em um instante: o que as partidas posteriores dizem. */
export interface GoalEvaluation {
  at: number;
  /** Partidas usadas para a linha de base (antes do início). */
  baselineGames: number;
  /** Partidas usadas para a janela seguinte (depois do início). */
  windowGames: number;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  relative: number | null;
  /** Intervalo de 95% da diferença (Welch) e a régua de ruído. */
  low: number | null;
  high: number | null;
  verdict: TrainingVerdict;
  confidence: Confidence;
  /** O estado que a leitura sustenta. */
  state: Exclude<TrainingState, "planned" | "running">;
  /**
   * A meta foi alcançada, quando havia meta. É um fato medido, mostrado ao lado do veredito: um
   * objetivo pode ter a meta batida e a tendência ainda inconclusiva, e o contrário também.
   */
  targetReached: boolean | null;
}

/**
 * As palavras do §6.3, mais o caso em que não há partidas suficientes. `improved` inclui a meta
 * atingida; `inconclusive` nunca é chamado de melhora.
 */
export type TrainingVerdict =
  | "consistent"
  | "positiveButInconclusive"
  | "noChange"
  | "worse"
  | "initialGainLost"
  | "notEnoughGames";

/** Uma partida com a métrica do objetivo, na forma que o cálculo precisa. */
export interface TrainingObservation {
  matchId: string;
  /** Fim da partida, em epoch ms: o corte da linha de base é por tempo. */
  at: number;
  value: number | null;
}

export interface GoalEvaluationInput {
  goal: Pick<TrainingGoal, "metric" | "target" | "startsAt">;
  observations: readonly TrainingObservation[];
  /** Instante da leitura; o padrão é agora. Passado explicitamente nos testes. */
  now?: number;
}

const DAY_MS = 86_400_000;
const dayOf = (timestamp: number) => Math.floor(timestamp / DAY_MS) * DAY_MS;

function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}

/**
 * Separa as observações em linha de base e janela seguinte.
 *
 * O dia do início fica de fora das duas: uma partida jogada antes do exercício ser combinado não é
 * "depois", e uma jogada depois não é "antes". Por isso o corte é o próximo dia UTC completo — a
 * escolha conservadora, que perde partidas em vez de inflar a amostra com o que não é comparável.
 */
export function splitObservations(
  observations: readonly TrainingObservation[],
  startsAt: number,
): { baseline: number[]; after: number[] } {
  const startDay = dayOf(startsAt);
  // Primeiro milissegundo do dia seguinte ao início (Brasil é UTC-3, então o dia UTC é o conservador).
  const firstDayAfter = startDay + DAY_MS;
  const valid = observations
    .filter((entry) => entry.value !== null)
    .sort((a, b) => a.at - b.at);
  const baseline: number[] = [];
  const after: number[] = [];
  for (const entry of valid) {
    const day = dayOf(entry.at);
    if (day < startDay) baseline.push(entry.value as number);
    else if (day >= firstDayAfter) after.push(entry.value as number);
  }
  // A linha de base é lida das ÚLTIMAS `WINDOWS.baseline` partidas antes do início: o histórico
  // antigo mede outro time, outro patch e outra função.
  return {
    baseline: baseline.slice(-WINDOWS.baseline),
    after,
  };
}

/**
 * O veredito do §6.3 a partir da comparação de janelas. A causa nunca é afirmada:
 * "evolução consistente observada" descreve o movimento, não atribui o mérito ao treinamento.
 */
export function trainingVerdict(
  change: ChangeAnalysis,
  direction: 1 | -1,
  options: {
    /** A janela "durante", as primeiras partidas posteriores, e a recente, as últimas. */
    early: number[];
    late: number[];
  },
): TrainingVerdict {
  if (change.gamesAfter < 2 || change.gamesBefore < 2) return "notEnoughGames";
  if (change.verdict === "unmeasurable") return "notEnoughGames";

  // Ganho inicial que não se manteve: a janela "durante" melhorou contra a linha de base e a janela
  // recente voltou ao menos até o ponto de partida. Só se diz isso com as duas janelas medidas.
  const earlyMean = mean(options.early);
  const lateMean = mean(options.late);
  if (
    change.verdict === "improved" &&
    earlyMean !== null &&
    lateMean !== null &&
    options.early.length >= 2 &&
    options.late.length >= 2 &&
    change.before !== null &&
    (direction > 0 ? lateMean <= change.before : lateMean >= change.before)
  ) {
    return "initialGainLost";
  }

  if (change.verdict === "improved") return "consistent";
  if (change.verdict === "worsened") return "worse";

  // Intervalo ainda contendo zero: a meta alcançada é um FATO, mas o movimento não é significativo.
  // Por isso vira "tendência positiva, mas ainda inconclusiva" — nunca "evolução consistente", que
  // é a palavra reservada para a melhora que a régua estatística sustenta (§6.3, §7).
  return "positiveButInconclusive";
}

/** O estado lido pelo veredito. */
export function stateOfVerdict(
  verdict: TrainingVerdict,
): Exclude<TrainingState, "planned" | "running"> {
  switch (verdict) {
    case "consistent":
      return "achieved";
    case "worse":
      return "missed";
    case "positiveButInconclusive":
    case "initialGainLost":
      return "inconclusive";
    case "noChange":
      return "inconclusive";
    case "notEnoughGames":
      return "inconclusive";
  }
}

/** Confiança do estado: amostra pequena nunca sustenta mais que "baixa". */
export function confidenceOfEvaluation(
  baselineGames: number,
  windowGames: number,
): Confidence {
  const smallest = Math.min(baselineGames, windowGames);
  if (smallest >= 8) return "high";
  if (smallest >= 4) return "medium";
  return "low";
}

/**
 * Avalia um objetivo: compara a linha de base com as partidas posteriores ao início e devolve o
 * histórico de uma leitura. Não altera nada e não grava: quem grava é o repositório.
 */
export function evaluateGoal(input: GoalEvaluationInput): GoalEvaluation {
  const spec = TRAINING_METRIC_SPECS[input.goal.metric];
  const { baseline, after } = splitObservations(
    input.observations,
    input.goal.startsAt,
  );
  // As últimas partidas da janela também são lidas sozinhas, para separar ganho inicial de evolução.
  const half = Math.max(1, Math.ceil(after.length / 2));
  const early = after.slice(0, half);
  const late = after.slice(-half);
  const change = compareWindows(baseline, after, { direction: spec.direction });
  const verdict = trainingVerdict(change, spec.direction, { early, late });
  // A meta é conferida com o valor atual MEDIDO (a média da janela), nunca com o delta: atingir 2
  // mortes por partida é o fato, ter "melhorado 2" é a leitura que precisa da régua.
  const currentValue =
    change.after === null ? null : round(change.after, spec.digits);
  const targetReached =
    input.goal.target === null || currentValue === null
      ? null
      : spec.direction > 0
        ? currentValue >= input.goal.target
        : currentValue <= input.goal.target;

  return {
    at: input.now ?? Date.now(),
    baselineGames: baseline.length,
    windowGames: after.length,
    baseline: round(change.before, spec.digits),
    current: currentValue,
    delta: round(change.delta, spec.digits),
    relative: round(change.relative, 3),
    low: round(change.low, spec.digits),
    high: round(change.high, spec.digits),
    verdict,
    confidence: confidenceOfEvaluation(baseline.length, after.length),
    state: stateOfVerdict(verdict),
    targetReached,
  };
}

/**
 * O estado do objetivo como a interface mostra: o que a equipe escolheu enquanto não há partidas
 * posteriores; o que os dados dizem depois que há.
 */
export function displayedState(
  goal: Pick<TrainingGoal, "state" | "id">,
  evaluation: GoalEvaluation | null,
): TrainingState {
  // A avaliação só sobrepõe o planejado/em andamento quando foi possível ler alguma janela.
  if (evaluation && evaluation.windowGames >= 2) return evaluation.state;
  return goal.state;
}

/** Variabilidade da janela, para o gráfico não fingir precisão (§6.3 "variabilidade"). */
export function windowSpread(values: readonly number[]): {
  n: number;
  mean: number | null;
  sd: number | null;
} {
  return {
    n: values.length,
    mean: mean(values),
    sd: standardDeviation(values),
  };
}

/**
 * A meta sugerida pela análise, quando o objetivo nasce de um diagnóstico: um passo do tamanho de
 * um desvio-padrão da própria variabilidade da pessoa na direção certa, nunca um número redondo
 * inventado. Sem amostra para medir a variabilidade, não há meta — e o objetivo fica em direção certa.
 */
export function suggestedTarget(
  metric: TrainingMetric,
  current: number | null,
  history: readonly number[],
  materiality = 0.5,
): number | null {
  if (current === null) return null;
  const sd = standardDeviation(history);
  if (sd === null || !(sd > 0)) return null;
  const spec = TRAINING_METRIC_SPECS[metric];
  const step = sd * materiality;
  return Number((current + spec.direction * step).toFixed(spec.digits));
}
