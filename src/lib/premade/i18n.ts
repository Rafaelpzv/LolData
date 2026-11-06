/**
 * Texto que a interface traduz, em vez de uma frase pronta num idioma só.
 *
 * Os módulos de análise são puros: não sabem o idioma do leitor, não importam next-intl e não devem
 * escolher um idioma. Antes eles devolviam frases em português, e quem abrisse a página em inglês lia
 * português no meio do resto traduzido. Agora devolvem uma CHAVE com os valores da interpolação, e
 * quem renderiza escolhe o idioma.
 *
 * Puro: sem I/O, sem Next.
 */

/** Um `id` da tabela de mensagens do namespace que o chama, com os valores da interpolação. */
export interface Text {
  /** Chave dentro do namespace do painel (ex.: `reason.metricRead`). */
  id: string;
  /** Valores da interpolação; os números já vêm formatados de forma neutra. */
  values?: Record<string, string | number>;
}

/** Atalho para escrever um `Text` sem repetir a forma do objeto. */
export function text(
  id: string,
  values?: Record<string, string | number>,
): Text {
  return values ? { id, values } : { id };
}
