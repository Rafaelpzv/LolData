"use client";

import Image from "next/image";
import { Clock } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { rankedCrestUrl } from "@/lib/cdn";
import { tierTextClass } from "@/lib/tiers";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RankingData } from "./types";

interface CutoffSummaryProps {
  cutoffs: RankingData["cutoffs"];
  cache?: RankingData["cache"];
  loading?: boolean;
}

const APEX = ["challenger", "grandmaster"] as const;

/** Challenger / Grandmaster LP cutoffs and cache freshness, in one row that wraps on small screens. */
export function CutoffSummary({ cutoffs, cache, loading }: CutoffSummaryProps) {
  const t = useTranslations("rankings");
  const tTiers = useTranslations("tiers");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  const items = APEX.flatMap((tier) => {
    const lp = cutoffs?.[tier]?.cutoffLP;
    return lp == null ? [] : [{ tier, lp }];
  });
  const updatedAt = cache?.updatedAt ? new Date(cache.updatedAt) : null;

  if (loading) {
    return (
      <Card padding="sm" className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-hidden>
        <Skeleton className="h-3 w-20" />
        {APEX.map((tier) => (
          <div key={tier} className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  if (items.length === 0 && !updatedAt) return null;

  return (
    <Card padding="sm" className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t("cutoffs")}</h2>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {items.map(({ tier, lp }) => {
              const crest = rankedCrestUrl(tier);
              return (
                <li key={tier} className="flex items-center gap-2">
                  {crest && <Image src={crest} alt="" width={24} height={24} className="size-6 shrink-0" />}
                  <p className="leading-tight">
                    <span className="block text-xs text-muted-foreground">{tTiers(tier)}</span>
                    <span className={cn("num block text-sm font-semibold", tierTextClass(tier))}>
                      {t("cutoffLp", { lp: format.number(lp) })}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {updatedAt && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
          <Clock aria-hidden className="size-3.5 shrink-0" />
          {t("updated", { time: format.relativeTime(updatedAt, now) })}
          {cache?.isStale && <Badge variant="warning">{t("stale")}</Badge>}
        </p>
      )}
    </Card>
  );
}
