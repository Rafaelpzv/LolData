// Cria a equipe inicial de PREMADE_MULTICONTA.md §4.3: 13 pessoas, 14 contas.
//   npx tsx scripts/seed-team.ts [nome da equipe]
// Usa o mesmo caminho do app (resolve a conta na Riot, grava jogador + conta); rodar de novo
// reaproveita a pessoa e a conta existentes em vez de duplicar.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

/** pessoa -> contas. A primeira conta dá o nome da pessoa na tela. */
const PERSONS: [string, string[]][] = [
  ["Rifu", ["Rifu#diabo"]],
  ["GHOSTCARD", ["GHOSTCARD#KEEF", "CHIEFKEEF#GHOST"]],
  ["hxh", ["hxh#2006"]],
  ["asphyxia", ["asphyxia#reS"]],
  ["mika", ["mika#tutu"]],
  ["satanic", ["satanic#yre"]],
  ["robe um brainrot", ["robe um brainrot#larp"]],
  ["mïm caguei", ["mïm caguei#br1"]],
  ["meepsie", ["meepsie#ahiru"]],
  ["KawaiRazorBlades", ["KawaiRazorBlades#5LVT"]],
  ["Henry", ["Henry#Nasus"]],
  ["gyro zeppeli", ["gyro zeppeli#BOLAS"]],
  ["uvogin", ["uvogin#goat"]],
];

const REGION = process.env.PREMADE_REGION ?? "BR1";
/** Slug da equipe semeada; uma segunda passada reaproveita a mesma. */
const TEAM_SLUG = "premade-flex";
const TEAM_NAME = "Premade Flex";

async function main() {
  const { getSummonerByRiotId } = await import("../src/app/actions/summoner");
  const repo = await import("../src/lib/premade/repository");

  // Reuse the seeded team instead of creating a second one on every run.
  const current = await repo.getTeamBySlug(TEAM_SLUG);
  const existing = current ?? (await repo.createTeam({ slug: TEAM_SLUG, name: TEAM_NAME, region: REGION, members: [] }));
  console.log(`equipe ${existing.slug}`);

  const players = await repo.getPlayers(existing.id);
  let failures = 0;

  for (const [label, accounts] of PERSONS) {
    const owner = players.find((player) => player.gameName === label || player.accounts.some((a) => accounts.includes(`${a.gameName}#${a.tagLine}`)));
    let playerId = owner?.id;

    for (const [index, riotId] of accounts.entries()) {
      const [gameName, tagLine] = riotId.split("#");
      const summoner = await getSummonerByRiotId(REGION, gameName, tagLine).catch(() => null);
      if (!summoner?.puuid) {
        console.error(`  ! ${riotId} não encontrado em ${REGION}`);
        failures += 1;
        continue;
      }
      const account = { puuid: summoner.puuid, gameName: summoner.name || gameName, tagLine };
      // A account that already exists stays where it is: never moved to another person.
      const already = players.find((player) => player.accounts.some((a) => a.puuid === summoner.puuid));
      if (already) {
        playerId = already.id;
        continue;
      }
      if (!playerId) {
        playerId = await repo.addPlayer(existing.id, { gameName: index === 0 ? label : account.gameName, account });
        players.push({ id: playerId, gameName: label, slot: players.length, accounts: [account] });
      } else {
        await repo.addAccount(existing.id, playerId, account);
        players.find((p) => p.id === playerId)?.accounts.push(account);
      }
      console.log(`  + ${label}: ${riotId}`);
    }
  }

  const final = await repo.getPlayers(existing.id);
  console.log(`${final.length} pessoas, ${final.reduce((n, p) => n + p.accounts.length, 0)} contas`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
