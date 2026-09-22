import Link from "next/link";
import { cn } from "@/lib/utils";
import { focusRing } from "./button";

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

/** Row of mutually exclusive links (queue filters, game switch). Scrolls horizontally on small screens. */
export function SegmentedNav({ items, label, className }: SegmentedNavProps) {
  return (
    <nav aria-label={label} className={cn("max-w-full overflow-x-auto", className)}>
      <ul className="inline-flex gap-1 rounded-md border border-border bg-surface-sunken/70 p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              scroll={false}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors duration-fast",
                item.active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                focusRing,
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
