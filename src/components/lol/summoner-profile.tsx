import { useTranslations } from "next-intl";
import { championIconUrl } from "@/lib/cdn";
import { championName } from "@/lib/champions";
import { RANKED_QUEUES } from "@/lib/queues";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RankedSummary } from "@/components/profile/ranked-summary";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";

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

interface SummonerProfileProps {
  gameName: string;
  tagLine: string;
  region: string;
  level: number | null | undefined;
  profileIconId: number | null | undefined;
  ranked: RankedEntry[];
  masteries: ChampionMastery[];
}

/** Identity, Solo/Duo + Flex ranks and top champion masteries. */
export function SummonerProfile({ gameName, tagLine, region, level, profileIconId, ranked, masteries }: SummonerProfileProps) {
  const t = useTranslations("matches");
  const tQueues = useTranslations("queues");

  return (
    <>
      <Reveal
        as="section"
        immediate
        aria-label={t("profileLabel")}
        className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"
      >
        <ProfileHeader
          gameName={gameName}
          tagLine={tagLine}
          level={level}
          profileIconId={profileIconId}
          region={region}
        />
        <div aria-label={t("rankedLabel")} role="group" className="grid gap-3 sm:grid-cols-2 md:w-[40rem] md:shrink-0">
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
      </Reveal>

      <MasteryList masteries={masteries} />
    </>
  );
}

function MasteryList({ masteries }: { masteries: ChampionMastery[] }) {
  const t = useTranslations("matches.mastery");
  const titleId = "champion-mastery-title";

  return (
    <Reveal as="section" delay={0.05} aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
        {t("title")}
      </h2>
      {masteries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Stagger as="ul" stagger={0.05} delay={0.1} className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {masteries.map((m) => {
            const name = championName(m.championId) ?? String(m.championId);
            return (
              <StaggerItem as="li" key={m.championId}>
                <Card variant="sunken" padding="sm" className="group/mastery flex h-full flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
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
      )}
    </Reveal>
  );
}
