"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { Gamepad2, Sword } from "lucide-react";
import { AppleSpotlight, type RegionOption } from "@/app/components/block/apple-spotlight";

const REGIONS: RegionOption[] = [
  { value: "BR1", label: "Brazil", countryCode: "BR" },
  { value: "NA1", label: "North America", countryCode: "US" },
  { value: "LA1", label: "Latin America North", countryCode: "MX" },
  { value: "LA2", label: "Latin America South", countryCode: "AR" },
  { value: "EUW1", label: "Western Europe", countryCode: "EU" },
  { value: "EUN1", label: "Northern & Eastern Europe", countryCode: "SE" },
  { value: "RU", label: "Russia", countryCode: "RU" },
  { value: "ME1", label: "Middle East", countryCode: "EG" },
  { value: "TR1", label: "Turkey", countryCode: "TR" },
  { value: "KR", label: "Korea", countryCode: "KR" },
  { value: "JP1", label: "Japan", countryCode: "JP" },
  { value: "OC1", label: "Oceania", countryCode: "AU" },
  { value: "TW2", label: "Taiwan, Hong Kong & Macau", countryCode: "TW" },
  { value: "VN2", label: "Vietnam", countryCode: "VN" },
  { value: "SG2", label: "Singapore", countryCode: "SG" },
];

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

  const [mode] = useState<"lol" | "tft">("lol");
  const [region, setRegion] = useState(defaultRegion);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = (riotId: string, region: string) => {
    const parts = riotId.split("#");

    const gameName = encodeURIComponent(parts[0].trim());

    const tagLine =
      parts.length > 1
        ? encodeURIComponent(parts[1].trim())
        : region.toUpperCase();

    const regionLower = region.toLowerCase();

    router.push(
      `/lol/${regionLower}/${gameName}/${tagLine}/all/all`
    );
  };

  const onSpotlightSearch = useCallback(
    async (riotId: string, r: string, m: "lol" | "tft") => {
      setIsLoading(true);
      setError(null);

      try {
        handleSearch(riotId, r);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao buscar"
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const modeItems = [
    {
      label: "League of Legends",
      icon: <Sword className="size-5" />,
      onClick: () => {},
    },
    {
      label: "Teamfight Tactics",
      icon: <Gamepad2 className="size-5" />,
      onClick: () => {},
    },
  ];

  return (
    <>
      <header
        role="banner"
        className="w-full sticky top-0 z-40 backdrop-blur-md border-b border-slate-700/50"
      >
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
                    {/* Apple Spotlight permanente */}

            </div>
            	      <div className="w-full">
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
	      </div>
              <Link
                href={`/rankings/soloDuo/${defaultRegion.toUpperCase()}/1`}
                className="px-3 py-2 text-sm font-mono border rounded-md bg-background border-slate-700 text-gray-100 hover:bg-slate-800 transition-all duration-200"
              >
                → Rankings
              </Link>

          </div>
        </nav>
      </header>
    </>
  );
}
