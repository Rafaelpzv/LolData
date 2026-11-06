/**
 * A camada que vira a análise em dado de tela: junta o diagnóstico rápido (§8.1) e os objetivos de
 * treinamento com a leitura do dia (§6) no formato que as duas páginas consomem.
 *
 * Existe para os dois lugares (a página da equipe e a escalação compartilhada) montarem exatamente o
 * mesmo payload — se cada um montasse o seu, a página compartilhada poderia divergir da que o editor
 * vê, que é justamente o que o projeto inteiro evita.
 *
 * Server-only: lê o banco através do repositório de treinamento.
 */
import { buildQuickDiagnosis, type QuickDiagnosis } from "./quick-diagnosis";
import { filterByMinPeople } from "./min-people";
import { getTeamBySlug } from "./repository";
import { buildTeamAnalysis, type TeamAnalysis } from "./team-analysis";
import { evaluateGoal, type GoalEvaluation, type TrainingGoal } from "./training";
import { deathEvents } from "./individual-metrics";
import { getPlayers, getTeamMatches, getTimelines } from "./repository";
import {
  getTrainingGoals,
  saveGoalEvaluation,
} from "./training-repository";
import { trainingObservations } from "./training-observations";

export interface AnalysisPayload {
  analysis: TeamAnalysis;
  quick: QuickDiagnosis & { activeGoals: number };
  /** Cada objetivo aberto com a leitura de hoje; `evaluation` é null quando ainda não há janela. */
  training: { goal: TrainingGoal; evaluation: GoalEvaluation | null }[];
}

/**
 * Avalia cada objetivo com as partidas que já estão no cache. Abrir o painel não chama a Riot: ele lê
 * o que a coleta gravou e compara as janelas.
 *
 * Partidas insuficientes não viram histórico: a ausência de leitura já diz que a janela ainda não
 * abriu, e gravar todo dia um "não há partidas" só encheria a tabela de linha sem informação.
 */
export async function evaluateTrainingGoals(
  teamId: string,
  goals: TrainingGoal[],
  context: {
    matches: Awaited<ReturnType<typeof getTeamMatches>>;
    depths: TeamAnalysis["depths"];
    timelines: Awaited<ReturnType<typeof getTimelines>>;
    persist: boolean;
  },
): Promise<{ goal: TrainingGoal; evaluation: GoalEvaluation | null }[]> {
  const deathsByMatch = new Map(
    context.timelines.map((entry) => [entry.matchId, deathEvents(entry.deaths)]),
  );
  const out: { goal: TrainingGoal; evaluation: GoalEvaluation | null }[] = [];
  for (const goal of goals) {
    const observations = trainingObservations(goal.metric, {
      matches: context.matches,
      depths: context.depths,
      person: goal.person,
      deathsByMatch,
    });
    const evaluation = evaluateGoal({ goal, observations });
    if (!context.persist) {
      // A escalação compartilhada é só leitura: ela mostra a leitura viva, sem gravar histórico.
      out.push({ goal, evaluation: evaluation.windowGames > 0 ? evaluation : null });
      continue;
    }
    if (evaluation.windowGames >= 2) {
      await saveGoalEvaluation(teamId, goal.id, evaluation).catch((error) => {
        console.error("[premade] training evaluation not saved:", error);
      });
    }
    out.push({
      goal,
      evaluation: evaluation.windowGames > 0 ? evaluation : null,
    });
  }
  return out;
}

/**
 * Lê tudo o que a análise precisa para uma equipe pelo slug. `persist` liga a gravação do histórico
 * de treinamento (só a página com sessão de edição grava).
 *
 * `minPeople` recorta as partidas pela escalação ANTES de qualquer número: o seletor de mínimo só
 * faz sentido se as métricas, as recomendações e a lista de partidas virem todas do mesmo conjunto.
 * Filtrar depois — só a lista, ou só um cartão — faria a página discordar de si mesma.
 */
export async function loadAnalysisPayload(
  slug: string,
  options: { persistTraining?: boolean; minPeople?: number } = {},
): Promise<AnalysisPayload | null> {
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) return null;
  const [allMatches, players, timelines, goals] = await Promise.all([
    getTeamMatches(team.id),
    getPlayers(team.id),
    getTimelines(team.id),
    // Um banco ainda sem a migração 0021 não pode derrubar a análise inteira.
    getTrainingGoals(team.id).catch(() => [] as TrainingGoal[]),
  ]);
  // Sem `minPeople`, nada é recortado: o padrão é "tudo o que foi coletado".
  const selection =
    options.minPeople === undefined
      ? null
      : filterByMinPeople(allMatches, players, options.minPeople);
  const matches = selection?.kept ?? allMatches;
  const keptIds = selection ? new Set(matches.map((entry) => entry.matchId)) : null;
  // A timeline de uma partida que saiu do recorte não pode alimentar gráfico nem diagnóstico.
  const keptTimelines = keptIds
    ? timelines.filter((entry) => keptIds.has(entry.matchId))
    : timelines;
  const analysis = buildTeamAnalysis(matches, players, keptTimelines);
  const open = goals.filter((goal) => !goal.archived);
  const training = await evaluateTrainingGoals(team.id, open, {
    matches,
    depths: analysis.depths,
    timelines: keptTimelines,
    persist: options.persistTraining === true,
  });
  return {
    analysis,
    quick: buildQuickDiagnosis(analysis, open.length),
    training,
  };
}
