import { beforeAll, describe, expect, it } from "vitest";

import type { PremadeParticipantSample } from "./types";

// The repository builds its Supabase clients at import time (browser and admin); the helpers tested
// here never call them, so the values only have to be well-formed, not reachable.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "dummy";
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.dummy";
});

const person = (
  deaths: number,
  assists: number,
): Pick<PremadeParticipantSample, "deaths" | "assists"> => ({
  deaths,
  assists,
});

describe("sideTotalsFromParticipants", () => {
  it("sums the five participants of the side", async () => {
    const { sideTotalsFromParticipants } = await import("./repository");
    expect(
      sideTotalsFromParticipants([
        person(3, 5),
        person(2, 7),
        person(4, 2),
        person(1, 9),
        person(5, 1),
      ]),
    ).toEqual({ teamDeaths: 15, sideAssists: 24 });
  });

  it("refuses a side that is not the full five: a partial sum is never the side's", async () => {
    const { sideTotalsFromParticipants } = await import("./repository");
    expect(sideTotalsFromParticipants([person(3, 5)])).toBeNull();
    expect(
      sideTotalsFromParticipants([person(3, 5), person(2, 7)]),
    ).toBeNull();
    expect(sideTotalsFromParticipants([])).toBeNull();
  });
});
