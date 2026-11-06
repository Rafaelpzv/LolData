// Pure rules of one collection batch: how far each account is read, and who listed each game.
// No I/O: the batch (collect-batch.ts) owns the Riot calls and the database, the tests own these.
//
// One cursor per account (`nextStart`) is enough for both ways of reading a list:
// - "fresh" (the data button): first asks for the games newer than the stored epoch, then reads
//   from `nextStart` one game at a time, so it resumes where the previous batch stopped;
// - anything else: reads the 100-game windows from `nextStart`, page by page.

/** The list endpoint caps `count` at 100; that is also what Riot returns per page. */
export const PAGE_SIZE = 100;

/** Why a read stopped without listing anything: the next batch tries again. */
export type StopReason = "timeout" | "network" | "limit";

/** Where one account's list stands when a batch starts (what the database stored). */
export interface AccountCursor {
  puuid: string;
  /** Next offset to ask when reading page by page. Zero means "from the newest game". */
  nextStart: number;
  /** Creation time of the newest game this account already listed: the `startTime` of an update. */
  epoch: number;
  /** When this account last answered with a game it had never seen (0 when never). */
  listedAt: number;
}

/** One account's list while this batch reads it. */
export interface PageState extends AccountCursor {
  /** Which list this batch reads: "fresh" goes by epoch, anything else by page number. */
  mode: string;
  finished: boolean;
  /** Games one request may bring: 100 by default, 1 when looking for a single new game. */
  pageSize: number;
  /** Reads this batch already spent on this account. */
  reads: number;
  /** The last read failed: nothing of this batch advances this account. */
  error?: StopReason;
}

/**
 * How the next list request of an account is made:
 * - "fresh": the first page of the window, with `startTime` (in SECONDS, as Riot expects) as its
 *   floor — do not narrow this to a single game, that is what hid the history;
 * - "probe": one game after a page that was already read;
 * - "walk": read the window from `start`, `count` games at a time.
 */
export type StepPlan =
  | { kind: "fresh"; startTime: number; count: number }
  | { kind: "probe"; start: number; count: number }
  | { kind: "walk"; start: number; count: number };

export type StepResult =
  | { kind: "advance"; ids: string[] }
  | { kind: "end"; ids: string[]; caughtUp: boolean };

/** Caught up with the stored data: this account has nothing the team does not already have. */
export function caughtUp(page: PageState): boolean {
  return page.finished;
}

/**
 * A data de criação (ms) da partida mais nova desta conta, entre as que acabaram de ser baixadas.
 *
 * É a única fonte confiável de "até onde esta conta já foi lida": o id não carrega data. Devolve 0
 * quando nenhuma das partidas é desta conta, e aí o cursor mantém o epoch que já tinha.
 */
export function newestGameOf(
  matches: readonly {
    matchId: string;
    gameCreation: number;
    participants: readonly { puuid: string }[];
  }[],
  puuid: string,
): number {
  let newest = 0;
  for (const match of matches) {
    if (!match.participants.some((participant) => participant.puuid === puuid)) continue;
    newest = Math.max(newest, match.gameCreation);
  }
  return newest;
}

/**
 * The request to make next, or null when this account already told everything it will in this
 * run. `maxPages` bounds an account that keeps answering new games.
 *
 * Two situations, and the difference is what makes the button cheap after the first collection:
 *
 * - the account already knows its newest game (a real epoch): `startTime` guarantees the first page
 *   holds only games created after it, so one page is the whole update;
 * - the account has no real epoch (a new player, or a cursor left at "1970" by the old id rule):
 *   find out what it owns. That is a full walk, page by page, resuming from the stored offset.
 *
 * The old code asked for a single game per account and stopped. The id of a game does not carry its
 * creation time (BR1_3300862966 and KR_8441588382 are both "1970"), so the "is this newer than the
 * epoch?" test could never be true and the whole history of a new account never entered.
 */
export function planStep(page: PageState, maxPages: number): StepPlan | null {
  if (page.finished || page.error) return null;
  // A stored offset means this account was already read this deep: resume there.
  if (page.nextStart > 0) {
    if (page.nextStart >= maxPages * PAGE_SIZE) return null;
    return { kind: "walk", start: page.nextStart, count: page.pageSize };
  }
  if (page.epoch > 0)
    return { kind: "fresh", startTime: Math.floor(page.epoch / 1000), count: page.pageSize };
  return { kind: "walk", start: 0, count: page.pageSize };
}

/**
 * Turns one answer into where the account stands: how many games were walked, and whether the list
 * ended.
 *
 * The epoch is NOT touched here. It is the date of the newest game the account owns, and a list of
 * ids cannot tell that date (see `newestGameOf`): raising it from an id is what pinned every
 * cursor to 1970 and made the next update re-read the whole history.
 */
export function applyPage(
  page: PageState,
  plan: StepPlan,
  ids: string[],
  maxPages: number,
): StepResult {
  page.reads += 1;
  // Every page is one step of the offset, whatever asked for it. `fresh` is not special: it is the
  // first page of the same walk, with `startTime` only lowering where the window starts.
  page.nextStart = ("start" in plan ? plan.start : 0) + plan.count;
  if (ids.length === 0) {
    // A page answered nothing usable: the list ends here.
    page.finished = true;
    return { kind: "end", ids: [], caughtUp: false };
  }
  // `startTime` já cortou tudo o que a conta tinha: a primeira página É a atualização. Continuar
  // paginaria o histórico inteiro a cada clique. Sem `startTime` (conta nova), a lista é varrida
  // até o fim, senão só a primeira página de 100 jogos entraria.
  if (plan.kind === "fresh") page.finished = true;
  if (page.nextStart >= maxPages * PAGE_SIZE) page.finished = true;
  // A page shorter than asked is the end of the list: asking again would return the same games.
  if (ids.length < plan.count) page.finished = true;
  return { kind: "advance", ids };
}

/**
 * The numeric tail of a match id.
 *
 * It is NOT a creation timestamp, despite what an id like `BR1_3300862966` suggests: every region
 * numbers its games its own way and the number lands in 1970 when read as milliseconds. It survives
 * only as a tie-breaker for ordering, never as "is this game newer than the epoch" — that mistake
 * made a fresh update believe every game was older than the window and read one game per click.
 */
export function idOfEpoch(id: string): number {
  const parsed = Number(String(id).split("_").pop());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The largest numeric tail among the ids, never below `epoch`.
 *
 * Kept for the stored cursor only: it is a monotonically growing number that is useful to compare
 * two lists of the same account. It is not a date and must not be compared against one.
 */
export function newestEpoch(ids: readonly string[], epoch: number): number {
  for (const id of ids) epoch = Math.max(epoch, idOfEpoch(id));
  return epoch;
}

/**
 * Adds the games a page listed to who listed them, person by person: one person with two accounts
 * is one person, and the accumulated set is what decides a candidate — never a single batch.
 */
export function addListed(
  listedBy: Map<string, Set<string>>,
  ids: readonly string[],
  person: string,
): void {
  for (const id of ids) {
    const people = listedBy.get(id) ?? new Set<string>();
    people.add(person);
    listedBy.set(id, people);
  }
}

/** Games listed by at least `minRoster` distinct people: they alone are worth a detail request. */
export function pickCandidates(
  listedBy: Map<string, Set<string>>,
  minRoster: number,
): string[] {
  const out: string[] = [];
  for (const [id, people] of listedBy)
    if (people.size >= minRoster) out.push(id);
  return out.sort((a, b) => b.localeCompare(a));
}

/** Games grouped by how many distinct people listed them, highest first. */
export function presenceBuckets(
  listedBy: Map<string, Set<string>>,
): { people: number; games: number }[] {
  const distribution: Record<number, number> = {};
  for (const people of listedBy.values())
    distribution[people.size] = (distribution[people.size] ?? 0) + 1;
  return Object.entries(distribution)
    .map(([people, games]) => ({ people: Number(people), games }))
    .sort((a, b) => b.people - a.people);
}

/** Merges the stored presence with the games this batch saw: the union is what decides. */
export function mergePresence(
  stored: Map<string, Set<string>>,
  listedBy: Map<string, Set<string>>,
): { matchId: string; people: string[] }[] {
  const changed: { matchId: string; people: string[] }[] = [];
  for (const [matchId, people] of listedBy) {
    const before = stored.get(matchId);
    if (before && before.size === people.size) continue;
    changed.push({ matchId, people: [...people].sort() });
  }
  return changed;
}
