// The loop of "Update data" must never spin: a batch that neither moves the cursor nor saves
// anything is called once more at most, and then the button stops with an error.

/** What one batch endpoint answers with, as far as the loop cares. */
export interface LoopBody {
  done?: boolean;
  calls?: number;
  /** The batch could not move the cursor: repeating it would repeat the same batch forever. */
  error?: string;
  saved?: number;
  /** The account this batch worked on (ranks): the loop adds it to `skip`. */
  puuid?: string;
  /** Collection: lists read so far — it only grows with a read that listed something new. */
  scansDone?: number;
  /** Collection: list requests made so far — a fresh update that reads old games still grows. */
  reads?: number;
  /** Recollect: games still to read (it goes DOWN as the run advances). */
  remaining?: number;
  /** Ranks: accounts still to refresh (it goes DOWN as the run advances). */
  accountsRemaining?: number;
  /** Any other field of the answer (timelines counters, totals): compared when there is no key. */
  [field: string]: unknown;
}

/** How a batch shows it is moving. Without one, "saved something" is the only signal there is. */
export type ProgressKey =
  "scansDone" | "remaining" | "accountsRemaining" | "calls";

export interface LoopOptions {
  /** Fields read as the moving counter (default: the collection's `scansDone`). */
  progressKeys?: ProgressKey[];
  /** Fields that restate the batch instead of moving: a change there is not progress. */
  ignore?: string[];
}

export interface ProgressState {
  /** The moving counter, copied from the first key that exists. */
  progress: number | null;
  /** Which key it came from (null when the endpoint has none). */
  key: ProgressKey | null;
  /** The whole answer without the ignored fields. */
  rest: string;
  /** Reads of this run so far: "scansDone" only counts reads that listed something. */
  reads?: number;
}

/** How many batches in a row may fail to move before the loop gives up. */
export const MAX_STALLS = 1;

/**
 * Where the run stands after this batch. Call it only when the batch did not finish: a batch that
 * neither moved the counter nor saved anything twice in a row means the loop must stop.
 *
 * `reads` (the collection) counts every list request, not only the ones that listed something: an
 * update reads game after game of the newest window, and the distance to the top of the list grows
 * with every read, so it always finishes. Without it, two pages of old games looking alike would
 * look like a frozen cursor.
 */
export function progressOf(
  body: LoopBody,
  previous: ProgressState | null,
  options: LoopOptions = {},
): ProgressState | "stalled" {
  const keys = options.progressKeys ?? ["scansDone"];
  const key =
    keys.find((candidate) => typeof body[candidate] === "number") ?? null;
  const progress = key ? (body[key] as number) : null;
  // What the answer says besides the counter: an endpoint without one moves by changing this.
  const rest = JSON.stringify(
    Object.entries(body).filter(([field]) => !options.ignore?.includes(field)),
  );
  const reads =
    previous && typeof body.reads === "number" ? body.reads : undefined;
  const next: ProgressState = { progress, key, rest, reads };
  if (previous === null) return next;
  if ((body.saved ?? 0) > 0) return next;
  if (
    reads !== undefined &&
    typeof previous.reads === "number" &&
    reads > previous.reads
  )
    return next;
  if (
    key !== null &&
    key === previous.key &&
    progress !== null &&
    previous.progress !== null
  ) {
    // The collection only counts up; the other counters count down, so any change is progress.
    if (
      key === "scansDone"
        ? progress > previous.progress
        : progress !== previous.progress
    )
      return next;
    return "stalled";
  }
  if (key === null && rest !== previous.rest) return next;
  return "stalled";
}
