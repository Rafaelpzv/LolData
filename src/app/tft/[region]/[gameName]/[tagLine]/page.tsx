import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDdragonVersion } from "@/lib/cdn";
import { regionShort } from "@/lib/regions";
import { decodeParamOnce } from "@/lib/riot-id";
import { PageShell } from "@/components/layout/page-shell";
import { TftProfile } from "@/components/tft/tft-profile";
import { TftMatchList } from "@/components/tft/tft-match-list";
import type { TftMatch } from "@/components/tft/types";
import {
  getTftSummonerByRiotId,
  getTftLeagueByPuuid,
  getTftMatchIds,
  getTftMatchById,
} from "@/app/actions/tft";

type PageParams = Promise<{ region: string; gameName: string; tagLine: string }>;

const MATCH_BATCH_SIZE = 5;

async function findSummoner(region: string, gameName: string, tagLine: string) {
  try {
    return await getTftSummonerByRiotId(region, gameName, tagLine);
  } catch (error: any) {
    // account-v1 answers 404 for an unknown Riot ID.
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

async function loadTftPageData(region: string, gameName: string, tagLine: string) {
  const summoner = await findSummoner(region, gameName, tagLine);
  if (!summoner) return null;

  // Only the summoner lookup is fatal; ranked, match ids and the ddragon version degrade to empty
  // so a Riot 429 on one call does not replace the whole profile with the error page.
  const [leagueRes, idsRes, versionRes] = await Promise.allSettled([
    getTftLeagueByPuuid(region, summoner.puuid),
    getTftMatchIds(region, summoner.puuid, 20),
    getDdragonVersion(),
  ]);
  const settled = <T,>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value ?? fallback;
    console.error(`[tft profile] ${label} failed:`, r.reason);
    return fallback;
  };
  const leagueEntries = settled(leagueRes, [], "league");
  const matchIds = settled(idsRes, [] as string[], "match ids");
  const ddragonVersion = settled(versionRes, null, "ddragon version");

  const matches = await fetchMatchesInBatches(region, matchIds);

  return { summoner, leagueEntries, matches, ddragonVersion, loadedAt: Date.now() };
}

async function fetchMatchesInBatches(region: string, matchIds: string[]): Promise<TftMatch[]> {
  const matches: TftMatch[] = [];

  for (let i = 0; i < matchIds.length; i += MATCH_BATCH_SIZE) {
    const batch = matchIds.slice(i, i + MATCH_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => getTftMatchById(region, id)));

    for (const result of results) {
      if (result.status === "fulfilled") {
        matches.push(result.value);
      }
    }

    if (i + MATCH_BATCH_SIZE < matchIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return matches;
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { region, gameName, tagLine } = await params;
  const t = await getTranslations("tft");
  return {
    title: t("metaTitle", {
      name: decodeParamOnce(gameName),
      tag: decodeParamOnce(tagLine),
      region: regionShort(region),
    }),
  };
}

export default async function TftSummonerPage({ params }: { params: PageParams }) {
  const raw = await params;
  const region = raw.region;
  const gameName = decodeParamOnce(raw.gameName);
  const tagLine = decodeParamOnce(raw.tagLine);

  // Errors propagate to error.tsx; a missing player renders not-found.tsx.
  const data = await loadTftPageData(region, gameName, tagLine);
  if (!data) notFound();

  const ranked = data.leagueEntries.find((entry) => entry.queueType === "RANKED_TFT") ?? null;

  return (
    <PageShell>
      <TftProfile
        gameName={gameName}
        tagLine={tagLine}
        level={data.summoner.summonerLevel}
        profileIconId={data.summoner.profileIconId}
        region={region}
        ranked={ranked}
      />
      <TftMatchList
        matches={data.matches}
        puuid={data.summoner.puuid}
        region={region}
        ddragonVersion={data.ddragonVersion}
        now={data.loadedAt}
      />
    </PageShell>
  );
}
