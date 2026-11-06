import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { focusRing } from "@/components/ui/button";
import { IconFrame } from "@/components/ui/icon-frame";
import { TierCrest } from "@/components/ui/tier-crest";
import { championIconUrl, profileIconUrl } from "@/lib/cdn";
import { rankLabel, type PlayerCard } from "@/lib/premade/lobby";
import { toTier, type Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export interface FlagChampion {
  championId: number;
  name: string;
  rate: number | null;
}

/** Swallow tail: top corners, then the bottom corners with the middle of the base raised (the V). */
const SHAPE = "0.5,0.5 99.5,0.5 99.5,99.5 50,95 0.5,99.5";

// Full class strings so Tailwind emits them: a template `stroke-tier-${tier}` would stay unstyled.
const STROKE: Record<Tier, string> = {
  iron: "stroke-tier-iron",
  bronze: "stroke-tier-bronze",
  silver: "stroke-tier-silver",
  gold: "stroke-tier-gold",
  platinum: "stroke-tier-platinum",
  emerald: "stroke-tier-emerald",
  diamond: "stroke-tier-diamond",
  master: "stroke-tier-master",
  grandmaster: "stroke-tier-grandmaster",
  challenger: "stroke-tier-challenger",
};

const RING: Record<Tier, string> = {
  iron: "border-tier-iron",
  bronze: "border-tier-bronze",
  silver: "border-tier-silver",
  gold: "border-tier-gold",
  platinum: "border-tier-platinum",
  emerald: "border-tier-emerald",
  diamond: "border-tier-diamond",
  master: "border-tier-master",
  grandmaster: "border-tier-grandmaster",
  challenger: "border-tier-challenger",
};

const TIER_TEXT: Record<Tier, string> = {
  iron: "text-tier-iron",
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
  platinum: "text-tier-platinum",
  emerald: "text-tier-emerald",
  diamond: "text-tier-diamond",
  master: "text-tier-master",
  grandmaster: "text-tier-grandmaster",
  challenger: "text-tier-challenger",
};

/**
 * One player as the lobby flag: a narrow vertical strip whose base ends in a swallow tail cut out
 * of the surface (the page shows through), outlined in the tier color. The outline is an SVG
 * polygon behind the content, so the 1px border follows the V (a clip-path would cut it). Color
 * appears only where it means something: outline, icon ring and tier name.
 */
export async function LineupFlag({
  card,
  lane,
  champions,
  iconId,
  level,
  href,
}: {
  card: PlayerCard;
  /** Raw Riot position ("TOP", "UTILITY"): the flag prints its localized short name. */
  lane: string | null;
  champions: FlagChampion[];
  iconId: number | null;
  level: number | null;
  /** Profile of the account drawn: the flag opens it. Without it the flag is plain content. */
  href: string | null;
}) {
  const t = await getTranslations("premade.lineup");
  const tTiers = await getTranslations("tiers");
  const tLanes = await getTranslations("premade.lanes");

  const tier = toTier(card.rank.tier);
  const label = rankLabel(card.rank, (value) => tTiers(value));
  const lp = card.rank.leaguePoints;
  const name = card.best.account.gameName;
  const tag = card.best.account.tagLine;
  const extra =
    card.accountCount > 1
      ? t("moreAccounts", { count: card.accountCount - 1 })
      : null;
  const laneName = lane ? laneLabel(lane, tLanes) : null;
  const laneTitle = laneName ? t("laneTitle", { lane: laneName }) : null;
  // Only the tier and the LP: the page shows Flex (Solo/Duo is the last fallback), so the queue is
  // not printed; when the rank came from Solo, the LP is that queue's.
  const lpText = lp !== null && tier ? t("lpValue", { lp }) : null;
  const aria = [name, extra, label ?? t("noRank"), lpText, laneName]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      aria-label={aria}
      data-tier={tier ?? undefined}
      className="relative flex min-h-[300px] w-[128px] flex-col items-center px-3 pb-[30px] pt-3 text-center sm:w-[152px]"
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <polygon
          points={SHAPE}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          className={cn(
            "fill-surface/85",
            tier ? STROKE[tier] : "stroke-border",
          )}
        />
      </svg>

      {href && (
        // The whole flag is the link: one overlay above the content, so the markup stays one article
        // (no card inside a card) and the focus ring follows the flag box.
        <Link
          href={href}
          aria-label={t("openProfile", { name })}
          className={cn("absolute inset-0 z-10 rounded-[6px]", focusRing)}
        />
      )}

      <p className="relative max-w-full truncate text-sm font-semibold text-foreground">
        {name}
      </p>
      <p className="relative max-w-full truncate text-2xs text-muted-foreground">
        #{tag}
      </p>
      {extra && (
        <p className="relative max-w-full truncate text-2xs text-muted-foreground">
          {extra}
        </p>
      )}

      <div className="relative mt-3">
        <IconFrame
          src={profileIconUrl(iconId)}
          alt={name}
          size="xl"
          shape="circle"
          className={cn("border-2", tier ? RING[tier] : "border-border-strong")}
          badge={
            level != null ? (
              <span className="num min-w-9 rounded-full border border-border-strong bg-surface-sunken px-2 py-px text-2xs font-semibold leading-[1.3] text-foreground">
                {level}
              </span>
            ) : null
          }
        />
      </div>

      <div className="relative mt-4 flex items-center gap-1.5">
        <TierCrest tier={tier} size={16} />
        <span
          className={cn(
            "truncate text-sm font-medium",
            tier ? TIER_TEXT[tier] : "text-muted-foreground",
          )}
        >
          {label ?? t("noRank")}
        </span>
      </div>
      <p className="num relative mt-0.5 min-h-4 text-2xs font-medium text-muted-foreground">
        {lpText}
      </p>

      <span
        aria-hidden
        className="relative mb-2 mt-2.5 h-px w-full bg-border"
      />

      <p
        className="relative text-2xs font-medium uppercase tracking-wide text-muted-foreground"
        title={laneTitle ?? undefined}
      >
        {laneName ?? t("noLane")}
      </p>

      {champions.length > 0 && (
        <ul
          aria-label={t("championsTitle")}
          className="relative mt-2 flex items-start gap-2"
        >
          {champions.map((champion) => (
            <li
              key={champion.championId}
              className="flex flex-col items-center gap-1"
            >
              <IconFrame
                src={championIconUrl(champion.championId)}
                alt={champion.name}
                size="sm"
                shape="rounded"
              />
              <ChampionRate rate={champion.rate} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Win rate as a number, win/loss colored; the accessible name says it in words. */
function ChampionRate({ rate }: { rate: number | null }) {
  const t = useTranslations("premade.lineup");
  if (rate === null)
    return (
      <span className="num w-8 text-center text-2xs text-muted-foreground">
        {"\u2014"}
      </span>
    );
  const rounded = Math.round(rate);
  return (
    <span
      className={cn(
        "num w-8 text-center text-2xs font-medium",
        rounded >= 50 ? "text-win" : "text-loss",
      )}
      title={t("championRate", { rate: rounded })}
    >
      {rounded}%
    </span>
  );
}

/** The lane's short name, guarded so an unexpected position falls back to the raw value. */
function laneLabel(
  lane: string,
  tLanes: (key: "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY") => string,
): string {
  const known = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
  return (known as readonly string[]).includes(lane)
    ? tLanes(lane as (typeof known)[number])
    : lane;
}
