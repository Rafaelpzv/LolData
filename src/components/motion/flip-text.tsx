// Adapted from ObsidianUI "flip-text" (MIT): characters flip on the X axis in a sine-staggered wave.
// Styles live in globals.css (.flip-char). Static for reduced motion.
import { cn } from "@/lib/utils";

interface FlipTextProps {
  children: string;
  className?: string;
  /** Seconds per cycle; the flip itself uses the first ~25% of it. */
  duration?: number;
  delay?: number;
  loop?: boolean;
}

export function FlipText({ children, className, duration = 6, delay = 0.2, loop = true }: FlipTextProps) {
  const chars = [...children];
  return (
    <span className={cn("inline-block leading-none [perspective:1000px]", className)} aria-label={children}>
      {chars.map((char, i) => {
        const wave = Math.sin((i / chars.length) * (Math.PI / 2));
        return (
          <span
            key={i}
            aria-hidden
            className="flip-char inline-block"
            style={
              {
                "--flip-duration": `${duration}s`,
                "--flip-delay": `${delay + wave * 0.35}s`,
                "--flip-iteration": loop ? "infinite" : "1",
              } as React.CSSProperties
            }
          >
            {char === " " ? " " : char}
          </span>
        );
      })}
    </span>
  );
}
