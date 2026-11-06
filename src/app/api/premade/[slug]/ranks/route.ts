import { NextRequest, NextResponse } from "next/server";

import { requireEdit } from "@/lib/premade/access";

import { syncAccountRanks } from "@/lib/premade/rank-sync";

/** Hits Riot and writes to Supabase: never cached. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/premade/[slug]/ranks — reads ONE stale account from Riot (Summoner-V4 + League-V4)
 * and answers with how many are left. The "Atualizar dados" button calls it in a loop.
 * Body (optional): { puuid?: string } to refresh a single account, { force?: boolean } to ignore the
 * 6 h interval, { skip?: string[] } with the accounts the run already wrote (the client walks the
 * roster once and stops on `done`).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  // Leitura e aberta; sem a sessao de edicao, nada escreve.
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const body = (await request.json().catch(() => ({}))) as {
    puuid?: unknown;
    force?: unknown;
    skip?: unknown;
  };
  const puuid = typeof body.puuid === "string" && body.puuid.trim() ? body.puuid.trim() : undefined;
  const force = body.force === true;
  const skip = Array.isArray(body.skip) ? body.skip.filter((value): value is string => typeof value === "string") : [];

  try {
    const step = await syncAccountRanks(team.id, { puuid, force, skip });
    if (step.outcome === "notFound") return NextResponse.json({ error: "notFound" }, { status: 404 });
    if (step.outcome === "noKey") return NextResponse.json({ error: "riotUnavailable" }, { status: 500 });
    console.info(
      `[premade] ranks ${slug}: saved=${step.saved} failed=${step.failed} remaining=${step.remaining} account=${step.account?.gameName ?? "-"} queue=${step.account?.queue ?? "-"}${step.error ? ` error=${step.error}` : ""}`,
    );
    return NextResponse.json(step);
  } catch (error) {
    // The reason is printed whole: a missing column or a bad row is what makes the write fail.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[premade] ranks failed for ${slug}:`, error);
    return NextResponse.json({ error: "internal", message }, { status: 500 });
  }
}
