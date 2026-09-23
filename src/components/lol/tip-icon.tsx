"use client";

import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/** Image hover feedback for game art inside rows (images only, never whole cards). */
export const iconHover = "transition-transform duration-fast hover:scale-105";

interface TipIconProps {
  /** Tooltip text (item, rune, spell or champion name). Nothing renders when empty. */
  label: string | null | undefined;
  /** Main-row icons join the tab order; participant-row icons stay hover-only to keep tab order short. */
  focusable?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Wraps a non-interactive IconFrame so it can carry a <Tip>. */
export function TipIcon({ label, focusable, className, children }: TipIconProps) {
  if (!label) return <>{children}</>;
  return (
    <Tip label={label}>
      <span
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? label : undefined}
        role={focusable ? "img" : undefined}
        className={cn("inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        {children}
      </span>
    </Tip>
  );
}
