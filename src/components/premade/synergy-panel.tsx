"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

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
import { formatProportion } from "@/lib/premade/stats";
import type { SynergyReport } from "@/lib/premade/synergy";
import type { PremadePlayer } from "@/lib/premade/types";

/**
 * Observed synergy: how often two people of the lineup were part of the same kill, against the
 * rate their own kill participation predicts (the lift). Proximity is a separate observation and
 * is not mixed in: two players standing together is not the same as playing together.
 */
export function SynergyPanel({
  report,
  players,
}: {
  report: SynergyReport;
  players: PremadePlayer[];
}) {
  const t = useTranslations("premade.synergy");
  const name = (person: string) => {
    const player = players.find((entry) => entry.id === person);
    const account =
      player?.accounts.find((entry) => !entry.archived) ?? player?.accounts[0];
    return account?.gameName ?? player?.gameName ?? person.slice(0, 6);
  };
  const ranked = report.pairs.filter((pair) => pair.enoughGames).slice(0, 8);
  const unranked = report.pairs.filter((pair) => !pair.enoughGames).length;

  if (ranked.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title={t("empty", { games: report.minGames })}
        />
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("hint", { games: report.minGames, unranked })}
      </p>
      <Table className="mt-3">
        <TableHeader>
          <TableRow>
            <TableHead>{t("pair")}</TableHead>
            <TableHead numeric>{t("together")}</TableHead>
            <TableHead numeric className="hidden sm:table-cell">
              {t("expected")}
            </TableHead>
            <TableHead numeric>{t("lift")}</TableHead>
            <TableHead numeric className="hidden md:table-cell">
              {t("sharedObjectives")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranked.map((pair) => (
            <TableRow key={`${pair.a}-${pair.b}`}>
              <TableCell className="font-medium">
                {name(pair.a)} <span aria-hidden>·</span> {name(pair.b)}
              </TableCell>
              <TableCell numeric>{formatProportion(pair.observed)}</TableCell>
              <TableCell numeric className="hidden sm:table-cell">
                {pair.expected === null
                  ? "—"
                  : `${(pair.expected * 100).toFixed(1)}%`}
              </TableCell>
              <TableCell numeric>
                <span
                  className={
                    (pair.lift ?? 0) >= 1 ? "text-win" : "text-foreground"
                  }
                >
                  {pair.lift === null ? "—" : `${pair.lift.toFixed(2)}×`}
                </span>
              </TableCell>
              <TableCell numeric className="hidden md:table-cell">
                {pair.sharedObjectives}/{pair.games}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">{t("caveat")}</p>
    </Card>
  );
}
