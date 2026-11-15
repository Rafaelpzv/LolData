// A análise da premade em cada recorte de modo: o que a página mostra (métricas) e não só a lista.
// Usage: npx tsx scripts/premade-mode-compare.ts <slug>
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/"/g, "");
}

const SLUG = process.argv[2] ?? "premade-flex";

async function main() {
  const { loadAnalysisPayload } = await import("../src/lib/premade/analysis-payload");
  // null = sem filtro (o padrão da página): Flex e CLASSIC juntos.
  for (const queueKey of [null, "flex", "classic"] as const) {
    const payload = await loadAnalysisPayload(SLUG, { persistTraining: false, queueKey });
    const metrics = payload?.analysis.metrics;
    process.stdout.write(
      `${queueKey ?? "todos"}: partidas=${metrics?.games ?? "-"} vitorias=${metrics?.wins ?? "-"} ` +
        `winrate=${metrics?.winRate ? metrics.winRate.toFixed(1) : "-"}\n`,
    );
  }
}

main().catch((error) => process.stderr.write(`falhou: ${String(error)}\n`));
