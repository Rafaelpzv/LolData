// Which account represents a person in the lobby strip, and which elo is shown next to it.
// Pure: no Riot, no Next, no Supabase. A premade plays Flex, so the card shows the Flex rank of the
// person; Solo/Duo only appears when nobody has Flex (see RANKED_QUEUES).
import { isApexTier, type Tier } from "../tiers";

import type {
  AccountRanks,
  LeagueEntry,
  RankedSnapshot,
  RankQueueCache,
} from "./ranks";
import { pickRanked, personQueue, rankScore } from "./ranks";
import type { PremadeAccount, PremadePlayer } from "./types";

/** Games each account played in the collected window: the tie-breaker when ranks are equal. */
export type AccountGames = Readonly<Record<string, number>>;

export interface StripAccount {
  account: PremadeAccount;
  rank: RankedSnapshot;
  score: number;
  games: number;
}

export interface PlayerCard {
  /** The person's id (the metrics key). */
  person: string;
  name: string;
  accounts: StripAccount[];
  /** The account drawn on the card: the highest rank in the person's queue, else the most played. */
  best: StripAccount;
  /** How many accounts the person has on the roster. */
  accountCount: number;
  rank: RankedSnapshot;
  /** The queue the shown rank came from, or null when the person has no rank at all. */
  queue: RankedSnapshot["queueType"];
}

/** Ranked part of a cached account: Flex when the account has it, Solo/Duo otherwise. */
export function rankOf(ranks: AccountRanks, puuid: string): RankedSnapshot {
  const row = ranks[puuid];
  // The two queues are stored side by side; rows synced before that only kept the shown one.
  const queues = [row?.flex, row?.solo].filter(
    (queue): queue is NonNullable<typeof queue> => Boolean(queue?.tier),
  );
  if (queues.length > 0)
    return pickRanked(queues.map((queue) => toEntry(queue)));
  return {
    queueType: (row?.queueType ?? null) as RankedSnapshot["queueType"],
    tier: (row?.tier?.toLowerCase() ?? null) as Tier | null,
    division: row?.division ?? null,
    leaguePoints: row?.leaguePoints ?? null,
    wins: row?.wins ?? null,
    losses: row?.losses ?? null,
  };
}

/** A cached queue as the League-V4 entry `pickRanked` reads. */
function toEntry(queue: RankQueueCache): LeagueEntry {
  return {
    queueType: queue.queueType,
    tier: queue.tier,
    rank: queue.division,
    leaguePoints: queue.leaguePoints,
    wins: queue.wins,
    losses: queue.losses,
  };
}

/**
 * One card per person still on the lineup. The person is shown with their Flex rank; only when no
 * account of theirs has Flex does Solo/Duo step in. Within that queue, the account drawn is the one
 * with the highest rank, and the most collected games break a tie. Ranks of two queues are never
 * compared: a Master Solo is not "better" than a Diamond Flex for this page.
 */
export function personCards(
  players: PremadePlayer[],
  ranks: AccountRanks,
  games: AccountGames,
): PlayerCard[] {
  return players
    .filter((player) => !player.archived)
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .flatMap((player) => {
      const active = player.accounts.filter((account) => !account.archived);
      if (active.length === 0) return [];
      const accounts: StripAccount[] = active.map((account) => {
        const rank = rankOf(ranks, account.puuid);
        return {
          account,
          rank,
          score: rankScore(rank),
          games: games[account.puuid] ?? 0,
        };
      });
      // One queue for the whole person: the best account of that queue represents them.
      const queue = personQueue(accounts.map((entry) => entry.rank));
      const inQueue = queue
        ? accounts.filter((entry) => entry.rank.queueType === queue)
        : accounts;
      const best = inQueue
        .slice()
        .sort((a, b) => b.score - a.score || b.games - a.games)[0];
      return [
        {
          person: player.id,
          name: player.gameName,
          accounts,
          best,
          accountCount: accounts.length,
          rank: best.rank,
          queue,
        },
      ];
    });
}

/** "Esmeralda II" / "Diamante" / "Mestre": the tier label plus the division, never color alone. */
export function rankLabel(
  rank: Pick<RankedSnapshot, "tier" | "division"> | null,
  tierName: (tier: Tier) => string,
): string | null {
  if (!rank?.tier) return null;
  return `${tierName(rank.tier)}${rank.division && !isApexTier(rank.tier) ? ` ${rank.division}` : ""}`;
}

/** How many games each account played, from the collected window. */
export function accountGamesOf(
  matches: { participants: { puuid: string }[] }[],
): Record<string, number> {
  const games: Record<string, number> = {};
  for (const match of matches) {
    for (const participant of match.participants) {
      games[participant.puuid] = (games[participant.puuid] ?? 0) + 1;
    }
  }
  return games;
}
