// Prints the purchases of one participant of one game from the events Riot sends (a second read of
// the same timeline), so the stored build can be checked line by line against the raw game.
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

async function main() {
  const [matchId = "BR1_3296413636", championId = "145"] = process.argv.slice(2);
  const res = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`, {
    headers: { "X-Riot-Token": process.env.RIOT_API_KEY ?? "" },
  });
  const json = (await res.json()) as { info?: { frames?: { events?: unknown[] }[] } };
  const events = (json.info?.frames ?? []).flatMap((frame) => (frame.events ?? []) as Record<string, unknown>[]);
  const msg = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`, {
    headers: { "X-Riot-Token": process.env.RIOT_API_KEY ?? "" },
  });
  const detail = (await msg.json()) as {
    info?: { participants?: { participantId?: number; championId?: number }[] };
  };
  const id = detail.info?.participants?.find((p) => String(p.championId) === championId)?.participantId;
  console.log("participantId", id);
  for (const event of events) {
    if (Number(event.participantId) !== Number(id)) continue;
    if (event.type === "ITEM_PURCHASED" || event.type === "ITEM_UNDO" || event.type === "ITEM_SOLD") {
      console.log(
        event.type,
        `item=${event.itemId ?? "-"}`,
        `before=${event.beforeId ?? "-"}`,
        `after=${event.afterId ?? "-"}`,
        `at=${(Number(event.timestamp) / 1000).toFixed(1)}s`,
      );
    }
    if (event.type === "SKILL_LEVEL_UP") process.stdout.write(String(event.skillSlot));
  }
  console.log("\nskills done");
}

main().catch((error) => {
  console.error("falhou:", error);
  process.exitCode = 1;
});
