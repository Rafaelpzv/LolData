import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("shimmer rounded-md bg-muted/60", className)} {...props} />;
}

interface SkeletonListProps {
  count?: number;
  /** Classes for each row (height, radius). */
  itemClassName?: string;
  className?: string;
  label: string;
}

/** Stack of placeholder rows with a single screen-reader announcement. */
export function SkeletonList({ count = 5, itemClassName = "h-24 rounded-lg", className, label }: SkeletonListProps) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={itemClassName} />
      ))}
    </div>
  );
}
