import * as React from "react";
import { cn } from "@/lib/utils";

/** Visual shell for anything floating above content: menus, listboxes, tooltips. */
export const popoverSurface =
  "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg shadow-black/40";

export const PopoverSurface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn(popoverSurface, className)} {...props} />,
);
PopoverSurface.displayName = "PopoverSurface";

/** Row inside a listbox/menu. Pass `active` for the keyboard-highlighted option. */
export function listOptionClass(active: boolean, selected = false) {
  return cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast",
    active ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60",
    selected && "font-medium",
  );
}
