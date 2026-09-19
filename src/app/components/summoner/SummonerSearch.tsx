"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

interface SummonerSearchProps {
  defaultRegion?: string;
}

export function SummonerSearch({ defaultRegion = "br1" }: SummonerSearchProps) {
  const router = useRouter();
  const [region, setRegion] = useState(defaultRegion);
  const [summonerName, setSummonerName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summonerName.trim()) return;

    // Split the name into gameName and tagLine if it contains #
    const parts = summonerName.split("#");
    const gameName = encodeURIComponent(parts[0].trim());
    const tagLine =
      parts.length > 1 ? encodeURIComponent(parts[1].trim()) : "BR1";
    const regionLower = region.toLowerCase();
    router.push(`/lol/${regionLower}/${gameName}/${tagLine}/all/all`);
  };

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex gap-2">
<Link
        href="/"
        className="inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors border rounded-md bg-background border-input hover:bg-accent/50"
        aria-label="Back to home"
      >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Link>
        <a
          href={`/rankings/soloDuo/${region.toLowerCase()}/1`}
          className="inline-flex px-3 py-2 text-sm transition-colors border rounded-md bg-background border-input hover:bg-accent/50"
        >
          Rankings
        </a>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 flex-1 max-w-[700px]"
      >
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-24 h-10 px-3 py-2 text-sm border rounded-md cursor-pointer border-input bg-background"
        >
          <option className="cursor-pointer" value="">
            Region
          </option>
          <optgroup label="Americas">
            <option className="cursor-pointer" value="BR1">
              ðŸ‡§ðŸ‡· - Brazil
            </option>
            <option className="cursor-pointer" value="NA1">
              ðŸ‡ºðŸ‡¸ - North America
            </option>
            <option className="cursor-pointer" value="LA1">
              ðŸ‡²ðŸ‡½ - Latin America North
            </option>
            <option className="cursor-pointer" value="LA2">
              ðŸ‡¦ðŸ‡· - Latin America South
            </option>
          </optgroup>
          <optgroup label="Europe">
            <option className="cursor-pointer" value="EUW1">
              ðŸ‡ªðŸ‡¸ - Western Europe
            </option>
            <option className="cursor-pointer" value="EUN1">
              ðŸ‡¸ðŸ‡ª - Northern & Eastern Europe
            </option>
            <option className="cursor-pointer" value="RU">
              ðŸ‡·ðŸ‡º - Russia
            </option>
            <option className="cursor-pointer" value="ME1">
              ðŸ‡ªðŸ‡¬ - Middle East
            </option>
            <option className="cursor-pointer" value="TR1">
              ðŸ‡¹ðŸ‡· - Turkey
            </option>
          </optgroup>
          <optgroup label="Asia">
            <option className="cursor-pointer" value="KR">
              ðŸ‡°ðŸ‡· - Korea
            </option>
            <option className="cursor-pointer" value="JP1">
              ðŸ‡¯ðŸ‡µ - Japan
            </option>
          </optgroup>
          <optgroup label="South Asia">
            <option className="cursor-pointer" value="OC1">
              ðŸ‡¦ðŸ‡º - Oceania
            </option>
            <option className="cursor-pointer" value="TW2">
              ðŸ‡¹ðŸ‡¼ - Taiwan, Hong Kong & Macau
            </option>
            <option className="cursor-pointer" value="VN2">
              ðŸ‡»ðŸ‡³ - Vietnam
            </option>
            <option className="cursor-pointer" value="SG2">
              ðŸ‡¸ðŸ‡¬ - Singapore
            </option>
          </optgroup>
        </select>
        <div className="relative flex-1">
          <input
            type="text"
            value={summonerName}
            onChange={(e) => setSummonerName(e.target.value)}
            placeholder="Riot#ID"
            className="w-full h-10 px-3 py-2 text-sm border rounded-md focus:outline-none border-input bg-background"
            required
          />
        </div>
        <button
          type="submit"
          className="h-10 px-4 py-2 text-sm font-medium border rounded-md bg-accent border-input hover:bg-accent/80"
        >
          Search
        </button>
      </form>
    </div>
  );
}
