"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

import { formatProportion, proportion } from "@/lib/premade/stats";
import type { MatchSets } from "@/lib/premade/integrity";
import { fromFraction } from "./format";

/**
 * Which games the analysis read, said before any number of the page (prompt §2.1: never mix a full
 * lineup with a partial one, or a game with a timeline with one without, without saying so).
 *
 * It lists the sets the window splits into, with the counts and the share. When the window is not
 * entirely one set, the line says the numbers below mix them.
 */
export function IntegrityPanel({
  integrity,
  games,
}: {
  integrity: MatchSets;
  games: number;
}) {
  const t = useTranslations("premade.integrity");
  if (games === 0) return null;

  const rows = [
    {
      key: "full" as const,
      games: integrity.full.length,
      /** The only set where every metric reads the whole team. */
      tone: "good" as const,
    },
    {
      key: "partial" as const,
      games: integrity.partial.length,
      tone: "warn" as const,
    },
    {
      key: "substitutes" as const,
      games: integrity.withSubstitutes.length,
      tone: "warn" as const,
    },
    {
      key: "unattributed" as const,
      games: integrity.unattributed.length,
      tone: "muted" as const,
    },
    {
      key: "withTimeline" as const,
      games: integrity.withTimeline.length,
      tone: "good" as const,
    },
    {
      key: "withoutTimeline" as const,
      games: integrity.withoutTimeline.length,
      tone: "warn" as const,
    },
  ].filter((row) => row.games > 0);

  const mixed = integrity.full.length < games || integrity.withTimeline.length < games;

  return (
    <section
      id="integrity"
      // Alvo do "ver limitações" do diagnóstico rápido: a qualidade dos dados tem endereço próprio.
      aria-labelledby="integrity-title"
      className="scroll-mt-20 rounded-lg border border-border bg-surface/40 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Info aria-hidden className="size-3.5 text-muted-foreground" />
        <h2 id="integrity-title" className="text-xs font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {rows.map((row) => (
          <li key={row.key} className="num flex items-baseline gap-1.5 text-2xs">
            <span
              className={
                row.tone === "good"
                  ? "text-foreground"
                  : row.tone === "warn"
                    ? "text-warning"
                    : "text-muted-foreground"
              }
            >
              {row.games}
            </span>
            <span className="text-muted-foreground">
              {t(`sets.${row.key}`, { total: games })} ·{" "}
              {/* The share carries its counts: 14% of 137 is not 14% of 7. */}
              {formatProportion(proportion(row.games, games), 0)}
            </span>
          </li>
        ))}
      </ul>
      {mixed && (
        <p className="mt-2 text-2xs text-muted-foreground">{t("mixed")}</p>
      )}
      <p className="mt-1 text-2xs text-muted-foreground">
        {t("fullWithTimeline", {
          games: integrity.fullWithTimeline.length,
          share: fromFraction(
            games > 0 ? integrity.fullWithTimeline.length / games : null,
          ),
        })}
      </p>
    </section>
  );
}
