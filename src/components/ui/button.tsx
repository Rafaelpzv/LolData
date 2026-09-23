import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[color,background-color,border-color,transform] duration-fast active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    focusRing,
  ),
  {
    variants: {
      variant: {
        /** Neutral surface button. The default for most actions. */
        default: "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-accent",
        /** High-emphasis action. One per view. */
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-accent/60",
        ghost: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        link: "h-auto px-0 text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. next/link) with button styles. */
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...(!asChild && !props.type ? { type: "button" as const } : {})}
        {...props}
      >
        {loading && <Spinner />}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  },
);
Button.displayName = "Button";
