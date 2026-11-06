import { getTranslations } from "next-intl/server";

import { IconFrame } from "@/components/ui/icon-frame";
import { TierCrest } from "@/components/ui/tier-crest";
import { profileIconUrl, championIconUrl } from "@/lib/cdn";
import type { PlayerCard } from "@/lib/premade/lobby";
import { rankLabel } from "@/lib/premade/lobby";
import { toTier, type Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/** Ring and edge of the banner per tier; without a rank it is the neutral border of the project. */
const EDGE: Record<Tier, string> = {
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

export interface BannerChampion {
  championId: number;
  name: string;
  rate: number | null;
}

/**
 * One lobby banner: the ornamental base of the reference composition, the nick above the icon, the
 * level pill over the base of the icon, the elo edge and, below, the crest with "tier, LP" plus the
 * lane and the favourite champions. Every elo is also text: color never carries it alone.
 */
export async function LobbyBanner({
  card,
  lane,
  champions,
  iconId,
  level,
}: {
  card: PlayerCard;
  lane: string | null;
  champions: BannerChampion[];
  iconId: number | null;
  level: number | null;
}) {
  const t = await getTranslations("premade.lineup");
  const tTiers = await getTranslations("tiers");

  const tier = toTier(card.rank.tier);
  const label = rankLabel(card.rank, (value) => tTiers(value)) ?? t("noRank");
  const lp = card.rank.leaguePoints;
  const name = card.best.account.gameName;
  const tag = card.best.account.tagLine;
  const edge = tier ? EDGE[tier] : "border-border/70";

  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border bg-surface",
        edge,
      )}
    >
      {/* The base: a recessed band and a hairline, both from the surface tokens. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-surface-sunken"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-14 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent"
      />

      <div className="relative flex flex-col items-center gap-2 px-3 pb-3 pt-3">
        <p className="w-full truncate text-center text-sm font-semibold text-foreground">
          {name}
          <span className="ml-1 text-2xs font-normal text-muted-foreground">
            #{tag}
          </span>
        </p>

        <IconFrame
          src={profileIconUrl(iconId)}
          alt={name}
          size="lg"
          shape="circle"
          className={cn("border-2", edge)}
          badge={
            level != null ? (
              <span className="num rounded-full border border-border-strong bg-background px-1.5 py-px text-2xs font-medium text-foreground">
                {level}
              </span>
            ) : null
          }
        />

        <div className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1.5">
            <TierCrest tier={tier} size={24} />
            <span
              className={cn(
                "num text-xs font-medium",
                tier ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {lp !== null && tier ? `${label} \u00b7 ${lp} LP` : label}
            </span>
          </span>
          {lane && (
            <span className="text-2xs text-muted-foreground">{lane}</span>
          )}
        </div>

        {champions.length > 0 && (
          <ul className="flex items-center gap-1.5">
            {champions.map((champion) => (
              <li
                key={champion.championId}
                className="flex flex-col items-center gap-0.5"
              >
                <IconFrame
                  src={championIconUrl(champion.championId)}
                  alt={champion.name}
                  size="xs"
                  shape="rounded"
                />
                <span className="num text-2xs text-muted-foreground">
                  {champion.rate === null
                    ? "\u2014"
                    : `${Math.round(champion.rate)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
