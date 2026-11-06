"use client";

import { useId, useState } from "react";

import { ChevronDown } from "lucide-react";

import { Collapse } from "@/components/motion/collapse";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A collapsible block of the individual tab: a real button over the shared Collapse, so the
 * person's page stays short and every section keeps its own state while switching players.
 */
export function PlayerSection({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card padding="lg">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {hint && (
            <span className="truncate text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-fast",
            open && "rotate-180",
          )}
        />
      </button>
      <Collapse open={open} id={id}>
        <div className="pt-4">{children}</div>
      </Collapse>
    </Card>
  );
}
