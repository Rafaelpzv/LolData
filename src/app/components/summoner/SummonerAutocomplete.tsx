"use client";

import { useEffect, useState } from "react";

export interface SummonerSuggestion {
  region: string;
  gameName: string;
  tagLine: string;
  puuid: string;
}

interface SummonerAutocompleteProps {
  value: string;
  onChangeValue: (value: string) => void;
  onSelect: (suggestion: SummonerSuggestion) => void;
  onEnter: () => void;
  disabled?: boolean;
}

export function SummonerAutocomplete({
  value,
  onChangeValue,
  onSelect,
  onEnter,
  disabled = false,
}: SummonerAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SummonerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
    const q = value.trim();

    const id = setTimeout(async () => {
      if (!q) {
        setSuggestions([]);
        setOpen(false);
        setHighlight(-1);
        return;
      }

      try {
        const res = await fetch(
          `/api/summoners/autocomplete?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data || []);
        setOpen(true);
        setHighlight(-1);
      } catch {
        // falha silenciosa: dropdown apenas fecha
      }
    }, 250);

    return () => clearTimeout(id);
  }, [value]);

  const pick = (s: SummonerSuggestion) => {
    setOpen(false);
    setHighlight(-1);
    onSelect(s);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && open && suggestions.length) {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && open && suggestions.length) {
      event.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (event.key === "Enter") {
      if (open && highlight >= 0 && suggestions[highlight]) {
        event.preventDefault();
        pick(suggestions[highlight]);
      } else {
        setOpen(false);
        onEnter();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full">
      <input
        className="w-full px-4 py-3 font-mono text-sm bg-slate-900 border border-slate-700 rounded-lg text-gray-100 placeholder-gray-400 transition-all duration-200 cursor-text focus:outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
        type="text"
        placeholder="Riot ID (e.g.: Player#BR1)"
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
      />

      {open && (
        <ul className="absolute z-50 w-full mt-1 overflow-hidden bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto backdrop-blur-sm">
          {suggestions.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-400 font-mono">
              Nenhum invocador encontrado no banco.
            </li>
          )}
          {suggestions.map((s, i) => (
            <li key={`${s.region}:${s.gameName}:${s.tagLine}`}>
              <button
                type="button"
                className={`flex items-center justify-between w-full px-4 py-3 text-sm text-left font-mono transition-colors duration-150 ${
                  i === highlight
                    ? "bg-slate-700/60 text-gray-100"
                    : "hover:bg-slate-700/40 text-gray-200"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="min-w-0 truncate">
                  <span className="text-gray-100">
                    {s.gameName}
                    <span className="text-gray-400">#{s.tagLine}</span>
                  </span>
                </span>
                <span className="flex-shrink-0 text-xs font-semibold text-gray-300 ml-2">
                  {s.region.toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
