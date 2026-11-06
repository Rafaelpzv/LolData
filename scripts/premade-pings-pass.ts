// Writes the pings of the games already stored into `premade_participants.fields` (migration 0013)
// and marks them in `premade_matches.pings_saved`. No Riot call: the sample already has them.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug, getTeamMatches, markPingsSaved, saveParticipantPings } = await import("../src/lib/premade/repository");
  const team = await getTeamBySlug(process.argv[2] ?? "premade-flex");
  if (!team) throw new Error("team not found");
  const matches = await getTeamMatches(team.id);
  let written = 0;
  for (let i = 0; i < matches.length; i += 10) {
    const slice = matches.slice(i, i + 10);
    await saveParticipantPings(team.id, slice);
    await markPingsSaved(team.id, slice.map((match) => match.matchId));
    written += slice.length;
    process.stdout.write(`\r${written}/${matches.length}`);
  }
  console.log("\ngames with pings written:", written);
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
