/**
 * Settings of the collection batch, read from the environment. Development gets a longer budget:
 * the dev server and the local network are slower than the machine that serves the app, and a
 * batch that runs out of time before touching any account never moves the cursor.
 */
export interface BatchConfig {
  /** How long one batch may hold the request. */
  budgetMs: number;
  /** Ids requests per batch. */
  scanCap: number;
  /** Match details per batch. */
  detailCap: number;
  /** Match details in parallel. */
  concurrency: number;
  /** Requests per second against the Riot key. */
  requestsPerSecond: number;
  /** Pages walked per account in one run: a runaway history cannot loop forever. */
  maxPages: number;
}

/** How long one batch may hold the request (dev default is four times bigger). */
export function defaultBudgetMs(
  isDev = process.env.NODE_ENV !== "production",
): number {
  return isDev ? 40_000 : 8_000;
}

/** A positive number from the environment, or the fallback. */
export function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function batchConfig(
  isDev = process.env.NODE_ENV !== "production",
  fallbacks: Partial<BatchConfig> = {},
): BatchConfig {
  return {
    budgetMs: envNumber(
      "PREMADE_BATCH_BUDGET_MS",
      fallbacks.budgetMs ?? defaultBudgetMs(isDev),
    ),
    scanCap: envNumber("PREMADE_SCAN_PER_BATCH", fallbacks.scanCap ?? 700),
    detailCap: envNumber(
      "PREMADE_DETAILS_PER_BATCH",
      fallbacks.detailCap ?? 80,
    ),
    concurrency: envNumber(
      "PREMADE_DETAIL_CONCURRENCY",
      fallbacks.concurrency ?? 10,
    ),
    requestsPerSecond: envNumber(
      "PREMADE_REQUESTS_PER_SECOND",
      fallbacks.requestsPerSecond ?? 10,
    ),
    maxPages: envNumber("PREMADE_MAX_PAGES", fallbacks.maxPages ?? 20),
  };
}
