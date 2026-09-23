"use client";

import * as React from "react";
import { ActivePill } from "@/components/motion/active-pill";
import { cn } from "@/lib/utils";
import { segmentGroupClass, segmentItemClass } from "./segmented-nav";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
}

/** Toggle between a few local states (not navigation). Buttons expose aria-pressed. */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className }: SegmentedControlProps<T>) {
  const id = React.useId();
  return (
    <div role="group" aria-label={label} className={cn(segmentGroupClass, className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={segmentItemClass(o.value === value)}
        >
          {o.value === value && <ActivePill layoutId={`segc-${id}`} />}
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
