"use client";

import { useEffect } from "react";

/**
 * One delegated listener for every `[data-glow]` element: writes the pointer position into
 * --glow-x / --glow-y so CSS can paint a soft light that follows the cursor (see globals.css).
 * Keeps Card a server component: no per-card handlers.
 */
export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-glow]") ?? null;
      if (last && last !== el) last.style.removeProperty("--glow-o");
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--glow-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--glow-y", `${e.clientY - r.top}px`);
      el.style.setProperty("--glow-o", "1");
    };
    const onLeave = () => last?.style.removeProperty("--glow-o");
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return null;
}
