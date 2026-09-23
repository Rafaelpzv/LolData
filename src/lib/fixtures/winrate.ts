import {
  MAX_MATCHES,
  aggregateWinrate,
  periodRange,
  type WinrateGame,
  type WinratePeriod,
} from "@/lib/riot/winrate";
import { FIXTURE_NOW, createRng, randInt, seedFromPuuid } from "./core";
import { personaBySeed } from "./personas";

const DAY = 86_400_000;
const HISTORY_DAYS = 365;

/**
 * A year of games, newest first: ~60% of days active with 2-6 games, a few
 * longer breaks, and a win rate that climbs over the year (visible trend).
 */
function fixtureGameLog(puuid: string, queueId?: string): WinrateGame[] {
  const seed = seedFromPuuid(puuid);
  if (personaBySeed(seed)?.noMatches) return [];

  const queue = Number(queueId) || 0;
  const rng = createRng(seed ^ 0x5bd1e995 ^ queue);
  // A queue filter keeps a share of the games, like a real filtered history.
  const share = queue ? 0.55 : 1;
  const games: WinrateGame[] = [];
  let breakDays = 0;

  for (let day = 0; day < HISTORY_DAYS; day++) {
    if (breakDays > 0) {
      breakDays--;
      continue;
    }
    if (day > 0 && rng() < 0.03) breakDays = randInt(rng, 3, 9);
    // Always play today so the "today" period has data.
    if (day > 0 && rng() > 0.6) continue;

    const count = randInt(rng, 2, 6);
    // Evening session: games spaced ~35 min apart, starting 18:00-22:00 before "now".
    let ts = FIXTURE_NOW - day * DAY - randInt(rng, 0, 4) * 3_600_000 - randInt(rng, 5, 50) * 60_000;
    const winChance = 0.42 + 0.16 * (1 - day / HISTORY_DAYS);
    for (let i = 0; i < count; i++) {
      if (rng() < share) games.push({ ts, win: rng() < winChance });
      ts -= randInt(rng, 28, 45) * 60_000;
    }
  }
  return games;
}

/** Body of GET /api/summoner/winrate. */
export function fixtureWinrate(puuid: string, period: WinratePeriod, queueId?: string) {
  const { from } = periodRange(period, FIXTURE_NOW);
  const inPeriod = fixtureGameLog(puuid, queueId).filter((g) => g.ts >= from);
  return aggregateWinrate(inPeriod.slice(0, MAX_MATCHES), period, FIXTURE_NOW, inPeriod.length > MAX_MATCHES);
}
