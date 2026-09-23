import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shaped like a collapsed MatchCard. */
export function MatchCardSkeleton() {
  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-sm" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="ml-auto size-8" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
        <div className="flex items-center gap-1.5">
          <Skeleton className="size-16" />
          <div className="space-y-1">
            <Skeleton className="size-8 rounded-sm" />
            <Skeleton className="size-8 rounded-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex gap-1 lg:ml-auto">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="size-8 md:size-10" />
          ))}
        </div>
      </div>
    </Card>
  );
}

/** A stack of match card placeholders with one screen-reader announcement. */
export function MatchListSkeleton({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}
