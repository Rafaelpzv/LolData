import { describe, expect, it } from "vitest";

import { metric, unavailable } from "./coverage";
import { proportion } from "./stats";

describe("metric", () => {
  it("carries everything a number needs to be checked", () => {
    const value = metric({
      key: "firstDragon",
      unit: "fraction",
      value: 0.4,
      denominator: "jogos do período",
      source: "match",
      formula: "jogos com o 1º dragão / jogos",
      limitations: ["info.teams não diz QUEM pegou, só quanto"],
      proportion: proportion(8, 20),
      gamesConsidered: 20,
      sampleFloor: 10,
    });
    expect(value.value).toBe(0.4);
    expect(value.denominator).toBe("jogos do período");
    expect(value.formula).toContain("1º dragão");
    expect(value.limitations).toHaveLength(1);
    expect(value.coverage).toEqual({
      gamesConsidered: 20,
      gamesWithData: 20,
      observations: 20,
      rate: 1,
    });
    expect(value.proportion?.successes).toBe(8);
    expect(value.conclusive).toBe(true);
  });

  it("never lets `gamesWithData` exceed the games considered", () => {
    const value = metric({
      key: "x",
      unit: "count",
      value: 3,
      denominator: "jogos",
      source: "match",
      formula: "n",
      gamesConsidered: 5,
      gamesWithData: 12,
      sampleFloor: 1,
    });
    expect(value.coverage.gamesWithData).toBe(5);
    expect(value.coverage.rate).toBe(1);
  });

  it("a value below the floor exists but is not conclusive", () => {
    const value = metric({
      key: "x",
      unit: "percent",
      value: 60,
      denominator: "jogos",
      source: "match",
      formula: "n",
      gamesConsidered: 4,
      sampleFloor: 10,
    });
    expect(value.value).toBe(60);
    expect(value.conclusive).toBe(false);
  });

  it("an empty window has a null coverage rate, not NaN", () => {
    const value = metric({
      key: "x",
      unit: "count",
      value: null,
      denominator: "jogos",
      source: "match",
      formula: "n",
      gamesConsidered: 0,
      sampleFloor: 1,
    });
    expect(value.coverage.rate).toBeNull();
    expect(value.conclusive).toBe(false);
  });

  it("counts observations apart from games: 6 dragons in 4 games", () => {
    const value = metric({
      key: "dragonsPerGame",
      unit: "perGame",
      value: 1.5,
      denominator: "jogos",
      source: "timeline",
      formula: "dragões / jogos",
      gamesConsidered: 4,
      gamesWithData: 4,
      observations: 6,
      sampleFloor: 3,
    });
    expect(value.coverage.observations).toBe(6);
    expect(value.coverage.gamesWithData).toBe(4);
    expect(value.conclusive).toBe(true);
  });
});

describe("unavailable", () => {
  it("says why instead of showing a zero", () => {
    const value = unavailable<number>({
      key: "vision",
      unit: "perMinute",
      reason: "nenhum jogo do período tem timeline",
      denominator: "jogos com timeline",
      source: "timelinePositions",
      formula: "pontos de visão / minutos",
      gamesConsidered: 30,
      sampleFloor: 10,
    });
    expect(value.value).toBeNull();
    expect(value.coverage.gamesWithData).toBe(0);
    expect(value.coverage.rate).toBe(0);
    expect(value.limitations[0]).toBe("nenhum jogo do período tem timeline");
    expect(value.conclusive).toBe(false);
  });
});
