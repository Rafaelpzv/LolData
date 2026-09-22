import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/page-shell";

export default async function TftProfileLoading() {
  const t = await getTranslations("tft");

  return (
    <PageShell>
      <div role="status" aria-live="polite" className="space-y-6 sm:space-y-8">
        <span className="sr-only">{t("loadingProfile")}</span>

        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <Skeleton className="size-24 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-20 rounded-lg md:w-80 md:shrink-0" />
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Card key={i} padding="md" className="flex gap-3 sm:gap-4">
                <Skeleton className="h-10 w-12 shrink-0 rounded-sm sm:h-12 sm:w-14" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-4 w-64 max-w-full" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }, (_, j) => (
                      <Skeleton key={j} className="h-5 w-20 rounded-sm" />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }, (_, j) => (
                      <Skeleton key={j} className="size-10" />
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
