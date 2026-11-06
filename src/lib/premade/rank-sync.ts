// One step of the account sync: fetch the next stale account, write it, answer with what is left.
// The client loops until `done`, like the collection buttons, so a big roster never runs past the
// route limit. Never called on render.
import {
  RANK_FORCE_REFRESH_MS,
  RANK_REFRESH_MS,
  type RankedQueue,
  type RankedSnapshot,
  type RankQueueCache,
} from "./ranks";
import {
  getAccountRank,
  getRankSyncTargets,
  getTeamById,
  saveAccountRank,
} from "./repository";
import { accountPace, fetchAccount } from "./summoner-sync";

export interface RankSyncStep {
  done: boolean;
  outcome: "synced" | "notFound" | "noKey";
  /** Accounts read from Riot in this step (two calls each: Summoner-V4 and League-V4). */
  accounts: number;
  /** Accounts whose cached row was written. */
  saved: number;
  /** Accounts still to read (stale) after this step. */
  remaining: number;
  /** Accounts Riot did not answer for. */
  failed: number;
  /** The account this step worked on: the client adds it to `skip` for the rest of the run. */
  puuid?: string;
  /** Why the row could not be written, when `saved` is 0 and Riot did answer. */
  error?: string;
  /** The account written in this step: its name and the queue Riot answered with it. */
  account?: { gameName: string; queue: string | null };
}

export async function syncAccountRanks(
  teamId: string,
  // `skip` (client only): accounts already written by this run. The pass walks the whole roster
  // once and stops on `done`, instead of re-reading the first account forever.
  options: { puuid?: string; force?: boolean; skip?: string[] } = {},
): Promise<RankSyncStep> {
  const team = await getTeamById(teamId, { includeArchived: true });
  if (!team) return emptyStep("notFound");
  if (!process.env.RIOT_API_KEY?.trim()) return emptyStep("noKey");

  const skip = new Set(options.skip ?? []);
  const targets = (await getRankSyncTargets(teamId, options.puuid)).filter(
    (puuid) => !skip.has(puuid),
  );
  if (targets.length === 0) return { ...emptyStep("synced"), done: true };

  const intervalMs = options.force ? RANK_FORCE_REFRESH_MS : RANK_REFRESH_MS;
  const pending = await staleAccounts(teamId, targets, intervalMs);
  const first = pending[0];
  if (!first) return { ...emptyStep("synced"), done: true };

  const snapshot = await fetchAccount(team.region, first, accountPace());
  if (!snapshot.summoner && !snapshot.ranked) {
    // Riot did not answer: no row is written, but the client still drops the account from this run,
    // so one failed call cannot trap the loop on the same account.
    return {
      done: pending.length <= 1,
      outcome: "synced",
      accounts: 1,
      saved: 0,
      remaining: pending.length - 1,
      failed: 1,
      puuid: first,
    };
  }

  const syncedAt = new Date();
  // A row written = Riot answered. A queue the answer did not include is an empty cache, not an
  // error to report, so the row is always saved and the page reads `flex` / `solo` from it.
  try {
    await saveAccountRank(
      teamId,
      {
        puuid: first,
        profileIconId: snapshot.summoner?.profileIconId ?? null,
        summonerLevel: snapshot.summoner?.summonerLevel ?? null,
        queueType: snapshot.ranked?.queueType ?? null,
        tier: snapshot.ranked?.tier?.toUpperCase() ?? null,
        division: snapshot.ranked?.division ?? null,
        leaguePoints: snapshot.ranked?.leaguePoints ?? null,
        wins: snapshot.ranked?.wins ?? null,
        losses: snapshot.ranked?.losses ?? null,
        // Both queues came in the same League-V4 answer: storing them costs no extra call.
        flex: cacheOf("RANKED_FLEX_SR", snapshot.queues?.flex ?? null),
        solo: cacheOf("RANKED_SOLO_5x5", snapshot.queues?.solo ?? null),
        fetchedAt: syncedAt.toISOString(),
      },
      syncedAt,
    );
  } catch (error) {
    // The Riot answer is good but the row could not be written (schema, constraint). It is reported
    // instead of swallowed: the client skips the account and tells the user how many failed.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[premade] rank save failed for ${first}:`, message);
    return {
      done: pending.length <= 1,
      outcome: "synced",
      accounts: 1,
      saved: 0,
      remaining: pending.length - 1,
      failed: 1,
      puuid: first,
      error: message,
    };
  }

  // The client stops on `done`: it is false while accounts are still unread (each call reads one),
  // so the loop walks the whole roster once and stops at the last account.
  const unread = pending.length - 1;
  return {
    done: unread === 0,
    outcome: "synced",
    accounts: 1,
    saved: 1,
    remaining: unread,
    failed: 0,
    puuid: first,
    // What was written, for the log and for the progress line of the menu action.
    account: {
      gameName: snapshot.account?.gameName ?? first.slice(0, 8),
      queue: snapshot.ranked?.queueType ?? null,
    },
  };
}

/** One queue as the cache keeps it, from one League-V4 answer. */
function cacheOf(
  queue: RankedQueue,
  rank: RankedSnapshot | null,
): RankQueueCache | null {
  if (!rank?.tier) return null;
  return {
    queueType: queue,
    tier: rank.tier,
    division: rank.division,
    leaguePoints: rank.leaguePoints,
    wins: rank.wins,
    losses: rank.losses,
  };
}

/** Accounts of `targets` whose cached answer is missing or older than `intervalMs`. */
async function staleAccounts(
  teamId: string,
  targets: string[],
  intervalMs: number,
): Promise<string[]> {
  const now = Date.now();
  const stale: string[] = [];
  for (const puuid of targets) {
    const cached = await getAccountRank(teamId, puuid);
    const fetched = cached?.fetchedAt ? Date.parse(cached.fetchedAt) : NaN;
    if (Number.isNaN(fetched) || now - fetched >= intervalMs) stale.push(puuid);
  }
  return stale;
}

function emptyStep(outcome: RankSyncStep["outcome"]): RankSyncStep {
  return {
    done: true,
    outcome,
    accounts: 0,
    saved: 0,
    remaining: 0,
    failed: 0,
  };
}
