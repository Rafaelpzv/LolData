/**
 * Padrões recorrentes: hábitos que aparecem de novo e de novo (§4).
 *
 * A pergunta que este módulo responde não é "quantas mortes tivemos" — isso a Etapa 2 já responde.
 * É "que comportamento explica esse número", e com que frequência ele se repete.
 *
 * Três regras, todas do prompt:
 *  - §4.5 lista nove campos por padrão: descrição, frequência, partidas, eventos, período,
 *    comparação com a janela anterior, intervalo de confiança, limitações e exemplos de partidas.
 *    Um padrão sem esses campos não é um padrão: é uma impressão.
 *  - §4.2 e §4.5: "não apresente correlações como causas comprovadas". Por isso o campo se chama
 *    `limitations` e é obrigatório — todo padrão declara o que não prova.
 *  - §4.3: "defina claramente os critérios de distância e tempo utilizados". Os critérios saem de
 *    `config.ts` e viajam com o padrão, em `criteria`.
 *
 * Puro: sem I/O, sem Supabase, sem Next.
 */
import {
  CONVERSION_WINDOW,
  DEATHS_BEFORE_OBJECTIVE,
  LEAD_GOLD,
  NEARBY_DISTANCE,
  OBJECTIVE_PRESENCE_PLAYERS,
  PREPARATION_WINDOW,
} from "./config";
import type { ChangeAnalysis } from "./inference";
import { compareWindows } from "./inference";
import { text, type Text } from "./i18n";
import {
  mean,
  median,
  proportion,
  spread,
  type Proportion,
  type Spread,
} from "./stats";
import type { PremadeTimeline, TimelineKill, TimelineObjective } from "./timeline";
import type { PremadeMatchSample } from "./types";

/** Os critérios de régua que um padrão pode declarar (§4.3). */
export type PatternCriterionId =
  | "minPlayers"
  | "proximityRadius"
  | "beforeObjectiveWindow"
  | "killCluster"
  | "conversionWindow"
  | "relevantLead"
  | "togetherRadius"
  | "collapseFactor";

/** A unidade de um critério ou de uma evidência. */
export type PatternUnit = "seconds" | "gold" | "units" | "players";

/** Os quatro eixos do §4: objetivos, conversão, sincronização, consistência. */
export type PatternArea =
  | "objectives"
  | "conversion"
  | "synchronization"
  | "consistency";

/**
 * Quão bem sustentado é o padrão. `recurring` exige repetição em jogos suficientes: um evento
 * isolado é um episódio, não um hábito (§4, primeira frase).
 */
export type PatternStrength = "recurring" | "suggestive" | "insufficient";

/** Um jogo que exemplifica o padrão, para o leitor conferir por conta própria. */
export interface PatternExample {
  matchId: string;
  /** Valor do padrão neste jogo, na unidade do padrão. */
  value: number;
  /** O que aconteceu, em uma frase: chave em `premade.patterns.items.<id>.examples` + valores. */
  note: Text;
}

/**
 * Um padrão recorrente, com os nove campos do §4.5.
 */
export interface RecurringPattern {
  /** Chave estável: `premade.patterns.items.<id>.title`, `.behavior` e `.limitations`. */
  id: string;
  area: PatternArea;
  strength: PatternStrength;
  /** §4.5 "Descrição": o que o padrão diz, em uma frase. Traduzido na interface. */
  title: Text;
  /** O comportamento por trás do número, não o número em si. */
  behavior: Text;
  /** §4.5 "Frequência": em quantos jogos o padrão aparece, e de quantos. */
  frequency: Proportion;
  /** §4.5 "Quantidade de partidas". */
  games: number;
  /** §4.5 "Quantidade de eventos": coisas contadas, não jogos. */
  events: number;
  /** §4.5 "Período analisado". */
  period: { from: number | null; to: number | null; days: number };
  /**
   * §4.5 "Comparação com a janela anterior". Null quando não há janela anterior com dados: ausência
   * de comparação é informação, não zero.
   */
  change: ChangeAnalysis | null;
  /** §4.5 "Intervalo de confiança, quando aplicável": o Wilson 95% da frequência. */
  interval: { low: number; high: number };
  /** §4.5 "Limitações": o que este padrão NÃO prova. Nunca vazio. */
  limitations: Text[];
  /** §4.5 "Exemplos de partidas". */
  examples: PatternExample[];
  /**
   * §4.3 "Defina claramente os critérios de distância e tempo": a régua usada, em números.
   * Vazio quando o padrão não depende de tempo nem de posição.
   */
  criteria: { id: PatternCriterionId; value: number; unit: PatternUnit }[];
  /** A média do padrão no conjunto, na unidade dele (fração, contagem, segundos). */
  value: number | null;
  /** Média da janela anterior, para o leitor ver de onde a comparação vem. */
  previous: number | null;
}

/** O que entra: os jogos e as timelines da janela recente, mais os da janela anterior. */
export interface PatternInput {
  recent: { matches: PremadeMatchSample[]; timelines: PremadeTimeline[] };
  previous: { matches: PremadeMatchSample[]; timelines: PremadeTimeline[] };
}

// ---------------------------------------------------------------------------------------------
// Leitura por jogo
// ---------------------------------------------------------------------------------------------

/** Leitura de UM jogo, nos termos que todos os padrões usam. */
interface GameReading {
  matchId: string;
  win: boolean;
  duration: number;
  /** When the game was played, for the "period analysed" field of §4.5. */
  gameCreation: number;
  /** Fração dos objetivos do grupo em que havia pelo menos `OBJECTIVE_PRESENCE_PLAYERS` pessoas. */
  preparedObjectives: number | null;
  /** Objetivos tomados em que o grupo estava em número insuficiente. */
  unpreparedCount: number;
  objectiveCount: number;
  /** Abates do grupo que viraram objetivo dentro da janela de conversão. */
  convertedKills: number;
  /** Sequências de 2+ abates na janela, e quantas delas não terminaram em captura. */
  clusterCount: number;
  unconvertedClusters: number;
  killCount: number;
  /** Fração das mortes do grupo que foram isoladas (sem aliado por perto). */
  isolatedShare: number | null;
  deathCount: number;
  /** Vantagem máxima de ouro e resultado: esteve na frente e perdeu? */
  peakLead: number;
  /** Mortes do grupo nos 30/60/90 s antes de um dragão ou barão. */
  deathsBefore30: number;
  deathsBefore60: number;
  deathsBefore90: number;
}

function withinWindow(
  events: readonly { at: number }[],
  from: number,
  to: number,
): number {
  return events.filter((event) => event.at > from && event.at <= to).length;
}

function peakLead(goldDiff: readonly [number, number][]): number {
  let peak = 0;
  for (const [, value] of goldDiff) peak = Math.max(peak, value);
  return peak;
}

/**
 * Uma morte é isolada quando nenhum outro jogador do grupo estava perto do corpo.
 *
 * A fonte preferida é `timeline.deaths`, que tem o corpo de todo mundo. Timelines coletadas antes
 * desse campo (ou de times com elenco incompleto) trazem só os `groupDeath` de `kills`: usar aqueles
 * como se fossem a lista inteira faria o time parecer sem mortes, então a queda é declarada.
 */
function isolatedRate(timeline: PremadeTimeline): {
  share: number | null;
  count: number;
  deaths: number;
} {
  const groupDeaths = timeline.kills.filter((kill) => kill.kind === "groupDeath");
  const source =
    timeline.deaths && timeline.deaths.length > 0
      ? timeline.deaths
      : // Fallback: `near` do kill conta o grupo em volta do corpo, mesma definição.
        groupDeaths;
  if (source.length === 0) return { share: null, count: 0, deaths: 0 };
  // `near` conta o próprio morto, então 1 significa "sozinho".
  const alone = source.filter((death) => death.near <= 1).length;
  return { share: alone / source.length, count: alone, deaths: source.length };
}

function readGame(
  match: PremadeMatchSample,
  timeline: PremadeTimeline,
): GameReading {
  const objectives: TimelineObjective[] = timeline.objectives;
  const majorObjectives = objectives.filter(
    (objective) => objective.kind === "dragon" || objective.kind === "baron",
  );
  const prepared = majorObjectives.filter(
    (objective) => objective.near >= OBJECTIVE_PRESENCE_PLAYERS,
  ).length;

  const deaths = timeline.kills.filter((kill) => kill.kind === "groupDeath");
  const kills = timeline.kills.filter((kill) => kill.kind !== "groupDeath");

  // Conversão: uma sequência converteu quando o grupo tomou algum objetivo dentro da janela.
  // Os abates são agrupados: dois abates a 5 s de distância são a MESMA luta, não duas chances.
  const sortedKills = [...kills].sort((a, b) => a.at - b.at);
  const clusters: TimelineKill[][] = [];
  for (const kill of sortedKills) {
    const last = clusters.at(-1);
    if (last && kill.at - last[last.length - 1].at <= CLUSTER_GAP) {
      last.push(kill);
    } else {
      clusters.push([kill]);
    }
  }
  let converted = 0;
  let convertedClusters = 0;
  let realClusters = 0;
  for (const cluster of clusters) {
    const first = cluster[0].at;
    const lastAt = cluster[cluster.length - 1].at;
    const took = objectives.some(
      (objective) =>
        objective.at >= first && objective.at <= lastAt + CONVERSION_WINDOW,
    );
    if (took) {
      converted += cluster.length;
      convertedClusters += 1;
    }
    if (cluster.length >= KILL_CLUSTER) realClusters += 1;
  }
  let before30 = 0;
  let before60 = 0;
  let before90 = 0;
  for (const objective of majorObjectives) {
    before30 += withinWindow(deaths, objective.at - 30, objective.at);
    before60 += withinWindow(deaths, objective.at - 60, objective.at);
    before90 += withinWindow(deaths, objective.at - 90, objective.at);
  }

  const isolated = isolatedRate(timeline);

  return {
    matchId: match.matchId,
    win: match.win,
    duration: timeline.duration || match.duration || 0,
    gameCreation: match.gameCreation ?? 0,
    preparedObjectives:
      majorObjectives.length > 0 ? prepared / majorObjectives.length : null,
    unpreparedCount: majorObjectives.length - prepared,
    objectiveCount: majorObjectives.length,
    convertedKills: converted,
    // Só as sequências grandes contam como "chance de conversão": um abate solto não oferece nada.
    clusterCount: realClusters,
    unconvertedClusters: realClusters - convertedClusters,
    killCount: kills.length,
    isolatedShare: isolated.share,
    deathCount: isolated.deaths,
    peakLead: peakLead(timeline.goldDiff),
    deathsBefore30: before30,
    deathsBefore60: before60,
    deathsBefore90: before90,
  };
}

function readWindow(input: {
  matches: PremadeMatchSample[];
  timelines: PremadeTimeline[];
}): GameReading[] {
  const byId = new Map(input.matches.map((match) => [match.matchId, match]));
  const readings: GameReading[] = [];
  for (const timeline of input.timelines) {
    const match = byId.get(timeline.matchId);
    // A timeline without its match has no result to read: reading it as a loss would bias every rate.
    if (!match) continue;
    readings.push(readGame(match, timeline));
  }
  return readings;
}

// ---------------------------------------------------------------------------------------------
// Construção dos padrões
// ---------------------------------------------------------------------------------------------

/** Jogos mínimos para tratar algo como hábito e não como episódio. */
const MIN_GAMES_FOR_PATTERN = 5;
/** Repetições mínimas do comportamento dentro da janela. */
const MIN_OCCURRENCES_FOR_PATTERN = 3;
/**
 * Abates a menos de `CLUSTER_GAP` segundos entre si são a mesma luta. Sem agrupar, um 12–2 viraria
 * sete "chances de conversão" que na verdade foram uma só.
 */
const CLUSTER_GAP = 20;
/** Abates numa luta que já oferecem vantagem numérica suficiente para pressionar. */
const KILL_CLUSTER = 2;
/**
 * Um jogo com mais de `COLLAPSE_FACTOR` vezes a mediana de mortes da janela é uma partida fora do
 * padrão do grupo. O fator é honestamente grosseiro: separa "jogo ruim" de "jogo desandado" sem
 * fingir precisão estatística que 20 amostras não dão.
 */
const COLLAPSE_FACTOR = 1.5;

function periodOf(readings: GameReading[]): {
  from: number | null;
  to: number | null;
  days: number;
} {
  const days = new Set<string>();
  let from: number | null = null;
  let to: number | null = null;
  for (const reading of readings) {
    if (reading.gameCreation <= 0) continue;
    from = from === null ? reading.gameCreation : Math.min(from, reading.gameCreation);
    to = to === null ? reading.gameCreation : Math.max(to, reading.gameCreation);
    days.add(new Date(reading.gameCreation).toISOString().slice(0, 10));
  }
  return { from, to, days: days.size };
}

/**
 * Monta os padrões a partir das duas janelas.
 *
 * Um padrão só é `recurring` quando aparece em pelo menos `MIN_OCCURRENCES_FOR_PATTERN` jogos de
 * uma janela com pelo menos `MIN_GAMES_FOR_PATTERN`: abaixo disso é `suggestive`, e o padrão diz
 * isso em vez de apresentar um caso isolado como hábito.
 */
export function buildPatterns(input: PatternInput): RecurringPattern[] {
  const recent = readWindow(input.recent);
  const previous = readWindow(input.previous);
  if (recent.length === 0) return [];

  const patterns: RecurringPattern[] = [];

  /** Fábrica comum: aplica a mesma régua de força e monta os nove campos. */
  const add = (
    spec: {
      id: string;
      area: PatternArea;
      title: Text;
      behavior: Text;
      limitations: Text[];
      criteria?: RecurringPattern["criteria"];
    },
    pick: (reading: GameReading) => {
      /** O jogo exibiu o comportamento? */
      occurred: boolean;
      /** Valor para a média do padrão. */
      value: number | null;
      /** Eventos contados neste jogo, para o total. */
      events: number;
      /** O que aconteceu neste jogo, em uma frase traduzível. */
      note: Text;
    },
  ) => {
    const hits = recent.map((reading) => ({ reading, ...pick(reading) }));
    const positives = hits.filter((entry) => entry.occurred);
    const eventTotal = hits.reduce((sum, entry) => sum + entry.events, 0);

    // A comparação usa uma observação por jogo, não o total: totais crescem com o número de jogos.
    const nowValues = hits
      .map((entry) => entry.value)
      .filter((value): value is number => value !== null);
    const beforeValues = previous
      .map((reading) => pick(reading).value)
      .filter((value): value is number => value !== null);
    const change =
      nowValues.length > 0 && beforeValues.length > 0
        ? compareWindows(beforeValues, nowValues)
        : null;

    const frequency = proportion(positives.length, recent.length);
    const strength: PatternStrength =
      recent.length < MIN_GAMES_FOR_PATTERN ||
      positives.length < MIN_OCCURRENCES_FOR_PATTERN
        ? "suggestive"
        : "recurring";

    patterns.push({
      id: spec.id,
      area: spec.area,
      strength,
      title: spec.title,
      behavior: spec.behavior,
      frequency,
      games: recent.length,
      events: eventTotal,
      period: periodOf(recent),
      change,
      // Sem jogos não há intervalo para mostrar: 0–0 é a leitura de "nenhuma estimativa", e a
      // frequência em si já vem nula (`rate`), então a UI nunca exibe um percentual inventado.
      interval: {
        low: frequency.low ?? 0,
        high: frequency.high ?? 0,
      },
      limitations: spec.limitations,
      examples: positives
        .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))
        .slice(0, 3)
        .map((entry) => ({
          matchId: entry.reading.matchId,
          value: entry.value ?? 0,
          note: entry.note,
        })),
      criteria: spec.criteria ?? [],
      value: mean(nowValues),
      previous: mean(beforeValues),
    });
  };

  // --- §4.1 Objetivos: chegar sem gente ------------------------------------------------
  add(
    {
      id: "unpreparedObjectives",
      area: "objectives",
      title: text("items.unpreparedObjectives.title"),
      behavior: text("items.unpreparedObjectives.behavior", {
        players: OBJECTIVE_PRESENCE_PLAYERS,
      }),
      limitations: [
        text("items.unpreparedObjectives.limitations.sampling"),
        text("items.unpreparedObjectives.limitations.position"),
      ],
      criteria: [
        { id: "minPlayers", value: OBJECTIVE_PRESENCE_PLAYERS, unit: "players" },
        { id: "proximityRadius", value: NEARBY_DISTANCE, unit: "units" },
      ],
    },
    (reading) => ({
      occurred: reading.unpreparedCount > 0,
      value: reading.preparedObjectives,
      events: reading.unpreparedCount,
      note: text("items.unpreparedObjectives.note", {
        unprepared: reading.unpreparedCount,
        objectives: reading.objectiveCount,
      }),
    }),
  );

  // --- §4.1 Objetivos: chegar atrasado (mortes antes do objetivo) ----------------------
  add(
    {
      id: "deathsBeforeObjectives",
      area: "objectives",
      title: text("items.deathsBeforeObjectives.title"),
      behavior: text("items.deathsBeforeObjectives.behavior", {
        seconds: PREPARATION_WINDOW,
      }),
      limitations: [
        text("items.deathsBeforeObjectives.limitations.cause"),
        text("items.deathsBeforeObjectives.limitations.window", {
          seconds: PREPARATION_WINDOW,
        }),
      ],
      criteria: [
        { id: "beforeObjectiveWindow", value: PREPARATION_WINDOW, unit: "seconds" },
      ],
    },
    (reading) => {
      const perObjective =
        reading.objectiveCount > 0
          ? reading.deathsBefore60 / reading.objectiveCount
          : null;
      return {
        occurred: reading.deathsBefore60 > 0,
        value: perObjective,
        events: reading.deathsBefore60,
        note: text("items.deathsBeforeObjectives.note", {
          deaths: reading.deathsBefore60,
          seconds: PREPARATION_WINDOW,
        }),
      };
    },
  );

  // --- §4.2 Conversão: abates que não viraram nada -------------------------------------
  // O critério é "abates suficientes para oferecer vantagem, sem nenhuma captura na sequência".
  // Contar abate a abate daria 100% em todo time — perder um abate isolado é normal e não diz nada
  // sobre conversão. O prompt pede o comportamento, não a trivia do jogo.
  add(
    {
      id: "killsWithoutConversion",
      area: "conversion",
      title: text("items.killsWithoutConversion.title"),
      behavior: text("items.killsWithoutConversion.behavior"),
      limitations: [
        text("items.killsWithoutConversion.limitations.notEveryCluster"),
        text("items.killsWithoutConversion.limitations.availability"),
      ],
      criteria: [
        { id: "killCluster", value: KILL_CLUSTER, unit: "players" },
        { id: "conversionWindow", value: CONVERSION_WINDOW, unit: "seconds" },
      ],
    },
    (reading) => ({
      occurred: reading.unconvertedClusters > 0,
      value:
        reading.clusterCount > 0
          ? reading.unconvertedClusters / reading.clusterCount
          : null,
      events: reading.unconvertedClusters,
      note: text("items.killsWithoutConversion.note", {
        unconverted: reading.unconvertedClusters,
        clusters: reading.clusterCount,
      }),
    }),
  );

  // --- §4.2 Conversão: esteve na frente e perdeu ----------------------------------------
  add(
    {
      id: "leadNotConverted",
      area: "conversion",
      title: text("items.leadNotConverted.title"),
      behavior: text("items.leadNotConverted.behavior"),
      limitations: [
        text("items.leadNotConverted.limitations.notAlwaysError"),
        text("items.leadNotConverted.limitations.peakGold"),
      ],
      criteria: [{ id: "relevantLead", value: LEAD_GOLD, unit: "gold" }],
    },
    (reading) => ({
      occurred: reading.peakLead >= LEAD_GOLD,
      value: reading.peakLead,
      events: reading.peakLead >= LEAD_GOLD ? 1 : 0,
      note: text("items.leadNotConverted.note", {
        gold: Math.round(reading.peakLead),
      }),
    }),
  );

  // --- §4.3 Sincronização: mortes isoladas ---------------------------------------------
  add(
    {
      id: "isolatedDeaths",
      area: "synchronization",
      title: text("items.isolatedDeaths.title"),
      behavior: text("items.isolatedDeaths.behavior"),
      limitations: [
        text("items.isolatedDeaths.limitations.farIsNotWrong"),
        text("items.isolatedDeaths.limitations.sampling"),
      ],
      criteria: [
        { id: "togetherRadius", value: NEARBY_DISTANCE, unit: "units" },
      ],
    },
    (reading) => ({
      occurred: (reading.isolatedShare ?? 0) > DEATHS_BEFORE_OBJECTIVE / 2,
      value: reading.isolatedShare,
      events: 0,
      note: text("items.isolatedDeaths.note", {
        share: Math.round((reading.isolatedShare ?? 0) * 100),
      }),
    }),
  );

  // --- §4.4 Consistência: jogos muito abaixo do próprio padrão --------------------------
  // Não basta "as mortes variam" — todo time varia, e isso seria verdade por definição. O hábito
  // é ter partidas que desabam em relação ao costume do próprio grupo, então o corte é a mediana
  // desta janela, calculada antes de julgar cada jogo.
  const baseline = median(recent.map((reading) => reading.deathCount));
  if (baseline !== null && baseline > 0) {
    const collapseLine = baseline * COLLAPSE_FACTOR;
    add(
      {
        id: "collapseGames",
        area: "consistency",
        title: text("items.collapseGames.title"),
        behavior: text("items.collapseGames.behavior"),
        limitations: [
          text("items.collapseGames.limitations.duration"),
          text("items.collapseGames.limitations.smallSample"),
        ],
        criteria: [{ id: "collapseFactor", value: COLLAPSE_FACTOR, unit: "units" }],
      },
      (reading) => ({
        occurred: reading.deathCount > collapseLine,
        value: reading.deathCount,
        events: reading.deathCount > collapseLine ? 1 : 0,
        note: text("items.collapseGames.note", {
          deaths: reading.deathCount,
          median: Math.round(baseline),
        }),
      }),
    );
  }

  return patterns;
}

/**
 * A dispersão de mortes por partida (§4.4): média, mediana e desvio, com o tamanho da amostra.
 * Separado porque não é "um jogo expos o comportamento", é uma propriedade do conjunto.
 */
export function deathSpread(input: PatternInput): {
  recent: Spread & { games: number };
  previous: Spread & { games: number };
} {
  const read = (window: PatternInput["recent"]) => {
    const values = readWindow(window).map((reading) => reading.deathCount);
    // `spread` já traz média, mediana, quartis e desvio: nada a recalcular aqui.
    return { ...spread(values), games: values.length };
  };
  return { recent: read(input.recent), previous: read(input.previous) };
}
