/**
 * Diagnóstico individual (§5): o que cada jogador precisa desenvolver, o que ele já faz bem, e —
 * igualmente importante — quando NÃO é o jogador que precisa mudar.
 *
 * As regras de recomendação já existem em `individual-recommendations.ts` e já comparam dentro da
 * lane. O que este módulo acrescenta é o que o §5 exige e faltava:
 *
 *  - §5.1: a comparação carrega função, campeão, duração e número de partidas junto do número. Um
 *    KDA sozinho não diz nada.
 *  - §5.3: todo diagnóstico apresenta os sete campos, inclusive o indicador de acompanhamento.
 *  - A última linha do §5, que é a mais importante: "não atribua responsabilidade individual quando
 *    a evidência indicar um problema coletivo". Por isso um diagnóstico pode ser recusado: quando o
 *    desvio do jogador se explica pela lane, pelo campeão, pela amostra ou pelo time inteiro, ele não
 *    vira culpa.
 *  - §6: o diagnóstico é a origem do objetivo de treinamento, então cada aspecto tem uma métrica
 *    acompanhável (`tracking.metric`) e um valor atual medido.
 *
 * Puro: sem I/O, sem Supabase, sem Next. Não pontua nem classifica jogador.
 */
import {
  LOW_CONFIDENCE_GAMES,
  type DeathBreakdown,
  type EarlyGame,
  type PlayerCombat,
  type PlayerDepth,
  type PlayerSummary,
  type PlayerVision,
} from "./individual-metrics";
import type { Confidence } from "./recommendations";
import { text, type Text } from "./i18n";

export type { Text } from "./i18n";


/**
 * Por que um diagnóstico deixou de ser individual. Cada motivo nomeia o que assumiu a
 * responsabilidade no lugar do jogador.
 */
export type SharedResponsibility =
  | "teamDeaths"
  | "laneStructure"
  | "championNotEstablished"
  | "smallSample"
  | "notMeasured";

/** Um dos sete campos do §5.3. */
export interface PlayerDiagnosis {
  /** §5.3 "Jogador": identificação. Sempre preenchido — antes era um id cru quando faltava o mapa. */
  person: string;
  personName: string;
  /** §5.3 "Aspecto a desenvolver": o problema (ou a força), não o número. */
  aspect: DiagnosisAspect;
  /**
   * Força quando o número está do lado bom. Um aspecto positivo também é diagnóstico: o §3.3 pede
   * isso para partidas vencidas, e o §8.2 pede os padrões positivos ao lado dos problemas.
   */
  kind: DiagnosisKind;
  /** §5.3 "Evidência": a estatística observada, com denominador. */
  evidence: DiagnosisEvidence[];
  /** §5.3 "Contexto": função, campeão e quantidade de partidas. Nunca separado do número. */
  context: DiagnosisContext;
  /** §5.3 "Confiança" e o porquê dela. */
  confidence: Confidence;
  confidenceReason: Text;
  /** §5.3 "Exercício recomendado": ação prática. */
  exercise: Text;
  /** §5.3 "Indicador de acompanhamento": a métrica que diz se melhorou. */
  tracking: { metric: TrackingMetric; current: number | null; unit: DiagnosisUnit };
  /** Quando não é do jogador: de quem é, e por quê. Vazio quando o diagnóstico é individual. */
  shared: SharedResponsibility | null;
}

export type DiagnosisKind = "problem" | "strength";

export type DiagnosisAspect =
  | "farming"
  | "vision"
  | "deaths"
  | "killParticipation"
  | "earlyGame"
  | "combat";

export type DiagnosisUnit =
  | "perMin"
  | "perGame"
  | "percent"
  | "ratio"
  | "points";

/**
 * Os rótulos de evidência que este módulo emite, sem nenhum outro. A interface usa esta lista para
 * garantir que cada um tem tradução (`premade.diagnosis.evidence.<label>`).
 */
export type EvidenceLabel =
  | "csVsLaneAt10"
  | "csPerMin"
  | "visionPerMin"
  | "roleAverage"
  | "deathsPerGame"
  | "groupDeathsPerGame"
  | "aloneDeaths"
  | "killParticipation"
  | "damagePerDeath";

export interface DiagnosisEvidence {
  /** Chave em `premade.diagnosis.evidence.<label>`. */
  label: string;
  value: number | null;
  unit: DiagnosisUnit;
  /** De onde o número veio, para o leitor poder discutir com ele. */
  source: Text;
}

/** §5.3 "Contexto": o que impede uma métrica de ser lida fora do seu lugar. */
export interface DiagnosisContext {
  roles: string[];
  champions: { name: string; games: number }[];
  games: number;
  /**
   * Partidas com elenco completo (cinco pessoas), de `MatchSets`. Antes era igual a `games`: o
   * módulo não tinha de onde tirar o denominador e o contexto mentia sem parecer mentir.
   */
  fullGames: number;
  /** Jogos com timeline, de onde saem as métricas de posição. */
  timelineGames: number;
  /** Duração mediana das partidas lidas, em segundos. */
  medianDuration: number | null;
}

/** A métrica que acompanha cada diagnóstico, e que a interface traduz. */
export type TrackingMetric =
  | "csDiffAt10"
  | "visionPerMin"
  | "aloneDeathShare"
  | "killParticipation"
  | "damagePerDeath"
  | "deathsPerGame"
  | "teamDeathsPerGame";

/** Função que a Riot registra em `teamPosition`. */
export type TeamPosition = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

/** O que o módulo precisa de fora: o time, para saber se o problema é coletivo. */
export interface DiagnosisInput {
  depths: PlayerDepth[];
  /** Nome de elenco por id. */
  names: Map<string, string>;
  /**
   * Mortes do GRUPO por partida — não da equipe inteira. É a evidência de "o grupo morre muito".
   * Antes era `metrics.kills.deaths`, que somava os dois lados: com 29,3 por partida nenhum jogador
   * jamais podia ser responsável. Use `groupDeathsPerGame()` de `metrics.ts`.
   */
  teamDeathsPerGame: number | null;
  /**
   * Mortes MÉDIAS POR PESSOA do grupo, no mesmo período: a referência contra a qual a pessoa é
   * medida.
   *
   * É diferente de `teamDeathsPerGame`, e a diferença é a que fazia todo diagnóstico de morte voltar
   * como "do time": comparar as mortes de UMA pessoa (≈5,9 por partida) com o total do grupo
   * (≈29,3 por partida) reprovava todo mundo em todos os jogos, então nenhuma pessoa jamais podia
   * aparecer como responsável pelo próprio excesso. Comparar pessoa com pessoa é a leitura honesta;
   * o total do grupo continua no texto da evidência, para separar "esta pessoa morre demais" de "o
   * elenco inteiro morre demais".
   *
   * Ausente quando o grupo não teve partida lida: aí não se atribui nada.
   */
  rosterDeathsPerPerson?: number | null;
  teamGames: number;
  /**
   * Partidas com elenco completo no período (de `MatchSets`). O contexto diz em quantas partidas a
   * leitura de comparação se apoia.
   */
  fullGames?: number;
}

/**
 * Abaixo desta razão entre as mortes do jogador e a média do grupo, o excesso é dele.
 * Acima, é o grupo inteiro morrendo: apontar um dedo seria escolher o bode expiatório do time.
 */
const TEAM_DEATH_ATTRIBUTION = 1.35;
/** Diferença de CS/min contra o oponente de lane que configura problema de farm. */
const LANE_CS_GAP = 15;
/** A mesma diferença, do outro lado: farm na frente do oponente é força, não ausência de problema. */
const LANE_CS_AHEAD = 15;
/** Visão abaixo da média da própria função: problema. */
const VISION_GAP = 0.6;
/** Visão acima da média da própria função: força. */
const VISION_AHEAD = 1.3;
/** Participação em abates abaixo/acima destes limites (fração 0..1). */
const KP_LOW = 0.45;
const KP_HIGH = 0.65;
/** Dano por morte que separa problema de força. */
const DAMAGE_PER_DEATH_LOW = 1_000;
const DAMAGE_PER_DEATH_HIGH = 2_000;
/** Mortes sem aliado perto (percentual 0..100) que aponta para posicionamento. */
const ALONE_SHARE_ATTRIBUTABLE = 50;

function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}

/** O campeão mais jogado, que é o único que se pode atribuir a um hábito. */
function topChampion(depth: PlayerDepth): { name: string; games: number } | null {
  const sorted = [...depth.champions].sort((a, b) => b.games - a.games);
  const first = sorted[0];
  return first && first.games > 0
    ? { name: first.championName, games: first.games }
    : null;
}

function contextOf(
  depth: PlayerDepth,
  medianDuration: number | null,
  fullGames: number,
): DiagnosisContext {
  const top = topChampion(depth);
  return {
    roles: depth.roles ?? [],
    champions: top ? [top] : [],
    games: depth.games,
    // Nunca maior que as partidas do próprio jogador, e nunca inventado quando o chamador não sabe.
    fullGames: Math.min(fullGames, depth.games),
    timelineGames: depth.deaths?.games ?? 0,
    medianDuration,
  };
}

/**
 * A regra mais importante do §5, isolada para poder ser testada: o problema é do jogador ou do
 * grupo? Devolve o motivo quando a responsabilidade é compartilhada.
 *
 * `referencePerPerson` é a mortes MÉDIAS POR PESSOA do grupo, nunca o total: ver o comentário de
 * `rosterDeathsPerPerson`. Comparar pessoa com total reprovava todos.
 */
export function sharedResponsibility(
  deathsPerGame: number | null,
  referencePerPerson: number | null,
): SharedResponsibility | null {
  // Sem referência do grupo não se atribui nada a ninguém.
  if (deathsPerGame === null || referencePerPerson === null) return "teamDeaths";
  if (referencePerPerson <= 0) return "teamDeaths";
  return deathsPerGame >= referencePerPerson * TEAM_DEATH_ATTRIBUTION
    ? null
    : "teamDeaths";
}

/** Confiança: o tamanho da amostra manda, e o motivo viaja junto. */
function confidenceOf(depth: PlayerDepth, needed: number): {
  confidence: Confidence;
  reason: Text;
} {
  if (depth.games < LOW_CONFIDENCE_GAMES) {
    return {
      confidence: "low",
      reason: text("reason.sampleBelowMinimum", { games: depth.games }),
    };
  }
  if (needed < LOW_CONFIDENCE_GAMES) {
    return {
      confidence: "low",
      reason: text("reason.metricFewGames", { games: needed }),
    };
  }
  return {
    confidence: needed >= 20 ? "high" : "medium",
    reason: text("reason.metricRead", { games: needed }),
  };
}

/**
 * Quando a comparação intra-lane não pode ser feita: a pessoa jogou em funções demais para que
 * "a média da própria função" signifique alguma coisa. §5.1 pede função no contexto justamente
 * para que um número de lane não seja lido fora dela.
 */
export function laneComparable(roles: readonly string[]): boolean {
  return roles.length <= 2;
}

/** Constrói o diagnóstico completo com os campos que não dependem do aspecto. */
function build(
  depth: PlayerDepth,
  personName: string,
  aspect: DiagnosisAspect,
  kind: DiagnosisKind,
  evidence: DiagnosisEvidence[],
  context: DiagnosisContext,
  confidence: { confidence: Confidence; reason: Text },
  exercise: Text,
  tracking: PlayerDiagnosis["tracking"],
  shared: SharedResponsibility | null = null,
): PlayerDiagnosis {
  return {
    person: depth.person,
    personName,
    aspect,
    kind,
    evidence,
    context,
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    exercise,
    tracking,
    shared,
  };
}

/**
 * Um diagnóstico recusado: o dado existe, mas ele aponta para o contexto e não para a pessoa.
 * Devolver isto em vez de nada é o que permite à interface DIZER que a análise olhou a pessoa e
 * não a culpa.
 */
function refused(
  depth: PlayerDepth,
  personName: string,
  aspect: DiagnosisAspect,
  evidence: DiagnosisEvidence[],
  context: DiagnosisContext,
  shared: SharedResponsibility,
  reason: Text,
  exercise: Text,
  tracking: PlayerDiagnosis["tracking"],
): PlayerDiagnosis {
  return build(
    depth,
    personName,
    aspect,
    "problem",
    evidence,
    context,
    { confidence: "low", reason },
    exercise,
    tracking,
    shared,
  );
}

// ---------------------------------------------------------------------------------------------
// Os geradores de diagnóstico, um por aspecto
// ---------------------------------------------------------------------------------------------

function farmingDiagnosis(
  depth: PlayerDepth,
  personName: string,
  early: EarlyGame,
  summary: PlayerSummary,
  context: DiagnosisContext,
): PlayerDiagnosis | null {
  const csDiff = early.at10.csDiff;
  // Sem número não há diagnóstico; com POUCAS partidas há, com confiança baixa: quem decide isso
  // é `confidenceOf`, nunca uma saída antecipada (senão o jogador com 3 jogos nunca é avaliado).
  if (csDiff === null) return null;

  const evidence: DiagnosisEvidence[] = [
    {
      label: "csVsLaneAt10",
      value: round(csDiff),
      unit: "points",
      source: text("source.laneGamesWithTimeline", { games: early.laneGames }),
    },
    {
      label: "csPerMin",
      value: round(summary.csPerMin),
      unit: "perMin",
      source: text("source.games", { games: summary.games }),
    },
  ];
  const tracking = {
    metric: "csDiffAt10" as const,
    current: round(csDiff),
    unit: "points" as const,
  };

  if (csDiff <= -LANE_CS_GAP) {
    // A comparação exige lane estável: quem jogou em três ou mais funções não tem "o oponente de
    // lane" de uma partida para a outra, e a média mistura um topo com um suporte.
    if (!laneComparable(context.roles)) {
      return refused(
        depth,
        personName,
        "farming",
        evidence,
        context,
        "laneStructure",
        text("reason.farmingUnstableRole"),
        text("exercise.farmingUnstableRole"),
        tracking,
      );
    }
    return build(
      depth,
      personName,
      "farming",
      "problem",
      evidence,
      context,
      confidenceOf(depth, early.laneGames),
      text("exercise.farmingProblem"),
      tracking,
    );
  }

  if (csDiff >= LANE_CS_AHEAD && laneComparable(context.roles)) {
    return build(
      depth,
      personName,
      "farming",
      "strength",
      evidence,
      context,
      confidenceOf(depth, early.laneGames),
      text("exercise.farmingStrength"),
      tracking,
    );
  }

  return null;
}

function visionDiagnosis(
  depth: PlayerDepth,
  personName: string,
  vision: PlayerVision,
  context: DiagnosisContext,
): PlayerDiagnosis | null {
  const own = vision.visionPerMin;
  const lane = vision.laneAveragePerMin;
  // A comparação é SEMPRE contra a própria função (§5.1): visão de suporte não se lê como topo.
  if (own === null || lane === null || lane <= 0) return null;
  // Quem jogou em três ou mais funções não tem "própria função": a média da lane mistura a visão de
  // um suporte com a de um topo, e o resultado diria mais sobre o sorteio da lane que sobre o jogador.
  if (!laneComparable(context.roles)) return null;

  const ratio = own / lane;
  const evidence: DiagnosisEvidence[] = [
    {
      label: "visionPerMin",
      value: round(own),
      unit: "perMin",
      source: text("source.games", { games: vision.games }),
    },
    {
      label: "roleAverage",
      value: round(lane),
      unit: "perMin",
      source: text("source.sameRoleGames", { games: vision.laneGames }),
    },
  ];
  const tracking = {
    metric: "visionPerMin" as const,
    current: round(own),
    unit: "perMin" as const,
  };

  if (ratio < VISION_GAP) {
    return build(
      depth,
      personName,
      "vision",
      "problem",
      evidence,
      context,
      confidenceOf(depth, vision.laneGames),
      text("exercise.visionProblem"),
      tracking,
    );
  }
  if (ratio >= VISION_AHEAD) {
    return build(
      depth,
      personName,
      "vision",
      "strength",
      evidence,
      context,
      confidenceOf(depth, vision.laneGames),
      text("exercise.visionStrength"),
      tracking,
    );
  }
  return null;
}

function deathsDiagnosis(
  depth: PlayerDepth,
  personName: string,
  breakdown: DeathBreakdown,
  teamDeathsPerGame: number | null,
  rosterDeathsPerPerson: number | null,
  context: DiagnosisContext,
): PlayerDiagnosis | null {
  const perGame = depth.summary.deathsPerGame;
  if (perGame === null) return null;

  const evidence: DiagnosisEvidence[] = [
    {
      label: "deathsPerGame",
      value: round(perGame),
      unit: "perGame",
      source: text("source.games", { games: depth.games }),
    },
    {
      label: "groupDeathsPerGame",
      value: round(teamDeathsPerGame),
      unit: "perGame",
      source: text("source.rosterSameSide"),
    },
  ];
  const teamTracking = {
    metric: "teamDeathsPerGame" as const,
    current: round(teamDeathsPerGame),
    unit: "perGame" as const,
  };

  // §5, último parágrafo: o time inteiro morrendo é um problema do time, não de um jogador. A régua
  // é a média POR PESSOA; o total do grupo viaja na evidência.
  if (sharedResponsibility(perGame, rosterDeathsPerPerson) !== null) {
    return refused(
      depth,
      personName,
      "deaths",
      evidence,
      context,
      "teamDeaths",
      text("reason.deathsTeamPace"),
      text("exercise.deathsTeamPace"),
      teamTracking,
    );
  }

  // A pessoa morre bem mais que o grupo, mas em que tipo de morte? Só o recorte "sem aliado perto"
  // é individual o bastante para virar exercício. Se as mortes dela são em luta coletiva, o
  // problema é da luta, não dela (§4.3: morte isolada ≠ morte de decisão coletiva).
  if (breakdown.aloneShare === null || breakdown.games === 0) {
    return refused(
      depth,
      personName,
      "deaths",
      evidence,
      context,
      "notMeasured",
      text("reason.deathsNoTimeline"),
      text("exercise.deathsNoTimeline"),
      teamTracking,
    );
  }

  if (breakdown.aloneShare < ALONE_SHARE_ATTRIBUTABLE) {
    return refused(
      depth,
      personName,
      "deaths",
      evidence,
      context,
      "laneStructure",
      text("reason.deathsWithAllies", {
        share: round(breakdown.aloneShare, 0) ?? 0,
      }),
      text("exercise.deathsWithAllies"),
      teamTracking,
    );
  }

  return build(
    depth,
    personName,
    "deaths",
    "problem",
    evidence.concat([
      {
        label: "aloneDeaths",
        value: round(breakdown.aloneShare, 1),
        unit: "percent",
        source: text("source.gamesWithTimeline", { games: breakdown.games }),
      },
    ]),
    context,
    confidenceOf(depth, breakdown.games),
    text("exercise.deathsProblem"),
    {
      metric: "aloneDeathShare",
      current: round(breakdown.aloneShare, 1),
      unit: "percent",
    },
  );
}

function participationDiagnosis(
  depth: PlayerDepth,
  personName: string,
  summary: PlayerSummary,
  context: DiagnosisContext,
  timelineGames: number,
): PlayerDiagnosis | null {
  const kp = summary.killParticipation;
  if (kp === null) return null;

  const evidence: DiagnosisEvidence[] = [
    {
      label: "killParticipation",
      value: round(kp * 100, 1),
      unit: "percent",
      source: text("source.games", { games: depth.games }),
    },
  ];

  if (kp < KP_LOW) {
    // Sem timeline não se pode dizer se a pessoa ficou fora das lutas ou se as lutas aconteceram
    // longe dela: as duas coisas pedem exercícios opostos.
    if (timelineGames === 0) {
      return refused(
        depth,
        personName,
        "killParticipation",
        evidence,
        context,
        "notMeasured",
        text("reason.kpNoTimeline"),
        text("exercise.kpNoTimeline"),
        { metric: "killParticipation", current: round(kp * 100, 1), unit: "percent" },
      );
    }
    return build(
      depth,
      personName,
      "killParticipation",
      "problem",
      evidence,
      context,
      confidenceOf(depth, depth.games),
      text("exercise.kpProblem"),
      {
        metric: "killParticipation",
        current: round(kp * 100, 1),
        unit: "percent",
      },
    );
  }

  if (kp >= KP_HIGH) {
    return build(
      depth,
      personName,
      "killParticipation",
      "strength",
      evidence,
      context,
      confidenceOf(depth, depth.games),
      text("exercise.kpStrength"),
      {
        metric: "killParticipation",
        current: round(kp * 100, 1),
        unit: "percent",
      },
    );
  }

  return null;
}

function combatDiagnosis(
  depth: PlayerDepth,
  personName: string,
  combat: PlayerCombat,
  early: EarlyGame,
  context: DiagnosisContext,
): PlayerDiagnosis | null {
  const perDeath = combat.damagePerDeath;
  if (perDeath === null) return null;

  const evidence: DiagnosisEvidence[] = [
    {
      label: "damagePerDeath",
      value: Math.round(perDeath),
      unit: "points",
      source: text("source.games", { games: combat.games }),
    },
  ];

  if (perDeath < DAMAGE_PER_DEATH_LOW) {
    // Início de jogo perdido explica dano por morte baixo: cobrar eficiência de luta de quem entra
    // toda luta atrasado é atribuir ao jogador um problema de rota (§5, última linha).
    if ((early.at10.xpDiff ?? 0) <= -500) {
      return refused(
        depth,
        personName,
        "combat",
        evidence,
        context,
        "laneStructure",
        text("reason.combatLaneBehind"),
        text("exercise.combatLaneBehind"),
        { metric: "damagePerDeath", current: Math.round(perDeath), unit: "points" },
      );
    }
    return build(
      depth,
      personName,
      "combat",
      "problem",
      evidence,
      context,
      confidenceOf(depth, combat.games),
      text("exercise.combatProblem"),
      { metric: "damagePerDeath", current: Math.round(perDeath), unit: "points" },
    );
  }

  if (perDeath >= DAMAGE_PER_DEATH_HIGH) {
    return build(
      depth,
      personName,
      "combat",
      "strength",
      evidence,
      context,
      confidenceOf(depth, combat.games),
      text("exercise.combatStrength"),
      { metric: "damagePerDeath", current: Math.round(perDeath), unit: "points" },
    );
  }

  return null;
}

/**
 * O diagnóstico de cada jogador, com os sete campos do §5.3.
 *
 * A ordem é estável (farm, visão, mortes, participação, combate) para que a leitura não mude de
 * sessão para sessão. Um jogador pode ter mais de um aspecto a desenvolver: não há veredito único,
 * e o prompt proíbe justamente o "quem joga melhor".
 */
export function diagnoseRoster(
  input: DiagnosisInput,
  medianDuration: (depth: PlayerDepth) => number | null = () => null,
): PlayerDiagnosis[] {
  const out: PlayerDiagnosis[] = [];
  for (const depth of input.depths) {
    const personName =
      input.names.get(depth.person) ?? depth.person.slice(0, 8);
    const context = contextOf(depth, medianDuration(depth), input.fullGames ?? 0);
    const candidates = [
      farmingDiagnosis(depth, personName, depth.early, depth.summary, context),
      visionDiagnosis(depth, personName, depth.vision, context),
      deathsDiagnosis(
        depth,
        personName,
        depth.deaths,
        input.teamDeathsPerGame,
        input.rosterDeathsPerPerson ?? null,
        context,
      ),
      participationDiagnosis(
        depth,
        personName,
        depth.summary,
        context,
        depth.deaths?.games ?? 0,
      ),
      combatDiagnosis(depth, personName, depth.combat, depth.early, context),
    ];
    for (const candidate of candidates) {
      // Diagnósticos recusados (responsabilidade coletiva) também entram: a UI precisa mostrar
      // que a análise olhou para a pessoa, e dizer que a questão não é dela.
      if (candidate) out.push(candidate);
    }
  }
  return out;
}

/** Separa o que é do jogador do que é do time, para as duas seções da interface. */
export function splitDiagnoses(diagnoses: PlayerDiagnosis[]): {
  individual: PlayerDiagnosis[];
  shared: PlayerDiagnosis[];
} {
  return {
    individual: diagnoses.filter((entry) => entry.shared === null),
    shared: diagnoses.filter((entry) => entry.shared !== null),
  };
}

/**
 * Problemas, forças e o que não pôde ser medido. A interface (`§8.2`) mostra os três com pesos
 * diferentes; aqui a separação é feita uma vez, para os painéis não discordarem entre si.
 */
export function classifyDiagnoses(diagnoses: PlayerDiagnosis[]): {
  problems: PlayerDiagnosis[];
  strengths: PlayerDiagnosis[];
  unmeasured: PlayerDiagnosis[];
  shared: PlayerDiagnosis[];
} {
  return {
    problems: diagnoses.filter(
      (entry) => entry.shared === null && entry.kind === "problem",
    ),
    strengths: diagnoses.filter(
      (entry) => entry.shared === null && entry.kind === "strength",
    ),
    unmeasured: diagnoses.filter(
      (entry) => entry.shared !== null && entry.aspect !== "deaths",
    ),
    shared: diagnoses.filter(
      (entry) => entry.shared !== null && entry.aspect === "deaths",
    ),
  };
}
