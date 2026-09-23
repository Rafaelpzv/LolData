"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Gamepad2, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { DEFAULT_REGION } from "@/lib/regions";
import type { Game } from "@/lib/riot-id";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { FlipText } from "@/components/motion/flip-text";
import { SummonerSearch } from "@/components/search/summoner-search";

export default function Home() {
  const t = useTranslations("home");
  const tNav = useTranslations("nav");
  const [game, setGame] = useState<Game>("lol");
  const [region, setRegion] = useState(DEFAULT_REGION);

  const rankingsHref = game === "lol" ? `/rankings/soloDuo/${region}/1` : `/tft/rankings/${region}/1`;

  return (
    <div className="container flex flex-1 flex-col items-center justify-center py-16 sm:py-24">
      <Stagger immediate stagger={0.08} delay={0.1} className="w-full max-w-2xl space-y-10">
        <div className="space-y-3 text-center">
          <StaggerItem>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              <FlipText>Lol</FlipText>
              <FlipText delay={0.5} className="text-muted-foreground">
                Data
              </FlipText>
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-balance text-base text-muted-foreground sm:text-lg">{t("tagline")}</p>
          </StaggerItem>
        </div>

        <div className="space-y-4">
          <StaggerItem className="relative z-20">
            <SummonerSearch game={game} region={region} onRegionChange={setRegion} size="lg" autoFocus />
          </StaggerItem>

          <StaggerItem className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <SegmentedControl<Game>
              label={t("mode")}
              value={game}
              onChange={setGame}
              options={[
                { value: "lol", label: tNav("lol"), icon: <Swords aria-hidden /> },
                { value: "tft", label: tNav("tft"), icon: <Gamepad2 aria-hidden /> },
              ]}
            />
            <Button asChild variant="ghost" size="sm" className="group">
              <Link href={rankingsHref}>
                {t("viewRankings", { game: game === "lol" ? tNav("lolShort") : tNav("tftShort") })}
                <ArrowRight aria-hidden className="transition-transform duration-base group-hover:translate-x-1" />
              </Link>
            </Button>
          </StaggerItem>
        </div>
      </Stagger>
    </div>
  );
}
