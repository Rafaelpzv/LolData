"use client";

import { useTranslations } from "next-intl";

import { ActivePill } from "@/components/motion/active-pill";
import { IconFrame } from "@/components/ui/icon-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { TierCrest } from "@/components/ui/tier-crest";
import { Tip } from "@/components/ui/tooltip";
import { profileIconUrl } from "@/lib/cdn";
import type { PlayerCard } from "@/lib/premade/lobby";
import { rankLabel } from "@/lib/premade/lobby";
import { toTier, type Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/** Ring color per tier: the same tier tokens the rest of the product uses. */
const RING: Record<Tier, string> = {
  iron: "border-tier-iron/70",
  bronze: "border-tier-bronze/70",
  silver: "border-tier-silver/70",
  gold: "border-tier-gold/70",
  platinum: "border-tier-platinum/70",
  emerald: "border-tier-emerald/70",
  diamond: "border-tier-diamond/70",
  master: "border-tier-master/70",
  grandmaster: "border-tier-grandmaster/70",
  challenger: "border-tier-challenger/70",
};

export interface RankSummary {
  profileIconId: number | null;
  summonerLevel: number | null;
}

/**
 * The lineup as a lobby strip: one compact card per person (icon with the elo ring, level pill,
 * nick and elo), horizontal scroll when it does not fit, and "Gerenciar" at the end. Clicking a
 * card selects that person in the Individual tab.
 */
export function PlayerStrip({
  cards,
  summaries,
  selected,
  onSelect,
}: {
  cards: PlayerCard[];
  /** Cached icon and level by PUUID (from the rank cache). */
  summaries: Record<string, RankSummary | undefined>;
  selected: string | null;
  onSelect: (person: string) => void;
}) {
  const t = useTranslations("premade.lobby");
  const tTiers = useTranslations("tiers");
  const tProfile = useTranslations("profile");
  const tCommon = useTranslations("common");
  const layoutId = "premade-strip-selection";

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {cards.map((card) => {
        const summary = summaries[card.best.account.puuid];
        const tier = toTier(card.rank.tier);
        const label =
          rankLabel(card.rank, (value) => tTiers(value)) ?? tCommon("unranked");
        const level = summary?.summonerLevel ?? null;
        const active = card.person === selected;
        return (
          <Tip
            key={card.person}
            label={
              card.accountCount > 1 ? (
                <span className="block space-y-1">
                  <span className="block font-medium">
                    {t("accountsTitle", { count: card.accountCount })}
                  </span>
                  <span className="block">
                    {card.accounts
                      .map(
                        (entry) =>
                          `${entry.account.gameName}#${entry.account.tagLine} · ${
                            rankLabel(entry.rank, (value) => tTiers(value)) ??
                            tCommon("unranked")
                          }`,
                      )
                      .join(" · ")}
                  </span>
                </span>
              ) : undefined
            }
          >
            <button
              type="button"
              onClick={() => onSelect(card.person)}
              aria-pressed={active}
              aria-label={t("playerAria", {
                name: card.best.account.gameName,
                rank: label,
              })}
              className={cn(
                "relative isolate flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-2",
                "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "border-border-strong"
                  : "border-border/60 bg-surface/70 hover:border-border-strong hover:bg-surface-raised",
              )}
            >
              {active && (
                <ActivePill layoutId={layoutId} className="rounded-md" />
              )}
              <IconFrame
                src={profileIconUrl(summary?.profileIconId)}
                alt={tProfile("profileIconAlt", {
                  name: card.best.account.gameName,
                })}
                size="lg"
                shape="circle"
                className={cn(
                  "m-1 border-2",
                  tier ? RING[tier] : "border-border/70",
                )}
                badge={
                  level != null ? (
                    <span className="num rounded-full border border-border-strong bg-background px-1.5 py-px text-2xs font-medium text-foreground">
                      {level}
                    </span>
                  ) : null
                }
              />
              <span className="w-full truncate text-center text-xs font-medium text-foreground">
                {card.best.account.gameName}
              </span>
              <span className="flex max-w-full items-center gap-1">
                <TierCrest tier={tier} size={16} />
                <span
                  className={cn(
                    "truncate text-2xs",
                    tier ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {card.accountCount > 1 && (
                  <span className="num shrink-0 text-2xs text-muted-foreground">
                    {t("moreAccounts", { count: card.accountCount - 1 })}
                  </span>
                )}
              </span>
            </button>
          </Tip>
        );
      })}

      {cards.length === 0 && (
        <div className="flex items-center gap-2 py-4">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="size-16 rounded-full" />
        </div>
      )}
    </div>
  );
}
