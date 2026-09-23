import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./button";

export const fieldBase = cn(
  "h-10 w-full rounded-md border border-border bg-surface-sunken px-3 text-sm text-foreground",
  "transition-colors duration-fast hover:border-border-strong",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-destructive/70",
  focusRing,
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(fieldBase, "placeholder:text-subtle-foreground", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";
