import { describe, expect, it } from "vitest";

import { buildTeamAnalysis } from "./team-analysis";
import type { PremadeTimeline } from "./timeline";
import type {
  PremadeMatchSample,
  PremadeParticipantSample,
  PremadePlayer,
} from "./types";

/**
 * Testes de integração do `buildTeamAnalysis` (§10).
 *
 * Os testes de cada módulo isolado já cobrem as fórmulas. O que falta é o que só aparece quando as
 * peças se encontram: partidas duplicadas, pessoa que trocou de função, elenco incompleto e timeline
 * ausente. Estes casos já quebraram a tela na prática, então ficam travados aqui.
 */

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

function player(index: number): PremadePlayer {
  const puuid = `puuid-${index}`;
  return {
    id: `person-${index}`,
    gameName: `Pessoa ${index}`,
    slot: index,
    accounts: [{ puuid, gameName: `Pessoa ${index}`, tagLine: "BR1" }],
  };
}

const ROSTER = [0, 1, 2, 3, 4].map(player);

/**
 * Uma partida de cinco pessoas do elenco. `seed` varia os números para as janelas terem variância:
 * duas janelas de valores constantes dão desvio zero e a comparação vira "inconclusivo", que não é
 * o que se quer testar aqui.
 */
function match(
  index: number,
  overrides: Partial<PremadeMatchSample> = {},
  options: { participants?: PremadeParticipantSample[]; roster?: PremadePlayer[] } = {},
): PremadeMatchSample {
  const roster = options.roster ?? ROSTER;
  const win = index % 2 === 0;
  const seed = (index % 3) - 1; // -1, 0, 1
  const participants =
    options.participants ??
    roster.map((person, slot) => ({
      puuid: person.accounts[0].puuid,
      accountId: person.id,
      championId: 1,
      championName: "Campeao",
      teamPosition: ROLES[slot] ?? "MIDDLE",
      kills: 4 + seed,
      deaths: 5 + seed,
      assists: 6,
      goldEarned: 10_000 + seed * 100,
      champExperience: 12_000,
      totalMinionsKilled: 150 + seed * 5,
      neutralMinionsKilled: 10,
      visionScore: 20 + seed * 2,
      wardsPlaced: 10,
      wardsKilled: 3,
      totalDamageDealtToChampions: 15_000,
      totalDamageTaken: 20_000,
      pings: null,
      win,
    }));
  return {
    matchId: `BR1_${index}`,
    // 12 h entre partidas: o dia UTC de cada uma é distinto, o que importa para os objetivos.
    gameCreation: Date.UTC(2026, 0, 1, 12) + index * 12 * 3_600_000,
    season: 15,
    win,
    duration: 1_800 + seed * 30,
    teamSide: 100,
    objectives: {
      // A chave da torre em `TeamObjectives` é `tower`, não `turret` (o `turret` nomeia o contador
      // do participante). Escrever a errada aqui derrubava o `computeMetrics`, não o teste.
      tower: { first: true, kills: 6 },
      dragon: { first: true, kills: 3 },
      baron: { first: false, kills: 1 },
      inhibitor: { first: false, kills: 1 },
      riftHerald: { first: true, kills: 1 },
      champion: { first: false, kills: 0 },
    },
    champLevel: 15,
    turretTakedowns: 20,
    teamKills: 22,
    teamGold: 50_000,
    teamDeaths: 25,
    teamDamage: 70_000,
    sideAssists: 40,
    teamObjectivesTaken: { turret: 6, dragon: 3, baron: 1, inhibitor: 1 },
    enemyObjectivesTaken: { turret: 2, dragon: 1, baron: 0, inhibitor: 0 },
    enemyGold: 48_000,
    gameMode: "CLASSIC",
    sideObjectives: null,
    timelineDuration: 1_800,
    sideDamage: 70_000,
    sideDamageTaken: 90_000,
    participants,
    ...overrides,
  };
}

/** Uma timeline mínima: ouro em degraus, sem eventos, para o painel de cobertura ter o que ler. */
function timeline(matchId: string, win: boolean): PremadeTimeline {
  return {
    matchId,
    duration: 1_800,
    endOfGameResult: "GameComplete",
    frameInterval: 60_000,
    goldSeries: Array.from({ length: 31 }, (_, minute) => [
      minute * 60,
      25_000 + minute * 100,
      25_000,
    ]),
    goldDiff: Array.from({ length: 31 }, (_, minute) => [
      minute * 60,
      minute * 100,
    ]),
    xpDiff: Array.from({ length: 31 }, (_, minute) => [minute * 60, minute * 80]),
    kills: [],
    objectives: [],
    positions: ROSTER.map((person) => ({
      puuid: person.accounts[0].puuid,
      points: Array.from({ length: 31 }, (_, minute) => [
        minute * 60,
        100,
        100,
        1_000 + minute * 50,
        1 + Math.floor(minute / 3),
        minute * 8,
      ]) as PremadeTimeline["positions"][number]["points"],
    })),
    deaths: [],
    finalStats: {
      gold: 28_000,
      kills: 20,
      deaths: 25,
      towers: 6,
      dragons: 3,
      barons: 1,
    },
    win,
  } as PremadeTimeline;
}

const FIFTEEN = Array.from({ length: 15 }, (_, index) => match(index));

describe("buildTeamAnalysis — a base", () => {
  it("builds an analysis from fifteen complete games", () => {
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, []);
    expect(analysis.metrics.games).toBe(15);
    expect(analysis.integrity.full).toHaveLength(15);
    // Sem timeline, a cobertura é dita, não escondida.
    expect(analysis.integrity.withTimeline).toHaveLength(0);
    expect(analysis.diagnoses.length).toBeGreaterThan(0);
  });

  it("survives an empty team instead of throwing", () => {
    const analysis = buildTeamAnalysis([], [], []);
    expect(analysis.metrics.games).toBe(0);
    expect(analysis.diagnoses).toEqual([]);
    expect(analysis.groupDeathsPerGame).toBeNull();
  });
});

describe("buildTeamAnalysis — partidas duplicadas (§10)", () => {
  /**
   * A deduplicação por `match_id` é da COLETA, não desta função: a tabela guarda uma linha por
   * partida e por time, e `getTeamMatches` devolve o que está lá. O `buildTeamAnalysis` confia na
   * entrada que recebe — por isso estes testes travam o contrato real (a entrada já é única) e
   * documentam o limite, em vez de prometer uma garantia que mora em outro lugar.
   */
  it("assumes the input is already unique, as the repository delivers it", () => {
    const unique = [...new Map(FIFTEEN.map((entry) => [entry.matchId, entry])).values()];
    const analysis = buildTeamAnalysis(unique, ROSTER, []);
    expect(analysis.metrics.games).toBe(15);
    expect(analysis.integrity.total).toBe(15);
  });

  it("counts a repeated game twice, because deduplication is upstream", () => {
    // Guarda de regressão do contrato: se um dia a coleta parar de deduplicar, este teste quebra e
    // mostra onde consertar. Fingir que aqui há deduplicação esconderia o problema real.
    const withDuplicate = [...FIFTEEN, FIFTEEN[0]];
    const analysis = buildTeamAnalysis(withDuplicate, ROSTER, []);
    expect(analysis.metrics.games).toBe(16);
  });
});

describe("buildTeamAnalysis — elenco incompleto (§10)", () => {
  it("keeps a game with four roster people out of the full-lineup set", () => {
    // Quatro do elenco e um preenchimento: é partida parcial, e a integridade tem que dizer isso.
    const partial = match(
      20,
      {},
      {
        participants: ROSTER.slice(0, 4).map((person, slot) => ({
          puuid: person.accounts[0].puuid,
          accountId: person.id,
          championId: 1,
          championName: "Campeao",
          teamPosition: ROLES[slot],
          kills: 4,
          deaths: 5,
          assists: 6,
          goldEarned: 10_000,
          champExperience: 12_000,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          visionScore: 20,
          wardsPlaced: 10,
          wardsKilled: 3,
          totalDamageDealtToChampions: 15_000,
          totalDamageTaken: 20_000,
          pings: null,
          win: true,
        })),
      },
    );
    const analysis = buildTeamAnalysis([...FIFTEEN, partial], ROSTER, []);
    expect(analysis.integrity.full).toHaveLength(15);
    // A partida parcial continua contando nas médias gerais, mas não na leitura de cinco pessoas.
    expect(analysis.metrics.games).toBe(16);
  });
});

describe("buildTeamAnalysis — pessoa que trocou de função (§10)", () => {
  it("attributes each game to the role actually played", () => {
    // A pessoa 0 joga de TOP nas antigas e de MIDDLE nas novas: cada partida conta na função em que
    // foi jogada, não na "função principal" da pessoa.
    const swapped = Array.from({ length: 16 }, (_, index) => {
      const participants = ROSTER.map((person, slot) => ({
        puuid: person.accounts[0].puuid,
        accountId: person.id,
        championId: 1,
        championName: "Campeao",
        teamPosition:
          slot === 0 && index >= 8 ? "MIDDLE" : ROLES[slot],
        kills: 4,
        deaths: 5,
        assists: 6,
        goldEarned: 10_000,
        champExperience: 12_000,
        totalMinionsKilled: 150,
        neutralMinionsKilled: 10,
        visionScore: 20,
        wardsPlaced: 10,
        wardsKilled: 3,
        totalDamageDealtToChampions: 15_000,
        totalDamageTaken: 20_000,
        pings: null,
        win: index % 2 === 0,
      }));
      return match(index, {}, { participants });
    });
    const analysis = buildTeamAnalysis(swapped, ROSTER, []);
    const person0 = analysis.depths.find((depth) => depth.person === "person-0");
    expect(person0).toBeDefined();
    // As 16 partidas entram no total da pessoa; nenhuma se perde na troca de função.
    expect(person0?.summary.games).toBe(16);
  });

  it("survives a game where two people played the same role", () => {
    // Dois MIDDLE no mesmo time (swap in-game): a leitura por função não pode duplicar nem sumir.
    const doubled = match(
      21,
      {},
      {
        participants: ROSTER.map((person, slot) => ({
          puuid: person.accounts[0].puuid,
          accountId: person.id,
          championId: 1,
          championName: "Campeao",
          teamPosition: slot === 1 ? "MIDDLE" : ROLES[slot],
          kills: 4,
          deaths: 5,
          assists: 6,
          goldEarned: 10_000,
          champExperience: 12_000,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 10,
          visionScore: 20,
          wardsPlaced: 10,
          wardsKilled: 3,
          totalDamageDealtToChampions: 15_000,
          totalDamageTaken: 20_000,
          pings: null,
          win: false,
        })),
      },
    );
    const analysis = buildTeamAnalysis([...FIFTEEN, doubled], ROSTER, []);
    expect(analysis.metrics.games).toBe(16);
    // Cada pessoa aparece uma vez só.
    const people = analysis.depths.map((depth) => depth.person);
    expect(new Set(people).size).toBe(people.length);
  });
});

describe("buildTeamAnalysis — timelines (§10)", () => {
  it("reports the coverage gap when some games have no timeline", () => {
    const timelines = FIFTEEN.slice(0, 10).map((entry) => timeline(entry.matchId, entry.win));
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, timelines);
    expect(analysis.integrity.withTimeline).toHaveLength(10);
    expect(analysis.integrity.withoutTimeline).toHaveLength(5);
  });

  it("ignores a timeline for a game that is not in the set", () => {
    // Timeline órfã: não pode entrar nem na contagem nem no gráfico.
    const timelines = [timeline("BR1_999", true)];
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, timelines);
    expect(analysis.timeline.games.every((game) => game.matchId !== "BR1_999")).toBe(true);
  });

  it("carries person and death data into the interactive timeline", () => {
    // §8.4: o filtro por jogador e as sequências precisam de pessoa e morte nos eventos.
    const withEvents = {
      ...timeline("BR1_0", true),
      kills: [
        {
          at: 300,
          kind: "groupKill",
          x: 100,
          y: 200,
          person: "person-0",
          near: 3,
          people: ["person-0", "person-1", "person-2"],
        },
      ],
      objectives: [
        {
          at: 420,
          kind: "dragon",
          x: 500,
          y: 500,
          variant: null,
          near: 4,
          people: ["person-0", "person-1"],
        },
      ],
      deaths: [
        { at: 400, person: "person-1", slot: 1, near: 1, costly: true, x: 500, y: 500 },
      ],
    } as unknown as PremadeTimeline;
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, [withEvents]);
    const game = analysis.timeline.games.find((entry) => entry.matchId === "BR1_0");
    expect(game?.kills?.[0].person).toBe("person-0");
    expect(game?.deaths?.[0].person).toBe("person-1");
    expect(game?.deaths?.[0].costly).toBe(true);
  });
});

describe("buildTeamAnalysis — escalação de cada partida", () => {
  it("names who from the roster played each game", () => {
    // `reports` só existe para partida com timeline: é a timeline que sustenta o relatório.
    const timelines = FIFTEEN.map((entry) => timeline(entry.matchId, entry.win));
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, timelines);
    const game = analysis.reports[0];
    expect(game.players).toHaveLength(ROSTER.length);
    // A mesma pessoa não entra duas vezes, mesmo com contas diferentes na mesma partida.
    expect(new Set(game.players.map((player) => player.person)).size).toBe(
      game.players.length,
    );
    // Todo mundo listado é do elenco: conta de preenchimento não vira participante.
    const rosterIds = new Set(ROSTER.map((person) => person.id));
    expect(game.players.every((player) => rosterIds.has(player.person))).toBe(true);
  });

  it("carries champion and role so the lineup can be read without another lookup", () => {
    const timelines = FIFTEEN.map((entry) => timeline(entry.matchId, entry.win));
    const analysis = buildTeamAnalysis(FIFTEEN, ROSTER, timelines);
    const game = analysis.reports[0];
    expect(game.players.every((player) => player.champion !== undefined)).toBe(true);
    expect(game.players.every((player) => player.role !== undefined)).toBe(true);
  });

  it("gives every game its own lineup, not a shared list", () => {
    // O filtro da aba escolhe partidas por pessoa; se os jogos compartilhassem a lista, filtrar por
    // alguém traria partidas em que ele não jogou.
    // Uma partida com quatro pessoas do elenco: só essas quatro entram na escalação dela.
    const fourPeople = match(0, {}, {
      participants: ROSTER.slice(0, 4).map((person, slot) => ({
        puuid: person.accounts[0].puuid,
        accountId: person.id,
        championId: 1,
        championName: "Campeao",
        teamPosition: ROLES[slot] ?? "MIDDLE",
        kills: 4,
        deaths: 5,
        assists: 6,
        goldEarned: 10_000,
        champExperience: 12_000,
        totalMinionsKilled: 150,
        neutralMinionsKilled: 10,
        visionScore: 20,
        wardsPlaced: 10,
        wardsKilled: 3,
        totalDamageDealtToChampions: 15_000,
        totalDamageTaken: 20_000,
        pings: null,
        win: true,
      })),
    });
    const mixed = [fourPeople, ...FIFTEEN.slice(1)];
    const partial = buildTeamAnalysis(mixed, ROSTER, mixed.map((entry) => timeline(entry.matchId, entry.win)));
    const shortGame = partial.reports.find((entry) => entry.matchId === "BR1_0");
    expect(shortGame?.players).toHaveLength(4);
    const fullGame = partial.reports.find((entry) => entry.matchId === "BR1_1");
    expect(fullGame?.players).toHaveLength(ROSTER.length);
  });

  it("keeps a game with nobody identifiable instead of inventing a player", () => {
    const empty = match(0, {}, { participants: [] });
    const nobody = buildTeamAnalysis([empty], ROSTER, [timeline(empty.matchId, empty.win)]);
    expect(nobody.reports[0].players).toHaveLength(0);
  });
});
