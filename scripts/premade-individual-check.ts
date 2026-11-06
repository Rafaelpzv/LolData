// Verification for the individual depth: runs the re-collection against the real team, then opens
// every section of every roster player and prints what each one shows (and its sample).
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug, getTeamMatches, getPlayers, getTimelines } = await import("../src/lib/premade/repository");
  const { recollectFields } = await import("../src/lib/premade/recollect-batch");
  const { computeMetrics } = await import("../src/lib/premade/metrics");
  const { computePlayerDepth, deathEvents } = await import("../src/lib/premade/individual-metrics");
  const { buildIndividualRecommendations } = await import("../src/lib/premade/individual-recommendations");

  const team = await getTeamBySlug(process.argv[2] ?? "premade-flex");
  if (!team) throw new Error("team not found");

  let calls = 0;
  for (let i = 0; i < 20; i++) {
    const step = await recollectFields(team.id, { budgetMs: 30_000 });
    calls += step.calls;
    console.log(`batch ${i + 1}: saved=${step.saved} remaining=${step.remaining} calls=${step.calls} failures=${JSON.stringify(step.failures)} done=${step.done}`);
    if (step.done) break;
  }
  console.log("TOTAL RIOT CALLS", calls);

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

  for (const depth of depths) {
    const champion = depth.champions[0];
    console.log("---", nameOf(depth.person));
    console.log("  summary n=", depth.summary.games, "wr", depth.summary.winRate?.toFixed(1), "kda", depth.summary.kda?.toFixed(2), "cs/min", depth.summary.csPerMin?.toFixed(1), "vision/min", depth.summary.visionPerMin?.toFixed(2));
    console.log("  fields", depth.fieldGames, "derived", depth.derivedGames, "champions", depth.champions.length);
    if (champion) {
      console.log("  champion", champion.championName, "n=", champion.games, "items", champion.items.slice(0, 3).map((i) => i.itemId).join(","), "first", champion.build.firstItem?.itemId, "runes", champion.runes?.keystone, "spells", champion.spells?.spells.join("/"), "skills", champion.skills?.order.join(""));
    }
    console.log("  pings n=", depth.pings.games, "total", depth.pings.total?.toFixed(1), "team", depth.pings.teamTotal?.toFixed(1), "getBack", depth.pings.perGame.getBackPings?.toFixed(1));
    console.log("  early n=", depth.early.laneGames, "cs10", depth.early.at10.cs?.toFixed(1), "diff", depth.early.at10.csDiff?.toFixed(1), "cs15diff", depth.early.at15.csDiff?.toFixed(1));
    console.log("  vision", depth.vision.visionPerMin?.toFixed(2), "team", depth.vision.teamPerMin?.toFixed(2), "wards", depth.vision.wardsPlaced?.toFixed(1));
    console.log("  combat dmg/death", depth.combat.damagePerDeath?.toFixed(0), "cc", depth.combat.ccPerGame?.toFixed(1), "multis", depth.combat.multikills, "dead%", depth.combat.deadTimeShare?.toFixed(1));
    console.log("  deaths n=", depth.deaths.games, "total", depth.deaths.total, JSON.stringify(depth.deaths.byPhase), JSON.stringify(depth.deaths.byRegion), "alone", depth.deaths.aloneShare?.toFixed(0));
    console.log("  objectives dragon", depth.objectives.dragonParticipation?.toFixed(0), "baron", depth.objectives.baronParticipation?.toFixed(0), "tower", depth.objectives.towerParticipation?.toFixed(0), "stolen", depth.objectives.stolen);
    console.log("  trend", JSON.stringify(depth.trend.deltas));
    console.log("  synergy best", depth.synergy.best.map((e) => `${nameOf(e.person)}:${(e.winRate ?? 0).toFixed(0)}%/n${e.games}`).join(" "));
  }

  const recommendations = buildIndividualRecommendations(depths, new Map(depths.map((d) => [d.person, nameOf(d.person)])));
  console.log("--- individual recommendations", recommendations.length);
  for (const rec of recommendations) {
    console.log(" ", rec.code, rec.kind, rec.confidence, "n=", rec.games, JSON.stringify(rec.evidence));
  }
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
