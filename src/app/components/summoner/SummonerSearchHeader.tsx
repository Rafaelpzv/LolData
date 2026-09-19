"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SummonerSearchBar } from "./SummonerSearchBar";

interface SummonerSearchHeaderProps {
  defaultRegion: string;
}

/**
 * Client Component para o header de busca na Profile Page
 * Encapsula a lógica de navegação com useRouter
 */
export function SummonerSearchHeader({
  defaultRegion,
}: SummonerSearchHeaderProps) {
  const router = useRouter();

  const handleSearch = (riotId: string, region: string) => {
    const parts = riotId.split("#");
    const gameName = encodeURIComponent(parts[0].trim());
    const tagLine =
      parts.length > 1
        ? encodeURIComponent(parts[1].trim())
        : region.toUpperCase();
    const regionLower = region.toLowerCase();

    router.push(`/lol/${regionLower}/${gameName}/${tagLine}/all/all`);
  };

  return (
    <header role="banner" className="w-full sticky top-0 z-50 backdrop-blur-md border-b border-slate-700/50">
      <nav
        role="navigation"
        aria-label="Pesquisa de invocador"
        className="p-4"
      >
        <div className="w-full flex justify-between items-center">
          {/* Botões Esquerda */}
          <div className="flex gap-2">
            <Link
              href="/"
              className="px-3 py-2 text-sm font-mono border rounded-md bg-background border-slate-700 text-gray-100 hover:bg-slate-800 transition-all duration-200"
            >
              ← Home
            </Link>
            <Link
              href={`/rankings/soloDuo/${defaultRegion.toUpperCase()}/1`}
              className="px-3 py-2 text-sm font-mono border rounded-md bg-background border-slate-700 text-gray-100 hover:bg-slate-800 transition-all duration-200"
            >
              Rankings →
            </Link>
          </div>

          {/* Search Bar Direita */}
          <div className="flex justify-end items-center pr-4">
            <SummonerSearchBar
              onSearch={handleSearch}
              defaultRegion={defaultRegion}
              isLoading={false}
              searchButtonLabel="Search"
              compactMode={true}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}