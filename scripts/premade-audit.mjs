// Read-only profile of one premade team: lineup composition, timelines, data quality per field.
// Run with: node scripts/premade-audit.mjs flexteste2-1093
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("Missing POSTGRES_URL / POSTGRES_URL_NON_POOLING in .env.local");
  process.exit(1);
}

const slug = process.argv[2] ?? "flexteste2-1093";
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

const table = (rows) => {
  if (rows.length === 0) return "  (vazio)";
  const cols = Object.keys(rows[0]);
  const width = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const line = (cells) =>
    "  " + cells.map((c, i) => String(c ?? "").padEnd(width[i])).join("  ");
  return [line(cols), line(width.map((w) => "-".repeat(w))), ...rows.map((r) => line(cols.map((c) => r[c])))].join("\n");
};

try {
  const [team] = await sql`select id, slug, name, region from premade_teams where slug = ${slug}`;
  if (!team) {
    console.error(`no team with slug ${slug}`);
    process.exit(1);
  }
  console.log(`# ${team.name} (${team.slug}, ${team.region})\n`);

  console.log("## Jogadores e contas");
  console.log(
    table(
      await sql`
        select p.slot, p.game_name as jogador, p.archived_at is not null as arquivado,
               count(a.puuid)::int as contas,
               string_agg(a.game_name || '#' || a.tag_line, ', ' order by a.created_at) as riot_ids
          from premade_players p
          left join premade_accounts a on a.player_id = p.id
         where p.team_id = ${team.id}
         group by p.id, p.slot, p.game_name, p.archived_at
         order by p.slot`,
    ),
  );

  console.log("\n## Escalação por partida (pessoas distintas do elenco no MESMO lado)");
  console.log(
    table(
      await sql`
        select coalesce(array_length(m.person_puuids, 1), 0) as pessoas,
               count(*)::int as jogos,
               sum(case when m.win then 1 else 0 end)::int as vitorias,
               count(*) filter (where tl.match_id is not null)::int as com_timeline,
               min(to_char(to_timestamp(m.game_creation/1000), 'YYYY-MM-DD')) as primeiro,
               max(to_char(to_timestamp(m.game_creation/1000), 'YYYY-MM-DD')) as ultimo
          from premade_matches m
          left join premade_timelines tl on tl.team_id = m.team_id and tl.match_id = m.match_id
         where m.team_id = ${team.id}
         group by 1 order by 1 desc`,
    ),
  );

  console.log("\n## Quem jogou em cada tamanho de escalação");
  console.log(
    table(
      await sql`
        select coalesce(array_length(m.person_puuids, 1), 0) as pessoas,
               count(*)::int as jogos
          from premade_matches m
         where m.team_id = ${team.id}
         group by 1 order by 1 desc`,
    ),
  );

  console.log("\n## Cobertura por campo dos participantes (linhas de premade_participants)");
  console.log(
    table(
      await sql`
        select count(*)::int as linhas,
               count(*) filter (where fields is not null)::int as com_fields,
               count(*) filter (where derived is not null)::int as com_derived,
               count(*) filter (where fields ? 'pings')::int as com_pings,
               count(*) filter (where fields ? 'items')::int as com_items,
               count(*) filter (where fields ? 'challenges')::int as com_challenges,
               count(*) filter (where derived ? 'laning')::int as com_laning
          from premade_participants
         where team_id = ${team.id}`,
    ),
  );

  console.log("\n## Jogos sem timeline e motivo");
  console.log(
    table(
      await sql`
        select m.match_id, to_char(to_timestamp(m.game_creation/1000), 'YYYY-MM-DD') as dia,
               m.duration, coalesce(tf.reason, '—') as motivo, coalesce(tf.attempts, 0)::int as tentativas
          from premade_matches m
          left join premade_timelines tl on tl.team_id = m.team_id and tl.match_id = m.match_id
          left join premade_timeline_failures tf on tf.team_id = m.team_id and tf.match_id = m.match_id
         where m.team_id = ${team.id} and tl.match_id is null
         order by m.game_creation desc
         limit 20`,
    ),
  );

  console.log("\n## Partidas com duração anômala (< 900s)");
  console.log(
    table(
      await sql`
        select m.match_id, m.duration, m.win, coalesce(array_length(m.person_puuids,1),0) as pessoas
          from premade_matches m
         where m.team_id = ${team.id} and m.duration < 900
         order by m.duration`,
    ),
  );

  console.log("\n## Posições (teamPosition) usadas por pessoa");
  console.log(
    table(
      await sql`
        select coalesce(nullif(p.team_position, ''), '(vazia)') as posicao,
               count(*)::int as linhas,
               count(distinct p.puuid)::int as contas
          from premade_participants p
         where p.team_id = ${team.id}
         group by 1 order by 2 desc`,
    ),
  );
} catch (error) {
  console.error("audit failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
