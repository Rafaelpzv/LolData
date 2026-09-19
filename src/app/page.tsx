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
    <div className="flex flex-col min-h-screen">
      <header role="banner" className="w-full">
      </header>

      <main className="flex flex-col items-center justify-center flex-grow p-4" role="main">
        <div id="title" className="mb-8 text-center">
          <h1 className="mb-2 font-mono text-4xl">LoLData</h1>
          <p className="mb-2 text-lg text-gray-600">
            Search for League of Legends or Teamfight Tactics player
            information
          </p>
          {error && (
            <p className="font-medium text-red-500" role="alert" aria-live="assertive">{error}</p>
          )}
        </div>

        <div id="input-container" className="flex flex-col w-full max-w-lg gap-4" role="search" aria-label="Pesquisa de invocador">
          <div className="grid grid-cols-2 gap-2 p-1 border border-gray-300 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('lol')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'lol' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
              }`}
            >
              League of Legends
            </button>
            <button
              type="button"
              onClick={() => setMode('tft')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'tft' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'
              }`}
            >
              Teamfight Tactics
            </button>
          </div>
        <SummonerAutocomplete
          value={riotid}
          onChangeValue={setRiotid}
          onSelect={handleSelectSummoner}
          onEnter={search}
          disabled={isLoading}
        />

        <select
          className="w-full p-3 transition border-2 border-gray-300 rounded cursor-pointer input focus:outline-none focus:border-blue-500"
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option className='cursor-pointer' value="">Region</option>
          <optgroup label="Americas">
            <option className='cursor-pointer' value="BR1">🇧🇷 - Brazil</option>
            <option className='cursor-pointer' value="NA1">🇺🇸 - North America</option>
            <option className='cursor-pointer' value="LA1">🇲🇽 - Latin America North</option>
            <option className='cursor-pointer' value="LA2">🇦🇷 - Latin America South</option>
          </optgroup>
          <optgroup label="Europe">
            <option className='cursor-pointer' value="EUW1">🇪🇸 - Western Europe</option>
            <option className='cursor-pointer' value="EUN1">🇸🇪 - Northern & Eastern Europe</option>
            <option className='cursor-pointer' value="RU">🇷🇺 - Russia</option>
            <option className='cursor-pointer' value="ME1">🇪🇬 - Middle East</option>
            <option className='cursor-pointer' value="TR1">🇹🇷 - Turkey</option>
          </optgroup>
          <optgroup label="Asia">
            <option className='cursor-pointer' value="KR">🇰🇷 - Korea</option>
            <option className='cursor-pointer' value="JP1">🇯🇵 - Japan</option>
          </optgroup>
          <optgroup label="South Asia">
            <option className='cursor-pointer' value="OC1">🇦🇺 - Oceania</option>
            <option className='cursor-pointer' value="TW2">🇹🇼 - Taiwan, Hong Kong & Macau</option>
            <option className='cursor-pointer' value="VN2">🇻🇳 - Vietnam</option>
            <option className='cursor-pointer' value="SG2">🇸🇬 - Singapore</option>
          </optgroup>
        </select>
        <Link
          href="/rankings/soloDuo/BR1/1"
          className="w-full p-3 m-auto transition bg-gray-700 border-2 border-gray-300 rounded input hover:bg-gray-600 focus:outline-none focus:border-blue-500"
        >
          View LoL Rankings
        </Link>
        <Link
          href="/tft/rankings/BR1/1"
          className="w-full p-3 m-auto transition bg-gray-800 border-2 border-gray-300 rounded input hover:bg-gray-700 focus:outline-none focus:border-blue-500"
        >
          View TFT Rankings
        </Link>
        <button
          className="w-full p-3 font-medium text-white transition bg-blue-600 rounded input hover:bg-blue-700 disabled:bg-blue-400"
          id="search_button"
          type="button"
          onClick={search}
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search Summoner'}
        </button>
      </div>
    </main>
    <footer>
      <div className="mt-10 text-center text-gray-500">
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
