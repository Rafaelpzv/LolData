/**
 * A timeline interativa do §8.4, na parte que tem regra: navegar por minuto, filtrar por jogador,
 * por tipo de evento e por objetivo, destacar momentos críticos, abrir a evidência de cada evento e
 * identificar sequências de acontecimentos.
 *
 * O componente só desenha o que este módulo decide. Manter a regra aqui tem dois motivos: ela é
 * testável sem DOM, e a mesma sequência ("morte seguida de objetivo perdido") não pode ser calculada
 * de um jeito na tela e de outro num relatório.
 *
 * Puro: sem I/O, sem React, sem Next.
 */
import type { KillKind } from "./timeline";

/** Um evento da partida, já normalizado: morte, abate do grupo ou objetivo. */
export interface TimelineEvent {
  /** `kills` ou `objectives` na partida de origem. */
  from: "kills" | "objectives" | "deaths";
  /** Segundos desde o início. */
  at: number;
  kind: string;
  x: number;
  y: number;
  /** Pessoa do elenco a quem o evento pertence; null quando é de alguém de fora. */
  person: string | null;
  /** Pessoas do grupo perto do evento (o próprio morto incluído, como a coleta grava). */
  near: number | null;
  /** Variante do objetivo (elemento do dragão, tier da torre) quando a Riot manda. */
  variant?: string | null;
  /** A morte virou objetivo perdido logo depois (só para mortes). */
  costly?: boolean;
}

export type EventFilter = "all" | "groupKill" | "groupDeath" | "fillKill" | "objective";

/** Os filtros que o §8.4 pede, na ordem em que aparecem na barra. */
export const EVENT_FILTERS: EventFilter[] = [
  "all",
  "groupKill",
  "groupDeath",
  "objective",
];

/**
 * Um evento pertence ao filtro escolhido?
 *
 * `fillKill` existe para quem quiser ver só o que o preenchimento fez, mas não entra em "abates do
 * grupo": misturar os dois faria a contagem por jogador incluir gente de fora do elenco.
 */
export function matchesFilter(event: TimelineEvent, filter: EventFilter): boolean {
  if (filter === "all") return true;
  if (filter === "objective") return event.from === "objectives";
  // Uma morte do mapa e uma morte de luta são o mesmo acontecimento visto de dois lados: quando o
  // filtro é "morte do grupo", as duas formas entram.
  if (filter === "groupDeath") {
    return event.from === "deaths" || event.kind === "groupDeath";
  }
  return event.kind === filter;
}

/** O evento interessa a esta pessoa? Null = todas as pessoas. */
export function matchesPerson(event: TimelineEvent, person: string | null): boolean {
  if (person === null) return true;
  return event.person === person;
}

/**
 * O evento está dentro do minuto escolhido?
 *
 * `minute: null` devolve tudo (a partida inteira). O minuto 0 cobre 0:00–0:59, e assim por diante:
 * a janela é sempre de 60 segundos, o que evita o "minuto 1" pular o 1:00 exato.
 */
export function matchesMinute(event: TimelineEvent, minute: number | null): boolean {
  if (minute === null) return true;
  return event.at >= minute * 60 && event.at < (minute + 1) * 60;
}

/**
 * Um evento como a partida guarda: o mesmo formato, sem o `from` — que é o campo que a coleta não
 * gravou e que `collectEvents` preenche ao juntar as três fontes. Os opcionais ficam opcionais aqui
 * também, porque um evento antigo pode não os ter.
 */
type RawEvent = {
  at: number;
  /** A morte do mapa não tem tipo na coleta: ela é a morte do grupo por definição. */
  kind?: string;
  x?: number;
  y?: number;
  person?: string | null;
  near?: number | null;
  variant?: string | null;
  costly?: boolean;
};

/** Todos os eventos de uma partida, numa lista só, em ordem de tempo. */
export function collectEvents(game: {
  kills?: RawEvent[];
  objectives?: RawEvent[];
  deaths?: RawEvent[];
}): TimelineEvent[] {
  // Os opcionais são normalizados aqui, uma vez: quem lê a lista não precisa repetir `?? null` nem
  // inventar posição para uma morte do mapa (a coleta grava a morte sem `kind`/`x`/`y`).
  const normalize = (event: RawEvent, from: TimelineEvent["from"]): TimelineEvent => ({
    from,
    at: event.at,
    kind: event.kind ?? (from === "deaths" ? "groupDeath" : ""),
    x: event.x ?? 0,
    y: event.y ?? 0,
    person: event.person ?? null,
    near: event.near ?? null,
    variant: event.variant ?? null,
    costly: event.costly === true,
  });
  return [
    ...(game.kills ?? []).map((event) => normalize(event, "kills")),
    ...(game.objectives ?? []).map((event) => normalize(event, "objectives")),
    ...(game.deaths ?? []).map((event) => normalize(event, "deaths")),
  ].sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/** Aplica os três filtros de uma vez, na ordem que gera menos trabalho. */
export function filterEvents(
  events: TimelineEvent[],
  options: { minute?: number | null; filter?: EventFilter; person?: string | null } = {},
): TimelineEvent[] {
  const { minute = null, filter = "all", person = null } = options;
  return events.filter(
    (event) =>
      matchesMinute(event, minute) &&
      matchesFilter(event, filter) &&
      matchesPerson(event, person),
  );
}

/**
 * Uma sequência: dois ou mais eventos que se explicam juntos. O caso que importa é a morte que vira
 * objetivo perdido, porque é isso que o time sente no placar — e é isso que o §8.4 chama de
 * "sequência de acontecimentos".
 */
export interface EventSequence {
  /** Identificador estável da REGRA, para a interface traduzir. */
  rule: "deathThenObjective";
  /**
   * Identidade única da sequência, para a interface usar como `key`.
   *
   * Não pode ser só `from-to`: dois jogadores que morrem no mesmo segundo e sofrem o mesmo objetivo
   * produzem exatamente o mesmo par de tempos, e o React recusa duas `key` iguais. O índice da morte
   * dentro da partida entra aqui porque duas mortes são dois acontecimentos, mesmo com os tempos
   * iguais.
   */
  id: string;
  /** Os eventos, em ordem. */
  events: TimelineEvent[];
  /** O morto da sequência: uma sequência é sobre quem morreu, não sobre o objetivo. */
  person: string | null;
  /** Quando começou e terminou, em segundos. */
  from: number;
  to: number;
}

/** Janela em que uma morte e o objetivo seguinte ainda são a MESMA sequência. */
export const SEQUENCE_WINDOW_MS = 60_000;

/** Uma sequência por OBJETIVO perdido, com as mortes que o antecederam na janela. */
export function findSequences(events: TimelineEvent[]): EventSequence[] {
  const deaths = events.filter(
    (event) => (event.from === "deaths" || event.kind === "groupDeath") && event.costly === true,
  );
  // O objetivo é a consequência: um objetivo perdido gera UMA sequência, e todas as mortes que
  // caíram na janela antes dele entram nela. Antes, cada morte virava uma sequência própria e duas
  // mortes na mesma luta repetiam o mesmo objetivo em duas linhas.
  const lost = events.filter((event) => event.from === "objectives");
  const out: EventSequence[] = [];
  for (const [objectiveIndex, consequence] of lost.entries()) {
    const before = deaths.filter(
      (death) =>
        death.at <= consequence.at &&
        (consequence.at - death.at) * 1000 <= SEQUENCE_WINDOW_MS,
    );
    // Objetivo sem morte "custosa" antes dele não é sequência: o evento continua na lista.
    if (before.length === 0) continue;
    out.push({
      rule: "deathThenObjective",
      id: `${consequence.at}-${objectiveIndex}`,
      events: [...before, consequence],
      person: before[0].person,
      from: before[0].at,
      to: consequence.at,
    });
  }
  return out;
}

/**
 * Os momentos críticos da partida, para o destaque do §8.4.
 *
 * "Crítico" não é adjetivo: é o ponto em que a diferença de ouro muda de sinal de forma duradoura, ou
 * em que o time leva a maior queda da partida. As duas regras vêm do que a partida registrou, e cada
 * uma diz por quê — o destaque nunca aparece sem explicação.
 */
export interface CriticalMoment {
  at: number;
  rule: "leadFlipped" | "biggestSwing";
  /** A diferença de ouro no momento, em unidades do jogo. */
  goldDiff: number;
}

/** Abaixo disto a diferença de ouro é ruído de troca de lane, não liderança. */
export const LEAD_THRESHOLD = 1_500;

export function criticalMoments(
  goldDiff: readonly [number, number][],
): CriticalMoment[] {
  const out: CriticalMoment[] = [];
  if (goldDiff.length < 2) return out;

  // A virada de liderança: o primeiro ponto em que a diferença passa do limiar vindo do outro lado.
  let leading: 1 | -1 | 0 = 0;
  for (const [at, diff] of goldDiff) {
    const side: 1 | -1 | 0 =
      diff >= LEAD_THRESHOLD ? 1 : diff <= -LEAD_THRESHOLD ? -1 : 0;
    if (side === 0) continue;
    if (leading !== 0 && side !== leading) {
      out.push({ at, rule: "leadFlipped", goldDiff: diff });
    }
    leading = side;
  }

  // A maior queda: o passo mais negativo entre dois pontos consecutivos.
  let worst = { at: 0, drop: 0 };
  for (let index = 1; index < goldDiff.length; index += 1) {
    const drop = goldDiff[index][1] - goldDiff[index - 1][1];
    if (drop < worst.drop) worst = { at: goldDiff[index][0], drop };
  }
  if (worst.drop < 0) {
    out.push({
      at: worst.at,
      rule: "biggestSwing",
      goldDiff: goldDiff.find(([at]) => at === worst.at)?.[1] ?? 0,
    });
  }

  // Em ordem de tempo e sem repetir o mesmo instante pela mesma regra.
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.at - b.at || a.rule.localeCompare(b.rule))
    .filter((moment) => {
      const key = `${moment.at}:${moment.rule}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Os minutos que a partida tem, para a navegação: 0 até o último minuto iniciado. */
export function minuteRange(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const last = Math.floor(duration / 60);
  return Array.from({ length: last + 1 }, (_, index) => index);
}

/** A contagem de eventos por tipo, para a barra de filtros mostrar o que há sem abrir nada. */
export function countByFilter(events: TimelineEvent[]): Record<EventFilter, number> {
  return {
    all: events.length,
    groupKill: events.filter((event) => matchesFilter(event, "groupKill")).length,
    groupDeath: events.filter((event) => matchesFilter(event, "groupDeath")).length,
    objective: events.filter((event) => matchesFilter(event, "objective")).length,
    fillKill: events.filter((event) => matchesFilter(event, "fillKill")).length,
  };
}

/** O tipo de abate que o evento representa, para o rótulo; null quando não é abate. */
export function killKindOf(event: TimelineEvent): KillKind | null {
  if (event.from !== "kills") return null;
  return event.kind === "groupKill" ||
    event.kind === "groupDeath" ||
    event.kind === "fillKill"
    ? event.kind
    : null;
}
