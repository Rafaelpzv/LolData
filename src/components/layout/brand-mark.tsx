import { cn } from "@/lib/utils";

/** Wordmark: "Lol" in foreground, "Data" muted. Pure type, no icon. */
export function BrandMark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "font-semibold tracking-tight text-foreground",
        size === "lg" ? "text-4xl sm:text-5xl" : "text-base",
        className,
      )}
    >
      Lol<span className="text-muted-foreground">Data</span>
    </span>
  );
}
