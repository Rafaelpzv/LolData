import * as React from "react";
import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const SIZES = { xs: 20, sm: 32, md: 40, lg: 64, xl: 96 } as const;

const frameVariants = cva("relative block shrink-0 overflow-hidden border border-border/60 bg-surface-sunken", {
  variants: {
    size: {
      xs: "size-5",
      sm: "size-8",
      md: "size-10",
      lg: "size-16",
      xl: "size-24",
    },
    shape: {
      square: "rounded-sm",
      rounded: "rounded-md",
      circle: "rounded-full",
    },
  },
  defaultVariants: { size: "sm", shape: "rounded" },
});

export interface IconFrameProps extends VariantProps<typeof frameVariants> {
  src: string | null | undefined;
  /** Required. Use "" only when adjacent text already names the image. */
  alt: string;
  className?: string;
  /** Classes for the inner <img> (e.g. scale to crop champion splash borders). */
  imageClassName?: string;
  /** Overlay pinned to the bottom edge (level pill, star count...). Rendered outside the clip. */
  badge?: React.ReactNode;
  title?: string;
  priority?: boolean;
  unoptimized?: boolean;
}

/** Square/circle frame for game art: profile icons, champions, items, runes, units. */
export function IconFrame({
  src,
  alt,
  size = "sm",
  shape,
  className,
  imageClassName,
  badge,
  title,
  priority,
  unoptimized,
}: IconFrameProps) {
  const px = SIZES[size ?? "sm"];
  const frame = (
    <span className={cn(frameVariants({ size, shape }), className)} title={title}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${px}px`}
          priority={priority}
          unoptimized={unoptimized}
          className={cn("object-cover", imageClassName)}
        />
      ) : (
        alt && <span className="sr-only">{alt}</span>
      )}
    </span>
  );

  if (!badge) return frame;
  return (
    <span className="relative inline-flex shrink-0">
      {frame}
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2">{badge}</span>
    </span>
  );
}
