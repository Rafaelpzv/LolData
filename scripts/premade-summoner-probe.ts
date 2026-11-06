// Probe the summoner match API exactly like the profile page does, for each roster player.
// Usage: npx tsx scripts/premade-summoner-probe.ts <slug>
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

const BASE_URL = "http://localhost:3000";

async function main() {
  const slug = process.argv[2];
  const { getTeamBySlug } = await import("../src/lib/premade/repository");
  const team = await getTeamBySlug(slug);
  if (!team) throw new Error("team not found");

  for (const member of team.members) {
    const params = new URLSearchParams({
      region: team.region.toLowerCase(),
      puuid: member.puuid,
      count: "20",
      queueId: "440",
      gameName: member.gameName,
      tagLine: member.tagLine,
    });
    const res = await fetch(`${BASE_URL}/api/summoner/matches?${params.toString()}`);
    const body = (await res.json().catch(() => null)) as { data?: any[]; cache?: string } | null;
    console.log(member.gameName, res.status, "flex", body?.data?.length ?? "-", "cache", body?.cache ?? "-");
  }
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
