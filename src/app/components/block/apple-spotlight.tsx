'use client';

import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AR,
  AU,
  BR,
  EG,
  EU,
  JP,
  KR,
  MX,
  RU,
  SE,
  SG,
  TR,
  TW,
  US,
  VN,
} from 'country-flag-icons/react/3x2';

type Mode = 'lol' | 'tft';

export interface Shortcut {
  label: string;
  icon: React.ReactNode;
  link?: string;
  onClick?: () => void;
  active?: boolean;
}

export interface RegionOption {
  value: string;
  label: string;
  countryCode: string;
}

const FLAGS: Record<string, React.ComponentType<{ className?: string }>> = {
  AR,
  AU,
  BR,
  EG,
  EU,
  JP,
  KR,
  MX,
  RU,
  SE,
  SG,
  TR,
  TW,
  US,
  VN,
};

interface SummonerSuggestion {
  region: string;
  gameName: string;
  tagLine: string;
  puuid: string;
}

interface SearchResult {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  isLast: boolean;
}

interface AppleSpotlightProps {
  shortcuts?: Shortcut[];
  isOpen?: boolean;
  handleClose?: () => void;
  mode?: Mode;
  region?: string;
  onRegionChange?: (region: string) => void;
  regions?: RegionOption[];
  onSearch?: (riotId: string, region: string, mode: Mode) => void;
  isLoading?: boolean;
  error?: string | null;
  isPositionFixed?: boolean;
}

const SVGFilter = () => (
  <svg width="0" height="0">
    <filter id="blob">
      <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
      <feColorMatrix
        values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -9"
        result="blob"
      />
      <feBlend in="SourceGraphic" in2="blob" />
    </filter>
  </svg>
);

const ShortcutButton = ({ shortcut }: { shortcut: Shortcut }) => {
  const cls = cn(
    'rounded-full cursor-pointer transition-[opacity,shadow] duration-200',
    shortcut.active
      ? 'opacity-100 shadow-lg'
      : 'opacity-30 hover:opacity-100 hover:shadow-lg'
  );
  const body = (
    <div className="size-16 aspect-square flex items-center justify-center">
      {shortcut.icon}
    </div>
  );

  if (shortcut.onClick) {
    return (
      <button
        type="button"
        onClick={shortcut.onClick}
        aria-label={shortcut.label}
        title={shortcut.label}
        className="m-0 border-0 bg-transparent p-0"
      >
        <div className={cls}>{body}</div>
      </button>
    );
  }

  return (
    <a
      href={shortcut.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={shortcut.label}
      title={shortcut.label}
    >
      <div className={cls}>{body}</div>
    </a>
  );
};

const SpotlightPlaceholder = ({ text, className }: { text: string; className?: string }) => (
  <motion.div
    layout
    className={cn(
      'absolute text-gray-500 flex items-center pointer-events-none z-10',
      className
    )}
  >
    <AnimatePresence mode="popLayout">
      <motion.p
        layoutId={`placeholder-${text}`}
        key={`placeholder-${text}`}
        initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {text}
      </motion.p>
    </AnimatePresence>
  </motion.div>
);

const RegionSelect = ({
  regions,
  value,
  onChange,
}: {
  regions: RegionOption[];
  value: string;
  onChange: (region: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = regions.find((r) => r.value === value) ?? regions[0];
  const CurrentFlag = current ? FLAGS[current.countryCode] : undefined;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-label="Select server"
        className="flex items-center gap-2 h-10 pl-3 pr-3 text-sm font-medium text-gray-200 bg-slate-800/80 border border-slate-700 rounded-full transition-colors hover:bg-slate-700"
      >
        {CurrentFlag ? (
          <CurrentFlag className="w-6 h-4 rounded-[2px] flex-shrink-0" />
        ) : null}
        <span className="font-mono">{current.value}</span>
        <ChevronDown
          className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 max-h-72 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-1 shadow-xl shadow-black/50"
          >
            {regions.map((r) => {
              const Flag = FLAGS[r.countryCode];
              return (
                <li key={r.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(r.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 text-left text-sm rounded-xl text-gray-200 transition-colors hover:bg-slate-800',
                      r.value === value && 'bg-slate-800 font-semibold text-white'
                    )}
                  >
                    {Flag ? (
                      <Flag className="w-6 h-4 rounded-[2px] flex-shrink-0" />
                    ) : null}
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-xs font-mono text-gray-500">{r.value}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

const SpotlightInput = ({
  placeholder,
  hidePlaceholder,
  value,
  onChange,
  onKeyDown,
  placeholderClassName,
  inputRef,
  focused,
  regions,
  region,
  onRegionChange,
}: {
  placeholder: string;
  hidePlaceholder: boolean;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholderClassName?: string;
  inputRef: React.RefObject<HTMLInputElement>;
  focused?: boolean;
  regions: RegionOption[];
  region: string;
  onRegionChange: (region: string) => void;
}) => {
  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused, inputRef]);

  return (
    <div className="flex items-center w-full justify-start gap-2 px-6 h-16">
      <motion.div layoutId="search-icon">
        <Search className="size-7" />
      </motion.div>
      <div className="flex-1 relative text-2xl">
        {!hidePlaceholder && (
          <SpotlightPlaceholder text={placeholder} className={placeholderClassName} />
        )}
        <motion.input
          ref={inputRef}
          layout="position"
          type="text"
          aria-label="Search shortcuts"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent outline-none ring-none"
        />
      </div>
      <RegionSelect regions={regions} value={region} onChange={onRegionChange} />
    </div>
  );
};

const SearchResultCard = ({
  icon,
  label,
  description,
  onClick,
  isLast,
}: SearchResult) => (
  <button
    type="button"
    onClick={onClick}
    className="overflow-hidden w-full group/card text-left cursor-pointer"
  >
    <div
      className={cn(
        'flex items-center text-gray-100 justify-start hover:bg-slate-800 gap-3 py-2 px-2 rounded-xl w-full',
        isLast && 'rounded-b-[30px]'
      )}
    >
      <div className="size-8 [&_svg]:stroke-[1.5] [&_svg]:size-6 aspect-square flex items-center justify-center">
        {icon}
      </div>
      <div className="flex flex-col">
        <p className="font-medium">{label}</p>
        <p className="text-xs opacity-50">{description}</p>
      </div>
      <div className="flex-1 flex items-center justify-end opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
        <ChevronRight className="size-6" />
      </div>
    </div>
  </button>
);

const SearchResultsContainer = ({
  results,
  onHover,
}: {
  results: SearchResult[];
  onHover: (index: number | null) => void;
}) => (
  <motion.div
    layout
    onMouseLeave={() => onHover(null)}
    className="absolute top-full left-0 mt-1 px-2 border-t border-slate-700 flex flex-col bg-slate-900 max-h-80 overflow-y-auto w-full py-2 z-50"
  >
    {results.map((result, index) => (
      <motion.div
        key={`search-result-${index}`}
        onMouseEnter={() => onHover(index)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          delay: Math.min(index * 0.05, 0.4),
          duration: 0.2,
          ease: 'easeOut',
        }}
      >
        <SearchResultCard {...result} />
      </motion.div>
    ))}
  </motion.div>
);
export function AppleSpotlight({
  shortcuts = [],
  isOpen = true,
  handleClose = () => {},
  mode = 'lol',
  region = 'BR1',
  onRegionChange,
  regions = [],
  onSearch,
  isLoading = false,
  error = null,
  isPositionFixed = true,
}: AppleSpotlightProps) {
  const [hovered, setHovered] = useState(false);
  const [hoveredSearchResult, setHoveredSearchResult] = useState<number | null>(null);
  const [hoveredShortcut, setHoveredShortcut] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState<SummonerSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setSearchValue('');
    setSuggestions([]);
    handleClose();
  }, [handleClose]);

  useEffect(() => {
    const q = searchValue.trim();
    let cancelled = false;

    const id = setTimeout(async () => {
      if (!q) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/summoners/autocomplete?q=${encodeURIComponent(q)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [searchValue]);

  const submit = useCallback(
    (riotId: string, r = region) => {
      if (!riotId.trim()) return;
      onSearch?.(riotId.trim(), r, mode);
      close();
    },
    [onSearch, region, mode, close]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit(searchValue);
    if (e.key === 'Escape') close();
  };

  const q = searchValue.trim();

  const results: SearchResult[] = [];
  if (q) {
    results.push({
      icon: <Search />,
      label: `Search for "${q}"`,
      description: `in ${mode.toUpperCase()} · ${region}`,
      onClick: () => submit(q),
      isLast: suggestions.length === 0,
    });
    suggestions.forEach((s, index) => {
      results.push({
        icon: <Search />,
        label: `${s.gameName}#${s.tagLine}`,
        description: `${s.region.toUpperCase()} server`,
        onClick: () => submit(`${s.gameName}#${s.tagLine}`, s.region),
        isLast: index === suggestions.length - 1,
      });
    });
  }

  const activePlaceholder =
    hoveredShortcut !== null && shortcuts[hoveredShortcut]
      ? shortcuts[hoveredShortcut].label
      : hoveredSearchResult !== null && results[hoveredSearchResult]
        ? results[hoveredSearchResult].label
        : 'Search Summoner';

  const hidePlaceholder = hoveredSearchResult === null && searchValue !== '';

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: -10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scaleX: 1, scaleY: 1, y: 0 }}
          exit={{ opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: 10 }}
          transition={{ stiffness: 550, damping: 50, type: 'spring' }}
          className={`${isPositionFixed ? 'fixed inset-0 justify-center' : 'w-full justify-start'} z-50 flex flex-col items-center`}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Summoner search spotlight"
        >
          <SVGFilter />
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false);
              setHoveredShortcut(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full flex items-center justify-end gap-4 z-20 group',
              '[&>div]:bg-slate-900/90 [&>div]:text-gray-100 [&>div]:rounded-full [&>div]:backdrop-blur-xl',
              'max-w-3xl'
            )}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                layoutId="search-input-container"
                transition={{ layout: { duration: 0.5, type: 'spring', bounce: 0.2 } }}
                style={{ borderRadius: '30px' }}
                className="h-full w-full flex flex-col items-center justify-start z-10 relative shadow-lg shadow-black/40 border border-slate-700"
              >
                <SpotlightInput
                  placeholder={activePlaceholder}
                  placeholderClassName={hoveredSearchResult !== null ? 'text-gray-100 bg-slate-800' : 'text-gray-500'}
                  hidePlaceholder={hidePlaceholder}
                  value={searchValue}
                  onChange={setSearchValue}
                  onKeyDown={handleKeyDown}
                  inputRef={inputRef}
                  focused={isOpen}
                  regions={regions}
                  region={region}
                  onRegionChange={onRegionChange ?? (() => {})}
                />
                {error && (
                  <div className="px-6 pb-3 w-full text-sm text-red-400 font-medium">
                    {error}
                  </div>
                )}
                {q && !isLoading && (
                  <SearchResultsContainer results={results} onHover={setHoveredSearchResult} />
                )}
                {isLoading && (
                  <div className="px-2 w-full py-8 text-center text-sm text-gray-400">
                    Searching…
                  </div>
                )}
              </motion.div>
              {hovered &&
                !q &&
                shortcuts.map((shortcut, index) => (
                  <motion.div
                    key={`shortcut-${index}`}
                    onMouseEnter={() => setHoveredShortcut(index)}
                    layout
                    initial={{ scale: 0.7, x: -1 * (64 * (index + 1)) }}
                    animate={{ scale: 1, x: 0 }}
                    exit={{
                      scale: 0.7,
                      x: 1 * (16 * (shortcuts.length - index - 1) + 64 * (shortcuts.length - index - 1)),
                    }}
                    transition={{ duration: 0.8, type: 'spring', bounce: 0.2, delay: index * 0.05 }}
                    className="rounded-full cursor-pointer"
                  >
                    <ShortcutButton shortcut={shortcut} />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AppleSpotlight;
