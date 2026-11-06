"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { championName } from "@/lib/champions";
import type { PlayerDepth } from "@/lib/premade/individual-metrics";
import type { PlayerDiagnosis } from "@/lib/premade/individual-diagnosis";
import { ScoreBadge } from "./score-badge";
import type { Rating, TeamRatings } from "@/lib/premade/score";
import type { PremadePlayer } from "@/lib/premade/types";
import type { PremadeMetrics } from "@/lib/premade/metrics";
import { IndividualDiagnosis } from "./individual-diagnosis-panel";
import { ChampionSections, PlayerSections } from "./individual-detail";
import { PlayerSection } from "./player-section";
import { fromFraction, fromPercent } from "./format";

type View = "player" | "champion";

/** A pick needs this many games to be worth opening: fewer is a single game, not a champion. */
export const MIN_CHAMPION_GAMES = 3;

const NOTHING = "\u2014";
const MIDDOT = "\u00b7";

/** A fraction (0..1) as a percent, for the ratios this panel reads (`killParticipation.ratio`). */
const ratioPercent = (value: number | null) => fromFraction(value);
/** A value already in percent (0..100): `summary.winRate` and the `*Share` fields of the metrics. */
const sharePercent = (value: number | null) => fromPercent(value);
const avg = (value: number | null) =>
  value === null ? NOTHING : value.toFixed(2);

/**
 * Per player: the summary, the champion picks and the depth sections of ONE person at a time. The
 * person comes from the strip at the top of the page; the first one is the default.
 */
export function IndividualPanel({
  metrics,
  players,
  ratings,
  depths,
  diagnoses,
  selected,
  onSelect,
  onCreateGoal,
}: {
  metrics: PremadeMetrics;
  players: PremadePlayer[];
  ratings: TeamRatings;
  depths: PlayerDepth[];
  /** Os diagnósticos do §5 de todo o elenco; a aba mostra só os da pessoa escolhida. */
  diagnoses: PlayerDiagnosis[];
  /** Person chosen in the strip, null before the first pick. */
  selected: string | null;
  /** Person picker inside the tab: the shared lineup has no strip, so it picks here. */
  onSelect?: (person: string) => void;
  /** "Virar objetivo de treinamento" (§6): quem liga a aba de treinamento à análise. */
  onCreateGoal?: (diagnosis: PlayerDiagnosis) => void;
}) {
  const t = useTranslations("premade.individual");
  const [view, setView] = useState<View>("player");
  const [champion, setChampion] = useState<number | null>(null);

  if (metrics.players.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title={t("empty")} />
      </Card>
    );
  }

  // The metrics are keyed by person, so the two accounts of one person are one name here.
  const name = (person: string) => {
    const player = players.find((p) => p.id === person);
    const account =
      player?.accounts.find((a) => !a.archived) ?? player?.accounts[0];
    return account?.gameName ?? person.slice(0, 6);
  };
  const names = new Map(
    metrics.players.map((profile) => [profile.puuid, name(profile.puuid)]),
  );

  const people = metrics.players.map((profile) => profile.puuid);
  const current = selected && people.includes(selected) ? selected : people[0];
  const depth = depths.find((entry) => entry.person === current) ?? null;
  // Only the picks with enough games are offered; the rest stay in the champions list.
  const picks = (depth?.champions ?? []).filter(
    (entry) => entry.games >= MIN_CHAMPION_GAMES,
  );
  const chosen =
    champion !== null && picks.some((entry) => entry.championId === champion)
      ? champion
      : (picks[0]?.championId ?? null);

  return (
    <div className="space-y-4">
      <SegmentedControl<View>
        label={t("sections")}
        value={view}
        onChange={setView}
        options={[
          { value: "player", label: t("summaryTitle") },
          { value: "champion", label: t("championsTitle") },
        ]}
      />

      {depth && (
        <>
          {onSelect && (
            <Select
              id="individual-person"
              value={current}
              onChange={(event) => onSelect(event.target.value)}
              aria-label={t("player")}
              wrapperClassName="w-full sm:max-w-xs"
            >
              {people.map((person) => (
                <option key={person} value={person}>
                  {name(person)}
                </option>
              ))}
            </Select>
          )}
          {view === "player" ? (
            <>
              <PlayerHeader
                name={name(depth.person)}
                rating={
                  ratings.players.find((entry) => entry.person === depth.person)
                    ?.rating
                }
                depth={depth}
              />
              {/* §5 antes dos números: o que desenvolver vem primeiro, a estatística depois. */}
              <IndividualDiagnosis
                diagnoses={diagnoses.filter(
                  (diagnosis) => diagnosis.person === depth.person,
                )}
                onCreateGoal={onCreateGoal}
              />
              <PlayerSections depth={depth} names={names} />
            </>
          ) : (
            <>
              <Card padding="lg" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="individual-champion"
                    className="text-sm font-semibold text-foreground"
                  >
                    {t("championPick")}
                  </label>
                  <span className="num text-xs text-muted-foreground">
                    {t("championPickHint", { min: MIN_CHAMPION_GAMES })}
                  </span>
                </div>
                {picks.length > 0 ? (
                  <Select
                    id="individual-champion"
                    value={String(chosen)}
                    onChange={(event) =>
                      setChampion(Number(event.target.value))
                    }
                    wrapperClassName="w-full sm:max-w-xs"
                  >
                    {picks.map((entry) => (
                      <option
                        key={entry.championId}
                        value={String(entry.championId)}
                      >
                        {championName(entry.championId) ?? entry.championName} -{" "}
                        {t("gamesCount", { games: entry.games })}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("championPickEmpty", { min: MIN_CHAMPION_GAMES })}
                  </p>
                )}
              </Card>
              {chosen !== null && (
                <ChampionSections depth={depth} championId={chosen} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Kill participation and consistency of the team, as the last section of the Individual tab.
 * They are read per person, so they sit beside the one player, not inside their own sections.
 */
export function ParticipationSection({
  metrics,
  players,
}: {
  metrics: PremadeMetrics;
  players: PremadePlayer[];
}) {
  const t = useTranslations("premade.individual");
  const name = (person: string) => {
    const player = players.find((p) => p.id === person);
    const account =
      player?.accounts.find((a) => !a.archived) ?? player?.accounts[0];
    return account?.gameName ?? person.slice(0, 6);
  };

  return (
    <PlayerSection title={t("kpTitle")} hint={t("kpHint")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("player")}</TableHead>
            <TableHead numeric>{t("killParticipation")}</TableHead>
            <TableHead numeric className="hidden sm:table-cell">
              {t("deathsVariation")}
            </TableHead>
            <TableHead numeric className="hidden sm:table-cell">
              {t("games")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.killParticipation.map((entry) => {
            const deviation =
              metrics.consistency.individual.find(
                (i) => i.puuid === entry.puuid,
              )?.deaths ?? null;
            return (
              <TableRow key={entry.puuid}>
                <TableCell className="font-medium text-foreground">
                  {name(entry.puuid)}
                </TableCell>
                <TableCell numeric>
                  {ratioPercent(entry.ratio)}
                  {entry.min !== null && entry.max !== null
                    ? ` (${ratioPercent(entry.min)}-${ratioPercent(entry.max)})`
                    : ""}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {ratioPercent(deviation)}
                </TableCell>
                <TableCell numeric className="hidden sm:table-cell">
                  {entry.games}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">{t("hint")}</p>
    </PlayerSection>
  );
}

function PlayerHeader({
  name,
  rating,
  depth,
}: {
  name: string;
  rating?: Rating;
  depth: PlayerDepth;
}) {
  const t = useTranslations("premade.individual");
  const summary = depth.summary;
  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          {rating && rating.confidence > 0 && (
            <ScoreBadge rating={rating} size="sm" />
          )}
        </div>
        <p className="num text-xs text-muted-foreground">
          {t("gamesCount", { games: summary.games })} {MIDDOT}{" "}
          {sharePercent(summary.winRate)} {MIDDOT} {t("kda")} {avg(summary.kda)}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {depth.fieldGames === summary.games
          ? t("fieldsComplete", { total: summary.games })
          : t("fields", { games: depth.fieldGames, total: summary.games })}{" "}
        {t("derived", { games: depth.derivedGames, total: summary.games })}
      </p>
    </Card>
  );
}
