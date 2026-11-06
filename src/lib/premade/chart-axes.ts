/**
 * Os eixos de um gráfico do painel (§8.5).
 *
 * O §8.5 pede que TODO gráfico diga unidade, período, amostra, legenda, qual direção é melhor e com
 * o que está comparando. Legenda e amostra cada painel já trazia; o que faltava era o eixo: sem ele
 * o leitor não consegue ler um valor, só a forma da curva. Este módulo desenha os dois eixos com as
 * marcas em valores reais, e o rótulo da unidade vai no próprio eixo — nunca só no texto abaixo.
 *
 * Puro: recebe números e devolve marcações.
 */

/** Uma marca de eixo: posição em coordenadas do viewBox e o rótulo já formatado. */
export interface AxisTick {
  /** Coordenada no eixo (x para o horizontal, y para o vertical). */
  at: number;
  label: string;
}

/** Quantas marcas cabem num eixo sem virar grade: três ou quatro se lê, dez não. */
const MAX_TICKS = 4;

/**
 * Marcas do eixo do tempo, em minutos.
 *
 * A escala é sempre 0..`width`, com a primeira marca em 0 e a última no fim da partida: um gráfico
 * que começa em "4" sem explicar recorta dado sem avisar.
 */
export function timeTicks(
  durationSeconds: number,
  width: number,
  pad: number,
  format: (second: number) => string,
): AxisTick[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const inner = width - pad * 2;
  if (inner <= 0) return [];
  // Passos redondos em minutos (1, 2, 5, 10…), para o eixo não marcar 7:30.
  const totalMinutes = durationSeconds / 60;
  const steps = [1, 2, 5, 10, 15, 20, 30];
  const step =
    steps.find((candidate) => totalMinutes / candidate <= MAX_TICKS) ??
    steps[steps.length - 1];
  const out: AxisTick[] = [];
  for (let minute = 0; minute <= totalMinutes; minute += step) {
    out.push({
      at: pad + (minute / totalMinutes) * inner,
      label: format(minute * 60),
    });
  }
  // A última marca é o fim da partida, mesmo que não caia num passo redondo.
  const last = out[out.length - 1];
  const endX = pad + inner;
  if (!last || Math.abs(last.at - endX) > 1) {
    out.push({ at: endX, label: format(durationSeconds) });
  }
  return out;
}

/**
 * Marcas do eixo do valor, simétricas em torno de zero.
 *
 * A diferença de ouro fica simétrica porque a mesma distância para cima e para baixo é a mesma
 * vantagem: um eixo de -3.000 a +9.000 faria uma liderança de 3.000 parecer maior do que é.
 */
export function valueTicks(
  max: number,
  height: number,
  pad: number,
  format: (value: number) => string,
): AxisTick[] {
  if (!Number.isFinite(max) || max <= 0) return [];
  const inner = height - pad * 2;
  if (inner <= 0) return [];
  const toY = (value: number) => pad + (0.5 - value / (max * 2)) * inner;
  return [max, max / 2, 0, -max / 2, -max].map((value) => ({
    at: toY(value),
    label: format(value),
  }));
}

/**
 * O extremo que o eixo precisa mostrar, arredondado para um número legível.
 *
 * Devolve pelo menos `floor` para um gráfico quase reto não virar uma linha de ruído ampliada — o
 * §8.5 pede para não transmitir precisão maior do que o dado tem, e ampliar uma variação de 200 de
 * ouro até encher a tela faria exatamente isso.
 */
export function axisExtent(values: readonly number[], floor: number): number {
  const peak = values.reduce(
    (max, value) => (Number.isFinite(value) ? Math.max(max, Math.abs(value)) : max),
    0,
  );
  if (peak <= floor) return floor;
  // Passo "bonito": 1, 2 ou 5 vezes uma potência de dez.
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const step = [1, 2, 5, 10].find((factor) => peak <= factor * magnitude) ?? 10;
  return step * magnitude;
}
