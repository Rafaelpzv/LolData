import Image from "next/image";
import { Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { rankedCrestUrl } from "@/lib/cdn";
import { winRate } from "@/lib/format";
import { isApexTier, tierTextClass, toTier } from "@/lib/tiers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RankedSummaryProps {
  /** Queue name, already translated ("Ranked Solo/Duo", "Ranked TFT"). */
  queueLabel: string;
  /** Riot tier ("GOLD", "Challenger") or null when unranked. */
  tier: string | null | undefined;
  /** Division ("I".."IV"); ignored for apex tiers. */
  division?: string | null;
  leaguePoints?: number | null;
  wins?: number | null;
  losses?: number | null;
  hotStreak?: boolean;
  className?: string;
}

/** One ranked queue: crest, tier + division, LP, record and win rate. */
export function RankedSummary({
  queueLabel,
  tier,
  division,
  leaguePoints,
  wins,
  losses,
  hotStreak,
  className,
}: RankedSummaryProps) {
  const t = useTranslations("profile");
  const tTiers = useTranslations("tiers");
  const tCommon = useTranslations("common");
  const key = toTier(tier);
  const crest = rankedCrestUrl(key);
  const wr = winRate(wins, losses);

  return (
    <Card padding="md" className={cn("flex items-center gap-4", className)}>
      <div className="flex size-12 shrink-0 items-center justify-center">
        {crest ? (
          <Image src={crest} alt={t("rankedCrestAlt", { tier: tTiers(key!) })} width={48} height={48} />
        ) : (
          <span aria-hidden className="size-10 rounded-full border border-dashed border-border-strong" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{queueLabel}</p>
        {key ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn("font-semibold", tierTextClass(key))}>
                {tTiers(key)}
                {division && !isApexTier(key) ? ` ${division}` : ""}
              </span>
              {leaguePoints != null && <span className="num text-sm text-foreground">{tCommon("lp", { value: leaguePoints })}</span>}
              {hotStreak && (
                <Badge variant="warning" title={t("hotStreak")}>
                  <Flame aria-hidden className="size-3" />
                  <span className="sr-only sm:not-sr-only">{t("hotStreak")}</span>
                </Badge>
              )}
            </p>
            <p className="num text-xs text-muted-foreground">
              {t("record", { wins: wins ?? 0, losses: losses ?? 0 })}
              {wr != null && (
                <>
                  {" · "}
                  <span className={wr >= 50 ? "text-win" : "text-loss"}>
                    {t("winRateValue", { value: wr.toFixed(1) })}
                  </span>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("unrankedHint")}</p>
        )}
      </div>
    </Card>
  );
}
