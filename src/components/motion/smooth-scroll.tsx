"use client";

// Adapted from ObsidianUI "smooth-scroll" (MIT): Lenis inertial scrolling, off for reduced motion.
import { useEffect } from "react";
import type Lenis from "lenis";

export function SmoothScroll() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let generation = 0;
    let instance: Lenis | null = null;
    let frame: number | null = null;

    const stop = () => {
      generation++;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      instance?.destroy();
      instance = null;
    };

    const update = async () => {
      stop();
      if (disposed || preference.matches) return;
      const current = generation;
      const LenisClass = (await import("lenis")).default;
      if (disposed || preference.matches || current !== generation) return;
      instance = new LenisClass({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 1.5,
      });
      const raf = (time: number) => {
        if (disposed || !instance || current !== generation) return;
        instance.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    };

    void update();
    preference.addEventListener("change", update);
    return () => {
      disposed = true;
      preference.removeEventListener("change", update);
      stop();
    };
  }, []);

  return null;
}
