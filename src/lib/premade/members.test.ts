import { describe, expect, it } from "vitest";

import {
  PREMADE_MIN_SIZE,
  buildMembers,
  splitRiotIdInput,
  teamSlug,
} from "./members";

describe("splitRiotIdInput", () => {
  it("splits by newline, comma and semicolon and keeps valid IDs", () => {
    expect(splitRiotIdInput("A#1\nB#2, C#3; D#4\nE#5")).toEqual([
      "A#1",
      "B#2",
      "C#3",
      "D#4",
      "E#5",
    ]);
  });

  it("drops entries without a complete tag", () => {
    expect(splitRiotIdInput("A#1, semTag, #tag, B#2,, ")).toEqual([
      "A#1",
      "B#2",
    ]);
  });
});

describe("buildMembers", () => {
  const players = [0, 1, 2, 3, 4].map((slot) => ({
    slot,
    puuid: `puuid-${slot}`,
    gameName: `P${slot}`,
    tagLine: `T${slot}`,
  }));

  it("keeps five distinct players in slot order", () => {
    const result = buildMembers([...players].reverse());
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.members.map((m) => m.slot)).toEqual([0, 1, 2, 3, 4]);
  });

  it("accepts a trio and a quartet", () => {
    const trio = buildMembers(players.slice(0, PREMADE_MIN_SIZE));
    expect(trio.ok).toBe(true);
    if (trio.ok) expect(trio.members).toHaveLength(PREMADE_MIN_SIZE);

    const quartet = buildMembers(players.slice(0, 4));
    expect(quartet.ok).toBe(true);
    if (quartet.ok) expect(quartet.members).toHaveLength(4);
  });

  it("rejects repeated players", () => {
    // Same account twice: the sixth entry does not fit, so only the duplicate remains.
    const result = buildMembers([...players.slice(0, 4), players[0]]);
    expect(result).toEqual({ ok: false, error: "duplicatePlayers" });
  });

  it("rejects an incomplete team", () => {
    expect(buildMembers(players.slice(0, PREMADE_MIN_SIZE - 1))).toEqual({
      ok: false,
      error: "duplicatePlayers",
    });
  });

  it("rejects a team bigger than a Flex side", () => {
    const sixth = { slot: 5, puuid: "puuid-5", gameName: "P5", tagLine: "T5" };
    expect(buildMembers([...players, sixth])).toEqual({
      ok: false,
      error: "duplicatePlayers",
    });
  });
});

describe("teamSlug", () => {
  it("is URL-safe and keeps a readable prefix", () => {
    const slug = teamSlug("Time do Rifu Nº");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.startsWith("time-do-rifu-n-")).toBe(true);
  });

  it("ends with six digits so the address is not guessable", () => {
    // The page is readable by whoever holds the link: the suffix is the only secret in the URL.
    for (let i = 0; i < 20; i += 1) {
      expect(teamSlug("Time")).toMatch(/^time-\d{6}$/);
    }
  });
});
