// Reads every Individual section of every roster player from what is stored, without any Riot call.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug, getTeamMatches, getPlayers, getTimelines } = await import("../src/lib/premade/repository");
  const { computeMetrics } = await import("../src/lib/premade/metrics");
  const { computePlayerDepth, deathEvents } = await import("../src/lib/premade/individual-metrics");

  const team = await getTeamBySlug(process.argv[2] ?? "premade-flex");
  if (!team) throw new Error("team not found");

  const [matches, players, timelines] = await Promise.all([
    getTeamMatches(team.id),
    getPlayers(team.id),
    getTimelines(team.id),
  ]);
  const metrics = computeMetrics(matches);
  const deaths = new Map(timelines.map((timeline) => [timeline.matchId, deathEvents(timeline.deaths)]));
  const depths = metrics.players.map((profile) => computePlayerDepth(profile.puuid, matches, profile, metrics, {}, deaths));
  const nameOf = (person: string) => {
    const player = players.find((p) => p.id === person);
    return player?.accounts.find((a) => !a.archived)?.gameName ?? person.slice(0, 6);
  };

  console.log("matches", matches.length, "timelines", timelines.length, "players with games", depths.length);
  for (const depth of depths) {
    const champion = depth.champions[0];
    console.log("---", nameOf(depth.person), `n=${depth.summary.games}`, `fields=${depth.fieldGames}`, `derived=${depth.derivedGames}`);
    if (champion) console.log("  champion", champion.championName, `n=${champion.games}`, "first", champion.build.firstItem?.itemId, "@", champion.build.firstItem?.at, "skills", champion.skills?.order.join(""));
    console.log("  pings", `n=${depth.pings.games}`, `total ${depth.pings.total?.toFixed(1)}`);
    console.log("  early", `n=${depth.early.laneGames}`, `cs10 ${depth.early.at10.cs?.toFixed(1)}`, `csDiff10 ${depth.early.at10.csDiff?.toFixed(1)}`);
    console.log("  deaths", `n=${depth.deaths.games}`, `total ${depth.deaths.total}`, `alone ${depth.deaths.aloneShare?.toFixed(0)}%`);
  }
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
