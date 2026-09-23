// Dev-only fixtures mode: `USE_FIXTURES=1` makes every API route and server
// action return deterministic sample data, so the UI renders without Supabase
// or a Riot API key. Start it with `node scripts/dev-fixtures.mjs`.
//
// Canonical profile: /lol/kr/Faker/KR1/all/all and /tft/kr/Faker/KR1.
// Any other Riot ID also works (a profile is generated from its name).
// Special gameNames (any tag): "notfound", "unranked", "nomatches".

export const USE_FIXTURES = process.env.USE_FIXTURES === "1";

export { FIXTURE_NOW } from "./core";
export { CANONICAL_PERSONA, ROSTER } from "./personas";
export { fixtureRankings, fixtureTftRankings } from "./rankings";
export {
  fixtureChampionMasteries,
  fixtureLolMatchPool,
  fixtureMatchHistory,
  fixtureMatches,
  fixtureQueueTypes,
  fixtureRankedByPuuid,
  fixtureSummonerByRiotId,
  fixtureSummonerNameByPuuid,
  type FixtureMatchesParams,
} from "./lol";
export {
  fixtureTftLeagueByPuuid,
  fixtureTftMatchById,
  fixtureTftMatchIds,
  fixtureTftMatches,
  fixtureTftSummonerByRiotId,
} from "./tft";
export { fixtureAutocomplete, fixtureBackfill, fixturePlayerStatus } from "./search";
export { fixtureWinrate } from "./winrate";
