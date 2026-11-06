// Public routes of the app, for links between pages: a summoner profile is
// /lol/{region}/{gameName}/{tagLine}/{queueType}/{championName} (lowercase region, encoded Riot ID).
import { normalizeRegion } from "./regions";

/** "all" queues / "all" champions: the profile as it opens from a search. */
const ALL = "all";

/** Profile of one account. The region is the platform code (BR1, EUW1...), lowercased in the URL. */
export function summonerHref(region: string, gameName: string, tagLine: string): string {
  const code = normalizeRegion(region).toLowerCase();
  return `/lol/${code}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/${ALL}/${ALL}`;
}
