import { NextRequest, NextResponse } from "next/server";

import { getSummonerByRiotId } from "@/app/actions/summoner";
import { buildMembers, createPremadePayloadSchema, teamSlug } from "@/lib/premade/members";
import { createTeam } from "@/lib/premade/repository";

/** Every lookup hits Riot: never prerender or cache this route. */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;

interface LookupResult {
  slot: number;
  summoner: Awaited<ReturnType<typeof getSummonerByRiotId>>;
}

/**
 * POST /api/premade — registers a team from three to five Riot IDs.
 * Every ID must resolve on the given region: a player from another region simply does not
 * exist there for Riot, so the lookup fails and the whole registration is refused.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "invalidBody" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalidBody" }, { status: 400 });
    }

    const parsed = createPremadePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidBody" }, { status: 400 });
    }
    const { name, region, riotIds } = parsed.data;

    let players: LookupResult[];
    try {
      players = await Promise.all(
        riotIds.map(async (riotId, slot) => {
          const [gameName, tagLine] = riotId.split("#");
          return { slot, summoner: await getSummonerByRiotId(region, gameName, tagLine) };
        }),
      );
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 429) {
        return NextResponse.json({ error: "riotBusy" }, { status: 429 });
      }
      return NextResponse.json({ error: "riotUnavailable" }, { status: 502 });
    }

    // A player outside this region is not found there, so any null (or any HTTP 404) means they
    // are not all from the same region.
    const missing = players.filter((p) => !p.summoner).map((p) => p.slot);
    if (missing.length > 0) {
      return NextResponse.json({ error: "wrongRegion", slots: missing }, { status: 422 });
    }

    const resolved = buildMembers(
      players.map((p) => ({
        slot: p.slot,
        puuid: p.summoner!.puuid,
        gameName: p.summoner!.name ?? "",
        tagLine: p.summoner!.tagLine,
      })),
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 422 });
    }

    const team = await createTeam({ slug: teamSlug(name), name, region, members: resolved.members });
    return NextResponse.json({ slug: team.slug }, { status: 201 });
  } catch (error) {
    console.error("[premade] create failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
