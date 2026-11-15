// Roda UM lote da coleta com a mesma função da rota, para verificar as filas de verdade
// (Riot -> samples -> Supabase) sem a sessão de edição que a rota exige.
// Usage: npx tsx scripts/premade-collect-once.ts <slug> [fresh|incremental|full] [flex,classic]
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

const SLUG = process.argv[2] ?? "premade-flex";
const MODE = (process.argv[3] ?? "fresh") as "fresh" | "incremental" | "full";
const QUEUES = process.argv[4]?.split(",");

async function main() {
  const { collectBatch } = await import("../src/lib/premade/collect-batch");
  const { getTeamBySlug, getTeamMatches } = await import("../src/lib/premade/repository");

  const team = await getTeamBySlug(SLUG);
  if (!team) throw new Error(`team not found: ${SLUG}`);

  const count = async () => {
    const matches = await getTeamMatches(team.id, 5000);
    const byQueue: Record<string, number> = {};
    for (const match of matches) {
      const key = String(match.queueId ?? "none");
      byQueue[key] = (byQueue[key] ?? 0) + 1;
    }
    return { total: matches.length, byQueue };
  };

  const before = await count();
  const step = await collectBatch(team.id, {
    queues: QUEUES,
    mode: MODE,
    minRoster: 2,
    restart: true,
    budgetMs: 120_000,
  });
  const after = await count();

  process.stdout.write(
    [
      `lote: mode=${MODE} queues=${QUEUES?.join("+") ?? "todas"} saved=${step.saved} scanned=${step.scanned} listed=${step.listed} reads=${step.reads} done=${step.done} error=${step.error}`,
      `antes: ${before.total} ${JSON.stringify(before.byQueue)}`,
      `depois: ${after.total} ${JSON.stringify(after.byQueue)}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => process.stderr.write(`falhou: ${String(error)}\n`));
