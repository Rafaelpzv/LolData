"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { normalizeRegion, regionShort } from "@/lib/regions";
import { type Game, parseRiotId, profileHref } from "@/lib/riot-id";
import { Spinner } from "@/components/ui/spinner";
import { Floating, FloatingAnchor, FloatingContent, listOptionClass } from "@/components/ui/popover-surface";
import { RegionFlag } from "./region-flag";
import { RegionPicker } from "./region-picker";

interface Suggestion {
  region: string;
  gameName: string;
  tagLine: string;
}

interface SummonerSearchProps {
  game?: Game;
  region: string;
  onRegionChange: (region: string) => void;
  /** "lg" for the home hero, "md" for page headers. */
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
}

/**
 * The one player search: Riot ID combobox with autocomplete + region picker.
 * Autocomplete uses /api/summoners/autocomplete.
 */
export function SummonerSearch({
  game = "lol",
  region,
  onRegionChange,
  size = "md",
  autoFocus,
  className,
}: SummonerSearchProps) {
  const t = useTranslations("search");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-error`;

  const [value, setValue] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const query = value.trim();
  // Stale results are hidden as soon as the field is cleared.
  const suggestions = query ? results : [];

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/summoners/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = res.ok ? await res.json() : [];
        setResults(Array.isArray(data) ? data : []);
        setActive(-1);
      } catch {
        /* aborted or offline: keep the previous list */
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const go = (riotId: string, targetRegion: string) => {
    const parsed = parseRiotId(riotId);
    if (!parsed.ok) {
      setError(tErrors(parsed.error));
      return;
    }
    setError(null);
    setOpen(false);
    startTransition(() => {
      router.push(profileHref(game, targetRegion, parsed.gameName, parsed.tagLine));
    });
  };

  const choose = (s: Suggestion) => {
    const r = normalizeRegion(s.region);
    if (r !== normalizeRegion(region)) onRegionChange(r);
    setValue(`${s.gameName}#${s.tagLine}`);
    go(`${s.gameName}#${s.tagLine}`, r);
  };

  const showList = open && query.length > 0 && suggestions.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0) choose(suggestions[active]);
      else go(value, region);
    } else if (e.key === "Escape") {
      if (showList) setOpen(false);
      else setValue("");
    }
  };

  const lg = size === "lg";

  return (
    <Floating open={showList} onOpenChange={(o) => !o && setOpen(false)}>
    <div ref={rootRef} role="search" className={cn("relative w-full", className)}>
      <FloatingAnchor asChild>
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-full border bg-surface transition-colors duration-fast",
          "focus-within:border-border-strong focus-within:ring-2 focus-within:ring-ring/60",
          error ? "border-destructive/60" : "border-border hover:border-border-strong",
          lg ? "h-14 pl-5 pr-2.5" : "h-11 pl-4 pr-1.5",
        )}
      >
        {isPending ? (
          <Spinner className={cn("text-muted-foreground", lg && "size-5")} />
        ) : (
          <Search aria-hidden className={cn("shrink-0 text-muted-foreground", lg ? "size-5" : "size-4")} />
        )}
        <input
          role="combobox"
          aria-label={t("label")}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={value}
          placeholder={lg ? t("placeholder") : t("placeholderShort")}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            if (error) setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-foreground placeholder:text-subtle-foreground focus:outline-none",
            lg ? "text-base sm:text-lg" : "text-sm",
          )}
        />
        {query && (
          <kbd
            aria-hidden
            className="hidden h-6 items-center rounded-sm border border-border px-1.5 text-muted-foreground sm:inline-flex"
          >
            <CornerDownLeft className="size-3.5" />
          </kbd>
        )}
        <RegionPicker value={region} onChange={onRegionChange} appearance="pill" />
      </div>
      </FloatingAnchor>

      {error && (
        <p id={errorId} role="alert" className="mt-2 px-5 text-sm text-destructive">
          {error}
        </p>
      )}

      <FloatingContent
        matchAnchorWidth
        align="start"
        onInteractOutside={(e) => {
          // Clicks in the input/pill keep the list open; everything else closes it.
          if (rootRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
          <ul id={listId} role="listbox" aria-label={t("suggestions")}>
            {suggestions.map((s, i) => (
              <li
                key={`${s.region}:${s.gameName}#${s.tagLine}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                onPointerMove={() => setActive(i)}
                className={listOptionClass(i === active)}
              >
                <RegionFlag region={s.region} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{s.gameName}</span>
                  <span className="text-muted-foreground">#{s.tagLine}</span>
                </span>
                <span className="num text-xs text-muted-foreground">{regionShort(s.region)}</span>
              </li>
            ))}
          </ul>
      </FloatingContent>
    </div>
    </Floating>
  );
}
