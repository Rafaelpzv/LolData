"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DEFAULT_REGION, normalizeRegion } from "@/lib/regions";
import type { Game } from "@/lib/riot-id";
import { focusRing } from "@/components/ui/button";
import { SummonerSearch } from "@/components/search/summoner-search";
import { LocaleSwitcher } from "./locale-switcher";
import { BrandMark } from "./brand-mark";

/** Reads game + region from the current route so header search and nav stay in context. */
function routeContext(pathname: string): { game: Game; region: string; section: "lol-rankings" | "tft-rankings" | null } {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "tft" && seg[1] === "rankings") return { game: "tft", region: normalizeRegion(seg[2]), section: "tft-rankings" };
  if (seg[0] === "tft") return { game: "tft", region: normalizeRegion(seg[1]), section: null };
  if (seg[0] === "rankings") return { game: "lol", region: normalizeRegion(seg[2]), section: "lol-rankings" };
  if (seg[0] === "lol") return { game: "lol", region: normalizeRegion(seg[1]), section: null };
  return { game: "lol", region: DEFAULT_REGION, section: null };
}

export function AppHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const ctx = routeContext(pathname);
  const isHome = pathname === "/";

  // Region follows the route, but the user can change it in the picker before searching.
  const [picked, setPicked] = useState<{ route: string; region: string } | null>(null);
  const region = picked?.route === ctx.region ? picked.region : ctx.region;

  const navItems = [
    {
      href: `/rankings/soloDuo/${region}/1`,
      label: t("lolRankings"),
      short: t("lolShort"),
      active: ctx.section === "lol-rankings",
    },
    {
      href: `/tft/rankings/${region}/1`,
      label: t("tftRankings"),
      short: t("tftShort"),
      active: ctx.section === "tft-rankings",
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-md">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        {t("skipToContent")}
      </a>
      <div className="container flex flex-wrap items-center gap-x-4 gap-y-3 py-3 md:flex-nowrap">
        {/* The home hero already shows the wordmark. */}
        {!isHome && (
          <Link href="/" className={cn("flex shrink-0 items-center gap-2 rounded-md", focusRing)}>
            <BrandMark />
          </Link>
        )}

        {!isHome && (
          <div className="order-last w-full md:order-none md:max-w-xl md:flex-1">
            <SummonerSearch
              game={ctx.game}
              region={region}
              onRegionChange={(r) => setPicked({ route: ctx.region, region: r })}
            />
          </div>
        )}

        <nav aria-label={t("main")} className="ml-auto flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-md px-2.5 text-sm transition-colors duration-fast",
                item.active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                focusRing,
              )}
            >
              <span className="sm:hidden" aria-hidden>
                {item.short}
              </span>
              <span className="sr-only sm:not-sr-only">{item.label}</span>
            </Link>
          ))}
          <LocaleSwitcher className="ml-2" />
        </nav>
      </div>
    </header>
  );
}
