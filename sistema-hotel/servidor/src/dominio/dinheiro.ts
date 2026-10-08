/** Reais (número da planilha, ex.: 194.24) → centavos inteiros, sem erro de ponto flutuante. */
export function reaisParaCentavos(reais: number): number {
  // toFixed(6) tira o resíduo binário (1.005 * 100 = 100.49999...) antes de arredondar
  return Math.round(Number((reais * 100).toFixed(6)));
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarReais(centavos: number): string {
  return fmt.format(centavos / 100);
}
