import { describe, expect, it } from "vitest";

import { personCards, rankLabel, rankOf } from "./lobby";
import {
  EMPTY_RANKED,
  pickRanked,
  RANKED_QUEUES,
  rankScore,
  type AccountRanks,
} from "./ranks";
import type { PremadePlayer } from "./types";

const entry = (
  queueType: string,
  tier: string,
  rank: string,
  leaguePoints: number,
) => ({
  queueType,
  tier,
  rank,
  leaguePoints,
  wins: 10,
  losses: 5,
});

describe("pickRanked", () => {
  it("takes Flex first, even when Solo/Duo is the higher tier", () => {
    // The case from the user: Master in Flex, Emerald I in Solo.
    const ranked = pickRanked([
      entry("RANKED_SOLO_5x5", "EMERALD", "I", 60),
      entry("RANKED_FLEX_SR", "MASTER", "I", 120),
    ]);
    expect(ranked.queueType).toBe("RANKED_FLEX_SR");
    expect(ranked.tier).toBe("master");
    expect(ranked.leaguePoints).toBe(120);
  });

  it("takes a lower Flex when Solo is the higher tier", () => {
    const ranked = pickRanked([
      entry("RANKED_SOLO_5x5", "DIAMOND", "II", 40),
      entry("RANKED_FLEX_SR", "PLATINUM", "IV", 10),
    ]);
    expect(ranked.queueType).toBe("RANKED_FLEX_SR");
    expect(ranked.tier).toBe("platinum");
  });

  it("falls back to Solo/Duo only when there is no Flex", () => {
    const ranked = pickRanked([entry("RANKED_SOLO_5x5", "GOLD", "III", 22)]);
    expect(ranked.queueType).toBe("RANKED_SOLO_5x5");
    expect(ranked.tier).toBe("gold");
    expect(RANKED_QUEUES[0]).toBe("RANKED_FLEX_SR");
  });

  it("returns an empty rank when there is no entry, or an unknown one", () => {
    expect(pickRanked([])).toEqual(EMPTY_RANKED);
    expect(pickRanked(null)).toEqual(EMPTY_RANKED);
    expect(pickRanked([entry("RANKED_TFT", "MASTER", "I", 900)])).toEqual(
      EMPTY_RANKED,
    );
  });

  it("orders ranks of one queue by tier, division and LP", () => {
    const flex = pickRanked([entry("RANKED_FLEX_SR", "MASTER", "I", 120)]);
    const solo = pickRanked([entry("RANKED_SOLO_5x5", "EMERALD", "I", 60)]);
    expect(rankScore(flex)).toBeGreaterThan(rankScore(solo));
    expect(rankScore(EMPTY_RANKED)).toBe(-1);
    expect(rankLabel(flex, (tier) => tier)).toBe("master");
  });
});

describe("personCards", () => {
  const player = (accounts: string[]): PremadePlayer =>
    ({
      id: "person-1",
      gameName: "Rifu",
      archived: false,
      slot: 0,
      accounts: accounts.map((puuid) => ({
        puuid,
        gameName: puuid,
        tagLine: "BR1",
        archived: false,
      })),
    }) as unknown as PremadePlayer;

  const ranks: AccountRanks = {
    flex: {
      puuid: "flex",
      profileIconId: 1,
      summonerLevel: 30,
      queueType: "RANKED_FLEX_SR",
      tier: "DIAMOND",
      division: "III",
      leaguePoints: 40,
      wins: 1,
      losses: 1,
      flex: null,
      solo: null,
      fetchedAt: null,
    },
    solo: {
      puuid: "solo",
      profileIconId: 2,
      summonerLevel: 30,
      queueType: "RANKED_SOLO_5x5",
      tier: "MASTER",
      division: "I",
      leaguePoints: 300,
      wins: 1,
      losses: 1,
      flex: null,
      solo: null,
      fetchedAt: null,
    },
  };

  it("shows the account and the queue of the person, Flex over a higher Solo", () => {
    const [card] = personCards([player(["solo", "flex"])], ranks, {
      solo: 9,
      flex: 2,
    });
    expect(card.queue).toBe("RANKED_FLEX_SR");
    expect(card.best.account.puuid).toBe("flex");
    expect(card.rank.tier).toBe("diamond");
  });

  it("chooses the highest Flex account among several", () => {
    const ranksTwo: AccountRanks = {
      low: { ...ranks.flex!, puuid: "low", tier: "PLATINUM" },
      high: { ...ranks.flex!, puuid: "high", tier: "GRANDMASTER" },
    };
    const [card] = personCards([player(["low", "high"])], ranksTwo, {});
    expect(card.best.account.puuid).toBe("high");
    expect(rankOf(ranksTwo, "high").tier).toBe("grandmaster");
  });

  it("falls back to Solo when no account of the person has Flex", () => {
    const [card] = personCards([player(["solo"])], ranks, {});
    expect(card.queue).toBe("RANKED_SOLO_5x5");
    expect(card.best.account.puuid).toBe("solo");
  });

  it("picks Flex from the two cached queues, even when the shown column says Solo", () => {
    // A team created before the two queues were stored: queue_type / tier hold the old Solo cache.
    const legacy: AccountRanks = {
      both: {
        puuid: "both",
        profileIconId: 3,
        summonerLevel: 40,
        queueType: "RANKED_SOLO_5x5",
        tier: "EMERALD",
        division: "I",
        leaguePoints: 60,
        wins: 1,
        losses: 1,
        flex: {
          queueType: "RANKED_FLEX_SR",
          tier: "master",
          division: null,
          leaguePoints: 120,
          wins: 2,
          losses: 3,
        },
        solo: {
          queueType: "RANKED_SOLO_5x5",
          tier: "emerald",
          division: "I",
          leaguePoints: 60,
          wins: 1,
          losses: 1,
        },
        fetchedAt: null,
      },
    };
    const rank = rankOf(legacy, "both");
    expect(rank.queueType).toBe("RANKED_FLEX_SR");
    expect(rank.tier).toBe("master");
    expect(rank.leaguePoints).toBe(120);
    const [card] = personCards([player(["both"])], legacy, {});
    expect(card.queue).toBe("RANKED_FLEX_SR");
    expect(card.rank.tier).toBe("master");
  });

  it("keeps the highest Flex account of a person with several accounts", () => {
    const two: AccountRanks = {
      a: {
        ...ranks.flex!,
        puuid: "a",
        tier: "PLATINUM",
        queueType: "RANKED_SOLO_5x5",
        flex: {
          queueType: "RANKED_FLEX_SR",
          tier: "diamond",
          division: "IV",
          leaguePoints: 10,
          wins: 1,
          losses: 4,
        },
      },
      b: {
        ...ranks.flex!,
        puuid: "b",
        tier: "GOLD",
        queueType: "RANKED_SOLO_5x5",
        flex: {
          queueType: "RANKED_FLEX_SR",
          tier: "platinum",
          division: "I",
          leaguePoints: 90,
          wins: 5,
          losses: 5,
        },
      },
    };
    const [card] = personCards([player(["a", "b"])], two, {});
    expect(card.best.account.puuid).toBe("a");
    expect(card.rank.tier).toBe("diamond");
    expect(card.accountCount).toBe(2);
  });
});
