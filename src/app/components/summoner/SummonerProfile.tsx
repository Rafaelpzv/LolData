"use client";

import { Card } from "../ui/Card";
import Image from "next/image";
import getChampionNameById from "../match/MatchFilter";

interface ChampionMastery {
  championId: number;
  level: number;
  points: number;
}

interface SummonerProfileProps {
  name: string;
  gameName?: string;
  tagLine?: string;
  level: number;
  profileIconId: number;
  region: string;
  masteries: ChampionMastery[];
  eloSoloq?: string | null;
  eloFlex?: string | null;
  lpSoloq?: number | null;
  lpFlex?: number | null;
  winsSoloq?: number | null;
  winsFlex?: number | null;
  losesSoloq?: number | null;
  losesFlex?: number | null;
}

export function SummonerProfile({
  name,
  gameName,
  tagLine,
  level,
  profileIconId,
  region,
  masteries,
  eloSoloq,
  eloFlex,
  lpSoloq,
  lpFlex,
  winsSoloq,
  winsFlex,
  losesSoloq,
  losesFlex,
}: SummonerProfileProps) {
  // Determinar o nome de display - usar gameName+tagLine se disponível, senão usar name
  const displayName =
    gameName?.replace(/\s+/g, " ") && tagLine
      ? `${gameName.replace(/\s+/g, " ")}#${tagLine}`
      : name || "Carregando...";

  const winrateSoloq =
    (winsSoloq ?? 0) + (losesSoloq ?? 0) > 0
      ? ((winsSoloq ?? 0) / ((winsSoloq ?? 0) + (losesSoloq ?? 0))) * 100
      : null;
  const winrateFlex =
    (winsFlex ?? 0) + (losesFlex ?? 0) > 0
      ? ((winsFlex ?? 0) / ((winsFlex ?? 0) + (losesFlex ?? 0))) * 100
      : null;
  // Função para obter URL do ícone do tier
  const getTierIconUrl = (elo: string | null) => {
    if (!elo) return null;

    // Extrair o tier da string de elo (ex: "Diamond II" -> "diamond")
    const tier = elo.split(" ")[0].toLowerCase();

    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier}.svg`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24">
          <Image
            src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${profileIconId}.jpg`}
            alt={`${displayName}'s profile icon`}
            fill={true}
            sizes="80px"
            priority
            className="object-cover border-4 rounded-full border-accent"
          />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium">
            {level}
          </div>
        </div>

        <div className="flex-1">
          <h1 className="mb-2 text-3xl font-bold text-primary">
            {displayName}
          </h1>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Region: {region}</p>
            {eloSoloq && (
              <p className="flex items-center gap-1 text-sm">
                <span className="font-medium">Solo/Duo:</span>
                {getTierIconUrl(eloSoloq) && (
                  <Image
                    src={getTierIconUrl(eloSoloq)!}
                    alt={`${eloSoloq} tier`}
                    width={20}
                    height={20}
                    priority
                    className="inline-block"
                  />
                )}
                <span>
                  {eloSoloq}{" "}
                  {lpSoloq !== null &&
                    lpSoloq !== undefined &&
                    `(${lpSoloq} LP)`}{" "}
                  -{" "}
                  {winsSoloq !== null &&
                    winsSoloq !== undefined &&
                    `(${winsSoloq}-${losesSoloq})`}{" "}
                  - {winrateSoloq?.toFixed(2)}%
                </span>
              </p>
            )}
            {eloFlex && (
              <p className="flex items-center gap-1 text-sm">
                <span className="font-medium">Flex:</span>
                {getTierIconUrl(eloFlex) && (
                  <Image
                    src={getTierIconUrl(eloFlex)!}
                    alt={`${eloFlex} tier`}
                    width={20}
                    height={20}
                    priority
                    className="inline-block"
                  />
                )}
                <span>
                  {eloFlex}{" "}
                  {lpFlex !== null && lpFlex !== undefined && `(${lpFlex} LP)`}{" "}
                  -{" "}
                  {winsFlex !== null &&
                    winsFlex !== undefined &&
                    `(${winsFlex}-${losesFlex})`}{" "}
                  - {winrateFlex?.toFixed(2)}%
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">      
        {masteries.map((champion) => (
          <Card
            key={champion.championId}
            className="overflow-hidden transition-all duration-200 hover:scale-105 hover:shadow-lg cursor-pointer"
          >
            <div className="flex flex-col items-center gap-2 p-4">
              <div className="relative w-16 h-16">
                <Image
                  src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${champion.championId}.png`}
                  alt={getChampionNameById(champion.championId)}
                  fill={true}
                  sizes="64px"
                  priority
                  className="object-cover object-top border-4 rounded-full border-accent/50"
                  style={{
                    clipPath: "inset(10% 10% round 50%)", // Adjust this if needed
                  }}
                />

                <div className="absolute flex items-center justify-center w-6 h-6 text-xs font-medium border rounded-full -bottom-1 -right-1 border-accent/50 bg-background">
                  {champion.level}
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {getChampionNameById(champion.championId)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {champion.points
                    .toString()
                    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{" "}
                  pts
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
