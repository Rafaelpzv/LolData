import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TftRankedSkeleton() {
  return <Skeleton className="h-20 rounded-lg md:w-80 md:shrink-0" />;
}

/** Heading, 3 summary tiles and match rows. */
export function TftMatchListSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
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
  );
}
