import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  addListed,
  applyPage,
  caughtUp,
  idOfEpoch,
  mergePresence,
  newestGameOf,
  pickCandidates,
  planStep,
  presenceBuckets,
  type PageState,
} from "./scan";

const EPOCH = 1_700_000_000_000;

/** Riot match ids: shard, creation date, and the optional game number. */
const id = (epoch: number) => `BR1_${epoch}`;

/** An account's list while the batch reads it, starting from what the database stored. */
function page(overrides: Partial<PageState> = {}): PageState {
  return {
    puuid: "acc",
    nextStart: 0,
    epoch: 0,
    listedAt: 0,
    mode: "fresh",
    finished: false,
    // O padrão de uma conta é pedir páginas cheias: `pageSize: 1` era o modo "gotejar um jogo por
    // vez" que deixou o botão sem efeito.
    pageSize: PAGE_SIZE,
    reads: 0,
    ...overrides,
  };
}

/** The reads of one run, as a loop: each answer is fed to `applyPage`. */
function readAll(answers: string[][], maxPages = 20) {
  const state = page();
  const seen: string[] = [];
  let reads = 0;
  while (planStep(state, maxPages)) {
    const result = applyPage(
      state,
      planStep(state, maxPages)!,
      answers[reads] ?? [],
      maxPages,
    );
    seen.push(...result.ids);
    reads += 1;
    if (reads > 1000) throw new Error("the walk never ended");
  }
  return { state, seen, reads };
}

describe("fresh updates (startTime)", () => {
  it("sends startTime in SECONDS, which is what Riot reads", () => {
    // O bug que deixou o botão sem efeito: o epoch é guardado em milissegundos e ia cru para o
    // Riot, que o lê como segundos e entende "jogos criados depois do ano 53.000" — isto é, nada.
    const state = page({ epoch: EPOCH });
    const plan = planStep(state, 20);
    expect(plan).toEqual({ kind: "fresh", startTime: Math.floor(EPOCH / 1000), count: PAGE_SIZE });
    expect((plan as { startTime: number }).startTime).toBeLessThan(1e11);
  });

  it("asks for a full page, not one game", () => {
    // O botão pedia `count: 1`: uma partida por conta por clique, e o histórico de uma conta nova
    // nunca entrava. O primeiro pedido tem de trazer a página inteira.
    const plan = planStep(page({ epoch: EPOCH }), 20);
    expect(plan?.count).toBe(PAGE_SIZE);
  });

  it("keeps reading the list instead of deciding by what an id looks like", () => {
    // `BR1_3300862966` e `KR_8441588382` não carregam data: lidos como milissegundos caem em 1970
    // e ficam "mais antigos" que qualquer epoch, então o código antigo os descartava todos.
    const answers = [
      Array.from({ length: PAGE_SIZE }, (_, i) => `BR1_${3300862966 + i}`),
      ["BR1_3300862900"],
    ];
    const { seen, state } = readAll(answers);
    expect(seen).toHaveLength(PAGE_SIZE + 1);
    expect(seen).toContain("BR1_3300862966");
    expect(caughtUp(state)).toBe(true);
  });

  it("ends when the list answers an empty page, without losing what was read", () => {
    const state = page({ epoch: EPOCH });
    expect(applyPage(state, planStep(state, 20)!, [], 20)).toEqual({
      kind: "end",
      ids: [],
      caughtUp: false,
    });
    expect(caughtUp(state)).toBe(true);
    expect(planStep(state, 20)).toBeNull();
  });

  it("advances the offset by the page it read, and a short page ends the list", () => {
    const state = page({ epoch: EPOCH });
    const ids = ["BR1_1", "BR1_2", "BR1_3"];
    expect(applyPage(state, planStep(state, 20)!, ids, 20)).toEqual({
      kind: "advance",
      ids,
    });
    // Menos de 100 jogos: é o fim da lista, e pedir de novo traria os mesmos jogos.
    expect(state.nextStart).toBe(PAGE_SIZE);
    expect(state.finished).toBe(true);
  });

  it("resumes from the stored offset when the previous batch was cut short", () => {
    const stored = page({ nextStart: 300, epoch: EPOCH, reads: 1 });
    expect(planStep(stored, 20)).toEqual({ kind: "walk", start: 300, count: PAGE_SIZE });
  });

  it("never asks from zero once the account has an offset", () => {
    // Retomar do cursor é o que impede reler tudo a cada clique.
    for (const nextStart of [100, 200, 1900]) {
      const plan = planStep(page({ nextStart, epoch: EPOCH }), 20);
      expect(plan).toMatchObject({ start: nextStart });
    }
  });
});

describe("page walking (full/incremental)", () => {
  it("reads 100-game windows from nextStart and never re-reads a page", () => {
    const state = page({ mode: "full", pageSize: PAGE_SIZE });
    expect(planStep(state, 20)).toEqual({
      kind: "walk",
      start: 0,
      count: PAGE_SIZE,
    });
    applyPage(
      state,
      planStep(state, 20)!,
      Array.from({ length: PAGE_SIZE }, (_, i) => id(EPOCH + i)),
      20,
    );
    expect(state.nextStart).toBe(PAGE_SIZE);
    // O epoch NÃO sai dos ids: eles não carregam data. Quem o preenche é `newestGameOf`, com a
    // data real da partida baixada.
    expect(state.epoch).toBe(0);
    expect(planStep(state, 20)).toEqual({
      kind: "walk",
      start: PAGE_SIZE,
      count: PAGE_SIZE,
    });
  });

  it("newestGameOf reads the creation date from the match, not from the id", () => {
    const creation = Date.UTC(2026, 10, 4, 23, 59);
    const matches = [
      {
        matchId: "KR_8441588382",
        gameCreation: creation,
        participants: [{ puuid: "acc" }, { puuid: "other" }],
      },
      {
        matchId: "KR_8441521874",
        gameCreation: creation - 3_600_000,
        participants: [{ puuid: "acc" }],
      },
      // Partida de outra pessoa: não pode definir o epoch desta conta.
      {
        matchId: "KR_9999999999",
        gameCreation: creation + 86_400_000,
        participants: [{ puuid: "other" }],
      },
    ];
    expect(newestGameOf(matches, "acc")).toBe(creation);
    expect(newestGameOf(matches, "sem-partida")).toBe(0);
  });

  it("stops at an empty answer and at the page ceiling", () => {
    const state = page({ mode: "full" });
    applyPage(state, planStep(state, 2)!, [], 2);
    expect(state.finished).toBe(true);

    const capped = page({ mode: "full", nextStart: 2 * PAGE_SIZE });
    expect(planStep(capped, 2)).toBeNull();
  });

  it("resumes from the stored nextStart instead of starting over", () => {
    const state = page({ mode: "full", nextStart: 3 * PAGE_SIZE });
    const plan = planStep(state, 20);
    expect(plan).toMatchObject({ kind: "walk", start: 3 * PAGE_SIZE });
    // Uma página de 100 jogos traz 100 ids: o cursor anda os 100, não um.
    const ids = Array.from({ length: PAGE_SIZE }, (_, i) => `BR1_${1000 + i}`);
    applyPage(state, plan!, ids, 20);
    expect(state.nextStart).toBe(4 * PAGE_SIZE);
  });
});

describe("presence", () => {
  it("decides the candidates over every account, not over one batch", () => {
    const listedBy = new Map<string, Set<string>>();
    // Batch 1 reads four accounts: four people on the same game.
    for (const person of ["a", "b", "c", "d"])
      addListed(listedBy, ["BR1_1"], person);
    expect(pickCandidates(listedBy, 5)).toEqual([]);
    // Batch 2 reads the rest: the fifth person makes the game a candidate.
    addListed(listedBy, ["BR1_1"], "e");
    expect(pickCandidates(listedBy, 5)).toEqual(["BR1_1"]);
  });

  it("counts people, not accounts", () => {
    const listedBy = new Map<string, Set<string>>();
    for (const person of ["a", "a", "b", "b", "c"])
      addListed(listedBy, ["BR1_1"], person);
    expect(pickCandidates(listedBy, 3)).toEqual(["BR1_1"]);
    expect(pickCandidates(listedBy, 4)).toEqual([]);
  });

  it("merges the stored presence with this batch and writes only what changed", () => {
    const stored = new Map([
      ["BR1_1", new Set(["a", "b"])],
      ["BR1_2", new Set(["a"])],
    ]);
    const listedBy = new Map([
      ["BR1_1", new Set(["a", "b", "c"])],
      ["BR1_2", new Set(["a"])],
    ]);
    expect(mergePresence(stored, listedBy)).toEqual([
      { matchId: "BR1_1", people: ["a", "b", "c"] },
    ]);
  });

  it("groups the games by how many people listed them", () => {
    const listedBy = new Map([
      ["BR1_1", new Set(["a", "b"])],
      ["BR1_2", new Set(["a", "b", "c"])],
      ["BR1_3", new Set(["a"])],
    ]);
    expect(presenceBuckets(listedBy)).toEqual([
      { people: 3, games: 1 },
      { people: 2, games: 1 },
      { people: 1, games: 1 },
    ]);
  });
});

describe("epoch", () => {
  it("reads the creation date from the match id", () => {
    expect(idOfEpoch("BR1_1234567")).toBe(1_234_567);
    expect(idOfEpoch("no-date")).toBe(0);
  });
});
