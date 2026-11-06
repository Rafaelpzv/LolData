import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import {
  LineupFlag,
  type FlagChampion,
} from "@/components/premade/lineup-flag";
import { LineupAnalysis } from "@/components/premade/lineup-analysis";
import type { AnalysisData } from "@/components/premade/premade-analysis";
import type { PlayerCard } from "@/lib/premade/lobby";
import type { PremadeMetrics } from "@/lib/premade/metrics";

/** Lane order of the lineup: Top, Jungle, Mid, Bot, Support. Anything else goes last. */
const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export interface LineupPerson {
  card: PlayerCard;
  /** Main lane of the person ("TOP"…), null when no game gave one. */
  lane: string | null;
  /** Games in that lane: the tie-breaker between two people of the same lane. */
  laneGames: number;
  champions: FlagChampion[];
  iconId: number | null;
  level: number | null;
  /** Profile of the account drawn on the flag ("/lol/{region}/{name}/{tag}/all/all"). */
  href: string;
}

/** Sort key of a lane: its place in the lineup, unknown positions last. */
function laneRank(lane: string | null): number {
  const index = LANE_ORDER.indexOf((lane ?? "") as (typeof LANE_ORDER)[number]);
  return index === -1 ? LANE_ORDER.length : index;
}

/** Order the people by main lane, then by the games in that lane; people without a lane go last. */
export function orderLineup<
  T extends { lane: string | null; laneGames: number },
>(people: T[]): T[] {
  return people
    .slice()
    .sort(
      (a, b) =>
        laneRank(a.lane) - laneRank(b.lane) || b.laneGames - a.laneGames,
    );
}

interface LineupViewProps {
  teamName: string;
  region: string;
  updatedAt: string | null;
  /** Games of the team: the flags cover the people, these numbers the games. */
  metrics: PremadeMetrics;
  people: LineupPerson[];
  /** The four analysis tabs, built by the page from the same data the editor reads. */
  analysis: AnalysisData;
}

/**
 * The public lineup: one lobby flag per person, in lane order, then the same four analysis tabs the
 * editor has (overview, individual, collective, evolution). Read-only: every number comes from the
 * cache the edit page refreshes, so opening this page never calls Riot.
 */
export async function LineupView({
  teamName,
  region,
  updatedAt,
  metrics,
  people,
  analysis,
}: LineupViewProps) {
  const t = await getTranslations("premade.lineup");
  const tSummary = await getTranslations("premade.summary");
  const format = await getFormatter();

  const updated = updatedAt
    ? t("lastUpdate", {
        time: format.dateTime(new Date(updatedAt), {
          dateStyle: "short",
          timeStyle: "short",
        }),
      })
    : t("never");

  return (
    <PageShell>
      <PageHeader
        title={teamName}
        description={`${region} \u00b7 ${tSummary("games", { count: metrics.games })} \u00b7 ${updated}`}
      />

      {people.length > 0 && (
        <Stagger
          immediate
          stagger={0.05}
          className="flex flex-wrap justify-center gap-4"
        >
          {people.map((person) => (
            // Two flags per row on mobile (half the row minus the gap), one fixed column from sm up.
            <StaggerItem
              key={person.card.person}
              className="flex w-[128px] justify-center sm:w-[152px]"
            >
              <LineupFlag
                card={person.card}
                lane={person.lane}
                champions={person.champions}
                iconId={person.iconId}
                level={person.level}
                href={person.href}
              />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <section aria-label={t("analysisTitle")}>
        <LineupAnalysis players={analysis.players} analysis={analysis} />
      </section>

      <p className="text-2xs text-muted-foreground">{t("readOnly")}</p>
    </PageShell>
  );
}
