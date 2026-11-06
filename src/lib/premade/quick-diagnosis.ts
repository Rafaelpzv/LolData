/**
 * Nível 1 da análise (§8.1): o diagnóstico rápido. O que existe, escrito em uma tela, derivado dos
 * diagnósticos que já foram calculados — nunca de uma nota inventada.
 *
 * O §8.1 pede sete coisas no topo: pontos positivos, principais problemas, evolução recente, estado
 * geral, qualidade dos dados, partidas analisadas e objetivos de treinamento ativos. Ele também
 * proíbe explicitamente a nota geral arbitrária ("não crie uma nota geral arbitrária que tente
 * resumir toda a qualidade da equipe"). Por isso o módulo NÃO produz número composto: produz uma
 * lista curta de fatores, cada um com a evidência, a amostra e a confiança de onde saiu, e o
 * consumidor escolhe como agrupar.
 *
 * A evolução recente vem de `DimensionReport`, que já compara a janela recente com a anterior com
 * intervalo de confiança; aqui não se recalcula nada disso.
 *
 * Puro: sem I/O, sem Supabase, sem Next.
 */
import type { Confidence } from "./recommendations";
import type { DimensionReport } from "./dimensions";
import type { DiagnosisKind } from "./individual-diagnosis";
import type { TeamAnalysis } from "./team-analysis";

/** A que parte do §8.2 o fator pertence: as mesmas categorias dos diagnósticos. */
export type QuickFactorArea =
  | "objectives"
  | "preparation"
  | "conversion"
  | "synchronization"
  | "consistency"
  | "individual"
  | "map";

/**
 * O estado de um fator. `trend` é a evolução recente: ela não é um problema nem uma força ainda, é a
 * direção do movimento medida contra a janela anterior.
 */
export type QuickFactorKind = DiagnosisKind | "trend";

export interface QuickFactor {
  /**
   * Chave estável da FAMÍLIA do fator (o que a interface traduz): `strength.vision`, `problem.deaths`,
   * `trend.<dimensão>.<métrica>`. Sempre ASCII e sem número, porque é rótulo, não dado.
   */
  id: string;
  kind: QuickFactorKind;
  area: QuickFactorArea;
  /**
   * As pessoas do elenco que sustentam o fator, pelo nome. O cartão mostra os nomes; o módulo não os
   * concatena numa frase, porque frase é trabalho da interface e muda com o idioma.
   */
  people: string[];
  /** Evidência já traduzida? Não: números e rótulos, para a interface formatar com o locale. */
  evidence: QuickFactorEvidence[];
  /** Partidas atrás do fator, e de quantas da janela. */
  sample: { games: number; total: number };
  confidence: Confidence;
  /**
   * De onde saiu: as duas janelas comparadas, em partidas. O leitor deve poder ir conferir — por
   * isso são números e não uma frase pronta, que ficaria em português na tela em inglês.
   */
  source: { after: number; before: number } | null;
}

export interface QuickFactorEvidence {
  label: string;
  /** Valor já formatado em pontos com unidade quando faz sentido; o número cru fica em `raw`. */
  raw: number | null;
  unit: "perGame" | "percent" | "seconds" | "count" | "percentPoints" | "ratio";
  /** intervalo 95% quando o fator vem de uma comparação de janelas. */
  interval?: { low: number | null; high: number | null };
}

/** §8.1 "qualidade dos dados": o que a janela conseguiu ler, em números. */
export interface DataQuality {
  games: number;
  /** Partidas com as cinco pessoas do elenco. */
  fullGames: number;
  /** Partidas com timeline. */
  timelineGames: number;
  /** Partidas com elenco completo E timeline: onde tudo pode ser lido ao mesmo tempo. */
  fullWithTimelineGames: number;
  /** Partidas com alguém de fora no lugar de uma pessoa do elenco. */
  withSubstitutes: number;
  /** Partidas cuja conta não pôde ser atribuída a ninguém do elenco. */
  unattributed: number;
  /**
   * As categorias cujo dado principal está abaixo da amostra mínima para uma conclusão. A interface
   * usa isto para dizer, sem número de nota, "estas partes ainda não dão para afirmar".
   */
  thinAreas: QuickFactorArea[];
}

/** O diagnóstico rápido completo, pronto para apresentar. */
export interface QuickDiagnosis {
  /** Estado geral em uma palavra: o maior nível de confiança dos problemas — nunca uma média. */
  state: "problems" | "mixed" | "steady" | "inconclusive";
  strengths: QuickFactor[];
  problems: QuickFactor[];
  trend: QuickFactor[];
  data: DataQuality;
}

/** Quantos fatores de cada tipo o resumo mostra: o topo da página não é o relatório inteiro. */
export const QUICK_LIMIT = 3;

/** Abaixo disto a área é declarada fina demais para concluir. */
const THIN_AREA_GAMES = 8;

function confidenceOfGames(games: number): Confidence {
  if (games >= 15) return "high";
  if (games >= 8) return "medium";
  return "low";
}

/**
 * Converte os diagnósticos individuais em fatores do resumo. Um problema de três pessoas diferentes
 * com o mesmo aspecto é UM fator do time (frequência), não três cartões repetidos — mas o fator diz
 * quantas pessoas, porque um aspecto de cinco pessoas é um tema de treinamento do time.
 */
function fromDiagnoses(patterns: TeamAnalysis["diagnoses"]): {
  strengths: QuickFactor[];
  problems: QuickFactor[];
} {
  const groups = new Map<
    string,
    { kind: DiagnosisKind; aspect: string; people: string[]; games: number; total: number }
  >();
  for (const diagnosis of patterns) {
    // Só o que é do jogador entra no resumo: o compartilhado já tem a sua seção, e repetir aqui
    // faria o topo dizer "o time morre muito" cinco vezes.
    if (diagnosis.shared !== null) continue;
    const key = `${diagnosis.kind}:${diagnosis.aspect}`;
    const entry = groups.get(key) ?? {
      kind: diagnosis.kind,
      aspect: diagnosis.aspect,
      people: [],
      games: 0,
      total: 0,
    };
    if (!entry.people.includes(diagnosis.personName)) {
      entry.people.push(diagnosis.personName);
      entry.games += diagnosis.context.games;
    }
    entry.total = Math.max(entry.total, diagnosis.context.games);
    groups.set(key, entry);
  }

  const strengths: QuickFactor[] = [];
  const problems: QuickFactor[] = [];
  for (const entry of groups.values()) {
    const factor: QuickFactor = {
      id: `${entry.kind}.${entry.aspect}`,
      kind: entry.kind,
      area: entry.aspect === "vision" || entry.aspect === "deaths" ? "map" : "individual",
      people: [...entry.people],
      evidence: [
        {
          label: "people",
          raw: entry.people.length,
          unit: "count",
        },
        {
          label: "games",
          // A partida de referência é a maior amostra entre as pessoas: reagrupar por pessoa
          // somaria jogos, e o fator fala em pessoas.
          raw: entry.total,
          unit: "count",
        },
      ],
      sample: { games: entry.total, total: entry.total },
      confidence: confidenceOfGames(entry.total),
      // Um diagnóstico de pessoa não vem de duas janelas: a origem é a própria amostra dela.
      source: null,
    };
    if (entry.kind === "strength") strengths.push(factor);
    else problems.push(factor);
  }
  return { strengths, problems };
}

/**
 * A evolução recente: uma linha por métrica de dimensão que a comparação de janelas conseguiu
 * medir. A régua é a de `inference.ts` (intervalo de Welch a 95%); aqui não se recalcula nada.
 */
function fromDimensions(report: DimensionReport): QuickFactor[] {
  const areaOf: Record<string, QuickFactorArea> = {
    objectiveControl: "objectives",
    objectivePreparation: "preparation",
    conversion: "conversion",
    synchronization: "synchronization",
    consistency: "consistency",
    individual: "individual",
    map: "map",
  };
  const out: QuickFactor[] = [];
  for (const dimension of report.dimensions) {
    for (const metric of dimension.metrics) {
      const change = metric.change;
      // "Sem medida" e "dentro do ruído" não entram no resumo: para o topo da página só vai o
      // movimento que a evidência sustenta; o resto fica no relatório completo, com o motivo.
      if (!change || change.verdict === "unmeasurable") continue;
      if (change.verdict === "inconclusive") continue;
      out.push({
        id: `trend.${dimension.key}.${metric.key}`,
        kind: "trend",
        area: areaOf[dimension.key] ?? "objectives",
        // Uma tendência é do time, não de uma pessoa: a lista de pessoas ficaria vazia de propósito.
        people: [],
        evidence: [
          {
            label: change.verdict === "improved" ? "improved" : "worsened",
            raw: change.delta,
            unit: "percentPoints",
            interval: { low: change.low, high: change.high },
          },
        ],
        sample: {
          games: change.gamesAfter,
          total: change.gamesAfter + change.gamesBefore,
        },
        confidence:
          change.gamesAfter >= 8 && change.gamesBefore >= 8 ? "medium" : "low",
        source: { after: change.gamesAfter, before: change.gamesBefore },
      });
    }
  }
  return out;
}

/** Qualidade dos dados, a partir dos conjuntos que o §2.1 já separa. */
function qualityOf(analysis: TeamAnalysis): DataQuality {
  const { integrity, metrics, timeline } = analysis;
  const timelineGames = integrity.withTimeline.length;
  const fullWithTimelineGames = integrity.fullWithTimeline.length;
  const thinAreas: QuickFactorArea[] = [];
  // Cada área fina é fina POR UM MOTIVO declarado, e o motivo é o conjunto que falta.
  if (metrics.games < THIN_AREA_GAMES) thinAreas.push("individual", "consistency");
  if (timelineGames < THIN_AREA_GAMES) {
    thinAreas.push("preparation", "synchronization", "map");
  }
  // Objetivos e conversão saem do placar de objetivos do match, que não depende de timeline.
  if (metrics.games < THIN_AREA_GAMES) thinAreas.push("objectives", "conversion");
  void timeline;
  return {
    games: metrics.games,
    fullGames: integrity.full.length,
    timelineGames,
    fullWithTimelineGames,
    withSubstitutes: integrity.withSubstitutes.length,
    unattributed: integrity.unattributed.length,
    thinAreas: [...new Set(thinAreas)],
  };
}

/**
 * O diagnóstico rápido da equipe. Sem nota, sem média de scores: os fatores vêm dos diagnósticos e
 * da comparação de janelas, e o estado geral é o pior nível que a evidência sustenta.
 */
export function buildQuickDiagnosis(
  analysis: TeamAnalysis,
  /**
   * Os objetivos de treinamento ativos, quando o chamador os tem. O módulo não os lê (é puro); eles
   * entram como contagem, para o topo poder dizer "3 em andamento".
   */
  activeGoals = 0,
): QuickDiagnosis & { activeGoals: number } {
  const { strengths, problems } = fromDiagnoses(analysis.diagnoses);
  const trend = fromDimensions(analysis.dimensions);
  const data = qualityOf(analysis);

  // Ordem: primeiro o que tem mais amostra (a confiança alta vem antes da baixa), e o empate em
  // ordem estável de id para a leitura não mudar entre sessões.
  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  const order = (a: QuickFactor, b: QuickFactor) =>
    rank[a.confidence] - rank[b.confidence] || a.id.localeCompare(b.id);
  const orderedProblems = [...problems].sort(order);
  const orderedStrengths = [...strengths].sort(order);
  const orderedTrend = [...trend].sort(order);

  let state: QuickDiagnosis["state"];
  if (orderedProblems.length === 0 && orderedStrengths.length === 0) {
    state = "inconclusive";
  } else if (orderedProblems.some((entry) => entry.confidence !== "low")) {
    // Um problema medido com amostra suficiente e um ponto positivo podem coexistir: é "mixed",
    // nunca "ruim" — a ferramenta não dá veredito.
    state = orderedStrengths.length > 0 ? "mixed" : "problems";
  } else if (orderedProblems.length === 0) {
    state = "steady";
  } else {
    // Só problemas de amostra pequena: a resposta honesta é "ainda não dá para afirmar".
    state = orderedStrengths.length > 0 ? "mixed" : "inconclusive";
  }

  return {
    state,
    strengths: orderedStrengths.slice(0, QUICK_LIMIT),
    problems: orderedProblems.slice(0, QUICK_LIMIT),
    trend: orderedTrend.slice(0, QUICK_LIMIT),
    data,
    activeGoals,
  };
}
