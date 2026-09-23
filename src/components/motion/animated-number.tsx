"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  /** Fraction digits (e.g. 1 for "56.4"). */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts up to `value` the first time it scrolls into view. Server and first paint render the final
 * value (no layout shift, correct for crawlers); the count-up is a client-side enhancement.
 */
export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const locale = useLocale();

  const format = (n: number) =>
    prefix +
    new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n) +
    suffix;

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || reduce) return;
    const controls = animate(0, value, {
      duration: DURATION.count,
      ease: EASE_OUT,
      onUpdate: (n) => {
        el.textContent = format(n);
      },
    });
    return () => controls.stop();
    // format depends only on locale/decimals/prefix/suffix, all captured below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value, locale, decimals, prefix, suffix]);

  return (
    <span ref={ref} className={cn("num", className)}>
      {format(value)}
    </span>
  );
}
