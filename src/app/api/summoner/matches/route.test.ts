import { describe, expect, it } from "vitest";

// The Supabase client is built at import time: dummy values, so importing the route never connects.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";

const { matchesQueueFilter, isClassicModeQueue } = await import("./route");

/**
 * O filtro de partidas do histórico: o `queueId` de cada partida, não o `gameMode`.
 *
 * A armadilha que este teste protege: TODO jogo CLASSIC tem `info.gameMode === "CLASSIC"`, então
 * casar pelo modo faria o filtro devolver Flex e Ranked Solo/Duo também. Quem diz o que está sendo
 * filtrado é `info.queueId` (440 Flex, 710 CLASSIC).
 */
describe("matchesQueueFilter", () => {
  const game = (queueId: number, gameMode = "CLASSIC") => ({
    info: { queueId, gameMode },
  });

  it("keeps the CLASSIC game when the filter is 710", () => {
    expect(matchesQueueFilter(game(710), "710")).toBe(true);
  });

  it("drops every other CLASSIC-mode queue: 440, 420 and 400 are CLASSIC too", () => {
    expect(matchesQueueFilter(game(440), "710")).toBe(false);
    expect(matchesQueueFilter(game(420), "710")).toBe(false);
    expect(matchesQueueFilter(game(400), "710")).toBe(false);
    expect(matchesQueueFilter(game(450, "ARAM"), "710")).toBe(false);
  });

  it("keeps every game when there is no filter", () => {
    expect(matchesQueueFilter(game(440), "")).toBe(true);
    expect(matchesQueueFilter(game(710), "")).toBe(true);
  });

  it("filters by queue for the other queues as well", () => {
    expect(matchesQueueFilter(game(440), "440")).toBe(true);
    expect(matchesQueueFilter(game(710), "440")).toBe(false);
  });

  it("falls back to the game mode when the detail carries no queue", () => {
    expect(matchesQueueFilter({ info: { gameMode: "CLASSIC" } }, "CLASSIC")).toBe(true);
    expect(matchesQueueFilter({ info: { gameMode: "CLASSIC" } }, "710")).toBe(false);
  });

  it("reads the CLASSIC mode only for the 710 filter", () => {
    expect(isClassicModeQueue("710")).toBe(true);
    expect(isClassicModeQueue("440")).toBe(false);
    expect(isClassicModeQueue("all")).toBe(false);
  });
});
