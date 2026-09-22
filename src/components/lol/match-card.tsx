"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { championIconUrl } from "@/lib/cdn";
import { championName } from "@/lib/champions";
import { csPerMinute, kdaRatio, splitDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Stat } from "@/components/ui/stat";
import { ParticipantRow } from "./participant-row";
import { matchTimestamp, participantItems, type LolMatch, type LolParticipant } from "./types";
import { itemIcon, type DdragonData } from "./use-ddragon";

interface MatchCardProps {
  match: LolMatch;
  /** The profile owner. */
  participant: LolParticipant;
  queueLabel: string;
  region: string;
  ddragon: DdragonData;
  className?: string;
}

const TEAMS = [
  { id: 100, labelKey: "blueTeam" },
  { id: 200, labelKey: "redTeam" },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Downloads, in the background, the full history of every player in the match while the card is
 * expanded, page by page, so the match cache is warm when someone opens their profile.
 */
function useWarmPlayersCache(region: string, participants: LolParticipant[], expanded: boolean) {
  const playersRef = useRef(participants);
  playersRef.current = participants;
  const runningRef = useRef(false);
  const stopRef = useRef(false);

  const warm = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      for (const player of playersRef.current) {
        if (stopRef.current) break;
        if (!player.puuid) continue;

        // Players whose history is already stored don't need a warm-up.
        try {
          const status = await fetch(
            `/api/summoner/players/status?region=${encodeURIComponent(region)}&puuid=${encodeURIComponent(player.puuid)}`,
          );
          if (stopRef.current) break;
          const { exists } = await status.json();
          if (exists) continue;
        } catch {
          // If the check fails, warm up anyway.
        }

        let start = 0;
        let failCount = 0;

        while (!stopRef.current) {
          let finished = false;
          try {
            const query = new URLSearchParams({ region, puuid: player.puuid, start: String(start), count: "20" });
            if (player.riotIdGameName) query.set("gameName", player.riotIdGameName);
            if (player.riotIdTagline) query.set("tagLine", player.riotIdTagline);

            const res = await fetch(`/api/summoner/matches?${query.toString()}`);
            if (stopRef.current) break;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            if (stopRef.current) break;

            const data: unknown[] = json.data || [];
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
          // Gentle pace: don't hammer the Riot API.
          await sleep(600);
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [region]);

  useEffect(() => {
    if (expanded) {
      stopRef.current = false;
      warm();
    } else {
      stopRef.current = true;
    }
    return () => {
      if (expanded) stopRef.current = true;
    };
  }, [expanded, warm]);
}

/** One game of the profile owner: result, loadout, KDA, CS, items; expands to both teams. */
export function MatchCard({ match, participant: p, queueLabel, region, ddragon, className }: MatchCardProps) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);

  const participants = match.info.participants;
  useWarmPlayersCache(region, participants, expanded);

  const win = p.win;
  const ts = matchTimestamp(match);
  const duration = splitDuration(match.info.gameDuration);
  const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
  const csMin = csPerMinute(cs, match.info.gameDuration);
  const kda = kdaRatio(p.kills, p.deaths, p.assists);
  const champion = championName(p.championId) ?? p.championName;
  const spells = [p.summoner1Id, p.summoner2Id].map((id) => ddragon.spells.get(String(id)));
  const keystone = ddragon.runes.get(p.perks?.styles?.[0]?.selections?.[0]?.perk ?? -1);
  const secondary = ddragon.runes.get(p.perks?.styles?.[1]?.style ?? -1);
  const ResultIcon = win ? Check : X;

  return (
    <Card as="article" variant={win ? "win" : "loss"} className={className}>
      <div className="space-y-3 p-3 sm:p-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Badge variant={win ? "win" : "loss"} size="md">
            <ResultIcon aria-hidden className="size-3.5" />
            {win ? tCommon("victory") : tCommon("defeat")}
          </Badge>
          <span className="font-medium text-foreground">{queueLabel}</span>
          {ts != null && (
            <time
              dateTime={new Date(ts).toISOString()}
              title={format.dateTime(ts, { dateStyle: "medium", timeStyle: "short" })}
              suppressHydrationWarning
              className="text-muted-foreground"
            >
              {format.relativeTime(ts, now)}
            </time>
          )}
          <span className="num text-muted-foreground">
            {t("duration", { minutes: duration.minutes, seconds: String(duration.seconds).padStart(2, "0") })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-1 ml-auto"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? t("hideDetails") : t("showDetails")}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              aria-hidden
              className={cn("transition-transform duration-base", expanded && "rotate-180")}
            />
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
          <div className="flex items-center gap-1.5">
            <IconFrame
              src={championIconUrl(p.championId)}
              alt={champion}
              size="lg"
              shape="rounded"
              badge={
                p.champLevel != null && (
                  <span
                    title={t("championLevel", { level: p.champLevel })}
                    className="num rounded-full border border-border-strong bg-background px-1.5 py-0.5 text-2xs font-medium text-foreground"
                  >
                    <span className="sr-only">{t("championLevel", { level: p.champLevel })}</span>
                    <span aria-hidden>{p.champLevel}</span>
                  </span>
                )
              }
            />
            <span className="flex flex-col gap-1">
              {spells.map((spell, i) => (
                <IconFrame
                  key={i}
                  src={spell?.icon}
                  alt={spell?.name ?? t("summonerSpell")}
                  title={spell?.name}
                  size="sm"
                  shape="square"
                />
              ))}
            </span>
            <span className="flex flex-col items-center gap-1">
              <IconFrame
                src={keystone?.icon}
                alt={keystone?.name ?? t("keystone")}
                title={keystone?.name}
                size="sm"
                shape="circle"
                className="bg-background"
              />
              <IconFrame
                src={secondary?.icon}
                alt={secondary?.name ?? t("secondaryPath")}
                title={secondary?.name}
                size="xs"
                shape="circle"
                className="bg-background p-0.5"
              />
            </span>
          </div>

          <div className="min-w-28 space-y-0.5">
            <p className="truncate text-sm font-medium text-foreground">{champion}</p>
            <p className="num text-base font-semibold text-foreground">
              {p.kills}
              <span className="text-muted-foreground"> / </span>
              <span className="text-loss">{p.deaths}</span>
              <span className="text-muted-foreground"> / </span>
              {p.assists}
            </p>
            <p className="num text-xs text-muted-foreground">
              {kda == null ? t("perfectKda") : t("kda", { value: format.number(kda, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) })}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="num text-sm text-foreground">{t("cs", { cs })}</p>
            {csMin != null && (
              <p className="num text-xs text-muted-foreground">
                {t("csPerMinute", { value: format.number(csMin, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })}
              </p>
            )}
          </div>

          <ul aria-label={t("items")} className="flex gap-1 lg:ml-auto">
            {participantItems(p).map((id, i) => (
              <li key={i}>
                <IconFrame
                  src={itemIcon(ddragon, id)}
                  alt={id ? (ddragon.items.get(id) ?? t("item", { id })) : ""}
                  title={id ? (ddragon.items.get(id) ?? undefined) : t("emptySlot")}
                  size="md"
                  shape="rounded"
                  className="size-8 md:size-10"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div id={detailsId} hidden={!expanded}>
        {expanded && (
          <div className="space-y-4 border-t border-border/50 p-3 motion-safe:animate-fade-in sm:p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t("stats.damage")} value={format.number(p.totalDamageDealtToChampions)} />
              <Stat label={t("stats.gold")} value={format.number(p.goldEarned)} />
              <Stat label={t("stats.vision")} value={format.number(p.visionScore)} />
              <Stat label={t("stats.cs")} value={format.number(cs)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {TEAMS.map((team) => {
                const members = participants.filter((x) => x.teamId === team.id);
                if (members.length === 0) return null;
                const teamWin = members[0].win;
                return (
                  <section key={team.id} aria-labelledby={`${detailsId}-${team.id}`} className="space-y-1">
                    <h4 id={`${detailsId}-${team.id}`} className="flex items-center gap-2 text-xs font-medium">
                      <span className="text-foreground">{t(team.labelKey)}</span>
                      <span className={teamWin ? "text-win" : "text-loss"}>
                        {teamWin ? tCommon("victory") : tCommon("defeat")}
                      </span>
                    </h4>
                    <ul>
                      {members.map((member, i) => (
                        <ParticipantRow
                          key={member.puuid || i}
                          participant={member}
                          region={region}
                          ddragon={ddragon}
                          isOwner={member.puuid === p.puuid}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
