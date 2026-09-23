"use client";

import { motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

/** Remounts on every navigation: each page fades and rises into place. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.reveal, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
