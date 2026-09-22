import Image from "next/image";
import { cn } from "@/lib/utils";
import { rankedCrestUrl } from "@/lib/cdn";

interface TierCrestProps {
  /** Riot tier or elo string ("CHALLENGER", "Diamond II"). Renders nothing when unranked. */
  tier: string | null | undefined;
  /** Square size in px. */
  size?: 16 | 20 | 24 | 32 | 48;
  /** Empty when adjacent text names the tier. */
  alt?: string;
  className?: string;
}

/** Ranked mini crest (SVG). Fixed square box so every crest aligns on the same grid. */
export function TierCrest({ tier, size = 24, alt = "", className }: TierCrestProps) {
  const src = rankedCrestUrl(tier);
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
