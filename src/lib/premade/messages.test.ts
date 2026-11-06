// Proves every recommendation rule has a title and a body in every locale, so the UI never shows
// a raw key like `premade.recommendations.rules.positiveStreak.body` to the user.
//
// The second half proves the same thing for the `Text` descriptors the pure modules emit: a module
// returns a key + values and the panel looks the key up directly, so a key the module writes but the
// catalog lacks reaches the user as `MISSING_MESSAGE` — which happened in production for
// `diagnosis.source.games`. These tests walk what the modules really emit, not what the source
// happens to say, so a new branch without a translation fails here instead of in the browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CODES } from "./recommendations";
import { INDIVIDUAL_RECOMMENDATION_CODES } from "./individual-recommendations";
import { diagnoseRoster } from "./individual-diagnosis";
import type { Text } from "./i18n";

const LOCALES = ["en", "pt-BR"];

function catalogFor(locale: string): Record<string, unknown> {
  const file = join(process.cwd(), "messages", locale, "premade.json");
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** `a.b.c` resolved against the catalog, or undefined when any step is missing. */
function lookup(catalog: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      catalog,
    );
}

// A varredura é explícita em `textTargets` (campo a campo) justamente porque o namespace de cada
// `Text` depende do prefixo do id — um coletor genérico não saberia onde procurar.

function rules(
  locale: string,
): Record<string, { title?: string; body?: string }> {
  const json = catalogFor(locale) as {
    recommendations?: {
      rules?: Record<string, { title?: string; body?: string }>;
    };
  };
  return json.recommendations?.rules ?? {};
}

describe("recommendation messages", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every rule code has a title and a body`, () => {
      const catalog = rules(locale);
      // The group rules and the individual ones live in the same `rules` catalog.
      const missing = [
        ...RECOMMENDATION_CODES,
        ...INDIVIDUAL_RECOMMENDATION_CODES,
      ].filter((code) => !catalog[code]?.title || !catalog[code]?.body);
      expect(missing).toEqual([]);
    });

    it(`${locale}: positiveStreak is translated (the key that used to leak)`, () => {
      expect(rules(locale).positiveStreak?.body).toBeTruthy();
    });

    it(`${locale}: no rule text is a raw key`, () => {
      const catalog = rules(locale);
      for (const [code, rule] of Object.entries(catalog)) {
        expect(rule.title, code).not.toContain("premade.");
        expect(rule.body, code).not.toContain("premade.");
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Os `Text` que os módulos puros emitem
// ---------------------------------------------------------------------------------------------

/**
 * Cada entrada aponta um `Text` para o namespace onde ele DEVE ser procurado. A distinção importa:
 * `reason.*`/`exercise.*` vivem em `diagnosis.text.*`, mas `source.*` vive diretamente em
 * `diagnosis.source.*`. Assumir um prefixo único foi exatamente o bug que chegou à produção
 * (`text.source.games`) — por isso o namespace é escolhido pelo prefixo do id, como no painel.
 *
 * A regra é espelhada do painel (`TEXT_PREFIX` em individual-diagnosis-panel.tsx). Se as duas
 * cópias divergirem, o teste passa enquanto a interface mostra a chave — foi o que aconteceu com
 * `diagnosis.exercise.*`. A guarda contra isso é o teste "the panel lookup matches the catalog"
 * mais abaixo, que usa o mesmo resolvedor do painel.
 */
function textTargets(): { namespace: string; text: Text }[] {
  const targets: { namespace: string; text: Text }[] = [];

  // O `id` já carrega o prefixo (`source.x`, `text.reason.y`); aqui só decidimos sob qual nó procurar.
  const diagnosisSpace = (id: string) => (id.startsWith("source.") ? "diagnosis" : "diagnosis.text");

  const addDiagnosis = (diagnoses: ReturnType<typeof diagnoseRoster>) => {
    for (const diagnosis of diagnoses) {
      targets.push({ namespace: diagnosisSpace(diagnosis.confidenceReason.id), text: diagnosis.confidenceReason });
      targets.push({ namespace: diagnosisSpace(diagnosis.exercise.id), text: diagnosis.exercise });
      for (const entry of diagnosis.evidence) {
        targets.push({ namespace: diagnosisSpace(entry.source.id), text: entry.source });
      }
    }
  };

  // Uma amostra que percorre os ramos: farm atrás/à frente, mortes excessivas e do time, KP, combate,
  // visão, função instável e amostra pequena.
  const base = diagnosisDepth();
  /** O caso em que a morte é claramente da pessoa: bem acima da média do grupo e isolada. */
  const heavy = diagnosisDepth();
  heavy.summary = { ...heavy.summary, deathsPerGame: 9 };
  heavy.deaths = { ...heavy.deaths, aloneShare: 70 };
  heavy.person = "p2";
  addDiagnosis(
    diagnoseRoster({
      depths: [
        base,
        heavy,
        { ...base, person: "p3", summary: { ...base.summary, deathsPerGame: 1 } },
        { ...base, person: "p4", roles: ["TOP", "JUNGLE", "MIDDLE"] },
        {
          ...base,
          person: "p5",
          vision: { ...base.vision, visionPerMin: 4 },
        },
        {
          ...base,
          person: "p6",
          combat: { ...base.combat, damagePerDeath: 100 },
          early: { ...base.early, at10: { ...base.early.at10, xpDiff: -900, csDiff: -40 } },
          summary: { ...base.summary, killParticipation: 0.2, games: 3, deathsPerGame: 6 },
          deaths: { ...base.deaths, aloneShare: 10 },
        },
      ],
      names: new Map(),
      teamDeathsPerGame: 4,
      rosterDeathsPerPerson: 4,
      teamGames: 20,
      fullGames: 20,
    }),
  );

  return targets;
}

/** Um `PlayerDepth` com tudo o que o diagnóstico lê preenchido, para os ramos rodarem de verdade. */
function diagnosisDepth(): Parameters<typeof diagnoseRoster>[0]["depths"][number] {
  return {
    person: "p1",
    summary: {
      games: 20,
      wins: 10,
      winRate: 50,
      kda: 2.5,
      killParticipation: 0.7,
      damagePerMin: 600,
      goldPerMin: 400,
      csPerMin: 7,
      visionPerMin: 1,
      deathsPerGame: 4,
      deadTimeShare: 10,
    },
    champions: [],
    pings: { perGame: {} as never, total: 2, games: 20, teamTotal: 2, aboveTeam: 5, deathsWithReplies: 3, deathsWithoutReplies: 4, replySplitGames: 20 },
    early: {
      games: 20,
      at10: { cs: 70, csDiff: -30, xpDiff: -600, goldDiff: -500 },
      at15: { cs: 110, csDiff: -20, xpDiff: -400, goldDiff: -300 },
      firstBlood: { games: 20, kills: 1, assists: 2 },
      deathsBefore10: 1,
      deathsBefore10Games: 20,
      laneGames: 20,
    },
    vision: { games: 20, wardsPlaced: 10, wardsKilled: 2, controlWards: 1, visionPerMin: 0.2, teamPerMin: 1.5, laneAveragePerMin: 1.1, laneGames: 20 },
    combat: { games: 20, damagePerDeath: 300, damageTakenPerGame: 20000, damageShare: 20, goldShare: 20, killShare: 20, soloKills: 1, doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: 2, killingSprees: 1, firstBloodKills: 1, firstBloodAssists: 1 } as never,
    deaths: { total: 80, byPhase: {} as never, byRegion: {} as never, alone: 60, aloneShare: 75, costly: 10, costlyShare: 12.5, games: 20 },
    objectives: {} as never,
    trend: {} as never,
    synergy: { best: [], worst: [] },
    fieldGames: 20,
    derivedGames: 20,
    games: 20,
    roles: ["MIDDLE"],
  } as Parameters<typeof diagnoseRoster>[0]["depths"][number];
}

describe("Text descriptors emitted by the pure modules", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every diagnosis text resolves (reason, exercise and evidence source)`, () => {
      const catalog = catalogFor(locale);
      const missing: string[] = [];
      for (const target of textTargets()) {
        const path = `${target.namespace}.${target.text.id}`;
        if (typeof lookup(catalog, path) !== "string") missing.push(path);
      }
      expect(missing).toEqual([]);
    });
  }

  it("the diagnosis lookup uses the id as-is, not with a guessed prefix", () => {
    // Trava a regressão: `source.games` existe em `diagnosis.source`, nunca em `diagnosis.text`.
    const catalog = catalogFor("en");
    expect(typeof lookup(catalog, "diagnosis.source.games")).toBe("string");
    expect(lookup(catalog, "diagnosis.text.source.games")).toBeUndefined();
  });

  // -------------------------------------------------------------------------------------------
  // O resolvedor do painel, reproduzido
  // -------------------------------------------------------------------------------------------
  /**
   * Cópia de `renderText`/`TEXT_PREFIX` de `individual-diagnosis-panel.tsx`. O teste acima procura
   * no namespace que ELE acredita (`diagnosis.text.*`) e por isso passou enquanto o painel mostrava
   * `premade.diagnosis.exercise.combatStrength` na tela: o painel procurava em `diagnosis.*`, onde
   * `exercise` é o rótulo "Exercício recomendado", e não no objeto `diagnosis.text.exercise`.
   *
   * Aqui a chave é resolvida do MESMO jeito que a interface resolve, com o namespace de verdade
   * (`premade.diagnosis`), e o teste falha se o resultado não for uma string traduzível.
   */
  const TEXT_PREFIX = {
    reason: "text.reason",
    exercise: "text.exercise",
    source: "source",
  } as const;

  function panelKey(id: string): string {
    const [group, ...rest] = id.split(".");
    const prefix = TEXT_PREFIX[group as keyof typeof TEXT_PREFIX];
    return prefix ? `${prefix}.${rest.join(".")}` : id;
  }

  for (const locale of LOCALES) {
    it(`${locale}: every diagnosis Text resolves under premade.diagnosis, as the panel looks it up`, () => {
      const catalog = catalogFor(locale);
      const missing: string[] = [];
      for (const target of textTargets()) {
        const key = panelKey(target.text.id);
        const found = lookup(catalog, `diagnosis.${key}`);
        // O painel precisa de uma string; um objeto aninhado chegando aqui vira chave crua na tela.
        if (typeof found !== "string") missing.push(`diagnosis.${key}`);
      }
      expect(missing).toEqual([]);
    });
  }

  it("an id that lands on a label is not silently accepted", () => {
    // `diagnosis.exercise` é o rótulo (string). Se o prefixo sumir, o painel acha o rótulo no lugar
    // da frase; este teste prova que o resolvedor real não faz isso.
    const catalog = catalogFor("pt-BR");
    expect(typeof lookup(catalog, "diagnosis.exercise")).toBe("string");
    expect(panelKey("exercise.combatStrength")).toBe("text.exercise.combatStrength");
    expect(typeof lookup(catalog, "diagnosis.text.exercise.combatStrength")).toBe("string");
  });
});

describe("the two locales carry the same keys", () => {
  it("no key exists in one locale and not the other", () => {
    const paths = (value: unknown, prefix = ""): string[] => {
      if (value === null || typeof value !== "object") return [prefix];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        paths(entry, prefix ? `${prefix}.${key}` : key),
      );
    };
    const en = paths(catalogFor("en")).sort();
    const pt = paths(catalogFor("pt-BR")).sort();
    expect(en.filter((key) => !pt.includes(key))).toEqual([]);
    expect(pt.filter((key) => !en.includes(key))).toEqual([]);
  });
});
