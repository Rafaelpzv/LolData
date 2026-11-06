import { beforeEach, describe, expect, it, vi } from "vitest";

// The batch is exercised end to end: Riot is replaced by an in-memory fake, so this follows
// exactly what the button does — a loop of calls that must end with done=true and, on the second
// update, cost one request per account.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";
process.env.RIOT_API_KEY ??= "test-riot-key";

const NOW = 1_700_000_000_000;
/** A game every hour, so the ids carry the creation date the collection expects. */
const gameId = (hour: number) => `BR1_${NOW + hour * 3_600_000}`;

const PEOPLE = ["p1", "p2", "p3", "p4", "p5"];
/** Seven accounts: p1 and p2 have two each, and two of them played nothing in Flex. */
const ACCOUNTS = ["acc1", "acc6", "acc2", "acc7", "acc3", "acc4", "acc5"];
const OWNERS: Record<string, string> = {
  acc1: "p1",
  acc6: "p1",
  acc2: "p2",
  acc7: "p2",
  acc3: "p3",
  acc4: "p4",
  acc5: "p5",
};

const db = vi.hoisted(() => ({
  sessions: new Map<string, any>(),
  cursors: new Map<string, any>(),
  presence: new Map<string, Set<string>>(),
  matches: new Set<string>(),
  /** PUUID -> Flex game ids, newest first. */
  lists: new Map<string, string[]>(),
  /** Every list request, in order: what the tests count and compare. */
  idRequests: [] as {
    puuid: string;
    start: number;
    count: number;
    startTime: string | null;
  }[],

  detailRequests: 0,
  sequence: 0,
}));

vi.mock("./repository", () => ({
  getTeamById: async () => ({
    id: "team",
    slug: "team",
    name: "Team",
    region: "br1",
    createdAt: "",
    members: [],
  }),
  getPlayers: async () =>
    PEOPLE.map((person, index) => ({
      id: person,
      gameName: person,
      slot: index + 1,
      archived: false,
      accounts: ACCOUNTS.filter((account) => OWNERS[account] === person).map(
        (puuid) => ({
          puuid,
          playerId: person,
          gameName: puuid,
          tagLine: "BR1",
          archived: false,
        }),
      ),
    })),
  getAccountOwners: async () => ({ ...OWNERS }),
  getCollectedMatchIds: async () => new Set(db.matches),
  getMatchIdsNeedingChampionData: async () => new Set<string>(),
  getCollectionCursors: async () =>
    new Map(
      [...db.cursors.entries()].map(([puuid, row]) => [
        puuid,
        {
          puuid,
          nextStart: row.nextStart,
          finished: row.finished,
          pagesFetched: 0,
          epoch: row.epoch,
          emitted: row.emitted ?? 0,
          lastListedAt: 0,
        },
      ]),
    ),
  saveCollectionCursor: async (_team: string, puuid: string, state: any) => {
    db.cursors.set(puuid, { ...state });
  },
  getMatchPresence: async () =>
    new Map(
      [...db.presence].map(([matchId, people]) => [matchId, new Set(people)]),
    ),
  saveMatchPresence: async (
    _team: string,
    entries: { matchId: string; people: string[] }[],
  ) => {
    for (const entry of entries)
      db.presence.set(entry.matchId, new Set(entry.people));
  },
  openCollectionSession: async (_team: string, options: any) => {
    const open = [...db.sessions.values()].filter(
      (session) => !session.finished,
    );
    if (!options.restart && open.length > 0)
      return { ...open[open.length - 1] };
    for (const session of open) session.finished = true;
    const session = {
      id: `session-${++db.sequence}`,
      minRoster: options.minRoster,
      nextStart: {},
      accountStart: {},
      ids: {},
      games: {},
      scansDone: 0,
      scansTotal: options.scansTotal,
      rosterKey: options.rosterKey,
      finished: false,
      error: null,
    };
    db.sessions.set(session.id, session);
    return { ...session };
  },
  saveCollectionSession: async (sessionId: string, state: any) => {
    Object.assign(db.sessions.get(sessionId), state);
  },
  finishCollectionSession: async (sessionId: string) => {
    db.sessions.get(sessionId).finished = true;
  },
  saveMatchSamples: async (_team: string, samples: { matchId: string }[]) => {
    for (const sample of samples) db.matches.add(sample.matchId);
  },
}));

// Riot, replaced: the helpers that do not touch the network are kept (the batch imports them).
vi.mock("@/lib/riot/match-v5", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/riot/match-v5")>();
  return {
    ...actual,
    safeFetch: async (url: string) => {
      const parsed = new URL(url);
      const listPath = /\/matches\/by-puuid\/([^/]+)\/ids$/.exec(
        parsed.pathname,
      );
      if (listPath) {
        const puuid = decodeURIComponent(listPath[1]);
        const start = Number(parsed.searchParams.get("start") ?? 0);
        const count = Number(parsed.searchParams.get("count") ?? 100);
        const startTime = parsed.searchParams.get("startTime");
        db.idRequests.push({ puuid, start, count, startTime });
        // Riot: `startTime` is in SECONDS and means "created after this moment". The id carries no
        // date, so the fake list compares the game's own timestamp, not the id.
        const list = (db.lists.get(puuid) ?? []).filter(
          (id) =>
            startTime === null ||
            Number(id.split("_").pop()) > Number(startTime) * 1000,
        );
        return json(list.slice(start, start + count));
      }
      db.detailRequests += 1;
      const matchId = decodeURIComponent(
        parsed.pathname.split("/").pop() ?? "",
      );
      // The roster accounts that played it: exactly how Riot returns a game with five of them.
      const creators = ACCOUNTS.filter((puuid) =>
        (db.lists.get(puuid) ?? []).includes(matchId),
      );
      // A real queue-440 game: both sides present, with the fields the sample reads.
      const participant = (puuid: string, teamId: number, index: number) => ({
        puuid,
        teamId,
        win: teamId === 100,
        kills: 1,
        deaths: 1,
        assists: 1,
        goldEarned: 1000,
        champExperience: 500,
        totalMinionsKilled: 100,
        neutralMinionsKilled: 10,
        visionScore: 20,
        totalDamageDealtToChampions: 1000,
        totalDamageTaken: 1000,
        championId: 100 + index,
        championName: `Champ${index}`,
        teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][index],
      });
      return json({
        metadata: { matchId },
        info: {
          queueId: 440,
          gameDuration: 1800,
          gameEndTimestamp: Number(matchId.split("_").pop()),
          participants: [
            ...creators.map((puuid, index) =>
              participant(puuid, 100, index % 5),
            ),
            ...Array.from({ length: 5 }, (_, index) =>
              participant(`enemy-${index}`, 200, index),
            ),
          ],
          teams: [
            { teamId: 100, win: true, objectives: {} },
            { teamId: 200, win: false, objectives: {} },
          ],
        },
      });
    },
  };
});

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const { collectBatch } = await import("./collect-batch");

/** The button: call the batch until it reports done, exactly like the client's loop. */
async function updateToTheEnd(maxCalls = 50) {
  const steps = [];
  for (let call = 1; call <= maxCalls; call++) {
    const step = await collectBatch("team", { budgetMs: 60_000 });
    steps.push(step);
    if (step.error) throw new Error(`batch failed: ${step.error}`);
    if (step.done) return steps;
  }
  throw new Error(`never finished after ${maxCalls} calls`);
}

beforeEach(() => {
  // The real key would wait on the rate limiter: the fake Riot answers instantly.
  vi.stubEnv("PREMADE_REQUESTS_PER_SECOND", "10000");
  vi.stubEnv("PREMADE_BATCH_BUDGET_MS", "60000");
  // The clock the batch reads: the games below are older than "now".
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  db.sessions.clear();
  db.cursors.clear();
  db.presence.clear();
  db.matches.clear();
  db.lists.clear();
  db.idRequests = [];
  db.detailRequests = 0;

  // Three games listed by five accounts (the candidates) and 40 games that only acc7 played.
  const shared = [11, 10, 9].map((hour) => gameId(hour));
  for (const account of ["acc1", "acc2", "acc3", "acc4", "acc5"])
    db.lists.set(account, [...shared]);
  db.lists.set(
    "acc7",
    Array.from({ length: 40 }, (_, i) => gameId(-i - 1)),
  );
  db.lists.set("acc6", []);
});

describe("collectBatch — one complete update", () => {
  it("ends with done=true and saves the shared games", async () => {
    const steps = await updateToTheEnd();
    const last = steps[steps.length - 1];
    expect(last.done).toBe(true);
    expect(steps.reduce((sum, step) => sum + step.saved, 0)).toBe(3);
    expect(db.matches.size).toBe(3);
    // The presence is stored per match with the people that listed it (not the accounts).
    expect([...(db.presence.get(gameId(10)) ?? [])].sort()).toEqual(PEOPLE);
    // The seven accounts were read, and the epoch of each one is the newest game it listed.
    expect(new Set(db.idRequests.map((request) => request.puuid)).size).toBe(
      ACCOUNTS.length,
    );
    expect(db.cursors.get("acc1").epoch).toBe(NOW + 11 * 3_600_000);
  });

  it("the second update costs a handful of calls and saves nothing", async () => {
    await updateToTheEnd();
    db.idRequests = [];
    db.detailRequests = 0;

    const steps = await updateToTheEnd();
    expect(steps[steps.length - 1].done).toBe(true);
    expect(steps.reduce((sum, step) => sum + step.saved, 0)).toBe(0);
    // Candidates already stored are not downloaded again.
    expect(db.detailRequests).toBe(0);
    // Uma requisição por conta: o epoch real faz a atualização ser só a primeira página.
    expect(db.idRequests).toHaveLength(ACCOUNTS.length);
    for (const request of db.idRequests) {
      // Página cheia: pedir 1 jogo por vez era o que deixava o botão sem trazer histórico.
      expect(request.count).toBe(100);
      // O Riot lê startTime em SEGUNDOS; mandar milissegundos devolvia zero jogos.
      expect(request.startTime).toBe(
        String(Math.floor(Number(db.cursors.get(request.puuid).epoch) / 1000)),
      );
    }
  });

  it("only the new game of the second update is read: old ones are never fresh again", async () => {
    await updateToTheEnd();
    const newest = gameId(12);
    for (const account of ["acc1", "acc2", "acc3", "acc4", "acc5"]) {
      db.lists.set(account, [newest, ...(db.lists.get(account) ?? [])]);
    }
    db.idRequests = [];
    db.detailRequests = 0;
    await updateToTheEnd();
    expect(db.matches.has(newest)).toBe(true);
    expect(db.matches.size).toBe(4);
    // Five accounts listed the new game: it is a candidate and was downloaded once. The three old
    // games, already stored, were not listed again and were not downloaded again.
    expect(db.detailRequests).toBe(1);
    // Every account reaches the new game as a startTime look: nothing walks from the top of the
    // list, so the games already listed are never listed again.
    const first = new Map<string, string | null>();
    for (const request of db.idRequests)
      if (!first.has(request.puuid))
        first.set(request.puuid, request.startTime);
    expect(first.size).toBe(ACCOUNTS.length);
    expect([...first.values()].every((value) => value !== null)).toBe(true);
    // An account that listed nothing gets an epoch from the window it was asked for, not zero: the
    // next update does not ask for its whole history again.
    expect(Number(db.cursors.get("acc6").epoch)).toBeGreaterThan(0);
  });
});




  it("PROBE cursors", async () => {
    await updateToTheEnd();
    for (const [puuid, state] of db.cursors) {
      console.log("CURSOR", puuid, JSON.stringify({
        nextStart: state.nextStart,
        epoch: state.epoch,
        epochDate: state.epoch ? new Date(Number(state.epoch)).toISOString().slice(0, 10) : "-",
        finished: state.finished,
      }));
    }
  });

describe("collectBatch — a walk that does not fit in one batch", () => {
  it("resumes from the stored cursor instead of starting over", async () => {
    db.lists.set(
      "acc7",
      Array.from({ length: 60 }, (_, i) => gameId(-i - 1)),
    );
    // The per-batch allowance is smaller than the whole walk (7 accounts x 1 page): every batch
    // stops with the cursor spent and the next one continues from exactly where it stopped.
    vi.stubEnv("PREMADE_SCAN_PER_BATCH", "2");
    const steps = [];
    for (let call = 1; call <= 40; call++) {
      const step = await collectBatch("team", {
        mode: "full",
        restart: call === 1,
      });
      steps.push(step);
      if (step.done) break;
    }
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[steps.length - 1].done).toBe(true);
    // The walk really was split: every batch but the last one ran out of the allowance.
    expect(steps.slice(0, -1).every((step) => step.budgetHit)).toBe(true);
    // scansDone is the session total: it never goes back after a batch.
    const scans = steps.map((step) => step.scansDone);
    for (let i = 1; i < scans.length; i++)
      expect(scans[i]).toBeGreaterThanOrEqual(scans[i - 1]);
    // Every call read at least one page: no batch wasted the turn, and the last one grew.
    expect(steps.every((step) => step.reads > 0)).toBe(true);
    expect(scans[scans.length - 1]).toBeGreaterThan(scans[0]);
    // No offset was requested twice: each batch continued where the previous one stopped.
    const offsets = db.idRequests.map(
      (request) => `${request.puuid}@${request.start}`,
    );
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});
