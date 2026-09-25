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
import { MatchFilters } from "@/components/lol/match-filters";
import { MatchHistory } from "@/components/lol/match-history";
import { MatchStatsText } from "@/components/lol/match-stats-text";
import { PartialDataAlert } from "@/components/lol/partial-data-alert";
import {
  SummonerProfile,
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

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === "fulfilled") return result.value ?? fallback;
  console.error(`[lol profile] ${label} failed:`, result.reason);
  return fallback;
}

async function loadMatches(url: string): Promise<LolMatch[]> {
  const res = await fetch(url, { cache: "no-store" });
  const contentType = res.headers.get("content-type");
  if (!res.ok || !contentType?.includes("application/json")) {
    throw new Error(`Match API error: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.data || [];
}

export default async function SummonerPage({ params }: SummonerPageProps) {
  const raw = await params;
  // The raw route region (e.g. "br1") is what the actions and match API cache keys expect.
  const region = raw.region;
  const gameName = decodeParamOnce(raw.gameName);
  const tagLine = decodeParamOnce(raw.tagLine);
  const queueId = queueIdFromSlug(raw.queueType);
  const championId = championIdFromParam(decodeParamOnce(raw.championName));

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

  // Only the summoner lookup is fatal. Every other source degrades on its own (Riot 429s, cold
  // cache, a slow self-fetch) so one failing call never takes the whole profile down.
  const [queueTypesRes, masteriesRes, rankedRes, matchesRes] = await Promise.allSettled([
    getQueueTypes(),
    getChampionMasteries(region, summoner.puuid),
    getRankedByPuuid(region, summoner.puuid),
    loadMatches(`${baseUrl}/api/summoner/matches?${matchParams.toString()}`),
  ]);

  const queueTypes = settledValue(queueTypesRes, [], "queue types");
  const masteries = settledValue(masteriesRes, [], "masteries");
  const rankedData = settledValue(rankedRes, [], "ranked");
  let matches: LolMatch[] = settledValue(matchesRes, [], "matches");
  const partialFailure = [masteriesRes, rankedRes, matchesRes].some((r) => r.status === "rejected");

  // Safety net in case the API returned games on other champions.
  if (championId) {
    matches = matches.filter((m) =>
      m.info?.participants?.some((p) => p.puuid === summoner.puuid && String(p.championId) === championId),
    );
  }

  const lastWins = matches
    .slice(0, 20)
    .filter((m) => m.info?.participants?.find((p) => p.puuid === summoner.puuid)?.win === true).length;
  const lastLosses = Math.min(matches.length, 20) - lastWins;

  const t = await getTranslations("matches");

  return (
    <PageShell>
      {partialFailure && <PartialDataAlert />}
      <SummonerProfile
        gameName={gameName}
        tagLine={tagLine}
        region={region}
        level={summoner.summonerLevel}
        profileIconId={summoner.profileIconId}
        ranked={(rankedData ?? []) as RankedEntry[]}
        masteries={((masteries ?? []) as ChampionMastery[]).slice(0, TOP_MASTERIES)}
      />

      <Reveal as="section" delay={0.1} aria-labelledby="match-history-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="match-history-title" className="text-lg font-semibold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <MatchStatsText initialWins={lastWins} initialLosses={lastLosses} />
        </div>
        <MatchFilters
          region={region}
          gameName={gameName}
          tagLine={tagLine}
          queueId={queueId}
          championId={championId}
        />
        <MatchHistory
          initialMatches={matches}
          puuid={summoner.puuid}
          queueTypes={(queueTypes ?? []) as QueueType[]}
          region={region}
          queueId={queueId}
          championId={championId}
          gameName={gameName}
          tagLine={tagLine}
        />
      </Reveal>
    </PageShell>
  );
}
