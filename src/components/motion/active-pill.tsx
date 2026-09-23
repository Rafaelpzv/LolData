"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

/**
 * The sliding "selected" background shared by segmented controls and nav items. Render it inside
 * the active item only; items in the same group share `layoutId`, so motion glides it between them.
 * The item must be `relative` (and `isolate` so the pill sits behind its text).
 */
export function ActivePill({ layoutId, className }: { layoutId: string; className?: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden
      transition={SPRING.snappy}
      className={cn("absolute inset-0 -z-10 rounded-sm bg-accent", className)}
    />
  );
}
