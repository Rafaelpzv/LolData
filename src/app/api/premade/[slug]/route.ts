import { NextRequest, NextResponse } from "next/server";

import { SMALL_SAMPLE, computeMetrics } from "@/lib/premade/metrics";
import { buildRecommendations } from "@/lib/premade/recommendations";
import { getPlayers, getTeamBySlug, getTeamMatches } from "@/lib/premade/repository";

/** Reads the database on every call: never cached. */
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/premade/[slug] — the team analysis: metrics, recommendations and the data the UI
 * renders. `?window=all|10|20` limits how many of the newest games are used.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const team = await getTeamBySlug(slug);
    if (!team) return NextResponse.json({ error: "notFound" }, { status: 404 });

    const windowParam = request.nextUrl.searchParams.get("window") ?? "all";
    const parsed = Number(windowParam);
    if (windowParam !== "all" && (!Number.isInteger(parsed) || parsed <= 0)) {
      return NextResponse.json({ error: "invalidWindow" }, { status: 400 });
    }

    const [matches, players] = await Promise.all([getTeamMatches(team.id), getPlayers(team.id)]);
    const windowed = windowParam === "all" ? matches : matches.slice(0, parsed);
    // People come from the matches themselves: an account only carries an accountId while its
    // owner is still on the lineup, so a removed player disappears from every number here.
    const metrics = computeMetrics(windowed);

    return NextResponse.json({
      team: { slug: team.slug, name: team.name, region: team.region, members: team.members, players },
      window: windowParam,
      games: metrics.games,
      smallSample: metrics.games < SMALL_SAMPLE,
      metrics,
      recommendations: buildRecommendations(metrics, windowed, players),
      matches: windowed.map((m) => ({
        matchId: m.matchId,
        gameCreation: m.gameCreation,
        win: m.win,
        duration: m.duration,
      })),
    });
  } catch (error) {
    console.error("[premade] analysis failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
