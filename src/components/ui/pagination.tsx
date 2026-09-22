"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/** Page list with ellipses: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current: number, total: number, maxVisible = 7): (number | "ellipsis")[] {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
}

export function Pagination({ page, totalPages, hrefFor, className }: PaginationProps) {
  const t = useTranslations("common");
  if (totalPages <= 1) return null;

  const item = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "num text-xs");
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav aria-label={t("pagination")} className={cn("flex flex-wrap items-center justify-center gap-1", className)}>
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-label={t("previous")}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={cn(item, page <= 1 && disabled)}
      >
        <ChevronLeft aria-hidden />
      </Link>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} aria-hidden className="w-6 text-center text-xs text-subtle-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-label={t("page", { page: p })}
            aria-current={p === page ? "page" : undefined}
            className={cn(item, p === page && "bg-foreground text-background hover:bg-foreground hover:text-background")}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-label={t("next")}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
        className={cn(item, page >= totalPages && disabled)}
      >
        <ChevronRight aria-hidden />
      </Link>
    </nav>
  );
}
