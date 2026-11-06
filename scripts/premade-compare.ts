// Compare the premade rule against the plain summoner match history for one team.
// Usage: npx tsx scripts/premade-compare.ts <slug> [scan]
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const [slug, scanArg] = process.argv.slice(2);
  const { getTeamBySlug } = await import("../src/lib/premade/repository");
  const { getRegionalUrl, safeFetch } = await import("../src/lib/riot/match-v5");

  const team = await getTeamBySlug(slug);
  if (!team) throw new Error("team not found");

  const base = getRegionalUrl(team.region);
  const headers = { "X-Riot-Token": process.env.RIOT_API_KEY! };
  const puuids = team.members.map((m) => m.puuid);

  const ids: string[] = [];
  for (const puuid of puuids) {
    const url = new URL(`${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`);
    url.searchParams.set("queue", "440");
    url.searchParams.set("count", "100");
    const res = await safeFetch(url.toString(), { headers, cache: "no-store" });
    if (res.ok) ids.push(...((await res.json()) as string[]));
  }

  const unique = [...new Set(ids)];
  const limit = Math.min(unique.length, Number(scanArg ?? 100));
  const depth: Record<string, number> = {};
  const oldest = { first: 0, last: 0 };

  for (let i = 0; i < limit; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const details = await Promise.all(
      chunk.map(async (id) => {
        const res = await safeFetch(`${base}/lol/match/v5/matches/${id}`, { headers, cache: "no-store" });
        return res.ok ? ((await res.json()) as any) : null;
      }),
    );
    for (const info of details) {
      if (!info?.info) continue;
      const created = Number(info.info.gameCreation);
      if (!oldest.first || created < oldest.first) oldest.first = created;
      if (!oldest.last || created > oldest.last) oldest.last = created;

      const bySide = new Map<number, number>();
      for (const p of info.info.participants as any[]) {
        if (!puuids.includes(p.puuid)) continue;
        bySide.set(p.teamId, (bySide.get(p.teamId) ?? 0) + 1);
      }
      const best = Math.max(0, ...bySide.values());
      const key = best >= 5 ? "5+" : String(best);
      depth[key] = (depth[key] ?? 0) + 1;
    }
  }

  console.log("team", team.name, "players", puuids.length);
  console.log("union", unique.length, "scanned", limit);
  console.log("depth", JSON.stringify(depth));
  console.log(
    "dates",
    oldest.first ? new Date(oldest.first).toISOString().slice(0, 10) : "-",
    "->",
    oldest.last ? new Date(oldest.last).toISOString().slice(0, 10) : "-",
  );
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
