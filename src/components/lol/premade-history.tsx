"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchX, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchCard } from "./match-card";
import { MATCH_STATS_EVENT, type MatchStatsDetail } from "./match-stats-text";
import type { LolMatch } from "./types";
import { useDdragon } from "./use-ddragon";
import { WinrateCard } from "./winrate-card";

/** A partida com o time que a coletou: o que a rota /api/summoner/premade devolve a mais. */
export interface PremadeMatch extends LolMatch {
  premade?: { teamName: string; teamSlug: string } | null;
}

interface PremadeHistoryProps {
  region: string;
  puuid: string;
  className?: string;
}

/**
 * As partidas do jogador com as premades dele.
 *
 * A lista sai do que os times já coletaram (nada é pedido ao Riot para saber QUAIS jogos são), e o
 * detalhe de cada partida vem do mesmo cache do histórico: o cartão é o mesmo, com o nome do time.
 */
export function PremadeHistory({ region, puuid, className }: PremadeHistoryProps) {
  const t = useTranslations("matches.premade");
  const tMatches = useTranslations("matches");
  const ddragon = useDdragon();

  const [matches, setMatches] = useState<PremadeMatch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Contador do "tentar novamente": mudar a chave refaz a busca sem sair do padrão do efeito. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const params = new URLSearchParams({ region, puuid });
        const res = await fetch(`/api/summoner/premade?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Premade API error ${res.status}`);
        const json = await res.json();
        if (controller.signal.aborted) return;
        setMatches((json.data ?? []) as PremadeMatch[]);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
        setMatches([]);
      }
    })();

    return () => controller.abort();
  }, [region, puuid, attempt]);

  const retry = useCallback(() => {
    setMatches(null);
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  // O resumo acima da lista segue a lista que está sendo mostrada, inclusive esta.
  useEffect(() => {
    if (matches === null) return;
    const wins = matches.filter((match) =>
      match.info?.participants?.find((player) => player.puuid === puuid)?.win === true,
    ).length;
    const detail: MatchStatsDetail = { wins, losses: matches.length - wins };
    window.dispatchEvent(new CustomEvent(MATCH_STATS_EVENT, { detail }));
  }, [matches, puuid]);

  if (matches === null) {
    return (
      <div aria-hidden className={cn("space-y-2", className)}>
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div className={className}>
        <Alert
          variant="destructive"
          title={t("failed")}
          action={
            <Button size="sm" onClick={retry}>
              {t("retry")}
            </Button>
          }
        />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className={className}>
        <Card>
          <EmptyState
            icon={SearchX}
            title={tMatches("empty")}
            description={t("empty")}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* O mesmo gráfico da lista principal, com a série limitada aos jogos das premades. */}
      <WinrateCard region={region} puuid={puuid} premadeOnly />
      <ol className={cn("space-y-2", className)}>
        {matches.map((match) => {
          const participant = match.info?.participants?.find(
            (player) => player.puuid === puuid,
          );
          if (!participant) return null;
          return (
            <li key={match.metadata.matchId} className="space-y-1">
              {match.premade && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <Users aria-hidden className="size-3.5" />
                  {match.premade.teamName}
                </p>
              )}
              <MatchCard
                match={match}
                participant={participant}
                queueLabel={
                  match.info.queueId === 710
                    ? t("ranked5s")
                    : match.info.queueId === 440
                      ? t("flex")
                      : match.info.gameMode
                }
                region={region}
                ddragon={ddragon}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
