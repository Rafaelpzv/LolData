"use client";

import { useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type {
  DimensionMetric,
  DimensionReport,
} from "@/lib/premade/dimensions";
import { formatProportion } from "@/lib/premade/stats";
import type { ChangeAnalysis } from "@/lib/premade/inference";

/**
 * How a value is shown: its unit, its direction relative to the noise, and never without an `n`.
 * Everything here is a plain value with a sample; the panel never averages them into one number.
 */
function format(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "\u2014";
  switch (unit) {
    case "pct":
      return `${(value * 100).toFixed(1)}%`;
    case "seconds":
      return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;
    case "gold":
      return `${value > 0 ? "+" : ""}${(value / 1000).toFixed(1)}k`;
    case "people":
      return value.toFixed(2);
    default:
      return value.toFixed(2);
  }
}

/**
 * The display unit of each metric. The DIRECTION is not here: it is part of the metric itself
 * (`DimensionMetric.direction`), so the panel can never disagree with the analysis about which way
 * is better.
 */
const UNITS: Record<string, string> = {
  firstDragon: "pct",
  firstHerald: "pct",
  firstBaron: "pct",
  firstTower: "pct",
  dragonsPerGame: "number",
  baronsPerGame: "number",
  dragonPresence: "pct",
  playersAtObjective: "people",
  deathsBeforeObjective: "number",
  winRateAhead15: "pct",
  comebackRate: "pct",
  killToObjective: "seconds",
  turretsPerKill: "number",
  groupedShare: "pct",
  playersAtKills: "people",
  isolatedDeathShare: "pct",
  teamDeathsVariation: "pct",
  teamGoldVariation: "pct",
  deathsPerGame: "number",
  killParticipationGap: "pct",
  kda: "number",
  averagePresence: "people",
  towersPerGame: "number",
  fightsPerGame: "number",
  goldAt15: "gold",
};

/**
 * The change of one metric against the previous window: the delta, the 95% interval of the change
 * and whether that interval leaves zero. "Dentro do ruído" now means "the interval contains zero",
 * not "below an arbitrary cut-off".
 */
function Change({
  change,
  unit,
}: {
  change: ChangeAnalysis | null;
  unit: string;
}) {
  const t = useTranslations("premade.dimensions");
  if (!change || change.delta === null)
    return <span className="text-muted-foreground">{"\u2014"}</span>;
  const number = (value: number) =>
    unit === "gold"
      ? format(value, "gold")
      : unit === "seconds"
        ? `${Math.round(value)}s`
        : unit === "pct"
          ? `${(value * 100).toFixed(1)} pp`
          : value.toFixed(2);
  const real =
    change.low !== null &&
    change.high !== null &&
    (change.low > 0 || change.high < 0);
  const label =
    change.verdict === "unmeasurable"
      ? t("noComparison")
      : !real
        ? t("withinNoise")
        : change.verdict === "improved"
          ? t("improved")
          : change.verdict === "worsened"
            ? t("worsened")
            : (change.delta ?? 0) > 0
              ? t("aboveNoise")
              : t("belowNoise");
  return (
    <span className="num inline-flex items-center gap-1.5 text-xs">
      <span className={cn(real ? "text-foreground" : "text-muted-foreground")}>
        {number(change.delta)}
      </span>
      <span
        className="text-2xs text-muted-foreground"
        title={
          change.low === null || change.high === null
            ? undefined
            : t("intervalTooltip", {
                low: number(change.low),
                high: number(change.high),
                before: change.gamesBefore,
                after: change.gamesAfter,
              })
        }
      >
        {label}
      </span>
    </span>
  );
}

/**
 * The team in seven independent dimensions. Each row: the metric, its value, the sample it was
 * read from and the change against the previous window, measured against the metric's own spread.
 * No composite score exists: one number would need weights nobody validated.
 */
export function DimensionsPanel({ report }: { report: DimensionReport }) {
  const t = useTranslations("premade.dimensions");
  const { recent, previous, size } = report.windows;
  const anyMetric = report.dimensions.some((dimension) =>
    dimension.metrics.some((metric) => metric.value !== null),
  );

  if (!anyMetric) {
    return (
      <Card>
        <EmptyState icon={LayoutGrid} title={t("empty")} />
      </Card>
    );
  }

  return (
    <section aria-labelledby="dimensions-title" className="space-y-3">
      <div className="space-y-1">
        <h2
          id="dimensions-title"
          className="text-sm font-semibold text-foreground"
        >
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("subtitle", {
            recent: recent.games,
            previous: previous.games,
            size,
            recentFull: recent.fullGames,
            previousFull: previous.fullGames,
          })}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {report.dimensions.map((dimension) => (
          <Card key={dimension.key} padding="lg">
            <h3 className="text-sm font-semibold text-foreground">
              {t(`names.${dimension.key}`)}
            </h3>
            <ul className="mt-3 divide-y divide-border">
              {dimension.metrics.map((metric) => (
                <MetricRow
                  key={metric.key}
                  metric={metric}
                  unit={UNITS[metric.key] ?? "number"}
                />
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t("caveat")}</p>
    </section>
  );
}

function MetricRow({ metric, unit }: { metric: DimensionMetric; unit: string }) {
  const t = useTranslations("premade.dimensions");
  const noData = metric.value === null;
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs text-foreground">
          {t(`metrics.${metric.key}` as "metrics.kda")}
        </p>
        <p className="num text-2xs text-muted-foreground">
          {metric.proportion
            ? formatProportion(metric.proportion)
            : `${t("sample")}: ${metric.n}`}
          {metric.direction !== 0 && (
            <span className="ml-1.5">
              {metric.direction > 0 ? t("higherBetter") : t("lowerBetter")}
            </span>
          )}
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "num text-sm font-semibold",
            noData ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {noData ? t("noData") : format(metric.value, unit)}
        </p>
        {!noData && (
          <p className="num text-2xs text-muted-foreground">
            {t("previous")}: {format(metric.previous, unit)} ·{" "}
            <Change change={metric.change} unit={unit} />
          </p>
        )}
      </div>
    </li>
  );
}
