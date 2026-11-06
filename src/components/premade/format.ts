/**
 * Formatadores de taxa do painel de premade.
 *
 * Existe porque cada painel declarava um `pct()` próprio e os módulos de métricas devolvem
 * unidades diferentes (ver `individual-metrics.ts`): umas em fração 0..1, outras já em 0..100.
 * Um `pct()` ambíguo multiplicado por 100 em cima de um valor que já era percentual produziu três
 * bugs de "5441%" / "5780,8%" na interface. Aqui a unidade faz parte do nome da função, então o
 * erro não tem como ser escrito: `fromFraction` para 0..1, `fromPercent` para 0..100.
 *
 * Sem I/O e sem estado: só formatação.
 */

const EMPTY = "\u2014";

/** Quantas casas decimais o percentual usa. */
export type PercentDigits = 0 | 1;

function render(value: number | null, digits: PercentDigits): string {
  if (value === null || Number.isNaN(value)) return EMPTY;
  const factor = digits === 0 ? 1 : 10;
  const rounded = Math.round(value * factor) / factor;
  return `${rounded}%`;
}

/** Uma fração 0..1 (ex.: `killParticipation.ratio = 0.72`) como percentual: "72%". */
export function fromFraction(
  value: number | null,
  digits: PercentDigits = 0,
): string {
  return value === null || Number.isNaN(value)
    ? EMPTY
    : render(value * 100, digits);
}

/** Um valor que JÁ É percentual 0..100 (ex.: `winRate = 54.41`) formatado: "54%". */
export function fromPercent(
  value: number | null,
  digits: PercentDigits = 0,
): string {
  return render(value, digits);
}

/** Uma razão guardada como proporção com os limites ("IC95 44–64%"). */
export function interval(
  low: number | null,
  high: number | null,
  digits: PercentDigits = 0,
): string {
  if (low === null || high === null || Number.isNaN(low) || Number.isNaN(high))
    return EMPTY;
  return `${fromFraction(low, digits)}\u2013${fromFraction(high, digits)}`;
}
