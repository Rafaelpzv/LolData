// Os cursores guardados por conta e por fila: prova de que a coleta dos dois modos não se mistura.
// Usage: npx tsx scripts/premade-cursors.ts <slug>
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

const SLUG = process.argv[2] ?? "premade-flex";

async function main() {
  const { getTeamBySlug, getCollectionCursors } = await import("../src/lib/premade/repository");
  const team = await getTeamBySlug(SLUG);
  if (!team) throw new Error(`team not found: ${SLUG}`);

  for (const queueKey of [null, "classic"] as const) {
    const cursors = await getCollectionCursors(team.id, queueKey);
    const rows = [...cursors.values()];
    const epochs = rows.map((row) => row.epoch).filter((value) => value > 0);
    const newest = epochs.length ? new Date(Math.max(...epochs)).toISOString().slice(0, 10) : "-";
    process.stdout.write(
      `${queueKey ?? "flex"}: ${rows.length} cursores, ${rows.filter((row) => row.finished).length} no fim, epoch mais novo ${newest}\n`,
    );
  }
}

main().catch((error) => process.stderr.write(`falhou: ${String(error)}\n`));
