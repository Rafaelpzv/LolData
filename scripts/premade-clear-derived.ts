// Marks every participant row whose derived data came from the broken lane reading (empty `laning`)
// for the rebuild: one pass, no Riot call, directly on the jsonb column.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { default: postgres } = await import("postgres");
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "";
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  const team = await sql`select id from premade_teams where slug = ${process.argv[2] ?? "premade-flex"}`;
  const teamId = team[0]?.id;
  const cleared = await sql`
    update premade_participants
       set derived = null
     where team_id = ${teamId}
       and derived is not null
       and derived->'laning' = '[]'::jsonb`;
  console.log("cleared derived rows:", cleared.count);
  await sql.end();
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
