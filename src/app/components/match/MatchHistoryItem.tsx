"use client";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function formatNumber(n?: number) {
  if (n == null) return "0";
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface MatchHistoryItemProps {
  champion: {
    name: string;
    imageUrl: string;
    spell1Url: string | null;
    spell2Url: string | null;
    mainStyle: string | null;
    subStyle: string | null;
  };
  gameMode: string;
  gameType: string;
  isWin: boolean;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  items: Array<{
    id: string; // "itemId-index" para garantir unicidade
    imageUrl: string | null;
  }>;
  gameDuration: string;
  gameCreation: string;
  goldEarned?: number;
  visionScore?: number;
  totalDamageDealt?: number;
  totalDamageTaken?: number;
  summonerName: string;
  participants?: Array<{
    puuid: string;
    subStyle: string | null;
    mainStyle: string | null;
    championName: string;
    championId: number;
    summonerName: string;
    team: number;
    kills: number;
    deaths: number;
    assists: number;
    riotIdGameName: string;
    riotIdTagline: string;
    items: Array<{
      id: string;
      imageUrl: string | null;
    }>;
    spell1Url?: string | null;
    spell2Url?: string | null;
  }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MatchHistoryItem({
  champion,
  gameMode,
  gameType,
  isWin,
  kills,
  deaths,
  assists,
  creepScore,
  items,
  gameDuration,
  gameCreation,
  goldEarned,
  visionScore,
  totalDamageDealt,
  totalDamageTaken,
  participants,
}: MatchHistoryItemProps) {
  const params = useParams();
  const region = params.region as string;
  const [isExpanded, setIsExpanded] = useState(false);

  const playersRef = useRef(participants);
  playersRef.current = participants;
  const runningRef = useRef(false);
  const stopRef = useRef(false);

  // Ao expandir a partida, baixa (em background) o histÃ³rico completo de
  // cada jogador, pÃ¡gina por pÃ¡gina, alimentando o cache do Supabase.
  // Sem UI: o objetivo Ã© sÃ³ popular o banco de dados via /api/summoner/matches.
  const warmPlayersCache = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const players = playersRef.current || [];
      for (const player of players) {
        if (stopRef.current) break;
        if (!player.puuid) continue;

        // Se o puuid jÃ¡ tem o histÃ³rico no banco, nÃ£o precisa reaquecer.
        try {
          const status = await fetch(
            `/api/summoner/players/status?region=${encodeURIComponent(
              region,
            )}&puuid=${encodeURIComponent(player.puuid)}`,
          );
          if (stopRef.current) break;
          const { exists } = await status.json();
          if (exists) continue;
        } catch {
          // Se a verificaÃ§Ã£o falhar, segue o aquecimento normalmente.
        }

        let start = 0;
        let failCount = 0;

        while (!stopRef.current) {
          let finished = false;
          try {
            const query = new URLSearchParams({
              region,
              puuid: player.puuid,
              start: String(start),
              count: "20",
            });
            if (player.riotIdGameName)
              query.set("gameName", player.riotIdGameName);
            if (player.riotIdTagline) query.set("tagLine", player.riotIdTagline);

            const res = await fetch(`/api/summoner/matches?${query.toString()}`);

            if (stopRef.current) break;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            if (stopRef.current) break;

            const data: any[] = json.data || [];

            if (data.length === 0 || json.hasMore === false) finished = true;
            else start += data.length;
            failCount = 0;
          } catch {
            if (stopRef.current) break;
            failCount += 1;
            if (failCount >= 3) break;
            await sleep(1500);
            continue;
          }

          if (finished) break;

          // intervalo gentil: nÃ£o bombardeia a API da Riot
          await sleep(600);
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [region]);

  useEffect(() => {
    if (isExpanded) {
      stopRef.current = false;
      warmPlayersCache();
    } else {
      stopRef.current = true;
    }
    return () => {
      if (isExpanded) stopRef.current = true;
    };
  }, [isExpanded, warmPlayersCache]);

  const kda = ((kills + assists) / Math.max(1, deaths)).toFixed(2);
  const csPerMin = (() => {
    const [minStr, secStr] = gameDuration.split(" ");
    const minutes = parseInt(minStr.replace("m", ""), 10) || 0;
    const seconds = parseInt(secStr.replace("s", ""), 10) || 0;
    const totalMinutes = minutes + seconds / 60;
    return (creepScore / Math.max(1, totalMinutes)).toFixed(1);
  })();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-4 animate-fadeIn cursor-pointer",
        "transition-all duration-200 ease-in-out hover:scale-[1.02]",
        "bg-gradient-to-r",
        isWin
          ? "from-win/10 to-win/5 border-win/20 hover:border-win/40"
          : "from-loss/10 to-loss/5 border-loss/20 hover:border-loss/40",
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium sm:text-sm text-muted-foreground">
            {gameMode} • {gameType}
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              isWin ? "text-win" : "text-loss",
            )}
          >
            {isWin ? "Victory" : "Defeat"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Perks do campeÃ£o principal */}
          <div className="relative flex items-center gap-1">
            {champion.mainStyle && (
              <Image
                src={champion.mainStyle}
                alt="Main Rune"
                width={25}
                height={25}
                className="object-cover rounded-md"
              />
            )}
            {champion.subStyle && (
              <Image
                src={champion.subStyle}
                alt="Sub Rune"
                width={15}
                height={15}
                className="object-cover rounded-md"
              />
            )}
          </div>

          {/* Ãcone do campeÃ£o */}
          <div className="relative flex-shrink-0 w-16 h-16">
            <Image
              src={champion.imageUrl}
              alt={champion.name}
              fill={true}
              sizes="64px"
              className="object-cover border-4 rounded-full"
              style={{ clipPath: "inset(10% 10% round 50%)" }}
            />
          </div>

          {/* Spells do campeÃ£o principal */}
          <div className="flex-wrap items-center gap-1 flexbox">
            {champion.spell1Url && (
              <Image
                src={champion.spell1Url}
                alt="Spell 1"
                width={25}
                height={25}
                className="object-cover mb-1 rounded-md"
              />
            )}
            {champion.spell2Url && (
              <Image
                src={champion.spell2Url}
                alt="Spell 2"
                width={25}
                height={25}
                className="object-cover rounded-md"
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-semibold">
                {champion.name === "MonkeyKing" ? "Wukong" : champion.name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">{kills}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs font-medium text-loss">{deaths}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs font-medium">{assists}</span>
              </div>
              <span className="text-xs text-muted-foreground">({kda} KDA)</span>
              <span className="text-xs text-muted-foreground">
                CS: {creepScore} ({csPerMin}/min)
              </span>
            </div>
          </div>

          {/* Itens do campeÃ£o principal */}
          <div className="flex items-center gap-2 ml-auto mr-auto">
            <div className="flex flex-wrap items-center gap-1">
              {items.map((item, index) => (
                <div
                  // Usando o Ã­ndice para garantir que cada slot de item seja Ãºnico,
                  // mesmo que o ID do item seja repetido ou 0.
                  key={`item-slot-${index}`}
                  className="relative rounded-md h-9 w-9 bg-background/50 overflow-hidden"
                >
                  {item.imageUrl && (
                    <Image
                      src={item.imageUrl}
                      alt={`Item ${item.id}`}
                      fill={true}
                      sizes="36px"
                      className="object-cover rounded-md"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex flex-col items-end ml-2">
              <span className="text-xs font-medium">{gameDuration}</span>
              <span className="text-xs text-muted-foreground">
                {gameCreation}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="pt-4 mt-4 border-t border-border/50 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between w-full mb-4">
            <div className="text-left">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Damage Dealt
              </p>
              <p className="text-xl font-bold">
                {formatNumber(totalDamageDealt)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Gold Earned
              </p>
              <p className="text-base font-medium">
                {formatNumber(goldEarned)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Vision Score
              </p>
              <p className="text-base font-medium">{visionScore}</p>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Damage Taken
              </p>
              <p className="text-xl font-bold">
                {formatNumber(totalDamageTaken)}
              </p>
            </div>
          </div>
          <div className="w-full h-px mb-4 bg-border"></div>

          {participants && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Time 1 */}
              <div className="space-y-2">
                <h4 className="mb-2 text-xs font-medium sm:text-sm text-muted-foreground">
                  Team 1
                </h4>
                {participants
                  .filter((p) => p.team === 100)
                  .map((participant, idx) => (
                    <div
                      key={`t100-${idx}`}
                      className="flex items-center gap-2 mb-2"
                    >
                      {/* Perks */}
                      <div className="relative flex items-center gap-1">
                        {participant.mainStyle && (
                          <Image
                            src={participant.mainStyle}
                            alt="Main Style"
                            width={25}
                            height={25}
                            className="object-cover rounded-md"
                          />
                        )}
                        {participant.subStyle && (
                          <Image
                            src={participant.subStyle}
                            alt="Sub Style"
                            width={15}
                            height={15}
                            className="hidden object-cover rounded-md sm:inline"
                          />
                        )}
                      </div>

                      {/* Ãcone campeÃ£o */}
                      <div
                        className="relative flex-shrink-0 w-8 h-8 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                        }}
                      >
                        <Image
                          src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${participant.championId}.png`}
                          alt={participant.championName}
                          fill={true}
                          sizes="32px"
                          className="rounded-full"
                        />
                      </div>

                      {/* Spells */}
                      <div className="flex-wrap items-center gap-1 flexbox">
                        {participant.spell1Url && (
                          <Image
                            src={participant.spell1Url}
                            alt="Spell 1"
                            width={15}
                            height={15}
                            className="object-cover mb-1 rounded"
                          />
                        )}
                        {participant.spell2Url && (
                          <Image
                            src={participant.spell2Url}
                            alt="Spell 2"
                            width={15}
                            height={15}
                            className="object-cover rounded"
                          />
                        )}
                      </div>

                      <div className="flex flex-col flex-1 min-w-0">
                        <span
                          className="hidden sm:inline text-sm truncate cursor-pointer hover:underline max-w-[120px] inline-block"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                          }}
                          title={participant.summonerName}
                        >
                          {participant.riotIdGameName}
                        </span>
                        <span
                          className="text-sm font-medium cursor-pointer sm:hidden hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                          }}
                        >
                          {participant.riotIdGameName.slice(0, 3)}
                        </span>
                        <span className="text-xs text-left sm:text-sm text-muted-foreground">
                          {participant.kills}/{participant.deaths}/
                          {participant.assists}
                        </span>
                      </div>

                      {/* Itens */}
                      <div className="flex items-center gap-1 ml-auto">
                        {participant.items.slice(0, 7).map((item, itemIdx) => (
                          <div
                            key={`item-${item.id}-${itemIdx}`}
                            className="relative w-5 h-5 rounded-md bg-background/50"
                          >
                            {item.imageUrl && (
                              <Image
                                src={item.imageUrl}
                                alt={`Item ${item.id}`}
                                fill={true}
                                sizes="20px"
                                className="object-cover rounded-md"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Time 2 */}
              <div className="space-y-2 md:border-l md:border-border/50 md:pl-4">
                <h4 className="mb-2 text-xs font-medium sm:text-sm text-muted-foreground">
                  Team 2
                </h4>
                {participants
                  .filter((p) => p.team === 200)
                  .map((participant, idx) => (
                    <div
                      key={`t200-${idx}`}
                      className="flex items-center gap-2 mb-2"
                    >
                      {/* Perks */}
                      <div className="relative flex items-center gap-1">
                        {participant.mainStyle && (
                          <Image
                            src={participant.mainStyle}
                            alt="Main Style"
                            width={25}
                            height={25}
                            className="object-cover rounded-md"
                          />
                        )}
                        {participant.subStyle && (
                          <Image
                            src={participant.subStyle}
                            alt="Sub Style"
                            width={15}
                            height={15}
                            className="hidden object-cover rounded-md sm:inline"
                          />
                        )}
                      </div>

                      {/* Ãcone campeÃ£o */}
                      <div
                        className="relative flex-shrink-0 w-8 h-8 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                        }}
                      >
                        <Image
                          src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${participant.championId}.png`}
                          alt={participant.championName}
                          fill={true}
                          sizes="32px"
                          className="rounded-full"
                        />
                      </div>

                      {/* Spells */}
                      <div className="flex-wrap items-center gap-1 flexbox">
                        {participant.spell1Url && (
                          <Image
                            src={participant.spell1Url}
                            alt="Spell 1"
                            width={15}
                            height={15}
                            className="object-cover mb-1 rounded"
                          />
                        )}
                        {participant.spell2Url && (
                          <Image
                            src={participant.spell2Url}
                            alt="Spell 2"
                            width={15}
                            height={15}
                            className="object-cover rounded"
                          />
                        )}
                      </div>

                      <div className="flex flex-col flex-1 min-w-0">
                        <span
                          className="hidden sm:inline text-sm truncate cursor-pointer hover:underline max-w-[120px] inline-block"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                          }}
                          title={participant.summonerName}
                        >
                          {participant.riotIdGameName}
                        </span>
                        <span
                          className="text-sm font-medium cursor-pointer sm:hidden hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/lol/${region}/${participant.riotIdGameName}/${participant.riotIdTagline}/all/all`;
                          }}
                        >
                          {participant.summonerName.slice(0, 3)}
                        </span>
                        <span className="text-xs text-left sm:text-sm text-muted-foreground">
                          {participant.kills}/{participant.deaths}/
                          {participant.assists}
                        </span>
                      </div>

                      {/* Itens */}
                      <div className="flex items-center gap-1 ml-auto">
                        {participant.items.slice(0, 7).map((item, itemIdx) => (
                          <div
                            key={`item-${item.id}-${itemIdx}`}
                            className="relative w-5 h-5 rounded-md bg-background/50"
                          >
                            {item.imageUrl && (
                              <Image
                                src={item.imageUrl}
                                alt={`Item ${item.id}`}
                                fill={true}
                                sizes="20px"
                                className="object-cover rounded-md"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
