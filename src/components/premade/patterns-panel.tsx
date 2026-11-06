"use client";

import { useTranslations } from "next-intl";
import { Repeat, ShieldQuestion } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { PatternStrength } from "@/lib/premade/patterns";
import type { Text } from "@/lib/premade/i18n";
import type { TeamAnalysis } from "@/lib/premade/team-analysis";
import { formatProportion } from "@/lib/premade/stats";
import { fromFraction } from "./format";

/** A força do padrão como tom, sempre junto do texto: a cor não carrega a informação sozinha. */
const STRENGTH_TONE: Record<PatternStrength, string> = {
  recurring: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  suggestive: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  insufficient: "border-border bg-muted text-muted-foreground",
};

/**
 * O `t` do next-intl tipa chaves literais; a chave aqui é montada em runtime (`items.<id>...`). O
 * cast fica uma vez, aqui dentro, e não em cada chamada. Todo `id` que o módulo emite já existe no
 * dicionário (testado em `messages.test.ts`).
 */
function render(
  t: ReturnType<typeof useTranslations<"premade.patterns">>,
  entry: Text,
): string {
  return t(entry.id as "items.collapseGames.title", entry.values);
}


/**
 * Padrões recorrentes (§4): cada linha é um hábito, com frequência, comparação com a janela
 * anterior, evidência, limitações e exemplos. A ordem é a do §8 — o que o time faz, depois quantas
 * vezes, e só então o detalhe — para que o leitor sem tempo leia as duas primeiras colunas.
 */
export function PatternsPanel({
  patterns,
}: {
  patterns: TeamAnalysis["patterns"];
}) {
  const t = useTranslations("premade.patterns");
  const { items, deaths } = patterns;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Repeat}
          title={t("empty")}
          description={t("emptyHint")}
        />
      </Card>
    );
  }

  // Os recorrentes primeiro: quem lê quer o hábito confirmado antes da suspeita.
  const ordered = [...items].sort((a, b) => {
    const rank: Record<PatternStrength, number> = {
      recurring: 0,
      suggestive: 1,
      insufficient: 2,
    };
    return rank[a.strength] - rank[b.strength];
  });

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="px-1 py-1">
          <p className="text-xs text-muted-foreground">
            {t("intro", { games: ordered[0]?.games ?? 0 })}
          </p>
        </div>
      </Card>

      <ul className="space-y-3">
        {ordered.map((pattern) => (
          <li key={pattern.id}>
            <Card padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium">
                    {render(t, pattern.title)}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {render(t, pattern.behavior)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-2xs",
                    STRENGTH_TONE[pattern.strength],
                  )}
                >
                  {t(`strength.${pattern.strength}`)}
                </span>
              </div>

              <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-2xs text-muted-foreground">
                    {t("frequency")}
                  </dt>
                  <dd className="num">
                    {formatProportion(pattern.frequency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted-foreground">
                    {t("games")}
                  </dt>
                  <dd className="num">
                    {pattern.frequency.successes}/{pattern.frequency.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted-foreground">
                    {t("events")}
                  </dt>
                  <dd className="num">{pattern.events}</dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted-foreground">
                    {t("comparedTo")}
                  </dt>
                  <dd>
                    {pattern.change === null
                      ? t("noComparison")
                      : t(`verdict.${pattern.change.verdict}`)}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
                <span className="num">
                  {t("interval", {
                    low: fromFraction(pattern.interval.low),
                    high: fromFraction(pattern.interval.high),
                  })}
                </span>
                {pattern.period.from !== null && pattern.period.days > 0 && (
                  <span>
                    {t("period", {
                      days: pattern.period.days,
                      from: new Date(pattern.period.from)
                        .toISOString()
                        .slice(0, 10),
                      to: pattern.period.to
                        ? new Date(pattern.period.to).toISOString().slice(0, 10)
                        : "",
                    })}
                  </span>
                )}
                {pattern.criteria.map((entry) => (
                  <span key={entry.id} className="num">
                    {t(`criteria.${entry.id}`, { value: entry.value })}{" "}
                    {t(`units.${entry.unit}`, { value: entry.value })}
                  </span>
                ))}
              </div>

              {pattern.examples.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-2xs font-medium text-muted-foreground">
                    {t("examples")}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {pattern.examples.map((example) => (
                      <li
                        key={example.matchId}
                        className="text-2xs text-muted-foreground"
                      >
                        <span className="num">{render(t, example.note)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                  <ShieldQuestion className="size-3" aria-hidden />
                  {t("limitations")}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-2xs text-muted-foreground">
                  {pattern.limitations.map((entry) => (
                    <li key={entry.id}>{render(t, entry)}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card padding="lg">
        <h3 className="text-sm font-medium">{t("deathsTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("deathsHint")}
        </p>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
          <div>
            <dt className="text-2xs text-muted-foreground">{t("deaths.mean")}</dt>
            <dd className="num">{deaths.recent.mean?.toFixed(1) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-2xs text-muted-foreground">
              {t("deaths.median")}
            </dt>
            <dd className="num">{deaths.recent.median?.toFixed(1) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-2xs text-muted-foreground">{t("deaths.sd")}</dt>
            <dd className="num">{deaths.recent.sd?.toFixed(1) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-2xs text-muted-foreground">{t("deaths.range")}</dt>
            <dd className="num">
              {deaths.recent.min ?? "—"}–{deaths.recent.max ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-2xs text-muted-foreground">{t("deaths.previous")}</dt>
            <dd className="num">
              {deaths.previous.median?.toFixed(1) ?? "—"} ({deaths.previous.games})
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

