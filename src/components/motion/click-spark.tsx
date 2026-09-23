"use client";

// Adapted from ObsidianUI "click-spark" (MIT): short radial sparks on click/tap. Uses the foreground
// token instead of next-themes, and skips entirely for reduced motion.
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface Spark {
  x: number;
  y: number;
  angle: number;
  start: number;
}

interface ClickSparkProps {
  size?: number;
  radius?: number;
  count?: number;
  duration?: number;
}

export function ClickSpark({ size = 9, radius = 18, count = 8, duration = 380 }: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduce) return;

    const sparks: Spark[] = [];
    let frame: number | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const color = `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim()} / 0.8)`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const t = (now - s.start) / duration;
        if (t >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const eased = t * (2 - t);
        const d = eased * radius;
        const len = size * (1 - eased);
        ctx.beginPath();
        ctx.moveTo(s.x + d * Math.cos(s.angle), s.y + d * Math.sin(s.angle));
        ctx.lineTo(s.x + (d + len) * Math.cos(s.angle), s.y + (d + len) * Math.sin(s.angle));
        ctx.stroke();
      }
      frame = sparks.length ? requestAnimationFrame(draw) : null;
    };

    const onPointer = (e: PointerEvent) => {
      const start = performance.now();
      for (let i = 0; i < count; i++) sparks.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / count, start });
      if (frame === null) frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerdown", onPointer);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reduce, count, duration, radius, size]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[100] size-full" />;
}
