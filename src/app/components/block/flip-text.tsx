"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface FlipTextProps {
  children: string;
  className?: string;
  duration?: number;
  stagger?: number;
  repeatInterval?: number;
}

export function FlipText({
  children,
  className,
  duration = 0.4,
  stagger = 0.05,
  repeatInterval = 2500,
}: FlipTextProps) {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), repeatInterval);
    return () => clearInterval(id);
  }, [repeatInterval]);

  return (
    <span className={cn("inline-flex", className)}>
      {children.split('').map((char, index) => (
        <motion.span
          key={`${cycle}-${index}`}
          className="inline-block"
          style={{ transformPerspective: 500 }}
          initial={{ rotateX: 0, y: 0 }}
          animate={{ rotateX: [0, 360], y: [0, -8, 0] }}
          transition={{ duration, delay: index * stagger, ease: "easeOut" }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}

export default FlipText;