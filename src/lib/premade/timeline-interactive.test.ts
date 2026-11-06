import { describe, expect, it } from "vitest";

import {
  LEAD_THRESHOLD,
  SEQUENCE_WINDOW_MS,
  collectEvents,
  countByFilter,
  criticalMoments,
  filterEvents,
  findSequences,
  killKindOf,
  matchesFilter,
  matchesMinute,
  matchesPerson,
  minuteRange,
  type TimelineEvent,
} from "./timeline-interactive";

/**
 * Um evento como a PARTIDA guarda: sem `from`, porque a coleta não grava de qual fonte veio —
 * `collectEvents` é quem preenche isso ao juntar abates, objetivos e mortes.
 */
function raw(overrides: Partial<TimelineEvent> & { at: number }) {
  const built = event(overrides);
  // `from` sai por construção: é o campo que a coleta não grava.
  const { from, ...rest } = built;
  void from;
  return rest;
}

function event(overrides: Partial<TimelineEvent> & { at: number }): TimelineEvent {
  return {
    from: "kills",
    kind: "groupKill",
    x: 0,
    y: 0,
    person: null,
    near: null,
    ...overrides,
  };
}

describe("matchesMinute", () => {
  it("covers exactly sixty seconds per minute", () => {
    // 0:00–0:59 é o minuto 0; 1:00 cai no minuto 1, nunca nos dois.
    expect(matchesMinute(event({ at: 0 }), 0)).toBe(true);
    expect(matchesMinute(event({ at: 59 }), 0)).toBe(true);
    expect(matchesMinute(event({ at: 60 }), 0)).toBe(false);
    expect(matchesMinute(event({ at: 60 }), 1)).toBe(true);
    expect(matchesMinute(event({ at: 119 }), 1)).toBe(true);
    expect(matchesMinute(event({ at: 120 }), 1)).toBe(false);
  });

  it("shows the whole game when no minute is chosen", () => {
    expect(matchesMinute(event({ at: 1_234 }), null)).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("keeps everything on 'all'", () => {
    expect(matchesFilter(event({ at: 1 }), "all")).toBe(true);
    expect(
      matchesFilter(event({ at: 1, from: "objectives", kind: "dragon" }), "all"),
    ).toBe(true);
  });

  it("reads a group death from both sides of the collection", () => {
    // A morte do mapa (`deaths`) e a morte de luta (`kills`) são o mesmo acontecimento.
    expect(matchesFilter(event({ at: 1, from: "deaths", kind: "groupDeath" }), "groupDeath")).toBe(
      true,
    );
    expect(matchesFilter(event({ at: 1, kind: "groupDeath" }), "groupDeath")).toBe(true);
    expect(matchesFilter(event({ at: 1, kind: "groupKill" }), "groupDeath")).toBe(false);
  });

  it("does not mix filling accounts into the group kills", () => {
    expect(matchesFilter(event({ at: 1, kind: "fillKill" }), "groupKill")).toBe(false);
    expect(matchesFilter(event({ at: 1, kind: "fillKill" }), "fillKill")).toBe(true);
  });

  it("finds every objective whatever its kind", () => {
    for (const kind of ["dragon", "herald", "baron", "tower"]) {
      expect(
        matchesFilter(event({ at: 1, from: "objectives", kind }), "objective"),
      ).toBe(true);
    }
  });
});

describe("matchesPerson", () => {
  it("keeps everyone when no person is chosen", () => {
    expect(matchesPerson(event({ at: 1, person: "ana" }), null)).toBe(true);
  });

  it("keeps only that person's events", () => {
    expect(matchesPerson(event({ at: 1, person: "ana" }), "ana")).toBe(true);
    expect(matchesPerson(event({ at: 1, person: "bia" }), "ana")).toBe(false);
    // Um evento sem pessoa (preenchimento) não é de ninguém do elenco.
    expect(matchesPerson(event({ at: 1, person: null }), "ana")).toBe(false);
  });
});

describe("collectEvents", () => {
  it("merges the three sources in time order", () => {
    const events = collectEvents({
      kills: [raw({ at: 300, kind: "groupKill" })],
      objectives: [
        raw({ at: 120, from: "objectives", kind: "dragon" }),
      ],
      deaths: [raw({ at: 200, from: "deaths", kind: "groupDeath" })],
    });
    expect(events.map((entry) => entry.at)).toEqual([120, 200, 300]);
    expect(events.map((entry) => entry.from)).toEqual([
      "objectives",
      "deaths",
      "kills",
    ]);
  });

  it("survives a game with no events at all", () => {
    expect(collectEvents({})).toEqual([]);
  });

  it("puts simultaneous events in a stable order", () => {
    // Dois eventos no mesmo segundo: a ordem não pode mudar entre duas leituras (§10, eventos
    // simultâneos). O desempate é pelo tipo.
    const a = collectEvents({
      kills: [raw({ at: 60, kind: "groupKill" })],
      objectives: [raw({ at: 60, from: "objectives", kind: "dragon" })],
    });
    const b = collectEvents({
      objectives: [raw({ at: 60, from: "objectives", kind: "dragon" })],
      kills: [raw({ at: 60, kind: "groupKill" })],
    });
    expect(a.map((e) => e.kind)).toEqual(b.map((e) => e.kind));
  });
});

describe("filterEvents", () => {
  const events = collectEvents({
    kills: [
      raw({ at: 130, kind: "groupKill", person: "ana" }),
      raw({ at: 140, kind: "groupDeath", person: "bia" }),
      raw({ at: 150, kind: "fillKill", person: null }),
    ],
    objectives: [raw({ at: 200, from: "objectives", kind: "dragon" })],
  });

  it("applies the minute, the type and the person together", () => {
    expect(filterEvents(events, { minute: 2 })).toHaveLength(3);
    expect(filterEvents(events, { minute: 2, filter: "groupKill" })).toHaveLength(1);
    expect(
      filterEvents(events, { minute: 2, filter: "groupKill", person: "ana" }),
    ).toHaveLength(1);
    expect(
      filterEvents(events, { minute: 2, filter: "groupKill", person: "bia" }),
    ).toHaveLength(0);
  });

  it("returns the whole game with no options", () => {
    expect(filterEvents(events)).toHaveLength(4);
  });
});

describe("countByFilter", () => {
  it("counts each kind without double counting the two death views", () => {
    const events = collectEvents({
      kills: [
        raw({ at: 100, kind: "groupKill" }),
        raw({ at: 110, kind: "groupDeath" }),
      ],
      deaths: [raw({ at: 110, from: "deaths", kind: "groupDeath" })],
      objectives: [raw({ at: 200, from: "objectives", kind: "baron" })],
    });
    const counts = countByFilter(events);
    expect(counts.all).toBe(4);
    expect(counts.objective).toBe(1);
    // A morte aparece nas duas fontes e é contada duas vezes na lista, mas o filtro de morte
    // é o mesmo: o número mostra o que o filtro devolveria, não o que a partida contém.
    expect(counts.groupDeath).toBe(2);
  });
});

describe("findSequences", () => {
  it("pairs a costly death with the objective taken right after it", () => {
    const death = event({
      at: 600,
      from: "deaths",
      kind: "groupDeath",
      costly: true,
    });
    const dragon = event({ at: 630, from: "objectives", kind: "dragon" });
    const sequences = findSequences([death, dragon]);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].rule).toBe("deathThenObjective");
    expect(sequences[0].from).toBe(600);
    expect(sequences[0].to).toBe(630);
  });

  it("refuses the pair when the objective is outside the window", () => {
    // 61 s depois, acima dos 60 s: já não é a mesma jogada.
    const death = event({ at: 600, from: "deaths", kind: "groupDeath", costly: true });
    const late = event({ at: 661, from: "objectives", kind: "dragon" });
    expect(findSequences([death, late])).toHaveLength(0);
    expect(SEQUENCE_WINDOW_MS).toBe(60_000);
  });

  it("ignores a death that was not costly", () => {
    // Sem consequência marcada, não há sequência para mostrar: o evento continua na lista.
    const death = event({ at: 600, from: "deaths", kind: "groupDeath", costly: false });
    const dragon = event({ at: 615, from: "objectives", kind: "dragon" });
    expect(findSequences([death, dragon])).toHaveLength(0);
  });

  it("ignores an objective that happened before the death", () => {
    const dragon = event({ at: 500, from: "objectives", kind: "dragon" });
    const death = event({ at: 600, from: "deaths", kind: "groupDeath", costly: true });
    expect(findSequences([dragon, death])).toHaveLength(0);
  });

  it("gives every sequence a unique id — the bug React reported", () => {
    // Dois jogadores morrem no MESMO segundo e o mesmo dragão é perdido depois. Antes, cada morte
    // virava uma sequência com os mesmos tempos (2280 → 2312), o React recusava as duas `key` iguais
    // e avisava no console. Duas mortes, um objetivo: uma sequência só.
    const first = event({
      at: 2_280,
      from: "deaths",
      kind: "groupDeath",
      costly: true,
      person: "ana",
    });
    const second = event({
      at: 2_280,
      from: "deaths",
      kind: "groupDeath",
      costly: true,
      person: "bia",
    });
    const dragon = event({ at: 2_312, from: "objectives", kind: "dragon" });
    const sequences = findSequences([first, second, dragon]);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].id).toBe("2312-0");
    // O episódio nomeia as duas mortes: quem morreu foi o grupo, não um jogador só.
    expect(sequences[0].events).toHaveLength(3);
    expect(sequences[0].person).toBe("ana");
  });

  it("keeps ids unique across separate objectives", () => {
    const a = event({ at: 600, from: "deaths", kind: "groupDeath", costly: true });
    const baron = event({ at: 630, from: "objectives", kind: "baron" });
    const b = event({ at: 1_200, from: "deaths", kind: "groupDeath", costly: true });
    const dragon = event({ at: 1_230, from: "objectives", kind: "dragon" });
    const sequences = findSequences([a, baron, b, dragon]);
    expect(sequences).toHaveLength(2);
    expect(new Set(sequences.map((s) => s.id)).size).toBe(2);
  });

  it("does not repeat the same objective across two deaths", () => {
    // Guarda contra a duplicação que gerava a chave repetida em primeiro lugar.
    const one = event({ at: 600, from: "deaths", kind: "groupDeath", costly: true });
    const two = event({ at: 610, from: "deaths", kind: "groupDeath", costly: true });
    const dragon = event({ at: 640, from: "objectives", kind: "dragon" });
    const sequences = findSequences([one, two, dragon]);
    const objectives = sequences.map((s) => s.to);
    expect(objectives).toHaveLength(new Set(objectives).size);
  });
});

describe("criticalMoments", () => {
  it("finds the lead flipping in both directions", () => {
    // Nós na frente com 2.000, depois atrás com 2.500: uma virada.
    const moments = criticalMoments([
      [0, 0],
      [300, 2_000],
      [600, -2_500],
    ]);
    expect(moments.filter((m) => m.rule === "leadFlipped")).toHaveLength(1);
    expect(moments[0].at).toBe(600);
  });

  it("does not call a small swing a lead change", () => {
    // Só 500 de diferença, abaixo do limiar: troca de lane, não liderança.
    const moments = criticalMoments([
      [0, 500],
      [300, -500],
    ]);
    expect(moments.filter((m) => m.rule === "leadFlipped")).toHaveLength(0);
    expect(LEAD_THRESHOLD).toBe(1_500);
  });

  it("reports the biggest drop once", () => {
    const moments = criticalMoments([
      [0, 3_000],
      [300, 2_800],
      [600, 200],
      [900, 400],
    ]);
    const swings = moments.filter((m) => m.rule === "biggestSwing");
    expect(swings).toHaveLength(1);
    expect(swings[0].at).toBe(600);
    expect(swings[0].goldDiff).toBe(200);
  });

  it("says nothing when there is no curve to read", () => {
    expect(criticalMoments([])).toEqual([]);
    expect(criticalMoments([[0, 0]])).toEqual([]);
  });

  it("never reports a rise as the biggest swing", () => {
    // Só subiu: não há queda para destacar.
    const moments = criticalMoments([
      [0, 0],
      [300, 1_000],
      [600, 3_000],
    ]);
    expect(moments.filter((m) => m.rule === "biggestSwing")).toHaveLength(0);
  });
});

describe("minuteRange", () => {
  it("goes from zero to the last minute started", () => {
    expect(minuteRange(0)).toEqual([0]);
    expect(minuteRange(59)).toEqual([0]);
    expect(minuteRange(60)).toEqual([0, 1]);
    // 1.800 s = 30:00, então o minuto 30 existe (e está vazio).
    expect(minuteRange(1_800)).toHaveLength(31);
  });

  it("does not fall over a broken duration", () => {
    expect(minuteRange(Number.NaN)).toEqual([0]);
    expect(minuteRange(-5)).toEqual([0]);
  });
});

describe("killKindOf", () => {
  it("names the kill kind and nothing for the rest", () => {
    expect(killKindOf(event({ at: 1, kind: "groupDeath" }))).toBe("groupDeath");
    expect(killKindOf(event({ at: 1, from: "objectives", kind: "dragon" }))).toBeNull();
    expect(killKindOf(event({ at: 1, kind: "unknown" }))).toBeNull();
  });
});
