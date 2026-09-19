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
        className="w-full p-3 transition border-2 border-gray-300 rounded input focus:outline-none focus:border-blue-500"
        type="text"
        placeholder="Riot ID (e.g.: Player#BR1)"
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
      />

      {open && (
        <ul className="absolute z-50 w-full mt-1 overflow-hidden bg-background border rounded-md shadow-lg border-input max-h-64 overflow-y-auto">
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum invocador encontrado no banco.
            </li>
          )}
          {suggestions.map((s, i) => (
            <li key={`${s.region}:${s.gameName}:${s.tagLine}`}>
              <button
                type="button"
                className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-accent/60 ${
                  i === highlight ? "bg-accent/60" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">
                    {s.gameName}
                    <span className="text-muted-foreground">#{s.tagLine}</span>
                  </span>
                </span>
                <span className="flex-shrink-0 text-xs font-semibold text-primary">
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