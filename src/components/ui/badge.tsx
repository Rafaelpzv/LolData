import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-foreground",
        outline: "border border-border text-muted-foreground",
        solid: "bg-foreground text-background",
        win: "bg-win/15 text-win",
        loss: "bg-loss/15 text-loss",
        first: "bg-place-first/15 text-place-first",
        top4: "bg-place-top4/15 text-place-top4",
        bottom: "bg-place-bottom/15 text-place-bottom",
        warning: "bg-warning/15 text-warning",
      },
      size: {
        sm: "px-1.5 py-1 text-2xs",
        md: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
