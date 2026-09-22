import Link from "next/link";
import { cn } from "@/lib/utils";
import { focusRing } from "./button";

/** Shared look for SegmentedNav (links) and SegmentedControl (buttons). */
export const segmentGroupClass = "inline-flex gap-1 rounded-md border border-border bg-surface-sunken/70 p-1";

export function segmentItemClass(active: boolean) {
  return cn(
    "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-sm transition-colors duration-fast [&_svg]:size-4",
    active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    focusRing,
  );
}

export interface SegmentedNavItem {
  href: string;
  label: string;
  active: boolean;
}

interface SegmentedNavProps {
  items: SegmentedNavItem[];
  label: string;
  className?: string;
}

/** Row of mutually exclusive links (queue filters). Scrolls horizontally on small screens. */
export function SegmentedNav({ items, label, className }: SegmentedNavProps) {
  return (
    <nav aria-label={label} className={cn("max-w-full overflow-x-auto", className)}>
      <ul className={segmentGroupClass}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              scroll={false}
              className={segmentItemClass(item.active)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
