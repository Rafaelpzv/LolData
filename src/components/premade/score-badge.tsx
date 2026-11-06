"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { Rating, ScorePart } from "@/lib/premade/score";

/** Colour of a score: the scale is 0..10 with the neutral line at 5,5. */
export function scoreTone(score: number): string {
  if (score >= 7) return "text-win";
  if (score >= 5.5) return "text-foreground";
  if (score >= 4) return "text-loss";
  return "text-loss";
}

/**
 * The big number: the score itself, over ten, with the label of what it is.
 * A small sample is said out loud instead of being hidden behind a confident-looking decimal.
 */
export function ScoreBadge({
  rating,
  label,
  size = "lg",
}: {
  rating: Rating;
  label?: string;
  size?: "sm" | "lg";
}) {
  const t = useTranslations("premade.score");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "num font-semibold leading-none tabular-nums",
            size === "lg" ? "text-4xl" : "text-2xl",
            scoreTone(rating.score),
          )}
        >
          {rating.score.toFixed(1)}
        </span>
        <span className="num text-xs text-muted-foreground">/10</span>
      </div>
      {label && (
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      {rating.confidence < 1 && (
        <span className="text-2xs text-muted-foreground">
          {t("sampleNote", { percent: Math.round(rating.confidence * 100) })}
        </span>
      )}
    </div>
  );
}

/** One row per dimension: its weight, its score and the raw numbers behind it. */
export function ScoreBreakdown({
  parts,
  className,
}: {
  parts: ScorePart[];
  className?: string;
}) {
  const t = useTranslations("premade.score");
  if (parts.length === 0) return null;

  return (
    <ul className={cn("space-y-2", className)}>
      {parts.map((part) => (
        <li key={part.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-foreground">
              {t(`parts.${part.key}` as "parts.winRate")}
              <span className="num ml-1.5 text-2xs text-muted-foreground">
                {Math.round(part.weight * 100)}%
              </span>
            </span>
            <span
              className={cn(
                "num text-xs font-semibold tabular-nums",
                scoreTone(part.score),
              )}
            >
              {part.score.toFixed(1)}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className={cn(
                "h-full rounded-full",
                part.score >= 5.5 ? "bg-win" : "bg-loss",
              )}
              style={{ width: `${Math.max(2, part.score * 10)}%` }}
            />
          </div>
          <p className="num text-2xs text-muted-foreground">
            {evidence(part, t)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The numbers that produced the score, formatted for reading, never invented. */
type Translate = ReturnType<typeof useTranslations<"premade.score">>;

/** Formats the numbers of a score part; a missing number is a dash, never a zero. */
function evidence(part: ScorePart, t: Translate): string {
  const number = (value: number | null | undefined, decimals = 1) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? "—"
      : value.toFixed(decimals);
  const e = part.evidence;

  switch (part.key) {
    case "winRate":
      return t("evidence.winRate", {
        winRate: number(e.winRate),
        games: e.games ?? 0,
      });
    case "objectives":
      return t("evidence.objectives", {
        firstDragon: number(e.firstDragon, 0),
        firstTower: number(e.turretFirst, 0),
        dragons: number(e.dragonPerGame),
        barons: number(e.baronPerGame),
      });
    case "turrets":
      return t("evidence.turrets", { perGame: number(e.turretsPerGame) });
    case "deaths":
      return t("evidence.deaths", { perGame: number(e.deathsPerGame) });
    case "conversion":
      return t("evidence.conversion", {
        goldPerKill: number(e.goldPerKill, 0),
        winRate: number(e.winRateWithDragon, 0),
      });
    case "consistency":
      return t("evidence.consistency", {
        deaths: number(e.deaths, 0),
        gold: number(e.gold, 0),
        xp: number(e.xp, 0),
      });
    case "presence":
      return t("evidence.presence", { average: number(e.averagePresence) });
    case "kda":
      return t("evidence.kda", {
        kda: number(e.kda, 2),
        kills: number(e.killsPerGame),
        assists: number(e.assistsPerGame),
      });
    case "farm":
      return t("evidence.farm", { cs: number(e.csPerMin) });
    case "vision":
      return t("evidence.vision", { vision: number(e.visionPerMin, 2) });
    case "synergy":
      return t("evidence.synergy", {
        kp: number(e.killParticipation, 0),
        damage: number(e.damageShare, 0),
        gold: number(e.goldShare, 0),
      });
    default:
      return "";
  }
}
