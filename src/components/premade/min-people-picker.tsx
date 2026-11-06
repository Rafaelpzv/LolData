"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** The "minimum players per match" filter: it changes the analysis, so it sits next to the tabs. */
export function MinPeoplePicker({
  value,
  onChange,
  levels = [5, 4, 3, 2],
}: {
  value: number;
  onChange: (value: number) => void;
  levels?: number[];
}) {
  const t = useTranslations("premade.update");
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 text-2xs text-muted-foreground"
    >
      {t("minPeople")}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("excludedHint")}
            className="rounded-full text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Info aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("excludedHint")}</TooltipContent>
      </Tooltip>
    </label>
  );
}
