"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Pagination } from "@/components/ui/pagination";

interface RankingsPaginationProps {
  page: number;
  totalPages: number;
  totalEntries: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}

/** Page links centered under the table plus the "Showing 1–200 of 1,234" range. */
export function RankingsPagination({ page, totalPages, totalEntries, pageSize, hrefFor }: RankingsPaginationProps) {
  const t = useTranslations("rankings");
  const format = useFormatter();
  const from = Math.min((page - 1) * pageSize + 1, totalEntries);
  const to = Math.min(page * pageSize, totalEntries);

  return (
    <div className="flex flex-col items-center gap-3">
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
      <p className="text-xs text-muted-foreground">
        {t("showing", { from: format.number(from), to: format.number(to), total: format.number(totalEntries) })}
      </p>
    </div>
  );
}
