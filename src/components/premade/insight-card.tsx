"use client";

import { useTranslations } from "next-intl";
import { Eye, Info, ShieldQuestion, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/premade/insights";

const ICONS = {
  observed: Eye,
  positive: Sparkles,
  sample: Info,
  coverage: ShieldQuestion,
} as const;

/**
 * ICU rejects two placeholders separated only by ", " (it reads the comma as an argument style), so
 * the values are kept from ever producing that shape: the text owns the separators.
 */
function healthy(
  values: Record<string, string | number>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      String(value).replace(/,+$/, "").trim(),
    ]),
  );
}

/** The codes the catalog knows: any other one is dropped, never rendered as a raw key. */
const KNOWN_CODES = new Set<string>([
  "objectivePresenceHelps",
  "objectivePresenceWeak",
  "leadHeld",
  "leadLost",
  "costlyDeaths",
  "isolatedDeaths",
  "scattered",
  "grouped",
  "conversionSlow",
  "noTimelines",
  "timelineCoverage",
]);

/**
 * One observation with its evidence block: the numbers, the sample band, the limitation and the
 * exercise that follows. The texts live in `premade.insights.<code>`; an unknown code (a rule added
 * in a newer deploy) is dropped instead of rendering a raw key.
 */
export function InsightCard({
  insight,
  players,
}: {
  insight: Insight;
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("premade.insights");
  const person = insight.person
    ? (players.find((entry) => entry.id === insight.person)?.name ??
      insight.person.slice(0, 6))
    : "";
  const Icon = ICONS[insight.kind] ?? Info;

  if (!KNOWN_CODES.has(insight.code)) return null;
  const values = healthy({
    ...Object.fromEntries(
      Object.entries(insight.evidence).map(([key, value]) => [
        key,
        value === null ? "—" : value,
      ]),
    ),
    person,
  });
  const title = t(
    `${insight.code}.title` as "objectivePresenceHelps.title",
    values,
  );
  const body = t(
    `${insight.code}.body` as "objectivePresenceHelps.body",
    values,
  );
  const limitation = t.has(
    `${insight.code}.limitation` as "objectivePresenceHelps.limitation",
  )
    ? t(
        `${insight.code}.limitation` as "objectivePresenceHelps.limitation",
        values,
      )
    : null;
  const exercise = t.has(
    `${insight.code}.exercise` as "objectivePresenceHelps.exercise",
  )
    ? t(`${insight.code}.exercise` as "objectivePresenceHelps.exercise", values)
    : null;

  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border",
            insight.kind === "positive"
              ? "border-win/30 bg-win/10 text-win"
              : "border-border bg-surface-raised text-muted-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("band.label")}: {t(`band.${insight.band}` as "band.good")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{body}</p>
          {/* The evidence as raw fields: the prose may round, these never do. */}
          <dl className="num flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            {Object.entries(insight.evidence).map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <dt className="text-muted-foreground/70">{key}:</dt>
                <dd className="text-foreground">
                  {value === null ? "—" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          {limitation && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("limitationLabel")}:{" "}
              </span>
              {limitation}
            </p>
          )}
          {exercise && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("exerciseLabel")}:{" "}
              </span>
              {exercise}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** The whole list: observations first, coverage gaps last, nothing when there is nothing to say. */
export function InsightList({
  insights,
  players,
}: {
  insights: Insight[];
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("premade.insights");
  const order: Record<Insight["kind"], number> = {
    observed: 0,
    positive: 1,
    sample: 2,
    coverage: 3,
  };
  const sorted = [...insights].sort((a, b) => order[a.kind] - order[b.kind]);
  return (
    <section aria-labelledby="insights-title" className="space-y-3">
      <div className="space-y-1">
        <h2
          id="insights-title"
          className="text-sm font-semibold text-foreground"
        >
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>
      {sorted.map((insight, index) => (
        <InsightCard
          key={`${insight.code}-${insight.person ?? index}`}
          insight={insight}
          players={players}
        />
      ))}
    </section>
  );
}
