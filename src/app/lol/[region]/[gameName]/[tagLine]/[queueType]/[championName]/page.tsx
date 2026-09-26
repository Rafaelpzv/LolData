import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getChampionMasteries,
  getQueueTypes,
  getRankedByPuuid,
  getSummonerByRiotId,
} from "@/app/actions/summoner";
import { championIdFromParam } from "@/lib/champions";
import { queueIdFromSlug } from "@/lib/queues";
import { regionShort } from "@/lib/regions";
import { decodeParamOnce } from "@/lib/riot-id";
import { PageShell } from "@/components/layout/page-shell";
import { Reveal } from "@/components/motion/reveal";
import { SectionFailed } from "@/components/ui/async-section";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileHeader } from "@/components/profile/profile-header";
import { MatchFilters } from "@/components/lol/match-filters";
import { MatchHistory } from "@/components/lol/match-history";
import { MatchListSkeleton } from "@/components/lol/match-card-skeleton";
import { MatchStatsText } from "@/components/lol/match-stats-text";
import {
  MasteryGrid,
  MasteryGridSkeleton,
  RankedCards,
  RankedCardsSkeleton,
  type ChampionMastery,
  type RankedEntry,
} from "@/components/lol/summoner-profile";
import type { LolMatch, QueueType } from "@/components/lol/types";

interface RouteParams {
  region: string;
  gameName: string;
  tagLine: string;
  queueType: string;
  championName: string;
}

interface SummonerPageProps {
  params: Promise<RouteParams>;
}

const TOP_MASTERIES = 5;

/** Summoner lookup; an unknown Riot ID (Riot 404) resolves to null instead of throwing. */
async function findSummoner(region: string, gameName: string, tagLine: string) {
  try {
    return await getSummonerByRiotId(region, gameName, tagLine);
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: SummonerPageProps): Promise<Metadata> {
  const raw = await params;
  const gameName = decodeParamOnce(raw.gameName);
  const tagLine = decodeParamOnce(raw.tagLine);
  const t = await getTranslations("matches");
  return {
    title: `${gameName}#${tagLine} (${regionShort(raw.region)})`,
    description: t("metaDescription", { name: `${gameName}#${tagLine}` }),
  };
}

/** Deduplicated per request: the stats line and the list share one fetch. */
const loadMatches = cache(async (url: string): Promise<LolMatch[]> => {
  const res = await fetch(url, { cache: "no-store" });
  const contentType = res.headers.get("content-type");
  if (!res.ok || !contentType?.includes("application/json")) {
    throw new Error(`Match API error: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data || [];
});

interface MatchContext {
  url: string;
  puuid: string;
  region: string;
  queueId: string;
  championId: string | null;
  gameName: string;
  tagLine: string;
}

async function loadFilteredMatches(ctx: MatchContext) {
  const matches = await loadMatches(ctx.url);
  // Safety net in case the API returned games on other champions.
  return ctx.championId
    ? matches.filter((m) =>
        m.info?.participants?.some((p) => p.puuid === ctx.puuid && String(p.championId) === ctx.championId),
      )
    : matches;
}

// ---- Async sections: each one loads (and fails) on its own. ---------------------------------

/** Runs a section loader; a failure is logged and becomes that section's error state. */
async function settle<T>(label: string, load: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    console.error(`[lol profile] ${label} failed:`, error);
    return { ok: false };
  }
}

async function RankedSection({ region, puuid, errorTitle }: { region: string; puuid: string; errorTitle: string }) {
  const res = await settle("ranked", () => getRankedByPuuid(region, puuid));
  if (!res.ok) return <SectionFailed title={errorTitle} />;
  return <RankedCards ranked={(res.value ?? []) as RankedEntry[]} />;
}

async function MasterySection({ region, puuid, errorTitle }: { region: string; puuid: string; errorTitle: string }) {
  const res = await settle("masteries", () => getChampionMasteries(region, puuid));
  if (!res.ok) return <SectionFailed title={errorTitle} />;
  return <MasteryGrid masteries={((res.value ?? []) as ChampionMastery[]).slice(0, TOP_MASTERIES)} />;
}

async function MatchStatsSection(ctx: MatchContext) {
  // The list below reports a failed load; the summary line just stays out of the way.
  const matches = await loadFilteredMatches(ctx).catch(() => null);
  if (!matches) return null;
  const recent = matches.slice(0, 20);
  const wins = recent.filter((m) => m.info?.participants?.find((p) => p.puuid === ctx.puuid)?.win === true).length;
  return <MatchStatsText initialWins={wins} initialLosses={recent.length - wins} />;
}

async function MatchHistorySection(ctx: MatchContext & { errorTitle: string }) {
  const [res, queueTypes] = await Promise.all([
    settle("matches", () => loadFilteredMatches(ctx)),
    // Queue names are cosmetic: never fail the list because of them.
    getQueueTypes().catch(() => []),
  ]);
  if (!res.ok) return <SectionFailed title={ctx.errorTitle} />;
  const matches = res.value;
  return (
    <MatchHistory
      initialMatches={matches}
      puuid={ctx.puuid}
      queueTypes={(queueTypes ?? []) as QueueType[]}
      region={ctx.region}
      queueId={ctx.queueId}
      championId={ctx.championId}
      gameName={ctx.gameName}
      tagLine={ctx.tagLine}
    />
  );
}

export default async function SummonerPage({ params }: SummonerPageProps) {
  const raw = await params;
  // The raw route region (e.g. "br1") is what the actions and match API cache keys expect.
  const region = raw.region;
  const gameName = decodeParamOnce(raw.gameName);
  const tagLine = decodeParamOnce(raw.tagLine);
  const queueId = queueIdFromSlug(raw.queueType);
  const championId = championIdFromParam(decodeParamOnce(raw.championName));

  // The only blocking call: without the player there is nothing to show.
  const summoner = await findSummoner(region, gameName, tagLine);
  if (!summoner) notFound();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";

  const matchParams = new URLSearchParams({ region, puuid: summoner.puuid, count: "20", gameName, tagLine });
  if (queueId !== "all") matchParams.set("queueId", queueId);
  if (championId) {
    // championName kept for older cache entries filtered by name/slug.
    matchParams.set("championName", championId);
    matchParams.set("championId", championId);
  }
  const matchCtx: MatchContext = {
    url: `${baseUrl}/api/summoner/matches?${matchParams.toString()}`,
    puuid: summoner.puuid,
    region,
    queueId,
    championId,
    gameName,
    tagLine,
  };

  const t = await getTranslations("matches");
  const tErrors = await getTranslations("matches.sectionError");

  return (
    <PageShell>
      <Reveal
        as="section"
        immediate
        aria-label={t("profileLabel")}
        className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"
      >
        <ProfileHeader
          gameName={gameName}
          tagLine={tagLine}
          level={summoner.summonerLevel}
          profileIconId={summoner.profileIconId}
          region={region}
        />
        <div className="md:w-[40rem] md:shrink-0">
          <Suspense fallback={<RankedCardsSkeleton />}>
            <RankedSection region={region} puuid={summoner.puuid} errorTitle={tErrors("ranked")} />
          </Suspense>
        </div>
      </Reveal>

      <Reveal as="section" delay={0.05} aria-labelledby="champion-mastery-title" className="space-y-3">
        <h2 id="champion-mastery-title" className="text-lg font-semibold tracking-tight text-foreground">
          {t("mastery.title")}
        </h2>
        <Suspense fallback={<MasteryGridSkeleton />}>
          <MasterySection region={region} puuid={summoner.puuid} errorTitle={tErrors("masteries")} />
        </Suspense>
      </Reveal>

      <Reveal as="section" delay={0.1} aria-labelledby="match-history-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="match-history-title" className="text-lg font-semibold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <Suspense fallback={<Skeleton className="h-4 w-48" />}>
            <MatchStatsSection {...matchCtx} />
          </Suspense>
        </div>
        <MatchFilters region={region} gameName={gameName} tagLine={tagLine} queueId={queueId} championId={championId} />
        <Suspense fallback={<MatchListSkeleton count={4} label={t("loadingMatches")} />}>
          <MatchHistorySection {...matchCtx} errorTitle={tErrors("matches")} />
        </Suspense>
      </Reveal>
    </PageShell>
  );
}
