import { NextRequest, NextResponse } from "next/server";

import { requireEdit } from "@/lib/premade/access";
import { z } from "zod";

import { getSummonerByRiotId } from "@/app/actions/summoner";
import { parseRiotId } from "@/lib/riot-id";
import { collectBatch } from "@/lib/premade/collect-batch";
import {
  addAccount,
  addPlayer,
  deletePlayer,
  getPlayers,
  removeAccount,
} from "@/lib/premade/repository";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  riotId: z.string().trim().min(3),
  /** The person that receives the account. Without it the account starts a new person. */
  playerId: z.string().uuid().optional(),
});

interface Params {
  params: Promise<{ slug: string }>;
}

/** Resolves a Riot ID on the team region; null means "not found there". */
async function resolveAccount(region: string, raw: string) {
  const riotId = parseRiotId(raw);
  if (!riotId.ok) return { error: "invalidRiotId" as const };
  const summoner = await getSummonerByRiotId(region, riotId.gameName, riotId.tagLine).catch(() => null);
  if (!summoner) return { error: "wrongRegion" as const };
  return {
    ok: true as const,
    account: {
      puuid: summoner.puuid,
      gameName: summoner.name || riotId.gameName,
      tagLine: riotId.tagLine,
    },
  };
}

/**
 * POST /api/premade/[slug]/members — adds a person (a new account) or an extra account to an
 * existing person (`playerId`). Same region as the team, no repeated PUUID.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  // Leitura e aberta; sem a sessao de edicao, nada escreve.
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalidInput" }, { status: 400 });

  const resolved = await resolveAccount(team.region, parsed.data.riotId);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 422 });

  // An account belongs to exactly one person: same person is a no-op, another person is a conflict.
  const existing = await getPlayers(team.id);
  const owner = existing.find((player) => player.accounts.some((a) => a.puuid === resolved.account.puuid));
  const target = parsed.data.playerId;
  if (owner && (!target || owner.id !== target)) return NextResponse.json({ error: "duplicate" }, { status: 409 });
  if (target && !existing.some((player) => player.id === target)) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  try {
    if (target) {
      await addAccount(team.id, target, resolved.account);
    } else {
      await addPlayer(team.id, { gameName: resolved.account.gameName, account: resolved.account });
    }
  } catch (error) {
    console.error("[premade] add account failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * DELETE /api/premade/[slug]/members?puuid=... — removes one account (and its games) for good.
 * DELETE /api/premade/[slug]/members?playerId=... — removes a whole person with their accounts.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  // Leitura e aberta; sem a sessao de edicao, nada escreve.
  const access = await requireEdit(slug, request);
  if (access.denied) return access.denied;
  const team = access.team!;

  const puuid = request.nextUrl.searchParams.get("puuid");
  const playerId = request.nextUrl.searchParams.get("playerId");
  if (!puuid && !playerId) return NextResponse.json({ error: "invalidInput" }, { status: 400 });

  try {
    if (playerId) await deletePlayer(team.id, playerId);
    else await removeAccount(team.id, puuid!);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    // The lineup always keeps three players: deleting below that is refused.
    if (code === "rosterTooSmall") return NextResponse.json({ error: code }, { status: 409 });
    if (code === "notFound") return NextResponse.json({ error: code }, { status: 404 });
    console.error("[premade] remove member failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // The lineup changed, so the games are measured again: the caller keeps calling `collect` until
  // it reports done. A Riot failure here must not undo the removal, hence the catch.
  const recollect = await collectBatch(team.id, { restart: true }).catch((error: unknown) => {
    console.error("[premade] recollect after removal failed:", error);
    return null;
  });

  return NextResponse.json({
    ok: true,
    recollect: recollect
      ? { done: recollect.done, saved: recollect.saved, collected: recollect.collected, remaining: recollect.remaining }
      : null,
  });
}
