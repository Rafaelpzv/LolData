import { describe, expect, it } from "vitest";

import { progressOf, type LoopBody, type ProgressState } from "./loop-progress";

/**
 * Runs batches one after another, exactly like the button does: one batch without movement is
 * retried, two in a row (no cursor and no saved game) end the loop with an error.
 */
function runLoop(batches: LoopBody[], options = {}) {
  let state: ProgressState | null = null;
  let stalls = 0;
  for (let calls = 1; calls <= batches.length; calls++) {
    const body = batches[calls - 1];
    if (body.error) return { outcome: "stuck", calls, why: "error" };
    if (body.done || body.calls === 0) return { outcome: "done", calls };
    const next = progressOf(body, state, options);
    if (next === "stalled") {
      stalls += 1;
      if (stalls > 1) return { outcome: "stuck", calls, why: "stalled" };
      continue;
    }
    stalls = 0;
    state = next;
  }
  return { outcome: "running", calls: batches.length };
}

describe("progressOf", () => {
  it("advances while scansDone grows", () => {
    expect(
      runLoop([
        { scansDone: 9, reads: 9 },
        { scansDone: 14, reads: 14 },
        { scansDone: 19, reads: 19, done: true },
      ]),
    ).toEqual({ outcome: "done", calls: 3 });
  });

  it("stops when two batches in a row do not move the cursor", () => {
    // The bug the button had: 9 scans and zero candidates, batch after batch.
    expect(
      runLoop([
        { scansDone: 9, reads: 9, saved: 0 },
        { scansDone: 9, reads: 9, saved: 0 },
        { scansDone: 9, reads: 9, saved: 0 },
      ]),
    ).toEqual({ outcome: "stuck", calls: 3, why: "stalled" });
  });

  it("one batch without movement is not a failure: it is retried once", () => {
    expect(
      runLoop([
        { scansDone: 9, saved: 0 },
        { scansDone: 14, saved: 0 },
        { scansDone: 20, done: true },
      ]),
    ).toEqual({ outcome: "done", calls: 3 });
  });

  it("reads are progress: an update that keeps reading old games is not stalled", () => {
    // The game read was old, so scansDone (listing) does not move; the reads do.
    expect(
      runLoop([
        { scansDone: 7, reads: 7 },
        { scansDone: 7, reads: 12 },
        { scansDone: 7, reads: 17, done: true },
      ]),
    ).toEqual({ outcome: "done", calls: 3 });
  });

  it("saving a game counts as progress even when the cursor did not move", () => {
    expect(
      runLoop([
        { scansDone: 9, saved: 0 },
        { scansDone: 9, saved: 2 },
        { scansDone: 20, done: true },
      ]),
    ).toEqual({
      outcome: "done",
      calls: 3,
    });
  });

  it("stops at once when the batch reports it cannot move", () => {
    expect(runLoop([{ scansDone: 9, error: "noProgress" }])).toEqual({
      outcome: "stuck",
      calls: 1,
      why: "error",
    });
  });

  it("follows a counter that counts down (recollect, ranks)", () => {
    expect(
      runLoop(
        [{ total: 40, remaining: 30 }, { remaining: 20 }, { remaining: 10 }],
        { progressKeys: ["remaining"] },
      ),
    ).toEqual({ outcome: "running", calls: 3 });
    expect(
      runLoop([{ remaining: 30 }, { remaining: 30 }, { remaining: 30 }], {
        progressKeys: ["remaining", "accountsRemaining"],
      }),
    ).toEqual({ outcome: "stuck", calls: 3, why: "stalled" });
  });

  it("uses the whole answer only when the endpoint has no counter", () => {
    expect(
      runLoop(
        [{ total: 40, withTimeline: 10 }, { total: 40 }, { done: true }],
        { progressKeys: [] },
      ),
    ).toEqual({
      outcome: "done",
      calls: 3,
    });
    expect(
      runLoop([{ total: 40 }, { total: 40 }, { total: 40 }], {
        progressKeys: [],
      }),
    ).toEqual({
      outcome: "stuck",
      calls: 3,
      why: "stalled",
    });
  });
});
