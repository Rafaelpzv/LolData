import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const valueVariants = cva("num font-semibold leading-tight", {
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-xl",
      xl: "text-3xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      win: "text-win",
      loss: "text-loss",
    },
  },
  defaultVariants: { size: "md", tone: "default" },
});

export interface StatProps extends VariantProps<typeof valueVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

/** Label over a numeric value. */
export function Stat({ label, value, hint, size, tone, className, align = "start" }: StatProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "center" && "items-center text-center",
        align === "end" && "items-end text-right",
        className,
      )}
    >
      <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={valueVariants({ size, tone })}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
