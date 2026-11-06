// What the four tabs read, computed once by whichever page shows them (editor or shared lineup).
import {
  buildDimensions,
  type DimensionReport,
} from "@/lib/premade/dimensions";
import {
  computePlayerDepth,
  deathEvents,
  type PlayerDepth,
} from "@/lib/premade/individual-metrics";
import { diagnoseRoster, type PlayerDiagnosis } from "@/lib/premade/individual-diagnosis";
import { groupDeathsPerGame, peopleOfMatch } from "@/lib/premade/metrics";
import { accountOwners } from "@/lib/premade/members";
import { computeMetrics, splitPeriods, type PremadeMetrics } from "@/lib/premade/metrics";
import type { PeriodWindow } from "@/lib/premade/metrics";
import {
  buildPatterns,
  deathSpread,
  type RecurringPattern,
} from "@/lib/premade/patterns";
import {
  buildRecommendations,
  buildTimelineInsights,
  withSampleLedger,
} from "@/lib/premade/recommendations";
import { computeRatings, type TeamRatings } from "@/lib/premade/score";
import { buildSynergyReport, type SynergyReport } from "@/lib/premade/synergy";
import {
  computeTimelineMetrics,
  type TimelineMetrics,
} from "@/lib/premade/timeline-metrics";
import {
  classifyMatches,
  type MatchSets,
} from "@/lib/premade/integrity";
import type { PremadeMatchSample, PremadePlayer } from "@/lib/premade/types";
import type { Insight } from "@/lib/premade/insights";
import type { Recommendation } from "@/lib/premade/recommendations";
import type { PremadeTimeline } from "@/lib/premade/timeline";
import { matchReport, type MatchReport } from "@/lib/premade/match-report";
import type { Text } from "@/lib/premade/i18n";
import type { MatchTimeline } from "@/components/premade/timeline-panel";
import type { SeriesGame } from "@/components/premade/evolution-panel";

/**
 * Quem do elenco jogou esta partida, com a função e o campeão de cada um.
 *
 * Fica no jogo (e não numa lista global) porque a pergunta é por partida: quem jogou o quê naquele
 * jogo. A ordem é a de `peopleOfMatch`, que já resolve a pessoa pelo dono da conta e ignora a conta
 * de preenchimento — quem não é do elenco não aparece como se fosse.
 */
export interface GamePlayer {
  person: string;
  /** Nome atual da pessoa; sem nome, o chamador decide o rótulo. */
  name: string | null;
  champion: string | null;
  /** "TOP", "JUNGLE"… como a Riot manda; vazio vira null. */
  role: string | null;
}

/** One game with its post-game report (§3), newest first. */
export interface GameReport {
  matchId: string;
  gameCreation: number;
  win: boolean;
  /** The headline and the confidence, which is all the collapsed list shows. */
  summary: {
    duration: number;
    /** Chave + valores: a interface traduz para o idioma do leitor. */
    headline: Text;
    /** O fato que a manchete enquadra; null quando a partida não teve ponto de inflexão. */
    headlineWhat: Text | null;
    confidence: MatchReport["confidence"];
    inflections: number;
  };
  /**
   * Quem do elenco jogou esta partida. Vazio quando o jogo não tem participante atribuído — o que
   * acontece com partidas antigas, antes de a conta ser ligada a uma pessoa.
   */
  players: GamePlayer[];
  /**
   * The full report, only for the games that have something to say. `null` for the rest: sending
   * the evidence of an inconclusive game would cost ~4 KB per game to say "nothing to conclude".
   */
  report: MatchReport | null;
}

export interface TeamAnalysis {
  metrics: PremadeMetrics;
  ratings: TeamRatings;
  recommendations: Recommendation[];
  /** Evidence-first observations (timeline rules and the sample coverage). */
  insights: Insight[];
  dimensions: DimensionReport;
  synergy: SynergyReport;
  series: SeriesGame[];
  timeline: { metrics: TimelineMetrics; games: MatchTimeline[] };
  /** Per-game post-game analysis: why this game went the way it did. */
  reports: GameReport[];
  /** Recurring habits and the dispersion of deaths per game (§4). */
  patterns: { items: RecurringPattern[]; deaths: ReturnType<typeof deathSpread> };
  depths: PlayerDepth[];
  /**
   * The individual diagnosis of every person (§5), already computed on the server: the rules are
   * pure, but they are not free to run on every render, and both pages must show the same words.
   */
  diagnoses: PlayerDiagnosis[];
  /**
   * Deaths of the roster group per game: the reference the diagnosis compares a person against.
   * Never the side total — see `groupDeathsPerGame`.
   */
  groupDeathsPerGame: number | null;
  /**
   * The lineup and data sets the window splits into (full/partial, with/without a timeline). Every
   * number above was read from one of these, and the page says which one (§2.1).
   */
  integrity: MatchSets;
  /** The dates the series covers, so a window is never read without its period. */
  window: {
    games: number;
    from: number | null;
    to: number | null;
    /** Games with the full five-person lineup. */
    fullGames: number;
    /** One entry per distinct UTC day, oldest first: the period the numbers come from. */
    days: string[];
  };
}

/**
 * The analysis of the four tabs from the stored data. Both pages call this same function, so the
 * shared lineup shows exactly the numbers the editor sees.
 */
export function buildTeamAnalysis(
  matches: PremadeMatchSample[],
  players: PremadePlayer[],
  timelines: PremadeTimeline[],
): TeamAnalysis {
  const owners = accountOwners(players);
  const metrics = computeMetrics(matches, owners);
  const recommendations = withSampleLedger(
    [
      ...buildRecommendations(
        metrics,
        matches,
        players,
        owners,
        timelines.length,
        matches.length,
      ),
    ],
    timelines.length,
    metrics.games,
  );
  const ratings = computeRatings(metrics, matches);
  const deathsByMatch = new Map(
    timelines.map((entry) => [entry.matchId, deathEvents(entry.deaths)]),
  );
  const depths = metrics.players.map((profile) =>
    computePlayerDepth(
      profile.puuid,
      matches,
      profile,
      metrics,
      owners,
      deathsByMatch,
    ),
  );
  // Timelines that no longer belong to a stored match (the lineup changed) are left out: a game
  // without its match has no result to read, and reading it as a loss would bias every rate.
  const winByMatch = new Map(
    matches.map((match) => [match.matchId, match.win]),
  );
  const readTimelines = timelines.filter((entry) =>
    winByMatch.has(entry.matchId),
  );
  const integrity = classifyMatches(matches, {
    owners,
    timelineIds: new Set(readTimelines.map((entry) => entry.matchId)),
  });
  // Names are the roster names, never the raw ids: §5.3 "Jogador" is a person, not a uuid.
  const nameOfPerson = (person: string): string => {
    const player = players.find((entry) => entry.id === person);
    if (!player) return person.slice(0, 8);
    return (
      player.accounts.find((account) => !account.archived)?.gameName ??
      player.gameName
    );
  };
  const groupDeaths = groupDeathsPerGame(matches, owners);
  // A média POR PESSOA do grupo: o grupo morre ~29 por partida, cada pessoa ~5,9. Comparar a pessoa
  // com o total fazia todo diagnóstico de morte voltar como "do time" (ver `DiagnosisInput`).
  const peoplePerGame =
    matches.length > 0
      ? matches.reduce(
          (sum, match) => sum + peopleOfMatch(match, owners).length,
          0,
        ) / matches.length
      : 0;
  const rosterDeathsPerPerson =
    groupDeaths !== null && peoplePerGame > 0
      ? groupDeaths / peoplePerGame
      : null;
  const diagnoses = diagnoseRoster(
    {
      depths,
      names: new Map(depths.map((depth) => [depth.person, nameOfPerson(depth.person)])),
      teamDeathsPerGame: groupDeaths,
      rosterDeathsPerPerson,
      teamGames: metrics.games,
      fullGames: integrity.full.length,
    },
    (depth) => {
      const played = matches.filter((match) =>
        match.participants.some(
          (participant) => participant.puuid === depth.person,
        ),
      );
      const durations = played
        .map((match) => match.timelineDuration ?? match.duration)
        .sort((a, b) => a - b);
      return durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null;
    },
  );
  const timelineMetrics = computeTimelineMetrics(
    readTimelines.map((entry) => ({
      timeline: entry,
      win: winByMatch.get(entry.matchId) ?? false,
      duration: entry.duration,
    })),
    matches.length,
  );
  // The dimensions compare the newest window against the one before it, each with its own timelines.
  const timelineFor = (window: PeriodWindow) => {
    const ids = new Set(window.games.map((match) => match.matchId));
    const subset = readTimelines.filter((entry) => ids.has(entry.matchId));
    if (subset.length === 0) return null;
    return computeTimelineMetrics(
      subset.map((entry) => ({
        timeline: entry,
        win: winByMatch.get(entry.matchId) ?? false,
        duration: entry.duration,
      })),
      window.games.length,
    );
  };
  const dimensions = buildDimensions(
    matches,
    timelineFor,
    (window) => computeMetrics(window.games, owners),
    owners,
  );
  const synergy = buildSynergyReport(matches, readTimelines);
  // Recurring patterns (§4): the same windows the dimensions compare, so "before" means the same
  // thing on both screens.
  const periods = splitPeriods(matches);
  const timelinesFor = (window: PeriodWindow) => {
    const ids = new Set(window.games.map((match) => match.matchId));
    return readTimelines.filter((entry) => ids.has(entry.matchId));
  };
  const patterns = buildPatterns({
    recent: { matches: periods.recent.games, timelines: timelinesFor(periods.recent) },
    previous: {
      matches: periods.previous.games,
      timelines: timelinesFor(periods.previous),
    },
  });
  const spreads = deathSpread({
    recent: { matches: periods.recent.games, timelines: timelinesFor(periods.recent) },
    previous: {
      matches: periods.previous.games,
      timelines: timelinesFor(periods.previous),
    },
  });
  // The observations of the timeline rules, plus the coverage gap when some game has no timeline.
  const insights = [
    ...buildTimelineInsights(timelineMetrics),
    ...(matches.length > 0 && readTimelines.length < matches.length
      ? [
          {
            code: "timelineCoverage",
            kind: "coverage" as const,
            band: "insufficient" as const,
            evidence: { games: readTimelines.length, total: matches.length },
          },
        ]
      : []),
  ];
  const timelineGames: MatchTimeline[] = readTimelines.map((entry) => ({
    matchId: entry.matchId,
    win: winByMatch.get(entry.matchId) ?? false,
    duration: entry.duration,
    goldDiff: entry.goldDiff,
    kills: entry.kills.map((kill) => ({
      at: kill.at,
      kind: String(kill.kind ?? ""),
      x: kill.x ?? 0,
      y: kill.y ?? 0,
      // O §8.4 pede filtro por jogador e abertura da evidência de cada evento: a pessoa e o número
      // de aliados perto são o que tornam o evento explicável, então viajam com ele.
      person: kill.person ?? null,
      near: typeof kill.near === "number" ? kill.near : null,
    })),
    objectives: entry.objectives.map((item) => ({
      at: item.at,
      kind: String(item.kind ?? ""),
      x: item.x ?? 0,
      y: item.y ?? 0,
      variant: item.variant ?? null,
      near: typeof item.near === "number" ? item.near : null,
    })),
    // As mortes do mapa, para o filtro por jogador alcançar também quem morreu (e para a sequência
    // "morte → objetivo perdido" ter o que encadear).
    deaths: (entry.deaths ?? []).map((death) => ({
      at: death.at,
      person: death.person ?? null,
      near: typeof death.near === "number" ? death.near : null,
      costly: death.costly === true,
    })),
  }));
  // The post-game report of every game that has a timeline (§3). Built here, on the server, so the
  // client only renders: the detector is pure, but it is not free to run on every render.
  const nameOf = (person: string | null) => {
    if (!person) return null;
    const player = players.find((entry) => entry.id === person);
    if (!player) return null;
    return (
      player.accounts.find((account) => !account.archived)?.gameName ??
      player.gameName
    );
  };
  const matchById = new Map(matches.map((match) => [match.matchId, match]));
  const reports = readTimelines
    .map((entry) => {
      const match = matchById.get(entry.matchId);
      if (!match) return null;
      const report = matchReport(match, entry, nameOf);
      return {
        matchId: entry.matchId,
        gameCreation: match.gameCreation ?? 0,
        win: match.win,
        summary: {
          duration: report.duration,
          // A lista mostra a mesma manchete do relatório: o enquadramento e, quando existe, o fato.
          // As duas chaves vão inteiras para a interface juntar na ordem do idioma.
          headline: report.headline,
          headlineWhat: report.headlineWhat,
          confidence: report.confidence,
          inflections: report.inflections.length,
        },
        // Quem do elenco jogou: a mesma resolução de pessoa usada nas métricas, para o filtro da aba
        // e o diagnóstico individual nunca discordarem sobre quem estava na partida.
        players: peopleOfMatch(match, owners).map(({ person, participant }) => ({
          person,
          name: nameOf(person),
          champion: participant.championName || null,
          role: participant.teamPosition || null,
        })),
        // Only what can be shown: an inconclusive game keeps just its summary.
        report: report.inflections.length > 0 ? report : null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.gameCreation - a.gameCreation);

  return {
    metrics,
    ratings,
    recommendations,
    insights,
    dimensions,
    synergy,
    series: matches
      .slice()
      .sort((a, b) => (b.gameCreation ?? 0) - (a.gameCreation ?? 0))
      .map((match) => ({
        matchId: match.matchId,
        gameCreation: match.gameCreation ?? 0,
        win: match.win,
      })),
    timeline: { metrics: timelineMetrics, games: timelineGames },
    reports,
    patterns: { items: patterns, deaths: spreads },
    depths,
    diagnoses,
    groupDeathsPerGame: groupDeaths,
    integrity,
    window: {
      games: matches.length,
      from:
        matches.length > 0
          ? Math.min(...matches.map((match) => match.gameCreation))
          : null,
      to:
        matches.length > 0
          ? Math.max(...matches.map((match) => match.gameCreation))
          : null,
      // Only the five-person games: every metric mixes partial games otherwise, and the page says so.
      fullGames:
        metrics.presence.find((bucket) => bucket.players >= 5)?.games ?? 0,
      days: [
        ...new Set(
          matches.map((match) =>
            new Date(match.gameCreation).toISOString().slice(0, 10),
          ),
        ),
      ].sort(),
    },
  };
}
