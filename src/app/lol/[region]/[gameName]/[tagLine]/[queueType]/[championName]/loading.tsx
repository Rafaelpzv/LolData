import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchListSkeleton } from "@/components/lol/match-card-skeleton";

/** Skeleton shaped like the profile header, ranked cards, mastery row and match history. */
export default async function ProfileLoading() {
  const t = await getTranslations("common");

  return (
    <PageShell>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Skeleton className="size-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48 sm:w-64" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:w-80 md:shrink-0 md:grid-cols-1">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-48 rounded-lg" />
        <MatchListSkeleton count={4} label={t("loading")} />
      </div>
    </PageShell>
  );
}
