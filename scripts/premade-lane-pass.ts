// Rebuilds the per-participant derived data (build, skills, lane, timeline deaths) of every stored
// game by reading its timeline again, one Riot call per game.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug } = await import("../src/lib/premade/repository");
  const { collectTimelines } = await import("../src/lib/premade/timeline-batch");
  const team = await getTeamBySlug(process.argv[2] ?? "premade-flex");
  if (!team) throw new Error("team not found");
  let calls = 0;
  for (let i = 0; i < 20; i++) {
    const step = await collectTimelines(team.id, { budgetMs: 45_000, maxTimelines: 25, rebuild: true });
    calls += step.calls;
    console.log(`batch ${i + 1}: calls=${step.calls} remaining=${step.remaining} failures=${JSON.stringify(step.failures)} done=${step.done}`);
    if (step.done) break;
  }
  console.log("TIMELINE CALLS", calls);
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
