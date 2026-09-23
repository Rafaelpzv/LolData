"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

/** Visual shell for anything floating above content: menus, listboxes, tooltips. */
export const popoverSurface =
  "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg shadow-black/40";

export const PopoverSurface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn(popoverSurface, className)} {...props} />,
);
PopoverSurface.displayName = "PopoverSurface";

/**
 * Floating layer for menus, listboxes and suggestion lists. Renders in a portal (never clipped or
 * covered by later sections), positions itself against its anchor and flips/shifts to stay inside
 * the viewport. Focus stays where the caller puts it (no auto-focus), so comboboxes keep typing.
 */
export const Floating = PopoverPrimitive.Root;
export const FloatingAnchor = PopoverPrimitive.Anchor;

interface FloatingContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Match the anchor's width (suggestion lists under an input). */
  matchAnchorWidth?: boolean;
}

export const FloatingContent = React.forwardRef<HTMLDivElement, FloatingContentProps>(
  ({ className, matchAnchorWidth, sideOffset = 8, collisionPadding = 12, onOpenAutoFocus, ...props }, ref) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          onOpenAutoFocus?.(e);
        }}
        data-lenis-prevent
        className={cn(
          popoverSurface,
          "z-50 overflow-y-auto overscroll-contain p-1 focus:outline-none",
          "max-h-[min(20rem,var(--radix-popover-content-available-height))]",
          "origin-[--radix-popover-content-transform-origin] duration-fast",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          matchAnchorWidth && "w-[--radix-popover-trigger-width]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
FloatingContent.displayName = "FloatingContent";

/** Row inside a listbox/menu. Pass `active` for the keyboard-highlighted option. */
export function listOptionClass(active: boolean, selected = false) {
  return cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast",
    active ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60",
    selected && "font-medium",
  );
}
