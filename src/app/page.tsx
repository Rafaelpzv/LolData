  // Home.tsx
  'use client';

  import React, { useState } from 'react';
  import Link from 'next/link';
  import { useSearchHandler } from './searchHandler';
  import { SummonerAutocomplete } from './components/summoner/SummonerAutocomplete';
  import type { SummonerSuggestion } from './components/summoner/SummonerAutocomplete';

  /**
  * Home page component
  * Implements the Single Responsibility Principle (S of SOLID)
  */
  const Home: React.FC = () => {
    // Local state for form
    const [riotid, setRiotid] = useState<string>('');
    const [region, setRegion] = useState<string>('');
    const [mode, setMode] = useState<'lol' | 'tft'>('lol');

    // Custom hook for search
    const { handleSearch, isLoading, error } = useSearchHandler();

    /**
    * Performs the search when called
    */
    const search = () => {
      // Start new search
      handleSearch(riotid, region, mode);
    };

    /**
    * Callback do autocomplete: preenche o input + região e já busca
    */
    const handleSelectSummoner = (suggestion: SummonerSuggestion) => {
      const fullRiotId = `${suggestion.gameName}#${suggestion.tagLine}`;
      const regionUp = suggestion.region.toUpperCase();
      setRiotid(fullRiotId);
      setRegion(regionUp);
      handleSearch(fullRiotId, regionUp, mode);
    };

    return (
      <div className="relative flex flex-col min-h-screen overflow-hidden">
        {/* Background com gradiente */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-black" />
          <div className="absolute top-0 right-0 w-96 h-96 -z-10 opacity-15 blur-3xl rounded-full bg-slate-700" />
          <div className="absolute bottom-0 left-0 w-96 h-96 -z-10 opacity-10 blur-3xl rounded-full bg-slate-800" />
        </div>

        <main className="flex flex-col items-center justify-center flex-grow p-4 relative z-10" role="main">
          <div id="title" className="mb-12 text-center max-w-2xl">
            <h1 className="font-mono text-5xl font-bold text-white tracking-tighter mb-8">LoLData</h1>
            <p className="text-base font-mono text-gray-400 mb-6">
              {mode === 'lol'
                ? 'LEAGUE OF LEGENDS PLAYER ANALYTICS'
                : 'TEAMFIGHT TACTICS PLAYER ANALYTICS'}
            </p>
            <p className="text-lg text-gray-300 mb-8">
              Search for player statistics, rank progression, and match history
            </p>
            {error && (
              <p className="font-medium text-red-400 bg-red-950/30 px-4 py-3 rounded border border-red-800/50 backdrop-blur-sm"
                role="alert"
                aria-live="assertive">
                {error}
              </p>
            )}
          </div>

          <div id="input-container"
              className="flex flex-col w-full max-w-md gap-6"
              role="search"
              aria-label="Pesquisa de invocador">

            {/* Mode Selector */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMode('lol')}
                className={`flex-1 px-4 py-3 font-mono text-sm font-semibold rounded-lg transition-all duration-300 border ${
                  mode === 'lol'
                  ? 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                  : 'bg-background text-gray-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                LoL
              </button>
              <button
                type="button"
                onClick={() => setMode('tft')}
                className={`flex-1 px-4 py-3 font-mono text-sm font-semibold rounded-lg transition-all duration-300 border ${
                  mode === 'tft'
                  ? 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                  : 'bg-background text-gray-300 border-slate-700 hover:bg-slate-900'
                }`}
              >
                TFT
              </button>
            </div>

            {/* Summoner Autocomplete */}
            <div className="backdrop-blur-sm">
              <SummonerAutocomplete
                value={riotid}
                onChangeValue={setRiotid}
                onSelect={handleSelectSummoner}
                onEnter={search}
                disabled={isLoading}
              />
            </div>

            {/* Region Selector */}
            <select
              className="w-full px-4 py-3 font-mono text-sm bg-slate-900 border border-slate-700 rounded-lg text-gray-100 cursor-pointer transition-all duration-200 hover:border-slate-600 focus:outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-600/20"
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
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
              className="w-full px-4 py-3 font-mono font-semibold text-white bg-slate-800 border border-gray-600 rounded-lg transition-all duration-300 hover:bg-gray-700 disabled:bg-gray-500"
              id="search_button"
              type="button"
              onClick={search}
              disabled={isLoading}
            >
              {isLoading ? '⟳ Searching...' : '→ Search Summoner'}
            </button>

            {/* Conditional Rankings Links */}
            {mode === 'lol' && (
              <Link
                href="/rankings/soloDuo/BR1/1"
                className="w-full px-4 py-3 font-mono font-semibold text-white rounded-lg transition-all duration-300 border bg-background border-slate-700 hover:bg-slate-900 text-center"
              >
                → View LoL Rankings
              </Link>
            )}

            {mode === 'tft' && (
              <Link
                href="/tft/rankings/BR1/1"
                className="w-full px-4 py-3 font-mono font-semibold text-white rounded-lg transition-all duration-300 border bg-background border-slate-700 hover:bg-slate-900 text-center"
              >
                → View TFT Rankings
              </Link>
            )}
          </div>
        </main>

        <footer className="relative z-10 py-8 px-4">
          <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm font-mono">
            <p>
              LoLData is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games
              or anyone officially involved in the production or management of League of Legends.
            </p>
          </div>
        </footer>
      </div>
    );
  };

  export default Home;
