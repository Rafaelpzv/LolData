"use client";

import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";
import { OBJECTIVES, type PremadeMetrics } from "@/lib/premade/metrics";
import { formatProportion } from "@/lib/premade/stats";
import { fromFraction } from "./format";

/** The consistency block of this panel reads coefficients of variation, which are 0..1 fractions. */
const asPercent = (value: number | null) => fromFraction(value, 1);
const avg = (value: number | null) => (value === null ? "—" : value.toFixed(2));

/** Objectives, consistency and conversion: the team-level view. */
export function CollectivePanel({ metrics }: { metrics: PremadeMetrics }) {
  const t = useTranslations("premade.collective");

  if (metrics.games === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title={t("empty")} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("objective")}</TableHead>
              <TableHead numeric>{t("firstRate")}</TableHead>
              <TableHead numeric>{t("average")}</TableHead>
              <TableHead numeric>{t("winRateWith")}</TableHead>
              <TableHead numeric className="hidden sm:table-cell">
                {t("winRateWithout")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {OBJECTIVES.map((key) => {
              const objective = metrics.objectives[key];
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {t(`objectives.${key}`)}
                  </TableCell>
                  {/* Every percent carries its counts: 100% of 3 games is not 100% of 30. */}
                  <TableCell numeric>
                    {formatProportion(objective.firstStats)}
                  </TableCell>
                  <TableCell numeric>{avg(objective.averageKills)}</TableCell>
                  <TableCell numeric>
                    {formatProportion(objective.withCondition)}
                  </TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {formatProportion(objective.withoutCondition)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("objectivesNote")}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-foreground">
            {t("consistency")}
          </h3>
          <ul className="num mt-3 space-y-1.5 text-sm">
            {[
              ["teamDeaths", metrics.consistency.team.deaths],
              ["teamGold", metrics.consistency.team.gold],
              ["teamXp", metrics.consistency.team.xp],
              ["teamCs", metrics.consistency.team.cs],
            ].map(([key, value]) => (
              <li
                key={key as string}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-muted-foreground">
                  {t(key as "teamDeaths")}
                </span>
                <span>{asPercent(value as number | null)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("varianceHint", { games: metrics.consistency.games })}
          </p>
        </Card>

        <Card padding="lg">
          <h3 className="text-sm font-semibold text-foreground">
            {t("conversion")}
          </h3>
          <ul className="num mt-3 space-y-1.5 text-sm">
            <li className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {t("killsToTurrets")}
              </span>
              <span>{avg(metrics.conversion.killsToTurrets)}</span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {t("winGoldPerKill")}
              </span>
              <span>{avg(metrics.conversion.winGoldPerKill)}</span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {t("lossGoldPerKill")}
              </span>
              <span>{avg(metrics.conversion.lossGoldPerKill)}</span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t("killBand")}</span>
              <span>
                {metrics.conversion.killBandMedian} ± ·{" "}
                {metrics.conversion.killBandGames} {t("gamesShort")} (
                {metrics.conversion.winKillGames}V/
                {metrics.conversion.lossKillGames}D)
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("conversionHint")}
          </p>
        </Card>
      </div>
    </div>
  );
}
