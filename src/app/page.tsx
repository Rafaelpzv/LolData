"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Gamepad2, Plus, Swords, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { DEFAULT_REGION } from "@/lib/regions";
import type { Game } from "@/lib/riot-id";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { FlipText } from "@/components/motion/flip-text";
import { SummonerSearch } from "@/components/search/summoner-search";

/** Where a new premade team is registered. */
const PREMADE_REGISTER_HREF = "/premade";

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
          <StaggerItem>
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
            {/* Premade is a section, not a game mode: it sits beside the rankings link instead of
                inside the game picker, which only filters the search and the ranking route. */}
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="group">
                <Link href={rankingsHref}>
                  {t("viewRankings", { game: game === "lol" ? tNav("lolShort") : tNav("tftShort") })}
                  <ArrowRight aria-hidden className="transition-transform duration-base group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={PREMADE_REGISTER_HREF}>
                  <Plus aria-hidden />
                  {tNav("premade")}
                </Link>
              </Button>
            </div>
          </StaggerItem>

          <StaggerItem>
            <Link
              href={PREMADE_REGISTER_HREF}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface/40 px-4 py-3 transition-colors duration-fast hover:border-border-strong hover:bg-accent/40"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-foreground">
                <Users aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{t("premadeTitle")}</span>
                <span className="block text-xs text-muted-foreground">{t("premadeHint")}</span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-base group-hover:translate-x-1 group-hover:text-foreground"
              />
            </Link>
          </StaggerItem>
        </div>
      </Stagger>
    </div>
  );
}
