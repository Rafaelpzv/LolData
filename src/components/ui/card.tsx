import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const cardVariants = cva("relative rounded-lg border", {
  variants: {
    variant: {
      /** Translucent panel over the backdrop. */
      default: "border-border/70 bg-surface/70",
      /** Clickable panel: border lifts on hover, no shadow. */
      interactive:
        "border-border/70 bg-surface/70 transition-colors duration-fast hover:border-border-strong hover:bg-surface/85",
      win: "border-win/20 bg-gradient-to-r from-win/10 to-win/5 transition-colors duration-fast hover:border-win/40",
      loss: "border-loss/20 bg-gradient-to-r from-loss/10 to-loss/5 transition-colors duration-fast hover:border-loss/40",
      /** Recessed area inside a card (slots, previews). */
      sunken: "border-border/50 bg-surface-sunken/70",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-4 sm:p-6",
    },
  },
  defaultVariants: { variant: "default", padding: "none" },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  as?: "div" | "section" | "article" | "li" | "aside";
}

export const Card = React.forwardRef<HTMLElement, CardProps>(
  ({ className, variant, padding, as = "div", ...props }, ref) => {
    const Comp = as as "div";
    return (
      <Comp
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(cardVariants({ variant, padding }), className)}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)} {...props} />;
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4";
}

export function CardTitle({ className, as: Comp = "h2", ...props }: CardTitleProps) {
  return <Comp className={cn("text-base font-semibold tracking-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
