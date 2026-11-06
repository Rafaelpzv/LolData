// Apaga as equipes de teste antes da coleta final (PREMADE_MULTICONTA.md §6). As partidas,
// contas, jogadores e curvas caem junto: tudo isto tem on delete cascade.
//   node scripts/reset-teams.mjs --confirm
//
// Guarda dupla: alem do --confirm, o banco alvo precisa ser declarado com --expect <slug>. Sem
// isso, um POSTGRES_URL apontado para producao apagaria todas as equipes reais em silencio.
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local", quiet: true });

if (!process.argv.includes("--confirm")) {
  console.log("Nada foi apagado. Rode com --confirm para apagar todas as equipes premade.");
  process.exit(0);
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("reset failed: POSTGRES_URL/POSTGRES_URL_NON_POOLING nao configurada.");
  process.exit(1);
}

// O host e impresso para que a pessoa veja, na saida, contra qual banco mandou o comando.
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(url invalida)";
  }
})();
const expect = (() => {
  const i = process.argv.indexOf("--expect");
  return i >= 0 ? process.argv[i + 1] : null;
})();
const productionLike = /prod|production/i.test(host);

if (!expect) {
  console.log(`Nada foi apagado. Host alvo: ${host}`);
  console.log("Rode com --confirm --expect <slug-da-primeira-equipe> para confirmar o banco.");
  process.exit(0);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  const teams = await sql`select id, slug, name from premade_teams order by created_at`;
  if (teams.length === 0) {
    console.log("Nenhuma equipe para apagar.");
    process.exit(0);
  }
  // --expect prova que a pessoa sabe qual banco esta na frente: o slug precisa existir nele.
  if (!teams.some((team) => team.slug === expect)) {
    console.error(`reset abortado: nenhuma equipe com slug "${expect}" em ${host}.`);
    process.exitCode = 1;
  } else if (productionLike) {
    console.error(`reset abortado: host ${host} parece de producao. Use o banco de testes.`);
    process.exitCode = 1;
  } else {
    for (const team of teams) console.log(`apagando ${team.slug} (${team.name})`);
    await sql`delete from premade_teams`;
    console.log(`${teams.length} equipe(s) apagada(s) em ${host}.`);
  }
} catch (error) {
  console.error("reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
