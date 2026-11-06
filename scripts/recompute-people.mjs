// Recalcula quem jogou cada partida salva, pelo banco: cada partida passa a guardar as PESSOAS
// (não as contas) que contam para ela. Uso:
//   node scripts/recompute-people.mjs            # só relata
//   node scripts/recompute-people.mjs --apply    # grava
//
// Regra: a conta só conta para a partida se pertencia à pessoa na data do jogo (histórico de
// criação/arquivamento), então um jogador removido sai dos jogos e um arquivado mantém os dele.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { ssl: "require", max: 1, onnotice: () => {} });

try {
  const teams = await sql`select id, slug from premade_teams`;
  for (const team of teams) {
    const accounts = await sql`
      select a.puuid, a.player_id, a.created_at, a.archived_at,
             p.created_at as player_created_at, p.archived_at as player_archived_at
      from premade_accounts a join premade_players p on p.id = a.player_id
      where a.team_id = ${team.id}`;

    const windows = new Map();
    for (const a of accounts) {
      const starts = [a.created_at, a.player_created_at].filter(Boolean).map((d) => new Date(d).getTime());
      const ends = [a.archived_at, a.player_archived_at].filter(Boolean).map((d) => new Date(d).getTime());
      windows.set(a.puuid, {
        playerId: a.player_id,
        from: starts.length ? Math.min(...starts) : 0,
        to: ends.length ? Math.min(...ends) : null,
      });
    }

    const matches = await sql`select match_id, game_creation, participants::jsonb as participants from premade_matches where team_id = ${team.id}`;
    let touched = 0;

    for (const match of matches) {
      const creation = Number(match.game_creation);
      const people = new Set();
      const participantsRaw = Array.isArray(match.participants) ? match.participants : JSON.parse(match.participants ?? "[]");
      for (const participant of participantsRaw) {
        const window = windows.get(participant.puuid);
        if (window && window.from <= creation && (window.to === null || creation < window.to)) {
          people.add(window.playerId);
        }
      }
      const before = new Set(participantsRaw.map((p) => windows.get(p.puuid)?.playerId).filter(Boolean));
      const changed = people.size !== before.size || [...people].some((id) => !before.has(id));
      if (changed) touched += 1;

      const personIds = [...people];
      const participants = participantsRaw.map((p) => ({
        ...p,
        accountId: windows.get(p.puuid)?.playerId ?? p.accountId ?? p.puuid,
      }));

      if (apply) {
        await sql`update premade_matches set person_puuids = ${personIds}, participants = ${JSON.stringify([participants])}::jsonb -> 0
                  where team_id = ${team.id} and match_id = ${match.match_id}`;
        for (const p of participants) {
          await sql`update premade_participants set account_id = ${p.accountId}
                    where team_id = ${team.id} and match_id = ${match.match_id} and puuid = ${p.puuid}`;
        }
      }
    }

    console.log(`${team.slug}: ${matches.length} partidas, ${touched} recalculadas${apply ? "" : " (dry-run)"}`);
  }
} catch (error) {
  console.error("recompute failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
