"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { winRate } from "@/lib/format";

/** Detail of the window "matchStatsUpdate" event dispatched by the match list. */
export interface MatchStatsDetail {
  wins: number;
  losses: number;
}

export const MATCH_STATS_EVENT = "matchStatsUpdate";

interface MatchStatsTextProps {
  initialWins: number;
  initialLosses: number;
}

/** "Last 20 games: 12W 8L · 60%" — follows the list as more games load. */
export function MatchStatsText({ initialWins, initialLosses }: MatchStatsTextProps) {
  const t = useTranslations("matches");
  const [stats, setStats] = useState<MatchStatsDetail>({ wins: initialWins, losses: initialLosses });

  useEffect(() => {
    const handler = (e: Event) => setStats((e as CustomEvent<MatchStatsDetail>).detail);
    window.addEventListener(MATCH_STATS_EVENT, handler);
    return () => window.removeEventListener(MATCH_STATS_EVENT, handler);
  }, []);

  const total = stats.wins + stats.losses;
  const wr = winRate(stats.wins, stats.losses);

  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {total > 0 && wr != null
        ? t.rich("summary", {
            count: total,
            wins: stats.wins,
            losses: stats.losses,
            winRate: Math.round(wr),
            num: (chunks) => <span className="num text-foreground">{chunks}</span>,
          })
        : t("summaryEmpty")}
    </p>
  );
}
