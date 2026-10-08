import type { Banco } from '../banco/conexao.js';
import { diasEntre, somarDias } from './datas.js';

// Caixa (seção 5.4). Entradas vêm SEMPRE dos pagamentos (regra de ouro: receita não é digitada).

export const GRUPOS = ['operacao', 'obra', 'financiamento', 'investimento', 'casa_pessoal', 'retirada'] as const;

function somarAno(d: string, anos: number): string {
  const [a, m, dia] = d.split('-');
  const ano = Number(a) + anos;
  // 29/02 em ano sem bissexto vira 28/02
  const ultimo = new Date(Date.UTC(ano, Number(m), 0)).getUTCDate();
  return `${ano}-${m}-${String(Math.min(Number(dia), ultimo)).padStart(2, '0')}`;
}

function totais(banco: Banco, de: string, ate: string) {
  const entradas = banco
    .prepare('SELECT IFNULL(SUM(valor_liquido), 0) FROM pagamentos_validos WHERE data >= ? AND data < ?')
    .pluck()
    .get(de, ate) as number;
  const porGrupo = Object.fromEntries(GRUPOS.map((g) => [g, 0])) as Record<(typeof GRUPOS)[number], number>;
  const linhas = banco
    .prepare(
      `SELECT c.grupo, SUM(d.valor) AS total FROM despesas d JOIN categorias c ON c.id = d.categoria_id
       WHERE d.cancelado_em IS NULL AND d.data >= ? AND d.data < ? GROUP BY c.grupo`,
    )
    .all(de, ate) as { grupo: (typeof GRUPOS)[number]; total: number }[];
  for (const l of linhas) porGrupo[l.grupo] = l.total;
  const resultadoHotel = entradas - porGrupo.operacao;
  const depoisObra = resultadoHotel - porGrupo.obra - porGrupo.financiamento - porGrupo.investimento;
  const sobrou = depoisObra - porGrupo.casa_pessoal - porGrupo.retirada;
  return { entradas, porGrupo, resultados: { resultadoHotel, depoisObra, sobrou } };
}

export function resumoCaixa(banco: Banco, de: string, ate: string) {
  const t = totais(banco, de, ate);
  const porForma = banco
    .prepare('SELECT forma, SUM(valor_liquido) AS total FROM pagamentos_validos WHERE data >= ? AND data < ? GROUP BY forma ORDER BY total DESC')
    .all(de, ate);
  const porConta = banco
    .prepare(
      `SELECT c.sigla, IFNULL(c.nome, 'Não informado') AS nome, SUM(p.valor_liquido) AS total
       FROM pagamentos_validos p LEFT JOIN contas_recebedoras c ON c.id = p.conta_recebedora_id
       WHERE p.data >= ? AND p.data < ? GROUP BY p.conta_recebedora_id ORDER BY total DESC`,
    )
    .all(de, ate);
  const categorias = banco
    .prepare(
      `SELECT c.id, c.nome, c.grupo, SUM(d.valor) AS total, COUNT(*) AS lancamentos
       FROM despesas d JOIN categorias c ON c.id = d.categoria_id
       WHERE d.cancelado_em IS NULL AND d.data >= ? AND d.data < ? GROUP BY c.id ORDER BY total DESC`,
    )
    .all(de, ate);

  // Diárias vendidas (pode passar de 100% por quarto) × quartos-noite ocupados (seção 4)
  const ocupacao = banco
    .prepare(
      `SELECT COUNT(*) AS diarias, COUNT(DISTINCT e.quarto_id || '|' || n.data) AS quartosNoite, IFNULL(SUM(n.valor), 0) AS valorDiarias
       FROM estadia_noites n JOIN estadias e ON e.id = n.estadia_id
       WHERE n.data >= ? AND n.data < ? AND e.status NOT IN ('cancelada','expirada','no_show')`,
    )
    .get(de, ate) as { diarias: number; quartosNoite: number; valorDiarias: number };
  const quartosAtivos = banco.prepare('SELECT COUNT(*) FROM quartos WHERE ativo = 1').pluck().get() as number;
  const noitesPeriodo = diasEntre(de, ate);

  // Mesmo período do ano anterior; antes de 2025, o faturamento mensal da planilha antiga
  const deAnt = somarAno(de, -1);
  const ateAnt = somarAno(ate, -1);
  const anterior = totais(banco, deAnt, ateAnt);
  // Só faz sentido para meses inteiros (a planilha antiga tem o total do mês)
  const mesInteiro = de.endsWith('-01') && ate.endsWith('-01');
  const faturamentoAntigo = mesInteiro
    ? (banco
        .prepare('SELECT IFNULL(SUM(valor), 0) FROM faturamento_historico WHERE mes >= ? AND mes <= ?')
        .pluck()
        .get(deAnt.slice(0, 7), somarDias(ateAnt, -1).slice(0, 7)) as number)
    : 0;

  return {
    de,
    ate,
    ...t,
    porForma,
    porConta,
    categorias,
    ocupacao: { ...ocupacao, quartosAtivos, noitesPeriodo, capacidade: quartosAtivos * noitesPeriodo },
    anterior: {
      de: deAnt,
      ate: ateAnt,
      ...anterior,
      faturamentoPlanilhaAntiga: anterior.entradas === 0 && faturamentoAntigo > 0 ? faturamentoAntigo : null,
    },
  };
}

export function lancamentosDespesas(banco: Banco, de: string, ate: string) {
  return banco
    .prepare(
      `SELECT d.id, d.data, d.fornecedor, d.descricao, d.valor, d.forma, d.obs, d.cancelado_em, d.conta_a_pagar_id, d.vale_id,
         d.categoria_id, c.nome AS categoria, c.grupo, d.importacao_id
       FROM despesas d JOIN categorias c ON c.id = d.categoria_id
       WHERE d.data >= ? AND d.data < ? ORDER BY d.data DESC, d.id DESC`,
    )
    .all(de, ate);
}

export function lancamentosEntradas(banco: Banco, de: string, ate: string) {
  return banco
    .prepare(
      `SELECT p.id, p.data, p.valor_liquido AS valor, p.forma, p.tipo, c.sigla AS conta, h.nome, q.codigo AS quarto, p.estadia_id
       FROM pagamentos_validos p JOIN estadias e ON e.id = p.estadia_id JOIN hospedes h ON h.id = e.hospede_id
       JOIN quartos q ON q.id = e.quarto_id LEFT JOIN contas_recebedoras c ON c.id = p.conta_recebedora_id
       WHERE p.data >= ? AND p.data < ? ORDER BY p.data DESC, p.id DESC`,
    )
    .all(de, ate);
}
