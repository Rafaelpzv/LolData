"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Gamepad2, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { DEFAULT_REGION } from "@/lib/regions";
import type { Game } from "@/lib/riot-id";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BrandMark } from "@/components/layout/brand-mark";
import { SummonerSearch } from "@/components/search/summoner-search";

export default function Home() {
  const t = useTranslations("home");
  const tNav = useTranslations("nav");
  const [game, setGame] = useState<Game>("lol");
  const [region, setRegion] = useState(DEFAULT_REGION);

  const rankingsHref = game === "lol" ? `/rankings/soloDuo/${region}/1` : `/tft/rankings/${region}/1`;

  return (
    <div className="container flex flex-1 flex-col items-center justify-center py-16 sm:py-24">
      <div className="w-full max-w-2xl space-y-10">
        <div className="space-y-3 text-center">
          <h1>
            <BrandMark size="lg" />
          </h1>
          <p className="text-balance text-base text-muted-foreground sm:text-lg">{t("tagline")}</p>
        </div>

        <div className="space-y-4">
          <SummonerSearch game={game} region={region} onRegionChange={setRegion} size="lg" autoFocus />

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <SegmentedControl<Game>
              label={t("mode")}
              value={game}
              onChange={setGame}
              options={[
                { value: "lol", label: tNav("lol"), icon: <Swords aria-hidden /> },
                { value: "tft", label: tNav("tft"), icon: <Gamepad2 aria-hidden /> },
              ]}
            />
            <Button asChild variant="ghost" size="sm">
              <Link href={rankingsHref}>
                {t("viewRankings", { game: game === "lol" ? tNav("lolShort") : tNav("tftShort") })}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
