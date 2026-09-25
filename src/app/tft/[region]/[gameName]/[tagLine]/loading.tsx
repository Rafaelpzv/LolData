import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/layout/page-shell";
import { TftMatchListSkeleton, TftRankedSkeleton } from "@/components/tft/tft-skeletons";

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
          <TftRankedSkeleton />
        </div>

        <TftMatchListSkeleton />
      </div>
    </PageShell>
  );
}
