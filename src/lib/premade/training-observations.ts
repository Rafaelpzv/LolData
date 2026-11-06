/**
 * Liga os dados coletados às métricas de treinamento (§6): transforma as partidas de uma pessoa
 * (ou do grupo) em observações de UMA métrica, uma por partida, na forma que `training.ts` compara.
 *
 * A regra que este módulo existe para não violar: dado ausente não é zero. Uma partida sem timeline
 * não tem CS aos 10 min nem sabe se a morte foi isolada; ela devolve `value: null` e a avaliação a
 * descarta — nunca a lê como 0, o que faria quem acertou o checkpoint parecer pior ao começar a
 * usar a timeline.
 *
 * Puro: sem I/O, sem Supabase, sem Next.
 */
import {
  minutesOf,
  playedGames,
  type PlayerDepth,
  type TimelineDeathMap,
} from "./individual-metrics";
import { peopleOfMatch } from "./metrics";
import type { TrainingMetric, TrainingObservation } from "./training";
import type { AccountOwners, PremadeMatchSample } from "./types";

/** O checkpoint da lane em segundos; o mesmo que `playerEarly` lê como "aos 10 min". */
const LANE_CHECKPOINT = 600;

/**
 * O que uma morte isolada significa para uma partida: a fração das mortes da pessoa que aconteceu
 * sem outro integrante do elenco por perto. Sem timeline, ou sem morte nenhuma, é `null` — não 0%.
 */
function aloneDeathShare(
  deaths: readonly { person: string | null; alone: boolean }[] | undefined,
  person: string,
): number | null {
  if (!deaths) return null;
  const own = deaths.filter((death) => death.person === person);
  // A partida em que a pessoa não morreu não diz nada sobre "morrer sozinho": sai como ausente.
  if (own.length === 0) return null;
  return (own.filter((death) => death.alone).length / own.length) * 100;
}

/**
 * As observações de cada métrica de treinamento para uma pessoa ou para o grupo.
 *
 * `person: null` lê a métrica do grupo (o lado): só `teamDeathsPerGame` faz sentido assim — as
 * demais exigem uma pessoa e, chamadas com `null`, devolvem lista vazia.
 */
export function trainingObservations(
  metric: TrainingMetric,
  options: {
    matches: PremadeMatchSample[];
    depths: PlayerDepth[];
    owners?: AccountOwners;
    person: string | null;
    /** As mortes por partida da timeline coletada (as mesmas que o painel individual lê). */
    deathsByMatch?: TimelineDeathMap;
  },
): TrainingObservation[] {
  const { matches, person } = options;
  const owners = options.owners ?? {};

  if (metric === "teamDeathsPerGame") {
    return matches.map((match) => {
      const people = peopleOfMatch(match, owners);
      return {
        matchId: match.matchId,
        at: match.gameCreation,
        // Sem ninguém do elenco nesta partida não há mortes do grupo a medir: null, não zero.
        value:
          people.length > 0
            ? people.reduce((sum, entry) => sum + entry.participant.deaths, 0)
            : null,
      };
    });
  }

  if (person === null) return [];
  if (!options.depths.some((depth) => depth.person === person)) return [];
  const played = playedGames(matches, person, owners);

  return played.map(({ match, participant }) => {
    const minutes = minutesOf(match);
    let value: number | null;
    switch (metric) {
      case "deathsPerGame":
        value = participant.deaths;
        break;
      case "killParticipation": {
        const takedowns = participant.kills + participant.assists;
        // O denominador é o lado inteiro, o mesmo da métrica individual: um jogo sem abates do lado
        // não permite dizer a participação.
        value = match.teamKills > 0 ? (takedowns / match.teamKills) * 100 : null;
        break;
      }
      case "visionPerMin":
        value = minutes > 0 ? participant.visionScore / minutes : null;
        break;
      case "damagePerDeath":
        value =
          participant.deaths > 0
            ? participant.totalDamageDealtToChampions / participant.deaths
            : null;
        break;
      case "csDiffAt10": {
        const lane = participant.derived?.laning?.find(
          (entry) => entry.at === LANE_CHECKPOINT,
        );
        value = lane ? lane.cs - lane.enemyCs : null;
        break;
      }
      case "aloneDeathShare":
        value = aloneDeathShare(
          options.deathsByMatch?.get(match.matchId),
          person,
        );
        break;
      default:
        value = null;
    }
    return { matchId: match.matchId, at: match.gameCreation, value };
  });
}

/**
 * O histórico de valores válidos de uma métrica, para dimensionar a meta sugerida (§6.3): a
 * variabilidade da própria pessoa determina o tamanho do passo, não um número redondo.
 */
export function metricHistory(
  observations: readonly TrainingObservation[],
): number[] {
  return observations
    .map((entry) => entry.value)
    .filter((value): value is number => value !== null);
}
