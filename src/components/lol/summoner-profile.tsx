import { useTranslations } from "next-intl";
import { championIconUrl } from "@/lib/cdn";
import { championName } from "@/lib/champions";
import { RANKED_QUEUES } from "@/lib/queues";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { RankedSummary } from "@/components/profile/ranked-summary";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Stagger, StaggerItem } from "@/components/motion/reveal";

/** league-v4 entry (subset). */
export interface RankedEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
}

/** champion-mastery-v4 entry (subset). */
export interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

export const rankedGridClass = "grid gap-3 sm:grid-cols-2 md:w-[40rem] md:shrink-0";
export const masteryGridClass = "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5";

/** Solo/Duo + Flex cards. */
export function RankedCards({ ranked }: { ranked: RankedEntry[] }) {
  const t = useTranslations("matches");
  const tQueues = useTranslations("queues");
  return (
    <div aria-label={t("rankedLabel")} role="group" className={rankedGridClass}>
      {RANKED_QUEUES.map((q) => {
        const entry = ranked.find((r) => r.queueType === q.apiValue);
        return (
          <RankedSummary
            key={q.apiValue}
            queueLabel={tQueues(q.labelKey as "soloDuo")}
            tier={entry?.tier}
            division={entry?.rank}
            leaguePoints={entry?.leaguePoints}
            wins={entry?.wins}
            losses={entry?.losses}
            hotStreak={entry?.hotStreak}
          />
        );
      })}
    </div>
  );
}

export function RankedCardsSkeleton() {
  return (
    <div aria-hidden className={rankedGridClass}>
      {[0, 1].map((i) => (
        <Card key={i} padding="md" className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Top champion masteries. */
export function MasteryGrid({ masteries }: { masteries: ChampionMastery[] }) {
  const t = useTranslations("matches.mastery");
  if (masteries.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <Stagger as="ul" stagger={0.05} className={masteryGridClass}>
      {masteries.map((m) => {
        const name = championName(m.championId) ?? String(m.championId);
        return (
          <StaggerItem as="li" key={m.championId}>
            <Card
              variant="sunken"
              padding="sm"
              className="group/mastery flex h-full flex-col items-center gap-3 text-center sm:flex-row sm:text-left"
            >
              <IconFrame
                src={championIconUrl(m.championId)}
                alt={name}
                size="lg"
                shape="rounded"
                imageClassName="transition-transform duration-fast group-hover/mastery:scale-105"
                badge={
                  <Badge variant="solid" className="num">
                    <span className="sr-only">{t("level", { level: m.championLevel })}</span>
                    <span aria-hidden>{m.championLevel}</span>
                  </Badge>
                }
              />
              <div className="w-full min-w-0 sm:w-auto">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                <p className="num text-xs text-muted-foreground">
                  {t.rich("points", { points: m.championPoints, n: () => <AnimatedNumber value={m.championPoints} /> })}
                </p>
              </div>
            </Card>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

export function MasteryGridSkeleton() {
  return (
    <div aria-hidden className={masteryGridClass}>
      {Array.from({ length: 5 }, (_, i) => (
        <Card key={i} variant="sunken" padding="sm" className="flex flex-col items-center gap-3 sm:flex-row">
          <Skeleton className="size-16" />
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}
