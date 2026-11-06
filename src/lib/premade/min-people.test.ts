import { describe, expect, it } from "vitest";

import { filterByMinPeople, rosterPeopleIn } from "./min-people";
import type { PremadeMatchSample, PremadePlayer } from "./types";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

function player(index: number): PremadePlayer {
  return {
    id: `person-${index}`,
    gameName: `Pessoa ${index}`,
    slot: index,
    accounts: [{ puuid: `puuid-${index}`, gameName: `Pessoa ${index}`, tagLine: "BR1" }],
  };
}

const ROSTER = [0, 1, 2, 3, 4].map(player);

/** Uma partida com as `count` primeiras pessoas do elenco. */
function matchWith(index: number, count: number): PremadeMatchSample {
  return {
    matchId: `BR1_${index}`,
    gameCreation: Date.UTC(2026, 0, 1, 12) + index * 3_600_000,
    season: 15,
    win: true,
    duration: 1_800,
    teamSide: 100,
    objectives: {
      tower: { first: true, kills: 6 },
      dragon: { first: true, kills: 3 },
      baron: { first: false, kills: 1 },
      inhibitor: { first: true, kills: 1 },
      riftHerald: { first: true, kills: 1 },
      champion: { first: true, kills: 40 },
    },
    participants: ROSTER.slice(0, count).map((person, slot) => ({
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
  } as unknown as PremadeMatchSample;
}

describe("rosterPeopleIn", () => {
  it("counts the roster people in the match", () => {
    expect(rosterPeopleIn(matchWith(0, 5), ROSTER)).toBe(5);
    expect(rosterPeopleIn(matchWith(0, 2), ROSTER)).toBe(2);
  });
});

describe("filterByMinPeople — o seletor de mínimo precisa filtrar de verdade", () => {
  const matches = [matchWith(0, 5), matchWith(1, 4), matchWith(2, 3), matchWith(3, 2)];

  it("keeps only the matches that reach the minimum", () => {
    // O caso real: um time com partidas de 2, 3, 4 e 5 pessoas mostrava todas com o seletor em 5.
    const result = filterByMinPeople(matches, ROSTER, 5);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].matchId).toBe("BR1_0");
    expect(result.dropped).toBe(3);
  });

  it("widens the set as the minimum goes down", () => {
    expect(filterByMinPeople(matches, ROSTER, 4).kept).toHaveLength(2);
    expect(filterByMinPeople(matches, ROSTER, 3).kept).toHaveLength(3);
    expect(filterByMinPeople(matches, ROSTER, 2).kept).toHaveLength(4);
  });

  it("reports the size of every lineup, including the dropped ones", () => {
    // A interface usa isso para dizer o que ficou de fora, em vez de encolher a lista em silêncio.
    const result = filterByMinPeople(matches, ROSTER, 5);
    expect(result.bySize).toEqual({ 5: 1, 4: 1, 3: 1, 2: 1 });
  });

  it("does not filter when the minimum is 1 or less", () => {
    expect(filterByMinPeople(matches, ROSTER, 1).kept).toHaveLength(4);
    expect(filterByMinPeople(matches, ROSTER, 0).kept).toHaveLength(4);
  });

  it("counts a person once even with two accounts in the same match", () => {
    // A regra da coleta: duas contas da mesma pessoa são uma pessoa, senão o mínimo 5 aceitaria
    // uma partida com quatro jogadores e um deles logado duas vezes.
    const twoAccounts = player(0);
    const withTwo = {
      ...twoAccounts,
      accounts: [
        { puuid: "puuid-0", gameName: "Pessoa 0", tagLine: "BR1" },
        { puuid: "puuid-0b", gameName: "Pessoa 0 alt", tagLine: "BR1" },
      ],
    } as PremadePlayer;
    const roster = [withTwo, ...ROSTER.slice(1)];
    const base = matchWith(0, 4);
    const doubled = {
      ...base,
      participants: [
        ...(base.participants as { puuid: string }[]),
        { ...(base.participants as { puuid: string }[])[0], puuid: "puuid-0b" },
      ],
    } as unknown as PremadeMatchSample;
    expect(rosterPeopleIn(doubled, roster)).toBe(4);
    expect(filterByMinPeople([doubled], roster, 5).kept).toHaveLength(0);
  });

  it("keeps nothing rather than everything when the minimum is impossible", () => {
    const result = filterByMinPeople([matchWith(0, 2)], ROSTER, 5);
    expect(result.kept).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });
});
