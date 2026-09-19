"use client";

import { MatchHistoryItem } from "./MatchHistoryItem";
import { WinrateCard } from "../winrate/WinrateCard";
import { useEffect, useState, useCallback, useRef } from "react";

interface Participant {
  puuid: string;
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  win: boolean;
  goldEarned: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  summonerName: string;
  teamId: number;
  riotIdGameName: string;
  riotIdTagline: string;
  summoner1Id: string;
  summoner2Id: string;
  perks: {
    styles: Perk[];
  };
}

interface MatchInfo {
  gameMode: string;
  queueId: number;
  gameStartTimestamp: number;
  gameDuration: number;
  participants: Participant[];
}

interface Match {
  info: MatchInfo;
  metadata: {
    matchId: string;
  };
}

interface Perk {
  selections: any;
  id: number;
  style: number;
  icon: string;
}

interface MatchHistoryProps {
  matchesByQueue: Match[];
  puuid: string;
  queueTypes: Array<{
    queueId: number;
    map: string;
    description: string;
  }>;
  isLoading?: boolean;
  region: string;
  queueId: number | string;
  gameName?: string;
  tagLine?: string;
  queueType?: string;
  championName?: string;
}

export function MatchHistoryFiltred({
  matchesByQueue,
  puuid,
  queueTypes,
  isLoading = false,
  region,
  queueId,
  gameName,
  tagLine,
  championName,
}: MatchHistoryProps) {
  const [leagueVersion, setLeagueVersion] = useState<string | null>(null);
  const [runesData, setRunesData] = useState<any[]>([]);
  const [spellsData, setSpellsData] = useState<Record<string, any>>({});
  const [matches, setMatches] = useState<Match[]>(matchesByQueue);
  const [start, setStart] = useState(matchesByQueue.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(matchesByQueue.length >= 10);

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const consecutiveEmptyRef = useRef(0);
  const [loadError, setLoadError] = useState(false);

  // Sempre reflete matchesByQueue mais recente sem ser dep do efeito de reset.
  const latestMatchesByQueueRef = useRef(matchesByQueue);
  latestMatchesByQueueRef.current = matchesByQueue;

  // FIX 1 -- tagLine e gameName em refs.
  //
  // Problema: o pai pode re-renderizar com tagLine="" antes de ter o valor
  // correto (route params resolvidos de forma assincrona no Next.js).
  // Com tagLine e gameName nas deps do useCallback, a funcao fetchMoreMatches
  // era recriada com o valor vazio capturado no closure, e enviava tagLine=
  // na URL. Isso causava cache miss no Supabase (a chave salva originalmente
  // tinha tagLine="nri", a nova nao tinha).
  //
  // Com refs, a funcao sempre le o valor ATUAL no momento do clique,
  // independente de quando o useCallback foi criado.
  const tagLineRef = useRef(tagLine);
  tagLineRef.current = tagLine;
  const gameNameRef = useRef(gameName);
  gameNameRef.current = gameName;

  // FIX 2 -- start em ref.
  //
  // Problema: setStart() e assincrono -- agenda atualizacao de estado.
  // O React pode re-renderizar o botao antes de recriar fetchMoreMatches.
  // O proximo clique usava o closure com o start anterior ao setStart,
  // buscando as mesmas partidas. O botao parecia travado/inativo.
  //
  // Com ref sincronizada dentro do proprio setStart, o valor correto esta
  // disponivel imediatamente para o proximo clique, antes mesmo do re-render.
  const startRef = useRef(start);
  startRef.current = start;

  // 1. Carregar versao e dados estaticos (DDragon)
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const versionsRes = await fetch(
          "https://ddragon.leagueoflegends.com/api/versions.json",
        );
        const versions: string[] = await versionsRes.json();
        const version = versions[0];
        setLeagueVersion(version);

        const [runesRes, spellsRes] = await Promise.all([
          fetch(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
          ),
          fetch(
            `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
          ),
        ]);

        const runes = await runesRes.json();
        const spells = await spellsRes.json();

        setRunesData(runes);
        setSpellsData(spells.data);
      } catch (e) {
        console.error("Erro ao carregar dados do DDragon:", e);
      }
    };
    loadStaticData();
  }, []);

  // 2. Resetar lista SOMENTE quando o filtro real muda.
  //
  // filterKey usa apenas escalares -- nao muda quando o array de prop
  // recebe nova referencia (o que acontecia a cada re-render do pai e
  // resetava o start de volta para matchesByQueue.length).
  const filterKey = `${region}||${puuid}||${queueId ?? ""}||${championName ?? ""}`;
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;

    const fresh = latestMatchesByQueueRef.current;
    setMatches(fresh);
    setStart(fresh.length);
    startRef.current = fresh.length; // sincroniza o ref imediatamente
    setHasMore(fresh.length >= 10);
    consecutiveEmptyRef.current = 0;
    setLoadError(false);
  }, [filterKey]);

  // 3. Atualizar estatisticas globais (Wins/Losses)
  useEffect(() => {
    const wins = matches.filter((m) => {
      const p = m.info?.participants?.find((p) => p.puuid === puuid);
      return p?.win === true;
    }).length;

    window.dispatchEvent(
      new CustomEvent("matchStatsUpdate", {
        detail: { wins, losses: matches.length - wins },
      }),
    );
  }, [matches, puuid]);

  // 4. Buscar mais partidas (paginacao)
  //
  // Deps minimas: so o que muda o TIPO de busca (filtros de consulta).
  // tagLine, gameName e start foram removidos das deps -- ficam em refs.
  // hasMore permanece porque e a condicao de parada (nao causa stale closure).
  const fetchMoreMatches = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoadingMore(true);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const params = new URLSearchParams({
        region,
        puuid,
        start: startRef.current.toString(), // sempre o valor atual, sem stale closure
        count: "20",
        gameName: gameNameRef.current || "", // sempre o valor atual
        tagLine: tagLineRef.current || "", // sempre o valor atual
      });

      if (queueId && queueId !== "all")
        params.append("queueId", String(queueId));
      if (championName && championName !== "all")
        params.append("championId", championName);

      const res = await fetch(`/api/summoner/matches?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error("Erro na API de partidas");

      const json = await res.json();
      const newMatches: Match[] = json.data || [];

      // Se a API devolveu vazio mas diz que tem mais partidas (hasMore true),
      // é um erro transitório (ex.: cache do servidor retornou página vazia).
      // NÃO desligar o botão na primeira vez — permitir nova tentativa.
      if (newMatches.length === 0) {
        if (json.hasMore === false) {
          setHasMore(false);
        } else {
          consecutiveEmptyRef.current += 1;
          setLoadError(consecutiveEmptyRef.current >= 2);
          if (consecutiveEmptyRef.current >= 2) setHasMore(false);
          // mantém hasMore=true para o usuário tentar de novo
        }
      } else {
        consecutiveEmptyRef.current = 0;
        setLoadError(false);
        setMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.metadata.matchId));
          const uniqueNew = newMatches.filter(
            (m) => !existingIds.has(m.metadata.matchId),
          );
          return [...prev, ...uniqueNew];
        });
        setStart((prev) => {
          const next = prev + newMatches.length;
          startRef.current = next; // sincroniza o ref antes do proximo render
          return next;
        });
        setHasMore(json.hasMore !== false && newMatches.length >= 10);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Erro ao carregar mais partidas:", error);
        consecutiveEmptyRef.current += 1;
        setLoadError(true);
        // Não desliga o botão no erro de rede/5xx: permite nova tentativa.
        // Depois de 2 falhas seguidas, desliga para evitar loop.
        if (consecutiveEmptyRef.current >= 2) setHasMore(false);
      }
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, region, puuid, queueId, championName]);

  // Helpers de imagem
  const getSummonerSpellImageUrl = useCallback(
    (spellId: string | number) => {
      if (!leagueVersion) return null;
      const spell = Object.values(spellsData).find(
        (s: any) => String(s.key) === String(spellId),
      );
      return spell
        ? `https://ddragon.leagueoflegends.com/cdn/${leagueVersion}/img/spell/${spell.image.full}`
        : null;
    },
    [spellsData, leagueVersion],
  );

  const getRuneImageUrl = useCallback(
    (id: number) => {
      if (!runesData.length) return null;
      for (const perk of runesData) {
        if (perk.id === id)
          return `https://ddragon.leagueoflegends.com/cdn/img/${perk.icon}`;
        for (const slot of perk.slots || []) {
          for (const rune of slot.runes || []) {
            if (rune.id === id)
              return `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`;
          }
        }
      }
      return null;
    },
    [runesData],
  );

  if (!leagueVersion || isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-32 rounded-lg animate-pulse bg-muted/50" />
        ))}
      </div>
    );
  }

  if (!matches?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border rounded-lg bg-card/50">
        <p className="text-muted-foreground mb-4">
          Nenhuma partida encontrada.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-medium text-primary hover:underline"
        >
          Recarregar pagina
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WinrateCard matches={matches} puuid={puuid} mode="lol" title="LoL Winrate" />

      {matches.map((match) => {
        const participant = match.info?.participants?.find(
          (p) => p.puuid === puuid,
        );
        if (!participant) return null;

        const spell1Url = getSummonerSpellImageUrl(participant.summoner1Id);
        const spell2Url = getSummonerSpellImageUrl(participant.summoner2Id);
        const perk1Url = getRuneImageUrl(
          participant.perks?.styles?.[0]?.selections?.[0]?.perk,
        );
        const perk2Url = getRuneImageUrl(participant.perks?.styles?.[1]?.style);

        const matchData = {
          champion: {
            name: participant.championName,
            imageUrl: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${participant.championId}.png`,
            spell1Url,
            spell2Url,
            mainStyle: perk1Url,
            subStyle: perk2Url,
          },
          gameMode: match.info.gameMode,
          gameType:
            queueTypes.find((q) => q.queueId === match.info.queueId)
              ?.description || "Partida",
          isWin: participant.win,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          creepScore:
            participant.totalMinionsKilled + participant.neutralMinionsKilled,
          items: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
            id: (participant as any)[`item${i}`],
            imageUrl: (participant as any)[`item${i}`]
              ? `https://ddragon.leagueoflegends.com/cdn/${leagueVersion}/img/item/${
                  (participant as any)[`item${i}`]
                }.png`
              : null,
          })),
          gameDuration: `${Math.floor(match.info.gameDuration / 60)}m ${
            match.info.gameDuration % 60
          }s`,
          gameCreation: new Date(
            match.info.gameStartTimestamp,
          ).toLocaleDateString(),

          goldEarned: participant.goldEarned,
          visionScore: participant.visionScore,
          totalDamageDealt: participant.totalDamageDealtToChampions,
          totalDamageTaken: participant.totalDamageTaken,

          // 🔥 fallback importante
          summonerName: participant.summonerName,

          participants: match.info.participants.map((p) => ({
            puuid: p.puuid,
            championName: p.championName,
            championId: p.championId,

            // 🔥 AGORA SIM (isso resolve teu bug)
            riotIdGameName: p.riotIdGameName,
            riotIdTagline: p.riotIdTagline,

            summonerName: p.summonerName,
            team: p.teamId,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,

            spell1Url: getSummonerSpellImageUrl(p.summoner1Id),
            spell2Url: getSummonerSpellImageUrl(p.summoner2Id),

            mainStyle: getRuneImageUrl(
              p.perks?.styles?.[0]?.selections?.[0]?.perk,
            ),
            subStyle: getRuneImageUrl(p.perks?.styles?.[1]?.style),

            items: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
              id: (p as any)[`item${i}`],
              imageUrl: (p as any)[`item${i}`]
                ? `https://ddragon.leagueoflegends.com/cdn/${leagueVersion}/img/item/${
                    (p as any)[`item${i}`]
                  }.png`
                : null,
            })),
          })),
        };

        return (
          <div key={match.metadata.matchId} className="transition-all">
            <MatchHistoryItem {...(matchData as any)} />
          </div>
        );
      })}

      <div className="flex flex-col items-center gap-2 pt-4">
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
        {loadError && !loadingMore && (
          <p className="text-xs text-destructive">
            Não foi possível carregar mais partidas. Tente novamente.
          </p>
        )}
      </div>
    </div>
  );
}
