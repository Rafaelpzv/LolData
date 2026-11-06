"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flag,
  Skull,
  Swords,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatGold, formatSeconds } from "@/lib/premade/stats";
import {
  EVENT_FILTERS,
  collectEvents,
  countByFilter,
  criticalMoments,
  filterEvents,
  findSequences,
  minuteRange,
  type EventFilter,
  type TimelineEvent,
} from "@/lib/premade/timeline-interactive";
import type { MatchTimeline } from "./timeline-panel";

const FILTER_KEY: Record<
  EventFilter,
  | "filters.all"
  | "filters.groupKill"
  | "filters.groupDeath"
  | "filters.objective"
  | "filters.fillKill"
> = {
  all: "filters.all",
  groupKill: "filters.groupKill",
  groupDeath: "filters.groupDeath",
  objective: "filters.objective",
  fillKill: "filters.fillKill",
};

const CRITICAL_KEY = {
  leadFlipped: "critical.leadFlipped",
  biggestSwing: "critical.biggestSwing",
} as const;

/**
 * O rótulo de um tipo de evento. O `kind` vem do dado coletado, então o mapa é literal: um tipo novo
 * sem tradução tem que aparecer no build, e não como chave crua na tela.
 */
const KIND_KEY = {
  groupKill: "kinds.groupKill",
  groupDeath: "kinds.groupDeath",
  fillKill: "kinds.fillKill",
  dragon: "kinds.dragon",
  herald: "kinds.herald",
  baron: "kinds.baron",
  tower: "kinds.tower",
  inhibitor: "kinds.inhibitor",
} as const;

function kindKey(kind: string): (typeof KIND_KEY)[keyof typeof KIND_KEY] {
  return KIND_KEY[kind as keyof typeof KIND_KEY] ?? "kinds.other";
}

/** O rótulo de um tipo de evento, com o ícone que o representa. */
function eventIcon(event: TimelineEvent) {
  if (event.from === "objectives") return <Flag className="size-3" aria-hidden />;
  if (event.kind === "groupDeath" || event.from === "deaths") {
    return <Skull className="size-3" aria-hidden />;
  }
  return <Swords className="size-3" aria-hidden />;
}

/**
 * A timeline interativa do §8.4.
 *
 * A regra vem de `timeline-interactive.ts` (puro, testado); aqui só se escolhe o que mostrar e se
 * desenha. A navegação é por minuto e não por segundo porque a coleta amostra a posição cerca de uma
 * vez por minuto: oferecer precisão de segundo seria vender exatidão que o dado não tem (§8.5).
 */
export function TimelineExplorer({
  games,
  players,
}: {
  games: MatchTimeline[];
  /** As pessoas do elenco, para o filtro por jogador. */
  players: { id: string; name: string }[];
}) {
  const t = useTranslations("premade.explorer");
  const [matchId, setMatchId] = useState<string>(games[0]?.matchId ?? "");
  const [minute, setMinute] = useState<number | null>(null);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [person, setPerson] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  const game = games.find((entry) => entry.matchId === matchId) ?? games[0];
  const events = useMemo(() => (game ? collectEvents(game) : []), [game]);
  const counts = useMemo(() => countByFilter(events), [events]);
  const moments = useMemo(
    () => (game ? criticalMoments(game.goldDiff) : []),
    [game],
  );
  const sequences = useMemo(() => findSequences(events), [events]);
  const shown = filterEvents(events, { minute, filter, person });
  const minutes = game ? minuteRange(game.duration) : [0];
  const nameOf = (id: string | null) =>
    id === null ? t("outside") : (players.find((p) => p.id === id)?.name ?? t("outside"));

  if (!game) {
    return (
      <Card padding="lg">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </Card>
    );
  }

  const step = (delta: number) => {
    const current = minute ?? 0;
    const next = current + delta;
    if (next < 0) return;
    if (next > minutes[minutes.length - 1]) return;
    setMinute(next);
  };

  return (
    <div className="space-y-4">
      <Card padding="lg" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{t("title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("hint")}</p>
          </div>
          {/* O seletor de partida é a entrada de tudo: sem partida escolhida não há o que navegar. */}
          <Select
            value={game.matchId}
            onChange={(event) => {
              setMatchId(event.target.value);
              setMinute(null);
              setOpenEvent(null);
            }}
            aria-label={t("match")}
            wrapperClassName="w-full sm:w-56"
          >
            {games.map((entry) => (
              <option key={entry.matchId} value={entry.matchId}>
                {t("matchOption", {
                  win: entry.win ? t("win") : t("loss"),
                  duration: formatSeconds(entry.duration),
                })}
              </option>
            ))}
          </Select>
        </div>

        {/* Navegação por minuto (§8.4). O botão "partida inteira" volta a mostrar tudo. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => step(-1)}
            disabled={(minute ?? 0) <= 0}
            aria-label={t("previousMinute")}
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </Button>
          <span className="num min-w-20 text-center text-xs font-medium">
            {minute === null
              ? t("wholeGame")
              : t("minuteLabel", { minute })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => step(1)}
            disabled={(minute ?? 0) >= minutes[minutes.length - 1]}
            aria-label={t("nextMinute")}
          >
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={minute === null ? "default" : "ghost"}
            onClick={() => setMinute(null)}
          >
            {t("wholeGame")}
          </Button>
          <div className="ml-auto flex flex-wrap gap-1">
            {moments.map((moment) => (
              <button
                key={`${moment.at}-${moment.rule}`}
                type="button"
                onClick={() => setMinute(Math.floor(moment.at / 60))}
                className="rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:border-border-strong hover:text-foreground"
                title={t(CRITICAL_KEY[moment.rule], {
                  gold: formatGold(moment.goldDiff),
                })}
              >
                <Crosshair className="mr-1 inline size-3" aria-hidden />
                {formatSeconds(moment.at)}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros: tipo de evento e jogador (§8.4). A contagem vai em cada botão. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {EVENT_FILTERS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
            >
              {t(FILTER_KEY[value])}
              <span className="num ml-1 text-2xs opacity-70">
                {counts[value]}
              </span>
            </Button>
          ))}
          <Select
            value={person ?? ""}
            onChange={(event) => setPerson(event.target.value || null)}
            aria-label={t("person")}
            wrapperClassName="ml-auto w-full sm:w-48"
          >
            <option value="">{t("everyone")}</option>
            {players.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Os eventos visíveis, cada um abrindo a própria evidência. */}
        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noEvents")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((event, index) => {
              // Dois eventos do mesmo tipo no mesmo segundo (duas mortes do grupo em 596s) têm a mesma
              // identidade natural — a pessoa é `null` na morte do mapa. O índice fecha a chave: a
              // ordem vem de `collectEvents`, que já é determinística, então ele não muda entre renders.
              const key = `${event.from}-${event.at}-${event.kind}-${event.person ?? "none"}-${index}`;
              const open = openEvent === key;
              return (
                <li key={key} className="py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenEvent(open ? null : key)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 text-left text-xs"
                  >
                    <span className="num w-14 shrink-0 text-muted-foreground">
                      {formatSeconds(event.at)}
                    </span>
                    <span className="text-muted-foreground">{eventIcon(event)}</span>
                    <span className="flex-1">{t(kindKey(event.kind))}</span>
                    <span className="text-2xs text-muted-foreground">
                      {nameOf(event.person)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 pl-16 text-2xs text-muted-foreground">
                      <div>
                        <dt className="inline">{t("evidence.time")}: </dt>
                        <dd className="num inline">{formatSeconds(event.at)}</dd>
                      </div>
                      <div>
                        <dt className="inline">{t("evidence.source")}: </dt>
                        <dd className="inline">{t(`sources.${event.from}`)}</dd>
                      </div>
                      {event.near !== null && (
                        <div>
                          <dt className="inline">{t("evidence.near")}: </dt>
                          <dd className="num inline">{event.near}</dd>
                        </div>
                      )}
                      {event.variant && (
                        <div>
                          <dt className="inline">{t("evidence.variant")}: </dt>
                          <dd className="inline">{event.variant}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline">{t("evidence.position")}: </dt>
                        <dd className="num inline">
                          {Math.round(event.x)}, {Math.round(event.y)}
                        </dd>
                      </div>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Sequências de acontecimentos (§8.4): a morte que virou objetivo perdido. */}
      {sequences.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <h3 className="text-sm font-semibold">{t("sequencesTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("sequencesHint")}</p>
          <ul className="space-y-1">
            {sequences.map((sequence) => {
              // O objetivo é sempre o ÚLTIMO evento da sequência; as mortes vêm antes dele.
              const objective = sequence.events[sequence.events.length - 1];
              const deaths = sequence.events.slice(0, -1);
              // Só pessoa do elenco é nomeada, e uma vez só: uma conta de preenchimento não é
              // colega de time, e duas mortes da mesma pessoa são a mesma pessoa na lista.
              const people = [
                ...new Set(
                  deaths
                    .map((death) => death.person)
                    .filter((person): person is string => person !== null),
                ),
              ];
              const outside = deaths.length - people.length;
              return (
                <li
                  key={sequence.id}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <Badge variant="warning">{t("sequences.deathThenObjective")}</Badge>
                  <span className="num text-muted-foreground">
                    {formatSeconds(sequence.from)} → {formatSeconds(sequence.to)}
                  </span>
                  <span className="text-muted-foreground">
                    {/* Sem ninguém do elenco na sequência, a frase muda de sujeito em vez de
                        escrever "fora do elenco morreu", que não é uma pessoa. */}
                    {people.length === 0
                      ? t("sequenceOutside", {
                          count: outside,
                          objective: t(kindKey(objective.kind)),
                        })
                      : t("sequenceDetail", {
                          person: people.map((person) => nameOf(person)).join(", "),
                          count: people.length,
                          objective: t(kindKey(objective.kind)),
                        })}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="text-2xs text-muted-foreground">{t("caveat")}</p>
    </div>
  );
}
