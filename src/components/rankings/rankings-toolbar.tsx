"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RANKED_QUEUES, type RankedQueue } from "@/lib/queues";
import { PageHeader } from "@/components/layout/page-shell";
import { RegionPicker } from "@/components/search/region-picker";
import { SegmentedNav } from "@/components/ui/segmented-nav";
import type { Game } from "./types";

/** Canonical rankings URL. LoL links always use the RANKED_QUEUES slug casing. */
export function rankingsHref(game: Game, region: string, page: number, queue: RankedQueue = RANKED_QUEUES[0]) {
  return game === "lol" ? `/rankings/${queue.slug}/${region}/${page}` : `/tft/rankings/${region}/${page}`;
}

interface RankingsToolbarProps {
  game: Game;
  region: string;
  queue: RankedQueue;
}

/** Page title plus game, queue (LoL) and region switches. */
export function RankingsToolbar({ game, region, queue }: RankingsToolbarProps) {
  const t = useTranslations("rankings");
  const tNav = useTranslations("nav");
  const tRegions = useTranslations("regions");
  const tQueues = useTranslations("queues");
  const router = useRouter();

  const regionName = tRegions(region as "BR1");
  const description =
    game === "lol"
      ? t("description.lol", { region: regionName, queue: tQueues(queue.labelKey as "soloDuo") })
      : t("description.tft", { region: regionName });

  return (
    <PageHeader
      title={t("title")}
      description={description}
      actions={
        <>
          <SegmentedNav
            label={t("gameLabel")}
            items={[
              { href: rankingsHref("lol", region, 1, queue), label: tNav("lolShort"), active: game === "lol" },
              { href: rankingsHref("tft", region, 1), label: tNav("tftShort"), active: game === "tft" },
            ]}
          />
          {game === "lol" && (
            <SegmentedNav
              label={t("queueLabel")}
              items={RANKED_QUEUES.map((q) => ({
                href: rankingsHref("lol", region, 1, q),
                label: t(`queueShort.${q.slug}`),
                active: q.slug === queue.slug,
              }))}
            />
          )}
          <RegionPicker
            value={region}
            appearance="field"
            onChange={(next) => router.push(rankingsHref(game, next, 1, queue))}
          />
        </>
      }
    />
  );
}
