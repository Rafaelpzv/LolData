import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDdragonVersion } from "@/lib/cdn";
import { regionShort } from "@/lib/regions";
import { decodeParamOnce } from "@/lib/riot-id";
import { PageShell } from "@/components/layout/page-shell";
import { SectionFailed } from "@/components/ui/async-section";
import { TftProfile, TftRankedCard } from "@/components/tft/tft-profile";
import { TftMatchList } from "@/components/tft/tft-match-list";
import { TftMatchListSkeleton, TftRankedSkeleton } from "@/components/tft/tft-skeletons";
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

/** Matches plus the time they were fetched (anchor for relative dates on server and client). */
async function loadMatches(region: string, matchIds: string[]) {
  const matches = await fetchMatchesInBatches(region, matchIds);
  return { matches, loadedAt: Date.now() };
}

// ---- Async sections: each one loads (and fails) on its own. ---------------------------------

/** Runs a section loader; a failure is logged and becomes that section's error state. */
async function settle<T>(label: string, load: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    console.error(`[tft profile] ${label} failed:`, error);
    return { ok: false };
  }
}

async function RankedSection({ region, puuid, errorTitle }: { region: string; puuid: string; errorTitle: string }) {
  const res = await settle("league", () => getTftLeagueByPuuid(region, puuid));
  if (!res.ok) return <SectionFailed title={errorTitle} />;
  const ranked = res.value.find((entry) => entry.queueType === "RANKED_TFT") ?? null;
  return <TftRankedCard ranked={ranked} />;
}

async function MatchesSection({ region, puuid, errorTitle }: { region: string; puuid: string; errorTitle: string }) {
  const [idsRes, ddragonVersion] = await Promise.all([
    settle("match ids", () => getTftMatchIds(region, puuid, 20)),
    // Unit art falls back to placeholders without the version: never fail the list for it.
    getDdragonVersion().catch(() => null),
  ]);
  if (!idsRes.ok) return <SectionFailed title={errorTitle} />;
  const { matches, loadedAt } = await loadMatches(region, idsRes.value);
  return (
    <TftMatchList
      matches={matches}
      puuid={puuid}
      region={region}
      ddragonVersion={ddragonVersion}
      now={loadedAt}
    />
  );
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

  // The only blocking call: a missing player renders not-found.tsx.
  const summoner = await findSummoner(region, gameName, tagLine);
  if (!summoner) notFound();

  const t = await getTranslations("tft.sectionError");

  return (
    <PageShell>
      <TftProfile
        gameName={gameName}
        tagLine={tagLine}
        level={summoner.summonerLevel}
        profileIconId={summoner.profileIconId}
        region={region}
      >
        <Suspense fallback={<TftRankedSkeleton />}>
          <RankedSection region={region} puuid={summoner.puuid} errorTitle={t("ranked")} />
        </Suspense>
      </TftProfile>

      <Suspense fallback={<TftMatchListSkeleton />}>
        <MatchesSection region={region} puuid={summoner.puuid} errorTitle={t("matches")} />
      </Suspense>
    </PageShell>
  );
}
