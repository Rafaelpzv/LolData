import { NextRequest, NextResponse } from "next/server";

import { requireEdit } from "@/lib/premade/access";

import { collectBatch } from "@/lib/premade/collect-batch";
import { isPremadeQueueKey, type PremadeQueueKey } from "@/lib/premade/collect";

/** Hits Riot and writes to Supabase: never cached. */
export const dynamic = "force-dynamic";
/** The batch budget (PREMADE_BATCH_BUDGET_MS, 40s in dev) has to fit inside this. */
export const maxDuration = 60;

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/premade/[slug]/collect — runs ONE batch of the collection and answers with where it
 * stopped. The client calls it again until `done` (or until a batch reports `error`), so every
 * request stays inside the route limit. Body (optional): { budgetMs?, maxDetails?, minRoster?,
 * mode?: "fresh" | "incremental" | "full", restart?, queues?: ("flex" | "classic")[] }. The data
 * button sends "fresh" and `restart: true` on its FIRST call only: restart starts a new session,
 * the next batches must resume the cursor it stored. `queues` narrows the collection to some of
 * the modes; without it every mode is collected (Flex 440 AND CLASSIC 710), since each has its own
 * list, cursor and session state.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  // Leitura e aberta; sem a sessao de edicao, nada escreve.
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const body = (await request
    .json()
    .catch(() => ({}))) as {
    budgetMs?: unknown;
    maxDetails?: unknown;
    minRoster?: unknown;
    rescan?: unknown;
    restart?: unknown;
    mode?: unknown;
    queues?: unknown;
  };
  const positive = (raw: unknown) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  };
  const mode = body.mode === "full" ? "full" : body.mode === "incremental" ? "incremental" : "fresh";

  try {
    const step = await collectBatch(team.id, {
      budgetMs: positive(body.budgetMs),
      maxDetails: positive(body.maxDetails),
      minRoster: positive(body.minRoster),
      rescan: body.rescan === true,
      restart: body.restart === true,
      mode,
      // Só as filas que o chamador nomeou; sem elas, a coleta lê todos os modos da premade.
      queues: toQueues(body.queues),
    });
    if (step.outcome === "notFound") return NextResponse.json({ error: "notFound" }, { status: 404 });
    if (step.outcome === "noKey") return NextResponse.json({ error: "riotUnavailable" }, { status: 500 });
    console.info(`[premade] collect ${slug}: ${JSON.stringify({ ...step, perAccount: undefined })}`);
    return NextResponse.json(step);
  } catch (error) {
    console.error("[premade] collect failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/**
 * As filas pedidas no corpo: nomes conhecidos, sem repetição, e nenhuma quando o pedido não nomeia
 * nenhuma (aí a coleta lê todas). Um nome desconhecido é descartado em vez de virar erro.
 */
function toQueues(raw: unknown): PremadeQueueKey[] | undefined {
  const names = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const known = names.filter(
    (name): name is PremadeQueueKey =>
      typeof name === "string" && isPremadeQueueKey(name),
  );
  return [...new Set(known)];
}
