"use client";

import { useState, useCallback } from "react";
import { SummonerAutocomplete } from "./SummonerAutocomplete";
import type { SummonerSuggestion } from "./SummonerAutocomplete";

interface SummonerSearchBarProps {
  /** Callback quando o usuário faz uma busca */
  onSearch: (riotId: string, region: string) => void;
  /** Região padrão (ex: "BR1") */
  defaultRegion?: string;
  /** Se está carregando */
  isLoading?: boolean;
  /** Mensagem de erro */
  error?: string | null;
  /** Texto do botão de busca */
  searchButtonLabel?: string;
  /** Se deve mostrar apenas a barra de busca (sem botão extra) */
  compactMode?: boolean;
}

export function SummonerSearchBar({
  onSearch,
  defaultRegion = "BR1",
  isLoading = false,
  error = null,
  searchButtonLabel = "→ Search Summoner",
  compactMode = false,
}: SummonerSearchBarProps) {
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState(defaultRegion);

  const handleSearch = useCallback(() => {
    if (!riotId.trim() || !region) return;
    onSearch(riotId, region);
  }, [riotId, region, onSearch]);

  const handleSelectSummoner = useCallback(
    (suggestion: SummonerSuggestion) => {
      const fullRiotId = `${suggestion.gameName}#${suggestion.tagLine}`;
      const regionUp = suggestion.region.toUpperCase();
      setRiotId(fullRiotId);
      setRegion(regionUp);
      // Dispara a busca automaticamente ao selecionar do autocomplete
      onSearch(fullRiotId, regionUp);
    },
    [onSearch]
  );

  if (compactMode) {
    // Modo compacto: apenas a barra com autocomplete e região
    return (
      <div className="flex items-center gap-2 flex-1 max-w-[700px]">
        <SummonerAutocomplete
          value={riotId}
          onChangeValue={setRiotId}
          onSelect={handleSelectSummoner}
          onEnter={handleSearch}
          disabled={isLoading}
        />

        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-24 px-3 py-2 text-sm border rounded-md cursor-pointer border-slate-700 bg-slate-900 text-gray-100 transition-all duration-200 hover:border-slate-600 focus:outline-none focus:border-slate-600"
          disabled={isLoading}
        >
          <option value="">Region</option>
          <optgroup label="AMERICAS">
            <option value="BR1">🇧🇷 Brazil</option>
            <option value="NA1">🇺🇸 North America</option>
            <option value="LA1">🇲🇽 Latin America North</option>
            <option value="LA2">🇦🇷 Latin America South</option>
          </optgroup>
          <optgroup label="EUROPE">
            <option value="EUW1">🇪🇸 Western Europe</option>
            <option value="EUN1">🇸🇪 Northern & Eastern Europe</option>
            <option value="RU">🇷🇺 Russia</option>
            <option value="ME1">🇪🇬 Middle East</option>
            <option value="TR1">🇹🇷 Turkey</option>
          </optgroup>
          <optgroup label="ASIA">
            <option value="KR">🇰🇷 Korea</option>
            <option value="JP1">🇯🇵 Japan</option>
          </optgroup>
          <optgroup label="SOUTH ASIA">
            <option value="OC1">🇦🇺 Oceania</option>
            <option value="TW2">🇹🇼 Taiwan, Hong Kong & Macau</option>
            <option value="VN2">🇻🇳 Vietnam</option>
            <option value="SG2">🇸🇬 Singapore</option>
          </optgroup>
        </select>

        <button
          onClick={handleSearch}
          disabled={isLoading || !riotId.trim() || !region}
          className="px-4 py-2 text-sm font-medium border rounded-md bg-accent border-input hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isLoading ? "⟳" : "→"}
        </button>
      </div>
    );
  }

  // Modo completo: com forma tradicional (home page)
  return (
    <div className="w-full max-w-md">
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded border border-red-800/50 bg-red-950/30 font-medium text-red-400 backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* Summoner Autocomplete */}
        <div className="backdrop-blur-sm">
          <SummonerAutocomplete
            value={riotId}
            onChangeValue={setRiotId}
            onSelect={handleSelectSummoner}
            onEnter={handleSearch}
            disabled={isLoading}
          />
        </div>

        {/* Region Selector */}
        <select
          className="w-full px-4 py-3 font-mono text-sm bg-slate-900 border border-slate-700 rounded-lg text-gray-100 cursor-pointer transition-all duration-200 hover:border-slate-600 focus:outline-none focus:border-slate-600"
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select Region</option>
          <optgroup label="AMERICAS">
            <option value="BR1">🇧🇷 Brazil</option>
            <option value="NA1">🇺🇸 North America</option>
            <option value="LA1">🇲🇽 Latin America North</option>
            <option value="LA2">🇦🇷 Latin America South</option>
          </optgroup>
          <optgroup label="EUROPE">
            <option value="EUW1">🇪🇸 Western Europe</option>
            <option value="EUN1">🇸🇪 Northern & Eastern Europe</option>
            <option value="RU">🇷🇺 Russia</option>
            <option value="ME1">🇪🇬 Middle East</option>
            <option value="TR1">🇹🇷 Turkey</option>
          </optgroup>
          <optgroup label="ASIA">
            <option value="KR">🇰🇷 Korea</option>
            <option value="JP1">🇯🇵 Japan</option>
          </optgroup>
          <optgroup label="SOUTH ASIA">
            <option value="OC1">🇦🇺 Oceania</option>
            <option value="TW2">🇹🇼 Taiwan, Hong Kong & Macau</option>
            <option value="VN2">🇻🇳 Vietnam</option>
            <option value="SG2">🇸🇬 Singapore</option>
          </optgroup>
        </select>

        {/* Search Button */}
        <button
          className="w-full px-4 py-3 font-mono font-semibold text-white bg-slate-800 border border-gray-600 rounded-lg transition-all duration-300 hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
          type="button"
          onClick={handleSearch}
          disabled={isLoading || !riotId.trim() || !region}
        >
          {isLoading ? "⟳ Searching..." : searchButtonLabel}
        </button>
      </div>
    </div>
  );
}