"use client";

import { useTranslations } from "next-intl";

import type { Recommendation } from "@/lib/premade/recommendations";

const TONE: Record<Recommendation["kind"], string> = {
  warning: "border-warning/40 bg-warning/5",
  positive: "border-win/30 bg-win/5",
};

const CONFIDENCE_TONE: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-win",
};

/**
 * One rule's card: localized title and body, the numeric evidence and the confidence label.
 * The text never comes from the server: only the rule key does. The sample (n) is always shown,
 * and a missing translation falls back to the other rule text instead of printing the raw key.
 */
export function RecommendationCard({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const t = useTranslations("premade.recommendations");
  const { code, kind, confidence, evidence, games } = recommendation;
  // Same values for title and body: a title may name the player too.
  const values = evidence as Record<string, string | number>;
  const title = t.has(`rules.${code}.title`)
    ? t(`rules.${code}.title`, values)
    : t("untranslated");
  const body = t.has(`rules.${code}.body`)
    ? t(`rules.${code}.body`, values)
    : "";
  // The sample: the rule's own when it read a smaller window than the team's.
  const sample =
    games ?? (typeof evidence.games === "number" ? evidence.games : null);

  return (
    <article className={`rounded-lg border p-4 ${TONE[kind]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span
          className={`text-2xs font-medium uppercase tracking-wide ${CONFIDENCE_TONE[confidence]}`}
        >
          {t(`confidence.${confidence}`)}
        </span>
      </div>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      {sample !== null && (
        <p className="num mt-2 text-2xs uppercase tracking-wide text-subtle-foreground">
          n = {sample} {t("gamesShort")}
        </p>
      )}
      {kind === "positive" && (
        <p className="mt-2 text-2xs uppercase tracking-wide text-win">
          {t("preserve")}
        </p>
      )}
    </article>
  );
}
