import { describe, expect, it } from "vitest";

import { inflectionPoints, matchReport, strategicTimeline } from "./match-report";
import type { PremadeMatchSample } from "./types";
import type { PremadeTimeline, TimelineKill, TimelineObjective } from "./timeline";

const MATCH = "BR1_1";

function sample(win = false): PremadeMatchSample {
  return {
    matchId: MATCH,
    gameCreation: 1_700_000_000_000,
    duration: 1800,
    win,
    queueId: 440,
    teamSide: 100,
    participants: [],
    teamTotals: {},
    timelineDuration: 1800,
  } as unknown as PremadeMatchSample;
}

interface Options {
  goldDiff?: [number, number][];
  kills?: TimelineKill[];
  objectives?: TimelineObjective[];
}

function timeline(options: Options = {}): PremadeTimeline {
  return {
    matchId: MATCH,
    duration: 1800,
    endOfGameResult: "GameComplete",
    frameInterval: 60000,
    goldSeries: [],
    goldDiff: options.goldDiff ?? [],
    xpDiff: [],
    kills: options.kills ?? [],
    objectives: options.objectives ?? [],
    positions: [],
    deaths: [],
    finalStats: { gold: 0, kills: 0, deaths: 0, towers: 0, dragons: 0, barons: 0 },
  };
}

function death(at: number, person = "a"): TimelineKill {
  return { at, x: 0, y: 0, person, kind: "groupDeath", near: 1, people: [person] };
}

function kill(at: number, person = "b"): TimelineKill {
  return { at, x: 0, y: 0, person, kind: "groupKill", near: 2, people: [person] };
}

function objective(
  at: number,
  kind: "dragon" | "baron" | "tower" = "dragon",
  near = 4,
): TimelineObjective {
  return { at, x: 0, y: 0, kind, variant: null, near, people: [] };
}

describe("strategicTimeline", () => {
  it("groups nearby events of the same kind into one moment", () => {
    const moments = strategicTimeline(
      timeline({ kills: [death(600), death(620), death(640)] }),
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].events).toBe(3);
  });

  it("keeps kinds apart even when they are close in time", () => {
    // A death and a kill are both fights and may merge; an objective never merges with a fight.
    const moments = strategicTimeline(
      timeline({ kills: [death(600), kill(605)], objectives: [objective(610)] }),
    );
    const fights = moments.filter((moment) => moment.kind === "fight");
    const objectives = moments.filter(
      (moment) => moment.kind === "objective" || moment.kind === "preparation",
    );
    expect(fights).toHaveLength(1);
    expect(fights[0].events).toBe(2);
    expect(objectives.length).toBeGreaterThan(0);
  });

  it("marks the preparation window of a dragon and of a baron", () => {
    const moments = strategicTimeline(
      timeline({ objectives: [objective(900, "dragon")] }),
    );
    expect(moments.some((moment) => moment.kind === "preparation")).toBe(true);
  });
});

describe("inflectionPoints", () => {
  it("does NOT turn a death into an inflection point when nothing changes", () => {
    // Gold is flat all game: a death alone proves nothing, and the prompt is explicit about it.
    const points = inflectionPoints(
      sample(),
      timeline({ goldDiff: [[0, 0], [600, 0], [900, 0], [1800, 0]], kills: [death(600)] }),
    );
    expect(points).toHaveLength(0);
  });

  it("reports deaths before an objective when the state actually swings", () => {
    // A realistic series: the game oscillates a few hundred gold per minute, and the swing inside
    // the window is far larger than that. The reference is the game's own volatility.
    const points = inflectionPoints(
      sample(),
      timeline({
        goldDiff: [
          [0, 0],
          [120, 200],
          [240, -150],
          [360, 350],
          [480, -300],
          [600, 250],
          [720, -400],
          [810, 2500],
          [860, 2500],
          [920, -800],
          [1020, -500],
          [1140, -900],
          [1800, -3000],
        ],
        kills: [death(850, "a"), death(870, "b")],
        objectives: [objective(900, "baron")],
      }),
    );
    const beforeObjective = points.find(
      (point) => point.kind === "deathsBeforeObjective",
    );
    expect(beforeObjective).toBeDefined();
    expect(beforeObjective!.swing).toBeLessThan(0);
    expect(beforeObjective!.confidence).not.toBe("inconclusive");
  });

  it("carries the nine fields the prompt asks for", () => {
    const points = inflectionPoints(
      sample(),
      timeline({
        goldDiff: [
          [0, 0],
          [120, 200],
          [240, -150],
          [360, 350],
          [480, -300],
          [600, 250],
          [720, -400],
          [810, 2500],
          [860, 2500],
          [920, -800],
          [1020, -500],
          [1140, -900],
          [1800, -3000],
        ],
        kills: [death(850, "a"), death(870, "b")],
        objectives: [objective(900, "baron")],
      }),
      (person) => (person === "a" ? "Ana" : person === "b" ? "Bia" : null),
    );
    const point = points.find((entry) => entry.kind === "deathsBeforeObjective")!;
    expect(point.at).toBeTypeOf("number");
    // The sentence travels as a message key, not as text in a single language.
    expect(point.what.id.length).toBeGreaterThan(0);
    expect(point.players).toContain("Ana");
    expect(point.evidence.length).toBeGreaterThan(0);
    expect(point.before).toBeDefined();
    expect(point.after).toBeDefined();
    expect(point.interpretation.id.length).toBeGreaterThan(0);
    expect(point.confidence).toBeTypeOf("string");
    expect(point.replayHint.to).toBeGreaterThan(point.replayHint.from);
  });

  it("never reports a point whose measured swing is zero", () => {
    // A lost fight in a game that was already decided: the event happened, but the state did not
    // move. The prompt forbids presenting that as an inflection, even a weak one.
    const points = inflectionPoints(
      sample(),
      timeline({
        goldDiff: [[0, -9000], [1800, -9000]],
        kills: [death(850, "a"), death(870, "b")],
        objectives: [objective(900, "baron")],
      }),
    );
    expect(points).toHaveLength(0);
  });

  it("orders the strongest point first", () => {
    const points = inflectionPoints(
      sample(),
      timeline({
        goldDiff: [[0, 0], [800, 9000], [1000, -9000], [1800, -9000]],
        kills: [death(850, "a"), death(870, "b")],
        objectives: [objective(900, "baron")],
      }),
    );
    const weight = { high: 3, medium: 2, low: 1, inconclusive: 0 } as const;
    for (let i = 1; i < points.length; i += 1) {
      expect(weight[points[i - 1].confidence]).toBeGreaterThanOrEqual(
        weight[points[i].confidence],
      );
    }
  });
});

describe("matchReport", () => {
  it("is honestly inconclusive when no inflection point holds up", () => {
    const report = matchReport(
      sample(),
      timeline({ goldDiff: [[0, 0], [600, 0], [1800, 0]], kills: [death(600)] }),
    );
    expect(report.confidence).toBe("inconclusive");
    expect(report.criticalAt).toBeNull();
    expect(report.inflections).toHaveLength(0);
  });

  it("names the limitation it cannot measure instead of pretending", () => {
    const report = matchReport(sample(), timeline());
    // The limitation is a message key the UI translates: the vision one is always declared.
    expect(report.notEvaluated.some((entry) => entry.id === "notEvaluatedText.noVision")).toBe(
      true,
    );
  });

  it("works for a won game too, without pretending the problem was a strength", () => {
    const report = matchReport(
      sample(true),
      timeline({
        goldDiff: [[0, 0], [800, -2000], [1000, 4000], [1800, 6000]],
        kills: [kill(850, "a"), kill(870, "b")],
        objectives: [objective(900, "baron")],
      }),
    );
    expect(report.win).toBe(true);
    if (report.criticalAt !== null) {
      // Todo `InflectionKind` descreve algo que deu errado. Numa vitória a leitura honesta é
      // "apesar disto, venceu" — chamar de "ponto forte" seria elogiar o próprio problema.
      // A manchete é a chave do enquadramento, então o teste não depende do idioma.
      expect(report.headline.id).toBe("frames.wonDespite");
      expect(report.headlineWhat).not.toBeNull();
    }
  });

  it("never calls a losing event a strength just because the game was won", () => {
    // O caso que apareceu na tela do time: vitória em que a vantagem caiu de 4.033 para 1.521.
    // A manchete dizia "Ponto forte: a vantagem de ouro caiu de 4033 para 1521".
    const report = matchReport(
      sample(true),
      timeline({
        goldDiff: [[0, 0], [600, 4033], [1000, 3900], [1800, 1521]],
        objectives: [objective(1100, "dragon")],
      }),
    );
    if (report.criticalAt !== null) {
      expect(report.headline.id).not.toBe("frames.mainProblem");
      expect(report.headline.id).toBe("frames.wonDespite");
    }
  });

  it("describes the gold move itself, not the match result", () => {
    // "Ganho" e "perda" são o que o ouro fez no recorte: a partida vencida não transforma uma queda
    // de 2.512 em ganho.
    const report = matchReport(
      sample(true),
      timeline({
        goldDiff: [[0, 0], [600, 4033], [1000, 3900], [1800, 1521]],
        objectives: [objective(1100, "dragon")],
      }),
    );
    if (report.criticalAt !== null) {
      // A direção viaja como valor da interpolação, coerente com o ouro no recorte.
      expect(report.impact.values?.direction).toBe("loss");
    }
  });

  it("keeps loss reports pointing at the problem", () => {
    const report = matchReport(
      sample(false),
      timeline({
        goldDiff: [[0, 0], [600, 2000], [1000, -3000], [1800, -5000]],
        kills: [death(850), death(870)],
      }),
    );
    if (report.criticalAt !== null) {
      // A derrota aponta o problema; nunca vira "apesar disto, venceu".
      expect(report.headline.id).toBe("frames.mainProblem");
    }
  });
});
