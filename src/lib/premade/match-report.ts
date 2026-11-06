/**
 * Análise pós-partida: por que esta partida aconteceu do jeito que aconteceu (prompt §3).
 *
 * Duas regras governam tudo aqui, e elas vêm do prompt:
 *
 *  1. "Não classifique automaticamente qualquer morte como erro decisivo." Uma morte só vira ponto
 *     de inflexão quando o estado da partida muda de fato depois dela — medido, não presumido.
 *  2. "Um ponto de inflexão precisa demonstrar uma mudança relevante no estado da partida." Por
 *     isso todo ponto carrega `before`/`after` em números: quem quiser discordar olha a evidência.
 *
 * O módulo é puro: recebe a partida e a timeline já derivada, devolve a narrativa estruturada.
 * Nada de I/O, nada de Supabase, nada de Next.
 */
import {
  CHANGE_Z,
  CONVERSION_WINDOW,
  GROUPED_RADIUS,
  LEAD_GOLD,
  OBJECTIVE_PRESENCE_PLAYERS,
  PREPARATION_WINDOW,
} from "./config";
import type { PremadeMatchSample } from "./types";
import type { PremadeTimeline, TimelineObjective } from "./timeline";
import { text, type Text } from "./i18n";

/** Quanto tempo depois de uma morte ainda se atribui a ela a consequência observada. */
const DEATH_CONVERSION_WINDOW = CONVERSION_WINDOW;
/** Uma queda de ouro deste tamanho numa janela é "perder a vantagem" (mesma régua da liderança). */
const SWING_GOLD = LEAD_GOLD;
/** Alguém sozinho a mais que isso do grupo não conta como "junto". */
const SPLIT_DISTANCE = GROUPED_RADIUS;
/** Janela para relacionar uma morte a outra (sequência de mortes). */
const SEQUENCE_WINDOW = 30;

export type InflectionKind =
  | "deathsBeforeObjective"
  | "objectiveLostAfterFight"
  | "killsWithoutConversion"
  | "leadFading"
  | "teamSplit"
  | "objectiveOutnumbered"
  | "deathsIntoStructures";

/**
 * Os quatro estados do §7.2. `inconclusive` não é falha: é a resposta honesta quando o estado da
 * partida não muda o bastante para sustentar uma conclusão.
 */
export type InflectionConfidence = "high" | "medium" | "low" | "inconclusive";

/**
 * Os 9 campos exigidos pelo §3.2, na ordem em que o prompt os lista.
 * `replayHint` é o "trecho do replay que merece revisão".
 */
export interface InflectionPoint {
  kind: InflectionKind;
  /** 1. Minuto aproximado (segundos desde o início). */
  at: number;
  /** 2. O que aconteceu, em uma frase factual: chave em `premade.matches.text.what.<kind>` + valores. */
  what: Text;
  /** 3. Jogadores envolvidos (nomes do elenco; vazio quando foram suplentes). */
  players: string[];
  /** 4. Evidências quantitativas que sustentam a deteccão. */
  evidence: InflectionEvidence[];
  /** 5. Situação anterior: o estado medido ANTES do evento. */
  before: MatchStateSnapshot;
  /** 6. Consequências observadas: o estado medido DEPOIS. */
  after: MatchStateSnapshot;
  /** 7. Possível interpretação — sempre hipótese, nunca causalidade. */
  interpretation: Text;
  /** 8. Nível de confiança. */
  confidence: InflectionConfidence;
  /** 9. Trecho do replay que merece revisão. */
  replayHint: { from: number; to: number };
  /** Mudança de ouro medida (depois − antes), a régua central de "mudou o estado". */
  swing: number;
}

/** Uma evidência é um número com unidade e rótulo: nunca uma frase solta. */
export interface InflectionEvidence {
  /** Chave em `premade.matches.evidenceLabels.<label>`. */
  label: string;
  value: number;
  unit: "gold" | "kills" | "deaths" | "players" | "count" | "seconds";
}

/** Foto do estado da partida num instante, para comparar antes/depois com a mesma régua. */
export interface MatchStateSnapshot {
  at: number;
  goldDiff: number;
  groupKills: number;
  groupDeaths: number;
  objectives: number;
}

/**
 * Um acontecimento estratégico da timeline (§3.1): vários eventos brutos agrupados de modo que a
 * linha do tempo caiba numa tela. `events` é a contagem crua que entrou no agrupamento.
 */
export interface StrategicMoment {
  at: number;
  kind: "fight" | "objective" | "tower" | "objectiveLost" | "goldSwing" | "preparation";
  label: string;
  /** Diferença de ouro do grupo no instante do marco. */
  goldDiff: number;
  near: number;
  events: number;
}

/** Síntese final (§3.3). Funciona também para partidas vencidas. */
export interface MatchReport {
  matchId: string;
  win: boolean;
  duration: number;
  /** Principal problema observado (ou principal ponto positivo, quando venceu). */
  headline: Text;
  /**
   * O fato que a manchete enquadra, quando existe (null na partida sem ponto de inflexão). Fica
   * separado porque o idioma decide a ordem: o painel junta `headline` e este fato.
   */
  headlineWhat: Text | null;
  /** Momento crítico, em segundos; null quando nenhum ponto de inflexão se sustentou. */
  criticalAt: number | null;
  /** Evidência que sustenta a análise. */
  evidence: InflectionEvidence[];
  /** Impacto observado depois do evento. */
  impact: Text;
  /** Hipótese fundamentada, sem afirmar causalidade. */
  interpretation: Text;
  /** Exercício ou comportamento a revisar. */
  improvement: Text;
  confidence: InflectionConfidence;
  /** Os pontos de inflexão, do mais forte para o mais fraco. */
  inflections: InflectionPoint[];
  /** O que não pôde ser avaliado nesta partida, e por quê. */
  notEvaluated: Text[];
}

// ---------------------------------------------------------------------------------------------
// Leitura do estado
// ---------------------------------------------------------------------------------------------

function goldDiffAt(timeline: PremadeTimeline, at: number): number {
  const series = timeline.goldDiff;
  if (series.length === 0) return 0;
  let value = 0;
  for (const [second, diff] of series) {
    if (second > at) break;
    value = diff;
  }
  return value;
}

function inWindow<T extends { at: number }>(
  events: readonly T[],
  from: number,
  to: number,
): T[] {
  return events.filter((event) => event.at > from && event.at <= to);
}

function stateAt(
  timeline: PremadeTimeline,
  at: number,
  objectivesUpTo?: readonly TimelineObjective[],
): MatchStateSnapshot {
  const kills = timeline.kills.filter((kill) => kill.at <= at);
  const objectives = (
    objectivesUpTo ?? timeline.objectives.filter((entry) => entry.at <= at)
  ).length;
  return {
    at,
    goldDiff: goldDiffAt(timeline, at),
    groupKills: kills.filter((kill) => kill.kind !== "groupDeath").length,
    groupDeaths: kills.filter((kill) => kill.kind === "groupDeath").length,
    objectives,
  };
}

/**
 * Quanto o ouro costuma andar entre um minuto e o seguinte NESTA partida, medido da própria série.
 *
 * Usar uma constante fixa (`LEAD_GOLD`) para julgar uma janela de 90s seria errado: num jogo que
 * oscila 10.000, uma queda de 2.000 numa janela curta é ruído; num jogo travado, 2.000 é a história
 * inteira. A referência tem de ser a volatilidade da partida observada.
 */
function volatility(goldDiff: readonly [number, number][]): number {
  if (goldDiff.length < 3) return LEAD_GOLD;
  const steps: number[] = [];
  for (let i = 1; i < goldDiff.length; i += 1) {
    steps.push(Math.abs(goldDiff[i][1] - goldDiff[i - 1][1]));
  }
  // Desvio absoluto mediano: resistente a um único pico (um barão roubado) definir a régua.
  steps.sort((a, b) => a - b);
  const median = steps[Math.floor(steps.length / 2)];
  // Piso: uma partida travada não pode tornar qualquer 300 de ouro "significativo".
  return Math.max(median, LEAD_GOLD / 4);
}

/**
 * Confiança a partir da mudança medida, comparada à volatilidade da própria partida.
 *
 * Um evento com mudança ZERO nunca vira ponto de inflexão, por mais sinais que tenham corroborado
 * a sua ocorrência: o prompt exige que o estado da partida mude (§3.2). Sem isto, uma luta perdida
 * num jogo já decidido apareceria como "inflexão de baixa confiança" — que é exatamente a
 * conclusão convincente baseada em evidência insuficiente que o princípio final proíbe.
 */
function confidenceFor(
  swing: number,
  reference: number,
  corroborating: number,
): InflectionConfidence {
  const needed = CHANGE_Z * reference;
  const magnitude = Math.abs(swing);
  if (magnitude < needed) return "inconclusive";
  if (magnitude < needed * 2) return corroborating >= 1 ? "medium" : "low";
  return "high";
}

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}min${s > 0 ? ` ${String(s).padStart(2, "0")}s` : ""}`;
}

/** O nome do elenco para um id, quando o chamador passou o mapa; senão o próprio id. */
type NameOf = (person: string | null) => string | null;

function people(ids: Iterable<string | null>, nameOf: NameOf): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const name = nameOf(id);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// §3.1 — Timeline estratégica
// ---------------------------------------------------------------------------------------------

/**
 * Agrupa os eventos brutos em marcos legíveis (§3.1: "evitando uma timeline poluída").
 *
 * A regra: eventos da mesma natureza a menos de `GROUPED_RADIUS` segundos viram um só marco, com a
 * contagem em `events`. É agrupamento de apresentação — a evidência continua toda disponível.
 */
export function strategicTimeline(
  timeline: PremadeTimeline,
  bucket = 60,
): StrategicMoment[] {
  const raw: StrategicMoment[] = [];

  for (const kill of timeline.kills) {
    raw.push({
      at: kill.at,
      kind: "fight",
      label: kill.kind === "groupDeath" ? "death" : "kill",
      goldDiff: goldDiffAt(timeline, kill.at),
      near: kill.near,
      events: 1,
    });
  }
  for (const objective of timeline.objectives) {
    raw.push({
      at: objective.at,
      kind: objective.kind === "tower" ? "tower" : "objective",
      label: objective.variant ?? objective.kind,
      goldDiff: goldDiffAt(timeline, objective.at),
      near: objective.near,
      events: 1,
    });
    // "Momentos de preparação para objetivos" (§3.1): a janela em que o grupo se move para o
    // objetivo antes de tomá-lo. É um marco próprio para que a leitura veja o deslocamento, não só
    // o instante do objetivo.
    if (objective.kind === "dragon" || objective.kind === "baron") {
      raw.push({
        at: Math.max(0, objective.at - PREPARATION_WINDOW),
        kind: "preparation",
        label: objective.kind,
        goldDiff: goldDiffAt(timeline, objective.at - PREPARATION_WINDOW),
        near: 0,
        events: 1,
      });
    }
  }

  raw.sort((a, b) => a.at - b.at);

  const moments: StrategicMoment[] = [];
  for (const moment of raw) {
    const previous = moments.at(-1);
    // Só funde o que é comparável: lutas com lutas, objetivos com objetivos.
    if (
      previous &&
      previous.kind === moment.kind &&
      moment.at - previous.at <= bucket
    ) {
      previous.events += 1;
      previous.near = Math.max(previous.near, moment.near);
      continue;
    }
    moments.push({ ...moment });
  }
  return moments;
}

// ---------------------------------------------------------------------------------------------
// §3.2 — Pontos de inflexão
// ---------------------------------------------------------------------------------------------

interface Candidate {
  kind: InflectionKind;
  at: number;
  what: Text;
  involved: Set<string | null>;
  evidence: InflectionEvidence[];
  before: MatchStateSnapshot;
  after: MatchStateSnapshot;
  interpretation: Text;
  replayHint: { from: number; to: number };
  /** Quantos sinais independentes corroboram o evento, além da variação de ouro. */
  corroborating: number;
}

function buildCandidates(
  sample: PremadeMatchSample,
  timeline: PremadeTimeline,
): Candidate[] {
  const candidates: Candidate[] = [];
  const duration = timeline.duration || sample.duration || 0;
  const deaths = timeline.kills.filter((kill) => kill.kind === "groupDeath");
  const objectives = timeline.objectives;

  // --- 1. Mortes de 2+ jogadores antes de um objetivo importante (§3.2, exemplo 1) -----------
  for (const objective of objectives) {
    if (objective.kind !== "dragon" && objective.kind !== "baron") continue;
    const beforeWindow = inWindow(deaths, objective.at - 90, objective.at);
    if (beforeWindow.length < 2) continue;
    const from = objective.at - 90;
    candidates.push({
      kind: "deathsBeforeObjective",
      at: objective.at,
      what: text("what.deathsBeforeObjective", {
        deaths: beforeWindow.length,
        seconds: 90,
        objective: objective.kind,
      }),      involved: new Set(beforeWindow.map((death) => death.person)),
      evidence: [
        { label: "deathsBeforeObjective", value: beforeWindow.length, unit: "deaths" },
        { label: "peopleAtObjective", value: objective.near, unit: "players" },
      ],
      before: stateAt(timeline, from),
      after: stateAt(timeline, objective.at + DEATH_CONVERSION_WINDOW),
      interpretation: text("interpretationText.deathsBeforeObjective"),
      replayHint: { from: from, to: objective.at + DEATH_CONVERSION_WINDOW },
      corroborating: objective.near < OBJECTIVE_PRESENCE_PLAYERS ? 1 : 0,
    });
  }

  // --- 2. Perda de objetivo logo depois de luta desfavorável (exemplo 2) --------------------
  // Uma luta desfavorável é: mais mortes do que abates na janela.
  const kills = timeline.kills.filter((kill) => kill.kind !== "groupDeath");
  for (const death of deaths) {
    const windowFrom = death.at - 30;
    const killsInWindow = inWindow(kills, windowFrom, death.at).length;
    const deathsInWindow = inWindow(deaths, windowFrom, death.at).length;
    if (deathsInWindow <= killsInWindow) continue;
    const objectiveAfter = objectives.find(
      (objective) =>
        objective.at > death.at &&
        objective.at <= death.at + DEATH_CONVERSION_WINDOW &&
        objective.kind !== "tower",
    );
    if (!objectiveAfter) continue;
    candidates.push({
      kind: "objectiveLostAfterFight",
      at: death.at,
      what: text("what.objectiveLostAfterFight", {
        seconds: Math.round(objectiveAfter.at - death.at),
      }),
      involved: new Set([death.person]),
      evidence: [
        { label: "groupDeathsInFight", value: deathsInWindow, unit: "deaths" },
        { label: "groupKillsInFight", value: killsInWindow, unit: "kills" },
        {
          label: "secondsToConversion",
          value: Math.round(objectiveAfter.at - death.at),
          unit: "seconds",
        },
      ],
      before: stateAt(timeline, windowFrom),
      after: stateAt(timeline, objectiveAfter.at),
      interpretation: text("interpretationText.objectiveLostAfterFight"),
      replayHint: { from: windowFrom, to: objectiveAfter.at + 15 },
      corroborating: 2,
    });
  }

  // --- 3. Abates sem conversão (exemplo 3) --------------------------------------------------
  // Cinco ou mais abates numa janela e nenhum objetivo obtido nela nem logo depois.
  const WINDOW = 120;
  let index = 0;
  while (index < kills.length) {
    const from = kills[index].at;
    const inWindowKills = inWindow(kills, from, from + WINDOW);
    // Consome a janela de uma vez: sem isto o mesmo achado apareceria de segundo em segundo.
    index += Math.max(1, inWindowKills.length);
    if (inWindowKills.length < 5) continue;
    const converted = objectives.some(
      (objective) => objective.at > from && objective.at <= from + WINDOW + CONVERSION_WINDOW,
    );
    if (converted) continue;
    candidates.push({
      kind: "killsWithoutConversion",
      at: from,
      what: text("what.killsWithoutConversion", {
        kills: inWindowKills.length,
        seconds: WINDOW,
      }),
      involved: new Set(inWindowKills.map((kill) => kill.person)),
      evidence: [
        { label: "killsInWindow", value: inWindowKills.length, unit: "kills" },
        { label: "objectivesConverted", value: 0, unit: "count" },
      ],
      before: stateAt(timeline, from),
      after: stateAt(timeline, from + WINDOW + CONVERSION_WINDOW),
      interpretation: text("interpretationText.killsWithoutConversion"),
      replayHint: { from: from, to: from + WINDOW + CONVERSION_WINDOW },
      corroborating: 1,
    });
  }

  // --- 4. Vantagem de ouro que começa a diminuir (exemplo 4) --------------------------------
  const series = timeline.goldDiff;
  for (let i = 0; i < series.length; i += 1) {
    const [second, diff] = series[i];
    if (diff < LEAD_GOLD) continue;
    // Primeiro instante em que a liderança cai abaixo da metade do pico.
    const later = series.slice(i + 1).find(([, value]) => value < diff / 2);
    if (!later) continue;
    const suggestion = diff - later[1];
    if (suggestion < SWING_GOLD) continue;
    candidates.push({
      kind: "leadFading",
      at: later[0],
      what: text("what.leadFading", {
        peak: Math.round(diff),
        later: Math.round(later[1]),
        minutes: minutes(later[0] - second),
      }),      involved: new Set(),
      evidence: [
        { label: "peakGold", value: Math.round(diff), unit: "gold" },
        { label: "goldAfter", value: Math.round(later[1]), unit: "gold" },
        { label: "drop", value: Math.round(suggestion), unit: "gold" },
      ],
      before: stateAt(timeline, second),
      after: stateAt(timeline, later[0]),
      interpretation: text("interpretationText.leadFading"),
      replayHint: { from: second, to: later[0] + 60 },
      corroborating: 1,
    });
    break; // o primeiro é o que importa; os demais seriam a mesma história contada de novo
  }

  // --- 5. Equipe dividida durante uma disputa (exemplo 5) -----------------------------------
  const frames = timeline.positions;
  if (frames.length >= 2) {
    // Percorre os frames de um jogador como relógio comum.
    const clock = frames[0].points;
    for (let index0 = 0; index0 < clock.length; index0 += 1) {
      const second = clock[index0][0];
      const positions = frames
        .map((entry) => entry.points[index0])
        .filter((point): point is NonNullable<typeof point> => Boolean(point));
      if (positions.length < 4) continue;
      // Distância máxima entre dois jogadores do grupo neste frame.
      let maxDistance = 0;
      for (let a = 0; a < positions.length; a += 1) {
        for (let b = a + 1; b < positions.length; b += 1) {
          const dx = positions[a][1] - positions[b][1];
          const dy = positions[a][2] - positions[b][2];
          maxDistance = Math.max(maxDistance, Math.hypot(dx, dy));
        }
      }
      if (maxDistance < SPLIT_DISTANCE) continue;
      // Só interessa se houver luta perto: senão todo jogo é "dividido".
      const fightNearby = timeline.kills.some(
        (kill) => Math.abs(kill.at - second) <= 20,
      );
      if (!fightNearby) continue;
      candidates.push({
        kind: "teamSplit",
        at: second,
        what: text("what.teamSplit", { units: Math.round(maxDistance) }),
        involved: new Set(frames.map((entry) => entry.puuid)),
        evidence: [
          { label: "maxGroupDistance", value: Math.round(maxDistance), unit: "count" },
          { label: "playersInFrame", value: positions.length, unit: "players" },
        ],
        before: stateAt(timeline, second - 30),
        after: stateAt(timeline, second + 30),
        interpretation: text("interpretationText.teamSplit"),
        replayHint: { from: Math.max(0, second - 20), to: second + 20 },
        corroborating: 0,
      });
      break; // um exemplo basta: repetir a cada frame poluiria a análise
    }
  }

  // --- 6. Iniciar objetivo em desvantagem numérica (exemplo 6) ------------------------------
  for (const objective of objectives) {
    if (objective.kind === "tower") continue;
    const deadNearby = deaths.filter(
      (death) => Math.abs(death.at - objective.at) <= 30,
    ).length;
    if (deadNearby < 2) continue;
    if (objective.near >= OBJECTIVE_PRESENCE_PLAYERS) continue;
    candidates.push({
      kind: "objectiveOutnumbered",
      at: objective.at,
      what: text("what.objectiveOutnumbered", { players: objective.near }),
      involved: new Set(objective.people),
      evidence: [
        { label: "peopleAtObjective", value: objective.near, unit: "players" },
        { label: "deathsAround", value: deadNearby, unit: "deaths" },
      ],
      before: stateAt(timeline, objective.at - 30),
      after: stateAt(timeline, objective.at + 60),
      interpretation: text("interpretationText.objectiveOutnumbered"),
      replayHint: { from: Math.max(0, objective.at - 30), to: objective.at + 60 },
      corroborating: 1,
    });
  }

  // --- 7. Sequências de mortes que resultam em perda de estruturas (exemplo 8) -------------
  for (let i = 0; i < deaths.length; i += 1) {
    const start = deaths[i].at;
    const chain = inWindow(deaths, start - 1, start + SEQUENCE_WINDOW * 2);
    if (chain.length < 3) continue;
    const structureAfter = objectives.find(
      (objective) =>
        objective.kind === "tower" &&
        objective.at > start &&
        objective.at <= start + DEATH_CONVERSION_WINDOW * 2,
    );
    if (!structureAfter) continue;
    candidates.push({
      kind: "deathsIntoStructures",
      at: start,
      what: text("what.deathsIntoStructures", { deaths: chain.length }),
      involved: new Set(chain.map((death) => death.person)),
      evidence: [
        { label: "deathsInSequence", value: chain.length, unit: "deaths" },
        {
          label: "secondsToStructure",
          value: Math.round(structureAfter.at - start),
          unit: "seconds",
        },
      ],
      before: stateAt(timeline, start - 30),
      after: stateAt(timeline, structureAfter.at),
      interpretation: text("interpretationText.deathsIntoStructures"),
      replayHint: { from: Math.max(0, start - 30), to: structureAfter.at + 20 },
      corroborating: 2,
    });
    // Consome a sequência para não gerar um achado por morte da mesma cadeia.
    i += chain.length - 1;
  }

  void duration;
  return candidates;
}

/**
 * Os pontos de inflexão da partida, do mais forte para o mais fraco (§3.2).
 *
 * Um candidato só se torna ponto de inflexão se a mudança de estado for mensurável; os demais são
 * descartados — é a trava "não classifique automaticamente qualquer morte como erro decisivo".
 */
export function inflectionPoints(
  sample: PremadeMatchSample,
  timeline: PremadeTimeline,
  nameOf: NameOf = () => null,
): InflectionPoint[] {
  const candidates = buildCandidates(sample, timeline);
  const reference = volatility(timeline.goldDiff);

  const points: InflectionPoint[] = [];
  for (const candidate of candidates) {
    const swing = candidate.after.goldDiff - candidate.before.goldDiff;
    const confidence = confidenceFor(swing, reference, candidate.corroborating);
    // Inconclusivo NÃO entra na lista de pontos de inflexão: se o estado não mudou, não houve
    // inflexão. Fica registrado apenas o que se pode sustentar.
    if (confidence === "inconclusive") continue;

    points.push({
      kind: candidate.kind,
      at: candidate.at,
      what: candidate.what,
      players: people(candidate.involved, nameOf),
      evidence: candidate.evidence,
      before: candidate.before,
      after: candidate.after,
      interpretation: candidate.interpretation,
      confidence,
      replayHint: candidate.replayHint,
      swing,
    });
  }

  const weight: Record<InflectionConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1,
    inconclusive: 0,
  };
  return points.sort(
    (a, b) =>
      weight[b.confidence] - weight[a.confidence] ||
      Math.abs(b.swing) - Math.abs(a.swing),
  );
}

// ---------------------------------------------------------------------------------------------
// §3.3 — Relatório
// ---------------------------------------------------------------------------------------------

/** O que não dá para avaliar com os dados que existem hoje: dito na cara, não omitido. */
export const REPORT_LIMITATIONS: readonly Text[] = [
  text("notEvaluatedText.noVision"),
  text("notEvaluatedText.sampledTimeline"),
];

const KIND_IMPROVEMENT: Record<InflectionKind, Text> = {
  deathsBeforeObjective: text("improvementText.deathsBeforeObjective"),
  objectiveLostAfterFight: text("improvementText.objectiveLostAfterFight"),
  killsWithoutConversion: text("improvementText.killsWithoutConversion"),
  leadFading: text("improvementText.leadFading"),
  teamSplit: text("improvementText.teamSplit"),
  objectiveOutnumbered: text("improvementText.objectiveOutnumbered"),
  deathsIntoStructures: text("improvementText.deathsIntoStructures"),
};

function sumEvidence(points: InflectionPoint[]): InflectionEvidence[] {
  const out: InflectionEvidence[] = [];
  for (const point of points) {
    for (const item of point.evidence) {
      if (!out.some((entry) => entry.label === item.label))
        out.push(item);
    }
  }
  return out.slice(0, 6);
}

/**
 * Monta o relatório de derrota — e também o de vitória: uma partida vencida tem pontos de
 * inflexão a favor, e o prompt pede que a análise funcione nos dois casos (§3.3).
 */
export function matchReport(
  sample: PremadeMatchSample,
  timeline: PremadeTimeline,
  nameOf: NameOf = () => null,
): MatchReport {
  const points = inflectionPoints(sample, timeline, nameOf);
  const win = sample.win;
  const duration = timeline.duration || sample.duration || 0;

  // Num jogo perdido, o pior ponto (mais negativo). Num jogo vencido, o melhor.
  const decisive = points
    .filter((point) => (win ? point.swing > 0 : point.swing < 0))
    .sort((a, b) => (win ? b.swing - a.swing : a.swing - b.swing))[0] ?? points[0] ?? null;

  const notEvaluated: Text[] = [...REPORT_LIMITATIONS];
  if (timeline.positions.length < 4)
    notEvaluated.push(text("notEvaluatedText.fewRosterPlayers"));
  if (timeline.objectives.length === 0)
    notEvaluated.push(text("notEvaluatedText.noObjectives"));

  if (!decisive) {
    return {
      matchId: sample.matchId,
      win,
      duration,
      headline: text(win ? "frames.winNoInflection" : "frames.lossNoInflection"),
      headlineWhat: null,
      criticalAt: null,
      evidence: [],
      impact: text("impactText.none"),
      interpretation: text("interpretationText.noInflection"),
      improvement: text("improvementText.noInflection"),
      confidence: "inconclusive",
      inflections: [],
      notEvaluated,
    };
  }

  const before = decisive.before.goldDiff;
  const after = decisive.after.goldDiff;
  // "Ganho" ou "perda" é o que o OURO fez no recorte, não o resultado da partida: uma vitória em que
  // a vantagem caiu de 4.033 para 1.521 continua sendo uma queda de 2.512.
  const objectiveDelta = decisive.after.objectives - decisive.before.objectives;
  const impact = text("impactText.measured", {
    direction: decisive.swing >= 0 ? "gain" : "loss",
    gold: Math.abs(Math.round(decisive.swing)),
    before: Math.round(before),
    after: Math.round(after),
    objectives: objectiveDelta,
    sign: objectiveDelta >= 0 ? "+" : "",
  });

  return {
    matchId: sample.matchId,
    win,
    duration,
    // O rótulo vem do SIGNIFICADO do evento, não do placar. Todo `InflectionKind` descreve algo que
    // deu errado (mortes antes do objetivo, abates sem conversão, vantagem evaporando, time dividido),
    // então chamar isso de "Ponto forte" porque o time venceu seria elogiar o próprio problema. Numa
    // vitória a leitura honesta é: venceu apesar disto.
    //
    // São DUAS chaves, não uma frase com outra frase dentro: o enquadramento (`headline.*`) e o fato
    // (`headlineWhat`), que o painel junta na ordem do idioma.
    headline: text(win ? "frames.wonDespite" : "frames.mainProblem"),
    headlineWhat: decisive.what,
    criticalAt: decisive.at,
    evidence: sumEvidence([decisive, ...points]),
    impact,
    interpretation: decisive.interpretation,
    improvement: KIND_IMPROVEMENT[decisive.kind],
    confidence: decisive.confidence,
    inflections: points,
    notEvaluated,
  };
}
