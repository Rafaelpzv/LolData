"use client";

import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";

interface CollapseProps {
  open: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/** Height-animated disclosure panel (expanders, accordions). */
export function Collapse({ open, id, className, children }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1, transition: { height: SPRING.soft, opacity: { duration: DURATION.base, ease: EASE_OUT, delay: 0.05 } } }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: DURATION.slow, ease: EASE_OUT }, opacity: { duration: DURATION.fast } } }}
          className="overflow-hidden"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
