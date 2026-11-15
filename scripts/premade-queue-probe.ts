// Probes the Riot id lists the premade collection reads, for each roster account: does the queue of
// the mode answer games, and what queue does a game of that mode carry in its detail?
// Usage: npx tsx scripts/premade-queue-probe.ts <slug> <queue> [--detail]
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

const SLUG = process.argv[2] ?? "premade-flex";
const QUEUE = process.argv[3] ?? "710";
const DETAIL = process.argv.includes("--detail");

async function main() {
  const { getTeamBySlug, getPlayers } = await import("../src/lib/premade/repository");
  const { getRegionalUrl } = await import("../src/lib/riot/match-v5");

  const team = await getTeamBySlug(SLUG);
  if (!team) throw new Error(`team not found: ${SLUG}`);
  const players = await getPlayers(team.id);
  const accounts = players.flatMap((player) =>
    player.accounts.map((account) => ({ ...account, person: player.id })),
  );
  const base = getRegionalUrl(team.region);
  const headers = { "X-Riot-Token": process.env.RIOT_API_KEY ?? "" };
  process.stderr.write(`team ${team.slug} ${team.region} accounts ${accounts.length}\n`);

  const listed = new Map<string, string[]>();
  for (const account of accounts) {
    const url = new URL(`${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids`);
    url.searchParams.set("queue", QUEUE);
    url.searchParams.set("start", "0");
    url.searchParams.set("count", "100");
    const res = await fetch(url, { headers, cache: "no-store" });
    const body = res.ok ? await res.json().catch(() => null) : null;
    const ids: string[] = Array.isArray(body) ? body : [];
    listed.set(account.puuid, ids);
    process.stderr.write(`${account.gameName} ${res.status} queue=${QUEUE} ids=${ids.length} newest=${ids[0] ?? "-"}\n`);
  }

  if (!DETAIL) return;
  const union = [...new Set([...listed.values()].flat())]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 6);
  for (const id of union) {
    const res = await fetch(`${base}/lol/match/v5/matches/${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
    });
    const info = (res.ok ? await res.json().catch(() => null) : null)?.info;
    if (!info) continue;
    const roster = info.participants.filter((p: { puuid: string }) => listed.has(p.puuid));
    process.stderr.write(
      `${id} queueId=${info.queueId} gameMode=${info.gameMode} duration=${info.gameDuration} roster=${roster.length}\n`,
    );
  }
}

main().catch((error) => process.stderr.write(`failed: ${String(error)}\n`));
