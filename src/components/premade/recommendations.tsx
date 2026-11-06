"use client";

import { AlertTriangle, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Recommendation } from "@/lib/premade/recommendations";
import { RecommendationCard } from "./recommendation-card";

export function Recommendations({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  const t = useTranslations("premade.recommendations");
  const tPings = useTranslations("premade.pings");

  if (recommendations.length === 0) {
    return (
      <Card>
        <EmptyState icon={Info} title={t("empty")} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((recommendation, index) => (
          <RecommendationCard
            key={`${recommendation.code}-${index}`}
            recommendation={recommendation}
          />
        ))}
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {tPings("caveat")}
      </p>
    </div>
  );
}
