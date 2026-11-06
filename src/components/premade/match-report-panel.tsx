"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GameReport } from "@/lib/premade/team-analysis";
import type {
  InflectionConfidence,
  InflectionEvidence,
  InflectionKind,
} from "@/lib/premade/match-report";
import type { Text } from "@/lib/premade/i18n";

/**
 * Traduz um `Text` do módulo puro, que entrega chave + valores em vez de uma frase pronta: só quem
 * renderiza conhece o idioma. O cast fica aqui, uma vez, porque a chave é montada em runtime.
 */
function renderText(
  t: ReturnType<typeof useTranslations<"premade.matches">>,
  entry: Text,
): string {
  return t(entry.id as "interpretationText.noInflection", entry.values);
}

/** Rótulos de confiança como tons, para a cor não carregar a informação sozinha (há texto junto). */
const CONFIDENCE_TONE: Record<InflectionConfidence, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  inconclusive: "border-border bg-muted text-muted-foreground",
};

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function signedGold(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/**
 * As cinco funções que a Riot manda, como chave de tradução literal.
 *
 * Mapa explícito em vez de `t(\`lanes.${role}\`)`: a chave montada em template faz o TypeScript
 * tentar resolver todas as combinações e explodir o tipo. O fallback é o próprio texto da Riot, para
 * uma função nova aparecer como veio em vez de sumir.
 */
const ROLE_KEY = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MIDDLE: "MIDDLE",
  BOTTOM: "BOTTOM",
  UTILITY: "UTILITY",
} as const;

/**
 * A aba de partidas: uma lista de jogos e, aberto, o relatório de um deles (§3).
 *
 * O relatório já vem pronto do servidor — este componente só apresenta. A hierarquia é a do §8:
 * primeiro a conclusão, depois as evidências, e o replay no fim para quem quiser conferir.
 */
export function MatchReportPanel({ games }: { games: GameReport[] }) {
  const t = useTranslations("premade.matches");
  const format = useFormatter();

  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyWithFinding, setOnlyWithFinding] = useState(false);
  // Filtro por pessoa: null mostra todas as partidas.
  const [personFilter, setPersonFilter] = useState<string | null>(null);

  // As pessoas que aparecem em pelo menos uma partida, em ordem alfabética de nome. Sai do próprio
  // dado: quem não jogou nenhuma partida listada não vira opção de filtro.
  const people = useMemo(() => {
    const byId = new Map<string, string>();
    for (const game of games) {
      for (const player of game.players) {
        const label = player.name ?? player.person.slice(0, 6);
        if (!byId.has(player.person)) byId.set(player.person, label);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [games]);

  const visible = useMemo(() => {
    const byPerson = personFilter
      ? games.filter((game) =>
          game.players.some((player) => player.person === personFilter),
        )
      : games;
    return onlyWithFinding
      ? byPerson.filter((game) => game.summary.inflections > 0)
      : byPerson;
  }, [games, onlyWithFinding, personFilter]);

  const withFinding = games.filter(
    (game) => game.summary.inflections > 0,
  ).length;

  if (games.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Clock}
          title={t("empty")}
          description={t("emptyHint")}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <p className="text-xs text-muted-foreground">
            {/* Com filtro ativo, o número que importa é o das partidas que sobraram. */}
            {personFilter
              ? t("coverageFiltered", {
                  shown: visible.length,
                  total: games.length,
                  found: withFinding,
                })
              : t("coverage", { found: withFinding, total: games.length })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={personFilter ?? ""}
              onChange={(event) => setPersonFilter(event.target.value || null)}
              aria-label={t("personFilter")}
              wrapperClassName="w-full sm:w-52"
            >
              <option value="">{t("everyone")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setOnlyWithFinding((value) => !value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                onlyWithFinding
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={onlyWithFinding}
            >
              {t("onlyWithFinding")}
            </button>
          </div>
        </div>
        {personFilter && visible.length === 0 && (
          <p className="px-1 pb-1 text-xs text-muted-foreground">
            {t("noMatchesForPerson", {
              name: people.find((person) => person.id === personFilter)?.name ?? "",
            })}
          </p>
        )}
      </Card>

      <ul className="space-y-2">
        {visible.map((game) => {
          const open = openId === game.matchId;
          return (
            <li key={game.matchId}>
              <GameRow
                game={game}
                open={open}
                onToggle={() =>
                  setOpenId((current) =>
                    current === game.matchId ? null : game.matchId,
                  )
                }
                formattedDate={format.dateTime(
                  new Date(game.gameCreation),
                  { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" },
                )}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GameRow({
  game,
  open,
  onToggle,
  formattedDate,
}: {
  game: GameReport;
  open: boolean;
  onToggle: () => void;
  formattedDate: string;
}) {
  const t = useTranslations("premade.matches");
  const found = game.summary.inflections > 0;

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md",
            game.win
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-rose-500/15 text-rose-400",
          )}
          aria-hidden
        >
          {game.win ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium">
              {game.win ? t("win") : t("loss")}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {formattedDate} · {mmss(game.summary.duration)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {found
              ? composeHeadline(t, game.summary.headline, game.summary.headlineWhat)
              : t("noFinding")}
          </span>
          {/* Quem do elenco jogou, direto na lista: é a informação que a partida tem de mais concreto. */}
          {game.players.length > 0 && (
            <span className="mt-1 block truncate text-2xs text-muted-foreground">
              {game.players
                .map((player) => player.name ?? player.person.slice(0, 6))
                .join(" · ")}
            </span>
          )}
        </span>

        {found && (
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 text-2xs",
              CONFIDENCE_TONE[game.summary.confidence],
            )}
          >
            {t(`confidence.${game.summary.confidence}`)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && <ReportBody game={game} />}
    </Card>
  );
}

/**
 * Quem do elenco jogou a partida, com campeão e função.
 *
 * Só pessoa do elenco entra aqui. Quando a partida foi registrada antes de a conta ser ligada a uma
 * pessoa, a lista vem vazia — e aí o painel diz isso, em vez de mostrar um bloco em branco.
 */
function Lineup({ players }: { players: GameReport["players"] }) {
  const t = useTranslations("premade.matches");
  // As funções já têm rótulo em `lanes`; duplicar aqui criaria duas fontes para o mesmo nome.
  const tLanes = useTranslations("premade.lanes");
  if (players.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("lineupEmpty")}</p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("lineupTitle", { count: players.length })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((player) => (
          <li
            key={player.person}
            className="flex items-baseline gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs"
          >
            <span className="font-medium">
              {player.name ?? player.person.slice(0, 6)}
            </span>
            {player.champion && (
              <span className="text-muted-foreground">{player.champion}</span>
            )}
            {player.role && (
              <span className="text-2xs uppercase text-muted-foreground">
                {ROLE_KEY[player.role as keyof typeof ROLE_KEY]
                  ? tLanes(ROLE_KEY[player.role as keyof typeof ROLE_KEY])
                  : player.role}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportBody({ game }: { game: GameReport }) {
  const t = useTranslations("premade.matches");
  const report = game.report;

  // A escalação aparece sempre, inclusive na partida sem conclusão: é um fato da partida, não uma
  // inferência, e é justamente o que se quer conferir ao abrir um jogo.
  const lineup = <Lineup players={game.players} />;

  // An inconclusive game carries no report: the body only shows the honest explanation.
  if (report === null) {
    return (
      <div className="space-y-4 border-t border-border px-4 py-4">
        {lineup}
        <p className="text-sm text-muted-foreground">{t("inconclusiveBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border px-4 py-4">
      {lineup}
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("headline")}
          value={composeHeadline(t, report.headline, report.headlineWhat)}
        />
        <Field
          label={t("criticalMoment")}
          value={report.criticalAt === null ? "—" : mmss(report.criticalAt)}
        />
        <Field label={t("impact")} value={renderText(t, report.impact)} />
        <Field
          label={t("interpretation")}
          value={renderText(t, report.interpretation)}
        />
        <Field
          label={t("improvement")}
          value={renderText(t, report.improvement)}
        />
        <Field
          label={t("confidence_label")}
          value={t(`confidence.${report.confidence}`)}
        />
      </dl>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("evidence")}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {report.evidence.map((item) => (
            <li
              key={item.label}
              className="rounded border border-border bg-muted/40 px-2 py-1 text-2xs text-muted-foreground"
            >
              {evidenceLabel(t, item)}:{" "}
              <span className="num text-foreground">{evidenceValue(item)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("inflections")}
        </p>
        <ul className="space-y-1.5">
          {report.inflections.map((point) => (
            <li
              key={`${point.kind}-${point.at}`}
              className="rounded-md border border-border px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="num text-xs text-muted-foreground">
                  {mmss(point.at)}
                </span>
                <span className="text-sm">{renderText(t, point.what)}</span>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-2xs",
                    CONFIDENCE_TONE[point.confidence],
                  )}
                >
                  {t(`confidence.${point.confidence}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {renderText(t, point.interpretation)}
              </p>
              {point.players.length > 0 && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {t("involved")}: {point.players.join(", ")}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                <span className="num">
                  {t("swing", { value: signedGold(point.swing) })}
                </span>
                <span className="num">
                  {t("replay", {
                    from: mmss(point.replayHint.from),
                    to: mmss(point.replayHint.to),
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {report.notEvaluated.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
            <Eye className="size-3" aria-hidden />
            {t("notEvaluated")}
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-2xs text-muted-foreground">
            {report.notEvaluated.map((entry) => (
              <li key={entry.id}>{renderText(t, entry)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Junta o enquadramento da manchete ("Apesar disto, venceu" / "Principal problema") com o fato que
 * ela enquadra. São duas chaves porque cada idioma ordena a frase e separa os dois trechos como
 * quiser; a partida sem ponto de inflexão já traz a manchete inteira e não passa `what`.
 */
function composeHeadline(
  t: ReturnType<typeof useTranslations<"premade.matches">>,
  headline: Text,
  what: Text | null,
): string {
  const frame = renderText(t, headline);
  if (what === null) return frame;
  return t("headlineWithFact", {
    headline: frame,
    what: renderText(t, what),
  });
}

/** O rótulo de uma evidência, que o módulo puro emite como chave. */
function evidenceLabel(
  t: ReturnType<typeof useTranslations<"premade.matches">>,
  item: InflectionEvidence,
): string {
  return t(`evidenceLabels.${item.label}` as "evidenceLabels.deathsBeforeObjective");
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

/** Unidade faz parte da saída: um número sem unidade não prova nada. */
function evidenceValue(item: InflectionEvidence): string {
  switch (item.unit) {
    case "gold":
      return signedGold(item.value);
    case "seconds":
      return `${Math.round(item.value)}s`;
    default:
      return String(item.value);
  }
}

/** Exportado para o teste do painel conferir que todo tipo tem rótulo traduzido. */
export const INFLECTION_KINDS: InflectionKind[] = [
  "deathsBeforeObjective",
  "objectiveLostAfterFight",
  "killsWithoutConversion",
  "leadFading",
  "teamSplit",
  "objectiveOutnumbered",
  "deathsIntoStructures",
];