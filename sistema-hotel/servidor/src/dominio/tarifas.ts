import type { Banco } from '../banco/conexao.js';

/** Acima do que estiver na tabela, cada pessoa a mais soma isso (regra do dono: R$ 100 por pessoa). */
export const VALOR_PESSOA_EXTRA = 10000;

export interface Tarifa {
  pessoas: number;
  valor: number;
}

export function tabelaGeral(banco: Banco): Tarifa[] {
  return banco
    .prepare('SELECT pessoas, valor FROM tarifas WHERE quarto_id IS NULL ORDER BY pessoas')
    .all() as Tarifa[];
}

export function tabelaDoQuarto(banco: Banco, quartoId: number): Tarifa[] {
  return banco
    .prepare('SELECT pessoas, valor FROM tarifas WHERE quarto_id = ? ORDER BY pessoas')
    .all(quartoId) as Tarifa[];
}

/** Diária sugerida: exceção do quarto → tabela geral → maior faixa + R$ 100 por pessoa a mais. */
export function diariaSugerida(banco: Banco, quartoId: number | null, pessoas: number): number {
  if (quartoId !== null) {
    const ex = banco
      .prepare('SELECT valor FROM tarifas WHERE quarto_id = ? AND pessoas = ?')
      .get(quartoId, pessoas) as { valor: number } | undefined;
    if (ex) return ex.valor;
  }
  const geral = tabelaGeral(banco);
  const exata = geral.find((t) => t.pessoas === pessoas);
  if (exata) return exata.valor;
  const abaixo = geral.filter((t) => t.pessoas < pessoas).pop();
  if (abaixo) return abaixo.valor + (pessoas - abaixo.pessoas) * VALOR_PESSOA_EXTRA;
  return geral[0]?.valor ?? 0;
}
