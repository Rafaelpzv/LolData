"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { REGIONS, REGION_GROUPS, getRegion } from "@/lib/regions";
import { focusRing } from "@/components/ui/button";
import { Floating, FloatingAnchor, FloatingContent, listOptionClass } from "@/components/ui/popover-surface";
import { RegionFlag } from "./region-flag";

interface RegionPickerProps {
  value: string;
  onChange: (region: string) => void;
  /** "pill" sits inside the search field; "field" matches Input/Select height. */
  appearance?: "pill" | "field";
  align?: "start" | "end";
  className?: string;
}

/** Listbox of regions with SVG flags, grouped by continent. Full keyboard support. */
export function RegionPicker({ value, onChange, appearance = "field", align = "end", className }: RegionPickerProps) {
  const t = useTranslations("regions");
  const tSearch = useTranslations("search");
  const id = useId();
  const listId = `${id}-list`;
  const current = getRegion(value);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(current.code);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const ordered = useMemo(() => REGION_GROUPS.flatMap((g) => REGIONS.filter((r) => r.group === g)), []);

  useEffect(() => {
    if (open) {
      listRef.current?.focus();
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, id]);

  const openList = () => {
    setActive(current.code);
    setOpen(true);
  };

  const select = (code: string) => {
    onChange(code);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const move = (delta: number) => {
    const i = ordered.findIndex((r) => r.code === active);
    const next = ordered[(i + delta + ordered.length) % ordered.length];
    setActive(next.code);
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(ordered[0].code);
        break;
      case "End":
        e.preventDefault();
        setActive(ordered[ordered.length - 1].code);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <Floating open={open} onOpenChange={setOpen}>
      <FloatingAnchor asChild>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${tSearch("region")}: ${t(current.code as "BR1")}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={cn(
          "inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors duration-fast",
          appearance === "pill"
            ? "h-9 rounded-full border border-border bg-accent/60 pl-3 pr-2 hover:border-border-strong hover:bg-accent"
            : "h-10 rounded-md border border-border bg-surface-sunken pl-3 pr-2.5 hover:border-border-strong",
          focusRing,
          className,
        )}
      >
        <RegionFlag region={current.code} />
        <span className="num text-xs">{current.short}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 text-muted-foreground transition-transform duration-fast", open && "rotate-180")}
        />
      </button>
      </FloatingAnchor>

      <FloatingContent
        align={align}
        className="w-80 max-w-[calc(100vw-1.5rem)]"
        onOpenAutoFocus={() => listRef.current?.focus()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          buttonRef.current?.focus();
        }}
      >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={tSearch("region")}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onListKeyDown}
            className="focus:outline-none"
          >
            {REGION_GROUPS.map((group) => (
              <li key={group} role="presentation">
                <p
                  id={`${id}-g-${group}`}
                  className="px-3 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-subtle-foreground"
                >
                  {t(`groups.${group}`)}
                </p>
                <ul role="group" aria-labelledby={`${id}-g-${group}`}>
                  {REGIONS.filter((r) => r.group === group).map((r) => (
                    <li
                      key={r.code}
                      id={`${id}-${r.code}`}
                      role="option"
                      aria-selected={r.code === current.code}
                      onClick={() => select(r.code)}
                      onPointerMove={() => setActive(r.code)}
                      className={listOptionClass(r.code === active, r.code === current.code)}
                    >
                      <RegionFlag region={r.code} />
                      <span className="flex-1 truncate">{t(r.code as "BR1")}</span>
                      <span className="num text-xs text-muted-foreground">{r.short}</span>
                      <Check
                        aria-hidden
                        className={cn("size-4 shrink-0", r.code === current.code ? "opacity-100" : "opacity-0")}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
      </FloatingContent>
    </Floating>
  );
}
