import { describe, expect, it, vi } from "vitest";

// O módulo importa o repositório, que cria o cliente Supabase na carga. As funções testadas aqui são
// puras: basta o cliente existir para o import não explodir.
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {},
  supabase: {},
}));

import { countPending, selectPending } from "./timeline-batch";

/**
 * O caso real: uma partida salva numa rodada em que a timeline não foi guardada ficou invisível na
 * aba Partidas, sem erro nenhum. O `rebuild` só olhava o campo derivado dos participantes, e a
 * partida tinha o derivado — então o lote a considerava pronta e nunca buscava a timeline dela.
 */
function base(overrides: Partial<Parameters<typeof selectPending>[0]> = {}) {
  return {
    matchIds: [] as string[],
    needsReading: () => false,
    missingDerived: new Set<string>(),
    rebuild: false,
    failureAttempts: new Map<string, number>(),
    giveUpAfter: 3,
    cap: 25,
    ...overrides,
  };
}

describe("selectPending — o que ainda precisa de timeline", () => {
  it("includes a game with no stored timeline even when its participants carry the derived data", () => {
    // É exatamente o bug: `derived` presente, timeline ausente, rebuild ligado.
    const pending = selectPending(
      base({
        matchIds: ["SEM_TIMELINE", "OK"],
        needsReading: (id) => id === "SEM_TIMELINE",
        missingDerived: new Set<string>(), // nada faltando no derivado
        rebuild: true,
      }),
    );
    expect(pending).toEqual(["SEM_TIMELINE"]);
  });

  it("includes a game missing the derived data under rebuild", () => {
    const pending = selectPending(
      base({
        matchIds: ["A", "B"],
        needsReading: () => false,
        missingDerived: new Set(["B"]),
        rebuild: true,
      }),
    );
    expect(pending).toEqual(["B"]);
  });

  it("does not re-read a complete game under rebuild", () => {
    const pending = selectPending(
      base({
        matchIds: ["A", "B"],
        needsReading: () => false,
        missingDerived: new Set<string>(),
        rebuild: true,
      }),
    );
    expect(pending).toEqual([]);
  });

  it("ignores the derived set when it is not a rebuild", () => {
    // Sem rebuild, o campo derivado não é uma razão para reler: só faz mais chamadas à Riot.
    const pending = selectPending(
      base({
        matchIds: ["A"],
        needsReading: () => false,
        missingDerived: new Set(["A"]),
        rebuild: false,
      }),
    );
    expect(pending).toEqual([]);
  });

  it("guives up on a game Riot kept refusing", () => {
    const pending = selectPending(
      base({
        matchIds: ["REFUSED"],
        needsReading: () => true,
        failureAttempts: new Map([["REFUSED", 3]]),
      }),
    );
    expect(pending).toEqual([]);
  });

  it("keeps reading a game that already has a timeline but lacks the derived data", () => {
    // Desistir aqui deixaria o campo vazio para sempre: a timeline existe, só falta o derivado.
    const pending = selectPending(
      base({
        matchIds: ["COM_TIMELINE"],
        needsReading: () => false,
        missingDerived: new Set(["COM_TIMELINE"]),
        rebuild: true,
        failureAttempts: new Map([["COM_TIMELINE", 9]]),
      }),
    );
    expect(pending).toEqual(["COM_TIMELINE"]);
  });

  it("respects the batch cap", () => {
    const pending = selectPending(
      base({ matchIds: ["A", "B", "C"], needsReading: () => true, cap: 2 }),
    );
    expect(pending).toEqual(["A", "B"]);
  });
});

describe("countPending — o que a tela mostra como faltando", () => {
  it("counts the game with no timeline, which is what the user sees as missing", () => {
    const remaining = countPending(
      base({
        matchIds: ["SEM_TIMELINE", "OK", "OK2"],
        needsReading: (id) => id === "SEM_TIMELINE",
        rebuild: true,
      }),
    );
    expect(remaining).toBe(1);
  });

  it("counts zero when every game is complete", () => {
    const remaining = countPending(
      base({ matchIds: ["A", "B"], needsReading: () => false, rebuild: true }),
    );
    expect(remaining).toBe(0);
  });
});
