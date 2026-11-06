"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Rating, TeamRatings } from "@/lib/premade/score";
import { ScoreBadge, ScoreBreakdown } from "./score-badge";

/**
 * The team rating: the number first, the dimensions behind it on request.
 * The breakdown is collapsed by default so the overview stays readable.
 */
export function TeamScore({ rating }: { rating: Rating }) {
  const t = useTranslations("premade.score");
  const [open, setOpen] = useState(false);
  if (rating.parts.length === 0) return null;

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ScoreBadge rating={rating} label={t("title")} />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? t("closeBreakdown") : t("openBreakdown")}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open && (
        <>
          <ScoreBreakdown parts={rating.parts} className="mt-4" />
          <p className="mt-4 text-xs text-muted-foreground">{t("hint")}</p>
        </>
      )}
    </Card>
  );
}

/**
 * The scores as what they are: a reading heuristic. The explanatory note comes first and the
 * numbers appear only on request, so the overview never opens on a grade nobody validated. The
 * dimensions (raw values, samples, changes against the previous window) stay in DimensionsPanel.
 */
export function ScoreNote({
  ratings,
  players,
}: {
  ratings: TeamRatings;
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("premade.score");
  const [open, setOpen] = useState(false);
  if (ratings.team.parts.length === 0) return null;
  const name = (person: string) =>
    players.find((entry) => entry.id === person)?.name ?? person.slice(0, 6);

  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <Info
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h3>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {open ? t("closeBreakdown") : t("openBreakdown")}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          {open && (
            <>
              <div className="flex flex-wrap gap-6 pt-2">
                <ScoreBadge rating={ratings.team} label={t("title")} />
                <ul className="flex flex-wrap gap-4">
                  {ratings.players.map((entry) => (
                    <li key={entry.person} className="space-y-1">
                      <ScoreBadge
                        rating={entry.rating}
                        label={name(entry.person)}
                        size="sm"
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <ScoreBreakdown parts={ratings.team.parts} className="pt-3" />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
