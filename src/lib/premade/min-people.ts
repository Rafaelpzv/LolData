import type { PremadeMatchSample, PremadePlayer } from "./types";
import { peopleOfMatch } from "./metrics";
import { accountOwners } from "./members";

/**
 * Filtro de "mínimo de jogadores por partida".
 *
 * A coleta já descarta partidas abaixo do mínimo, mas o mínimo pode mudar depois: a equipe ajusta o
 * seletor, ou adiciona gente ao elenco e o mínimo efetivo muda. O que está guardado não é reescrito,
 * então a análise precisa recortar na hora de mostrar — senão o seletor não faz nada e as métricas
 * somam partidas de 2 pessoas com partidas de 5.
 *
 * A contagem é de PESSOAS distintas do elenco na mesma partida, exatamente a regra da coleta: duas
 * contas da mesma pessoa contam uma vez.
 */

/** Quantas pessoas do elenco jogaram esta partida. */
export function rosterPeopleIn(
  match: PremadeMatchSample,
  players: PremadePlayer[],
): number {
  return peopleOfMatch(match, accountOwners(players)).length;
}

/**
 * As partidas que respeitam o mínimo, e o que ficou de fora.
 *
 * `minPeople <= 1` não filtra nada: é o caso de "quero ver tudo". O retorno traz as contagens de
 * descarte por tamanho de escalação, para a interface poder dizer o que escondeu em vez de encolher
 * a lista em silêncio.
 */
export function filterByMinPeople<T extends PremadeMatchSample>(
  matches: T[],
  players: PremadePlayer[],
  minPeople: number,
): {
  kept: T[];
  dropped: number;
  /** Quantas partidas havia para cada tamanho de escalação (inclui as mantidas). */
  bySize: Record<number, number>;
} {
  const required = Math.max(1, Math.trunc(minPeople));
  const bySize: Record<number, number> = {};
  const kept: T[] = [];
  for (const match of matches) {
    const size = rosterPeopleIn(match, players);
    bySize[size] = (bySize[size] ?? 0) + 1;
    if (size >= required) kept.push(match);
  }
  return { kept, dropped: matches.length - kept.length, bySize };
}
