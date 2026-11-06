import { NextRequest, NextResponse } from "next/server";

import { requireEdit } from "@/lib/premade/access";

import { recollectFields } from "@/lib/premade/recollect-batch";

/** Hits Riot and writes to Supabase: never cached. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/premade/[slug]/recollect — runs ONE batch of the re-collection of the games already
 * stored (the fields of migration 0010) and answers with where it stopped. The client calls again
 * until `done`. Body (optional): { budgetMs?: number, maxMatches?: number }.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  // Leitura e aberta; sem a sessao de edicao, nada escreve.
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const body = (await request.json().catch(() => ({}))) as { budgetMs?: unknown; maxMatches?: unknown };
  const positive = (raw: unknown) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  };

  try {
    const step = await recollectFields(team.id, {
      budgetMs: positive(body.budgetMs),
      maxMatches: positive(body.maxMatches),
    });
    if (step.outcome === "notFound") return NextResponse.json({ error: "notFound" }, { status: 404 });
    if (step.outcome === "noKey") return NextResponse.json({ error: "riotUnavailable" }, { status: 500 });
    console.info(`[premade] recollect ${slug}: ${JSON.stringify(step)}`);
    return NextResponse.json(step);
  } catch (error) {
    console.error("[premade] recollect failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
