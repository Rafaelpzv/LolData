// Repara os totais do lado que o coletor nunca gravou (teamDeaths, sideAssists) nas partidas já
// armazenadas, sem chamar a Riot: o que falta pode ser reconstruído do que já está salvo.
//
//   teamDeaths   = soma das mortes dos 5 participantes do lado (o payload original os tinha; o
//                  coletor calculava e não persistia)
//   sideAssists  = soma das assistências dos 5 participantes do lado (mesma causa)
//   sideDamage   = soma do dano a campeões dos 5 participantes
//   sideDamageTaken = soma do dano recebido dos 5 participantes
//
// Uso:
//   node scripts/premade-backfill-side-totals.mjs                # só relata
//   node scripts/premade-backfill-side-totals.mjs --apply        # grava
//   node scripts/premade-backfill-side-totals.mjs flexteste2-1093 --apply
//
// Só preenche o que está ausente: uma partida que já tem o dado fica intocada. Como o lado tem
// exatamente 5 participantes no Flex, essa soma É o total do lado, não um recorte do elenco.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const slug = args.find((arg) => !arg.startsWith("--"));

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("Missing POSTGRES_URL / POSTGRES_URL_NON_POOLING in .env.local");
  process.exit(1);
}
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  const teams = slug
    ? await sql`select id, slug from premade_teams where slug = ${slug}`
    : await sql`select id, slug from premade_teams`;

  for (const team of teams) {
    // One statement, so the whole team is repaired atomically and in a single round trip.
    const rows = await sql`
      with side as (
        select m.team_id,
               m.match_id,
               coalesce(sum((p.value->>'deaths')::int), 0)::int  as deaths,
               coalesce(sum((p.value->>'assists')::int), 0)::int as assists,
               count(*)::int                                     as participants
          from premade_matches m
          cross join lateral jsonb_array_elements(m.participants) as p(value)
         where m.team_id = ${team.id}
         group by m.team_id, m.match_id
      )
      select m.match_id,
             s.participants,
             s.deaths, s.assists,
             (m.team_totals ? 'teamDeaths')  as has_deaths,
             (m.team_totals ? 'sideAssists') as has_assists
        from premade_matches m
        join side s on s.team_id = m.team_id and s.match_id = m.match_id
       where m.team_id = ${team.id}
         and (not (m.team_totals ? 'teamDeaths') or not (m.team_totals ? 'sideAssists'))`;

    const missingDeaths = rows.filter((row) => !row.has_deaths);
    const missingAssists = rows.filter((row) => !row.has_assists);
    const wrongSide = rows.filter((row) => row.participants !== 5);

    console.log(
      `${team.slug}: ${rows.length} partidas para reparar · sem teamDeaths=${missingDeaths.length} · sem sideAssists=${missingAssists.length} · com lado incompleto=${wrongSide.length}${apply ? "" : " (dry-run)"}`,
    );

    if (!apply || rows.length === 0) continue;

    await sql`
      with side as (
        select m.team_id,
               m.match_id,
               coalesce(sum((p.value->>'deaths')::int), 0)::int  as deaths,
               coalesce(sum((p.value->>'assists')::int), 0)::int as assists,
               count(*)::int                                     as participants
          from premade_matches m
          cross join lateral jsonb_array_elements(m.participants) as p(value)
         where m.team_id = ${team.id}
         group by m.team_id, m.match_id
      )
      update premade_matches m
         set team_totals = m.team_totals
             || case when not (m.team_totals ? 'teamDeaths') and s.participants = 5
                     then jsonb_build_object('teamDeaths', s.deaths) else '{}'::jsonb end
             || case when not (m.team_totals ? 'sideAssists') and s.participants = 5
                     then jsonb_build_object('sideAssists', s.assists) else '{}'::jsonb end
        from side s
       where m.team_id = ${team.id}
         and s.team_id = m.team_id
         and s.match_id = m.match_id
         and s.participants = 5
         and (not (m.team_totals ? 'teamDeaths') or not (m.team_totals ? 'sideAssists'))`;
    console.log(`  reparadas: ${rows.filter((row) => row.participants === 5).length}`);
  }
} catch (error) {
  console.error("backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
