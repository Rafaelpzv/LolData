// Read-only check: is the stored side KDA complete? Compare what the collection stored against a
// recount of the raw participant rows. Run with: node scripts/premade-kda-check.mjs flexteste2-1093
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
const slug = process.argv[2] ?? "flexteste2-1093";
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  const [team] = await sql`select id from premade_teams where slug = ${slug}`;
  const rows = await sql`
    select m.match_id,
           (m.team_totals->>'sideAssists')::int as stored_assists,
           coalesce(sum(p.assists), 0)::int as participant_assists,
           (m.team_totals->>'teamKills')::int as team_kills,
           (m.team_totals->>'teamDeaths')::int as team_deaths,
           count(p.puuid)::int as participant_rows
      from premade_matches m
      left join premade_participants p on p.team_id = m.team_id and p.match_id = m.match_id
     where m.team_id = ${team.id}
     group by m.match_id, m.team_totals
     order by m.match_id
     limit 8`;
  console.log("match_id            stored_assists  participant_assists  kills  deaths  rows");
  for (const row of rows) {
    console.log(
      `${row.match_id.padEnd(20)}${String(row.stored_assists ?? "null").padStart(8)}${String(row.participant_assists).padStart(21)}${String(row.team_kills).padStart(8)}${String(row.team_deaths).padStart(8)}${String(row.participant_rows).padStart(6)}`,
    );
  }

  const [agg] = await sql`
    select count(*) filter (where (m.team_totals->>'sideAssists') is not null)::int as with_assists,
           count(*) filter (where (m.team_totals->>'sideAssists')::int > 0)::int as with_positive_assists,
           count(*)::int as games,
           sum((m.team_totals->>'sideAssists')::int) filter (where (m.team_totals->>'sideAssists') is not null) as sum_assists
      from premade_matches m
     where m.team_id = ${team.id}`;
  console.log("\n", agg);
} finally {
  await sql.end({ timeout: 5 });
}
