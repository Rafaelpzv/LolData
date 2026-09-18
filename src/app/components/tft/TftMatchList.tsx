"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card } from "../ui/Card";
import { WinrateCard } from "../winrate/WinrateCard";

interface TftTrait {
  name: string;
  num_units: number;
  style: number;
  tier_current: number;
  tier_total: number;
}

interface TftUnit {
  character_id: string;
  items: number[];
  level: number;
  name: string;
  rarity: number;
  tier: number;
}

interface TftParticipant {
  puuid: string;
  placement: number;
  level: number;
  gold_left: number;
  last_round: number;
  total_damage_to_players: number;
  players_eliminated: number;
  augments: string[];
  traits: TftTrait[];
  units: TftUnit[];
}

interface TftMatch {
  metadata: {
    match_id: string;
    participants: string[];
  };
  info: {
    game_datetime: number;
    game_length: number;
    game_version: string;
    queue_id: number;
    tft_game_type: string;
    tft_set_number: number;
    participants: TftParticipant[];
  };
}

interface TftMatchListProps {
  matches: TftMatch[];
  puuid: string;
  region: string;
}

const TRAIT_STYLES: Record<number, string> = {
  0: "text-gray-400",
  1: "text-orange-300",
  2: "text-yellow-300",
  3: "text-blue-300",
  4: "text-fuchsia-300",
};

function getTierIconUrl(tier: string) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function TftMatchList({ matches, puuid, region }: TftMatchListProps) {
  const [leagueVersion, setLeagueVersion] = useState<string | null>(null);
  const [loadedMatches, setLoadedMatches] = useState<TftMatch[]>(matches);
  const [start, setStart] = useState(matches.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(matches.length >= 10);

  const startRef = useRef(start);
  startRef.current = start;
  const loadingRef = useRef(false);

  useEffect(() => {
    setLoadedMatches(matches);
    setStart(matches.length);
    startRef.current = matches.length;
    setHasMore(matches.length >= 10);
  }, [matches]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          "https://ddragon.leagueoflegends.com/api/versions.json",
        );
        const versions: string[] = await res.json();
        if (active && versions[0]) setLeagueVersion(versions[0]);
      } catch (e) {
        console.error("Erro ao carregar versão do DDragon:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fetchMoreMatches = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        region,
        puuid,
        start: startRef.current.toString(),
        count: "20",
      });

      const res = await fetch(`/api/tft/matches?${params.toString()}`);
      if (!res.ok) throw new Error("Erro na API de partidas TFT");

      const json = await res.json();
      const newMatches: TftMatch[] = json.data || [];

      if (newMatches.length === 0) {
        setHasMore(false);
      } else {
        setLoadedMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.metadata.match_id));
          const uniqueNew = newMatches.filter(
            (m) => !existingIds.has(m.metadata.match_id),
          );
          return [...prev, ...uniqueNew];
        });
        setStart((prev) => {
          const next = prev + newMatches.length;
          startRef.current = next;
          return next;
        });
        setHasMore(json.hasMore !== false && newMatches.length >= 10);
      }
    } catch (error) {
      console.error("Erro ao carregar mais partidas TFT:", error);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, region, puuid]);

  const getUnitIconUrl = (characterId: string, version: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${version}/tft-champion/${characterId}.png`;

  if (!leagueVersion) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg animate-pulse bg-muted/50"
          />
        ))}
      </div>
    );
  }

  if (!loadedMatches?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border rounded-lg bg-card/50">
        <p className="text-muted-foreground">
          Nenhuma partida TFT encontrada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WinrateCard matches={loadedMatches} puuid={puuid} mode="tft" title="TFT Winrate" />

      {loadedMatches.map((match) => {
        const participant = match.info?.participants?.find(
          (p) => p.puuid === puuid,
        );
        if (!participant) return null;

        const placement = participant.placement;
        const isWin = placement === 1;
        const placementClass = isWin
          ? "text-green-400"
          : placement <= 4
            ? "text-blue-400"
            : "text-red-400";

        return (
          <Card
            key={match.metadata.match_id}
            className="p-4 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center justify-center w-20">
                <Image
                  src={getTierIconUrl(
                    isWin
                      ? "challenger"
                      : placement <= 4
                        ? "grandmaster"
                        : "iron",
                  )}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  aria-hidden="true"
                />
                <span
                  className={`text-3xl font-bold ${placementClass}`}
                >
                  {placement}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isWin ? "Victory" : placement <= 4 ? "Top 4" : "Defeat"}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    {new Date(match.info.game_datetime).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDuration(match.info.game_length)}
                  </span>
                  <span className="text-muted-foreground">
                    Set {match.info.tft_set_number}
                  </span>
                  <span className="text-muted-foreground">
                    Level {participant.level}
                  </span>
                  <span className="text-muted-foreground">
                    {participant.total_damage_to_players.toLocaleString("pt-BR")}{" "}
                    dmg
                  </span>
                  {participant.players_eliminated > 0 && (
                    <span className="text-muted-foreground">
                      {participant.players_eliminated} eliminados
                    </span>
                  )}
                </div>

                {participant.augments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {participant.augments.map((augment) => (
                      <span
                        key={augment}
                        className="px-2 py-0.5 text-xs rounded bg-muted/40"
                        title="Augment"
                      >
                        {augment}
                      </span>
                    ))}
                  </div>
                )}

                {participant.traits?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {participant.traits.map((trait) => (
                      <span
                        key={trait.name}
                        className={`px-2 py-0.5 text-xs rounded border ${
                          TRAIT_STYLES[trait.style] ?? "text-gray-400"
                        } border-muted/30`}
                      >
                        {trait.name}
                        {trait.num_units > 1 ? ` (${trait.num_units})` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {participant.units?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {participant.units.slice(0, 12).map((unit) => (
                      <div
                        key={unit.character_id}
                        className="relative w-10 h-10"
                        title={unit.name || unit.character_id}
                      >
                        <Image
                          src={getUnitIconUrl(
                            unit.character_id,
                            leagueVersion,
                          )}
                          alt={unit.name || unit.character_id}
                          fill
                          sizes="40px"
                          unoptimized
                          className={`object-cover rounded ${
                            unit.tier >= 3
                              ? "ring-2 ring-yellow-400"
                              : unit.tier === 2
                                ? "ring-2 ring-blue-400"
                                : "ring-1 ring-gray-500"
                          }`}
                        />
                        {unit.items?.length > 0 && (
                          <span className="absolute bottom-0 right-0 text-[9px] leading-none bg-background/80 rounded px-0.5">
                            {unit.items.length}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      <div className="flex justify-center pt-4">
        {hasMore && (
          <button
            type="button"
            className="h-10 px-6 py-2 text-sm font-medium border rounded-md bg-accent hover:bg-accent/80 disabled:opacity-50 transition-colors"
            onClick={fetchMoreMatches}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more games"}
          </button>
        )}
      </div>
    </div>
  );
}