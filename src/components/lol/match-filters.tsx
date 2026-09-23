"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { championIconUrl } from "@/lib/cdn";
import { CHAMPIONS, championName } from "@/lib/champions";
import { MATCH_QUEUES, queueSlugFromId } from "@/lib/queues";
import { normalizeRegion } from "@/lib/regions";
import { buttonVariants } from "@/components/ui/button";
import { IconFrame } from "@/components/ui/icon-frame";
import { fieldBase } from "@/components/ui/input";
import { Floating, FloatingAnchor, FloatingContent, listOptionClass } from "@/components/ui/popover-surface";
import { SegmentedNav } from "@/components/ui/segmented-nav";

interface MatchFilterBase {
  region: string;
  gameName: string;
  tagLine: string;
}

/** /lol/<region>/<name>/<tag>/<queue slug>/<champion id | all> */
export function matchFilterHref(
  { region, gameName, tagLine }: MatchFilterBase,
  queueId: string,
  championId: string | null,
): string {
  const r = normalizeRegion(region).toLowerCase();
  return `/lol/${r}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/${queueSlugFromId(queueId)}/${championId ?? "all"}`;
}

interface MatchFiltersProps extends MatchFilterBase {
  /** Current queue id ("all", "420"...). */
  queueId: string;
  /** Current champion id, or null for all champions. */
  championId: string | null;
}

/** Queue tabs + champion combobox. Both navigate (filters live in the URL). */
export function MatchFilters({ queueId, championId, ...base }: MatchFiltersProps) {
  const t = useTranslations("matches.filters");
  const tQueues = useTranslations("queues");

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SegmentedNav
        label={t("queue")}
        items={MATCH_QUEUES.map((q) => ({
          href: matchFilterHref(base, q.id, championId),
          label: tQueues(q.labelKey as "all"),
          active: q.id === queueId,
        }))}
      />
      <ChampionFilter base={base} queueId={queueId} championId={championId} />
    </div>
  );
}

/** Options past this index appear together with the last cascading one. */
const OPTION_CASCADE = 16;

interface ChampionOption {
  id: string | null;
  name: string;
}

function ChampionFilter({
  base,
  queueId,
  championId,
}: {
  base: MatchFilterBase;
  queueId: string;
  championId: string | null;
}) {
  const t = useTranslations("matches.filters");
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const options = useMemo<ChampionOption[]>(() => {
    const all: ChampionOption[] = [
      { id: null, name: t("allChampions") },
      ...[...CHAMPIONS].sort((a, b) => a.name.localeCompare(b.name)),
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((c) => c.id !== null && c.name.toLowerCase().includes(q)) : all;
  }, [query, t]);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.id === championId)));
    setOpen(true);
  };

  const hrefFor = (option: ChampionOption) => matchFilterHref(base, queueId, option.id);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (options.length ? (i + 1) % options.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, options.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[active];
      if (option) {
        close(true);
        router.push(hrefFor(option), { scroll: false });
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close();
    }
  };

  const currentName = championId ? (championName(championId) ?? championId) : t("allChampions");

  return (
    <Floating open={open} onOpenChange={(o) => (o ? openList() : close())}>
    <div ref={rootRef} className="relative w-full sm:w-64">
      <FloatingAnchor asChild>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${t("champion")}: ${currentName}`}
        onClick={() => (open ? close() : openList())}
        className={cn(buttonVariants({ variant: "default" }), "w-full justify-between px-3")}
      >
        <span className="flex min-w-0 items-center gap-2">
          {championId && <IconFrame src={championIconUrl(championId)} alt="" size="xs" shape="rounded" />}
          <span className="truncate">{currentName}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn("text-muted-foreground transition-transform duration-fast", open && "rotate-180")}
        />
      </button>
      </FloatingAnchor>

      <FloatingContent
        align="end"
        className="max-h-none w-[max(var(--radix-popover-trigger-width),18rem)] overflow-visible"
        onInteractOutside={(e) => {
          if (rootRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close(true);
        }}
      >
          <div className="relative p-1">
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              role="combobox"
              aria-label={t("championSearch")}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options[active] ? `${id}-opt-${active}` : undefined}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={t("championSearch")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className={cn(fieldBase, "h-9 pl-9 placeholder:text-subtle-foreground")}
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={t("champions")}
            data-lenis-prevent
            className="mt-1 max-h-[min(18rem,calc(var(--radix-popover-content-available-height)-3.5rem))] overflow-y-auto overscroll-contain"
          >
            {options.length === 0 ? (
              <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
                {t("noChampions")}
              </li>
            ) : (
              options.map((option, i) => (
                <motion.li
                  key={option.id ?? "all"}
                  role="presentation"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DURATION.fast, ease: EASE_OUT, delay: Math.min(i, OPTION_CASCADE) * 0.012 }}
                >
                  <Link
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={option.id === championId}
                    tabIndex={-1}
                    href={hrefFor(option)}
                    scroll={false}
                    onClick={() => close()}
                    onPointerMove={() => setActive(i)}
                    ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    className={listOptionClass(i === active, option.id === championId)}
                  >
                    {option.id ? (
                      <IconFrame src={championIconUrl(option.id)} alt="" size="xs" shape="rounded" />
                    ) : (
                      <span aria-hidden className="size-5 shrink-0" />
                    )}
                    <span className="truncate">{option.name}</span>
                  </Link>
                </motion.li>
              ))
            )}
          </ul>
      </FloatingContent>
    </div>
    </Floating>
  );
}
