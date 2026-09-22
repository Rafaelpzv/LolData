import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { regionShort } from "@/lib/regions";
import { RankingsView } from "@/components/rankings/rankings-view";

interface TftRankingsPageProps {
  params: Promise<{ region: string; page: string }>;
}

export async function generateMetadata({ params }: TftRankingsPageProps): Promise<Metadata> {
  const { region } = await params;
  const t = await getTranslations("rankings");
  return { title: t("metaTitle.tft", { region: regionShort(region) }) };
}

export default async function TftRankingsPage({ params }: TftRankingsPageProps) {
  const { region, page } = await params;
  return <RankingsView game="tft" region={region} page={Math.max(1, Number.parseInt(page, 10) || 1)} />;
}
