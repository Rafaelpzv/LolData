import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes for the wrapper (width, margins). `className` styles the <select> itself. */
  wrapperClassName?: string;
}

/** Native select: keyboard, screen reader and mobile pickers work out of the box. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn("relative", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(fieldBase, "cursor-pointer appearance-none pr-9 [&>optgroup]:bg-popover [&>option]:bg-popover", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = "Select";
