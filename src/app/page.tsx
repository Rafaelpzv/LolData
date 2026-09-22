'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Gamepad2, Sword } from 'lucide-react';
import { useSearchHandler } from './searchHandler';
import { FlipText } from './components/block/flip-text';
import { CircleMenu } from './components/block/circle-menu';
import {
  AppleSpotlight,
  type RegionOption,
} from './components/block/apple-spotlight';

const REGIONS: RegionOption[] = [
  { value: 'BR1', label: 'Brazil', countryCode: 'BR' },
  { value: 'NA1', label: 'North America', countryCode: 'US' },
  { value: 'LA1', label: 'Latin America North', countryCode: 'MX' },
  { value: 'LA2', label: 'Latin America South', countryCode: 'AR' },
  { value: 'EUW1', label: 'Western Europe', countryCode: 'EU' },
  { value: 'EUN1', label: 'Northern & Eastern Europe', countryCode: 'SE' },
  { value: 'RU', label: 'Russia', countryCode: 'RU' },
  { value: 'ME1', label: 'Middle East', countryCode: 'EG' },
  { value: 'TR1', label: 'Turkey', countryCode: 'TR' },
  { value: 'KR', label: 'Korea', countryCode: 'KR' },
  { value: 'JP1', label: 'Japan', countryCode: 'JP' },
  { value: 'OC1', label: 'Oceania', countryCode: 'AU' },
  { value: 'TW2', label: 'Taiwan, Hong Kong & Macau', countryCode: 'TW' },
  { value: 'VN2', label: 'Vietnam', countryCode: 'VN' },
  { value: 'SG2', label: 'Singapore', countryCode: 'SG' },
];

const Home: React.FC = () => {
  const [mode, setMode] = useState<'lol' | 'tft'>('lol');
  const [region, setRegion] = useState('BR1');

  const { handleSearch, isLoading, error } = useSearchHandler();

  const onSpotlightSearch = useCallback(
    async (riotId: string, r: string, m: 'lol' | 'tft') => {
      await handleSearch(riotId, r, m);
    },
    [handleSearch]
  );

  const modeItems = [
    {
      label: 'League of Legends',
      icon: <Sword className="size-5" />,
      onClick: () => setMode('lol'),
    },
    {
      label: 'Teamfight Tactics',
      icon: <Gamepad2 className="size-5" />,
      onClick: () => setMode('tft'),
    },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-black" />

        <div className="absolute top-0 right-0 -z-10 h-96 w-96 rounded-full bg-slate-700 blur-3xl opacity-15" />

        <div className="absolute bottom-0 left-0 -z-10 h-96 w-96 rounded-full bg-slate-800 blur-3xl opacity-10" />
      </div>

      <main
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6"
        role="main"
      >
        {/* Header */}
        <div className="mb-12 w-full max-w-3xl text-center">
          <h1 className="mb-7 font-mono text-4xl font-bold tracking-tight text-white">
            <FlipText>LoLData</FlipText>
          </h1>

          <p className="mb-7 font-mono text-xs uppercase tracking-[0.08em] text-gray-400">
            {mode === 'lol'
              ? 'LEAGUE OF LEGENDS PLAYER ANALYTICS'
              : 'TEAMFIGHT TACTICS PLAYER ANALYTICS'}
          </p>

          <p className="font-mono text-base text-gray-300">
            Search for player statistics, rank progression, and match history
          </p>
        </div>

        {/* Controls */}
        <div
          className="flex w-full max-w-[895px] flex-col items-center gap-8"
          role="search"
          aria-label="Pesquisa de invocador"
        >
          {/* Mode Selector */}
          <div className="flex flex-col items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">
              Mode
            </p>

            <CircleMenu
              items={modeItems}
              openIcon={
                mode === 'lol' ? (
                  <Sword size={18} className="text-white" />
                ) : (
                  <Gamepad2 size={18} className="text-white" />
                )
              }
            />
          </div>

          {/* Apple Spotlight */}
          <AppleSpotlight
            isOpen={true}
            handleClose={() => {}}
            mode={mode}
            region={region}
            onRegionChange={setRegion}
            regions={REGIONS}
            onSearch={onSpotlightSearch}
            isLoading={isLoading}
            error={error}
            isPositionFixed={false}
          />

          {/* Error Message */}
          {error && (
            <div
              className="
                max-w-[895px]
                rounded-lg
                border
                border-red-800/50
                bg-red-950/30
                px-4
                py-3
                text-sm
                font-medium
                text-red-400
              "
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          {/* Rankings Links */}
          <div className="flex w-full max-w-[895px] flex-col gap-4">
            {mode === 'lol' && (
              <Link
                href={`/rankings/soloDuo/${region}/1`}
                className="
                  flex
                  h-[50px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-lg
                  border
                  border-slate-700
                  bg-[#050505]
                  font-mono
                  text-sm
                  font-semibold
                  text-white
                  transition-all
                  duration-200
                  hover:border-slate-500
                  hover:bg-slate-900
                "
              >
                <span>→</span>
                <span>View LoL Rankings</span>
              </Link>
            )}

            {mode === 'tft' && (
              <Link
                href={`/tft/rankings/${region}/1`}
                className="
                  flex
                  h-[50px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-lg
                  border
                  border-slate-700
                  bg-[#050505]
                  font-mono
                  text-sm
                  font-semibold
                  text-white
                  transition-all
                  duration-200
                  hover:border-slate-500
                  hover:bg-slate-900
                "
              >
                <span>→</span>
                <span>View TFT Rankings</span>
              </Link>
            )}
          </div>
        </div>
      </main>

      <footer className="pointer-events-none absolute bottom-3 left-0 right-0 px-4">
        <div className="mx-auto max-w-4xl text-center font-mono text-[9px] text-gray-600">
          <p>
            LoLData is not endorsed by Riot Games and does not reflect the views
            or opinions of Riot Games or anyone officially involved in the
            production or management of League of Legends.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;