// Full re-collection of the stored games for the Individual tab: one Match-V5 call per stored game
// that still lacks a field from the pull, which also brings the ping counters and the pings of the
// participant rows. Reports the number of Riot calls at the end.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug } = await import("../src/lib/premade/repository");
  const { recollectFields } = await import("../src/lib/premade/recollect-batch");
  const { default: postgres } = await import("postgres");
  const team = await getTeamBySlug(process.argv[2] ?? "premade-flex");
  if (!team) throw new Error("team not found");
  // The games whose pings never landed are pending again: the flag is what the batch reads.
  const sql = postgres(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "", {
    ssl: "require",
    max: 1,
    onnotice: () => {},
  });
  const reset = await sql`
    update premade_matches
       set pings_saved = false
     where team_id = ${team.id}
       and not (participants @> '[{"pings": {"getBackPings": 0}}]'::jsonb)
       and (participants->0->'pings') is null`;
  console.log("games pending again:", reset.count);
  await sql.end();
  let calls = 0;
  for (let i = 0; i < 30; i++) {
    const step = await recollectFields(team.id, { budgetMs: 45_000, maxMatches: 25 });
    calls += step.calls;
    console.log(`batch ${i + 1}: saved=${step.saved} calls=${step.calls} remaining=${step.remaining} failures=${JSON.stringify(step.failures)} done=${step.done}`);
    if (step.done) break;
  }
  console.log("MATCH RIOT CALLS", calls);
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
