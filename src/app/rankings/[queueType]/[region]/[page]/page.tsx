import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { rankedQueueFromSlug } from "@/lib/queues";
import { regionShort } from "@/lib/regions";
import { RankingsView } from "@/components/rankings/rankings-view";

interface RankingsPageProps {
  params: Promise<{ queueType: string; region: string; page: string }>;
}

export async function generateMetadata({ params }: RankingsPageProps): Promise<Metadata> {
  const { queueType, region } = await params;
  const t = await getTranslations("rankings");
  const queue = rankedQueueFromSlug(queueType);
  return { title: t("metaTitle.lol", { queue: t(`queueShort.${queue.slug}`), region: regionShort(region) }) };
}

export default async function RankingsPage({ params }: RankingsPageProps) {
  const { queueType, region, page } = await params;
  return (
    <RankingsView game="lol" queueSlug={queueType} region={region} page={Math.max(1, Number.parseInt(page, 10) || 1)} />
  );
}
