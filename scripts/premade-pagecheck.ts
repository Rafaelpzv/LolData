// Reproduce the collector's ids pass outside Next: 5 players x 2 pages, queue 440, count 100.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const { getTeamBySlug } = await import("../src/lib/premade/repository");
  const { getRegionalUrl, safeFetch } = await import("../src/lib/riot/match-v5");
  const team = await getTeamBySlug(process.argv[2]);
  const base = getRegionalUrl(team!.region);
  const headers = { "X-Riot-Token": process.env.RIOT_API_KEY! };
  const counts = new Map<string, number>();

  for (const member of team!.members) {
    for (let page = 0; page < 2; page++) {
      const url = new URL(`${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(member.puuid)}/ids`);
      url.searchParams.set("queue", "440");
      url.searchParams.set("start", String(page * 100));
      url.searchParams.set("count", "100");
      const res = await safeFetch(url.toString(), { headers, cache: "no-store" });
      const text = await res.text();
      let ids: string[] = [];
      try {
        ids = JSON.parse(text);
      } catch {
        /* ignore */
      }
      console.log(member.gameName, "page", page, res.status, "ids", ids.length);
      for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const dist: Record<string, number> = {};
  for (const n of counts.values()) dist[n] = (dist[n] ?? 0) + 1;
  console.log("union", counts.size, "presence", JSON.stringify(dist));
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
