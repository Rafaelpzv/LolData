/**
 * Motion tokens. Every animation in the app uses these values so movement feels like one system.
 * CSS equivalents live in tailwind.config.js (duration-fast/base/slow, ease-out).
 */
import type { Transition, Variants } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
  /** Content entering the viewport. */
  reveal: 0.45,
  /** Numbers counting up. */
  count: 0.9,
} as const;

export const SPRING = {
  /** Indicators sliding between tabs, pills. */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 } satisfies Transition,
  /** Layout changes, expanding panels. */
  soft: { type: "spring", stiffness: 260, damping: 32 } satisfies Transition,
} as const;

/** Rise + unblur. Used by Reveal and StaggerItem. */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: DURATION.reveal, ease: EASE_OUT },
  },
};

export const staggerVariants = (stagger = 0.04, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
});
