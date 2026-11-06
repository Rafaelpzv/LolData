import { NextRequest, NextResponse } from "next/server";

import { requireEdit } from "@/lib/premade/access";
import { getShareState, regenerateShareId, setShareEnabled } from "@/lib/premade/share";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * /api/premade/[slug]/share
 * GET    -> { shareId, enabled } (somente para quem edita: o link nao e publico por si)
 * POST   { enabled }  liga/desliga o link
 * POST   { regenerate: true } troca o id e invalida o link antigo
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  return NextResponse.json(await getShareState(access.team!.id));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const teamId = access.team!.id;

  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown; regenerate?: unknown };
  try {
    if (body.regenerate === true) return NextResponse.json(await afterRegenerate(teamId));
    if (typeof body.enabled === "boolean") await setShareEnabled(teamId, body.enabled);
    return NextResponse.json(await getShareState(teamId));
  } catch (error) {
    console.error("[premade] share update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

async function afterRegenerate(teamId: string) {
  const shareId = await regenerateShareId(teamId);
  return { shareId, enabled: true };
}
