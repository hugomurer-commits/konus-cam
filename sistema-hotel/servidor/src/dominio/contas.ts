import type { Banco } from '../banco/conexao.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import { dataLocal, dataNoMes, diasEntre, somarDias, somarMeses } from './datas.js';
import { idCategoriaPorNome, inserirDespesa, reabrirConta, type FormaPagamento } from './despesas.js';
import type { Agora } from './estadias.js';

// Contas a pagar (seção 5.5): geradas das recorrentes e dos salários, ou avulsas.
// "Paguei" gera a despesa na hora, então nada é lançado duas vezes.

export const CATEGORIA_FUNCIONARIOS = 'Funcionários';

interface Recorrente {
  id: number;
  nome: string;
  fornecedor: string;
  categoria_id: number;
  valor_previsto: number | null;
  valor_variavel: number;
  dia_vencimento: number;
  parcelas_restantes: number | null;
  avisar_dias_antes: number;
  inicio_competencia: string | null;
}

interface Funcionaria {
  id: number;
  nome: string;
  salario: number;
  dia_pagamento: number;
  inicio_competencia: string | null;
}

/**
 * Garante as contas do mês atual e do próximo. Na primeira vez, se o vencimento deste mês
 * já passou, começa no mês seguinte (a conta deste mês foi paga do jeito antigo).
 */
export function garantirContas(banco: Banco, agora: Date) {
  const hoje = dataLocal(agora);
  const mesAtual = hoje.slice(0, 7);
  const meses = [mesAtual, somarMeses(mesAtual, 1)];
  banco.transaction(() => {
    const recorrentes = banco.prepare('SELECT * FROM contas_recorrentes WHERE ativa = 1').all() as Recorrente[];
    for (const r of recorrentes) {
      let inicio = r.inicio_competencia;
      if (!inicio) {
        inicio = dataNoMes(mesAtual, r.dia_vencimento) >= hoje ? mesAtual : somarMeses(mesAtual, 1);
        banco.prepare('UPDATE contas_recorrentes SET inicio_competencia = ? WHERE id = ?').run(inicio, r.id);
      }
      for (const mes of meses) {
        if (mes < inicio) continue;
        const existe = banco
          .prepare(`SELECT 1 FROM contas_a_pagar WHERE recorrente_id = ? AND competencia = ? AND status <> 'cancelada'`)
          .get(r.id, mes);
        if (existe) continue;
        if (r.parcelas_restantes !== null) {
          const abertas = banco
            .prepare(`SELECT COUNT(*) FROM contas_a_pagar WHERE recorrente_id = ? AND status = 'aberta'`)
            .pluck()
            .get(r.id) as number;
          if (abertas >= r.parcelas_restantes) continue;
        }
        banco
          .prepare(
            `INSERT INTO contas_a_pagar (recorrente_id, descricao, categoria_id, fornecedor, competencia, vencimento,
               valor_previsto, valor_variavel, avisar_dias_antes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(r.id, r.nome, r.categoria_id, r.fornecedor, mes, dataNoMes(mes, r.dia_vencimento), r.valor_previsto, r.valor_variavel, r.avisar_dias_antes);
      }
    }
    const funcionarias = banco.prepare('SELECT * FROM funcionarias WHERE ativa = 1').all() as Funcionaria[];
    const catFunc = idCategoriaPorNome(banco, CATEGORIA_FUNCIONARIOS);
    for (const f of funcionarias) {
      let inicio = f.inicio_competencia;
      if (!inicio) {
        inicio = dataNoMes(mesAtual, f.dia_pagamento) >= hoje ? mesAtual : somarMeses(mesAtual, 1);
        banco.prepare('UPDATE funcionarias SET inicio_competencia = ? WHERE id = ?').run(inicio, f.id);
      }
      for (const mes of meses) {
        if (mes < inicio) continue;
        const existe = banco
          .prepare(`SELECT 1 FROM contas_a_pagar WHERE funcionaria_id = ? AND competencia = ? AND status <> 'cancelada'`)
          .get(f.id, mes);
        if (existe) continue;
        banco
          .prepare(
            `INSERT INTO contas_a_pagar (funcionaria_id, descricao, categoria_id, fornecedor, competencia, vencimento, valor_previsto, avisar_dias_antes)
             VALUES (?, ?, ?, ?, ?, ?, ?, 2)`,
          )
          .run(f.id, `Salário ${f.nome}`, catFunc, f.nome, mes, dataNoMes(mes, f.dia_pagamento), f.salario);
      }
    }
  })();
}

/** Período de vales que entra num pagamento de salário: do dia seguinte ao pagamento anterior até o dia do pagamento. */
export function periodoVales(competencia: string, dia: number) {
  const ate = dataNoMes(competencia, dia);
  const de = somarDias(dataNoMes(somarMeses(competencia, -1), dia), 1);
  return { de, ate };
}

export function valesDoPeriodo(banco: Banco, funcionariaId: number, de: string, ate: string) {
  return banco
    .prepare(
      `SELECT id, data, valor, forma, obs, despesa_id FROM vales
       WHERE funcionaria_id = ? AND cancelado_em IS NULL AND data BETWEEN ? AND ? ORDER BY data, id`,
    )
    .all(funcionariaId, de, ate) as { id: number; data: string; valor: number; forma: string; obs: string }[];
}

export type EstadoConta = 'paga' | 'atrasada' | 'vence_hoje' | 'vence_breve' | 'aberta' | 'cancelada';

export function estadoConta(c: { status: string; vencimento: string; avisar_dias_antes: number }, hoje: string): EstadoConta {
  if (c.status === 'paga') return 'paga';
  if (c.status === 'cancelada') return 'cancelada';
  if (c.vencimento < hoje) return 'atrasada';
  if (c.vencimento === hoje) return 'vence_hoje';
  if (diasEntre(hoje, c.vencimento) <= c.avisar_dias_antes) return 'vence_breve';
  return 'aberta';
}

export function listarContas(banco: Banco, mes: string, agora: Date) {
  const hoje = dataLocal(agora);
  // As do mês + as atrasadas de meses anteriores (ficam até marcar "Paguei")
  const contas = banco
    .prepare(
      `SELECT c.*, cat.nome AS categoria, r.parcelas_restantes, f.salario, f.dia_pagamento
       FROM contas_a_pagar c JOIN categorias cat ON cat.id = c.categoria_id
       LEFT JOIN contas_recorrentes r ON r.id = c.recorrente_id
       LEFT JOIN funcionarias f ON f.id = c.funcionaria_id
       WHERE c.status <> 'cancelada' AND (c.competencia = ? OR (c.status = 'aberta' AND c.competencia < ?))
       ORDER BY c.status = 'paga', c.vencimento, c.id`,
    )
    .all(mes, mes) as (Record<string, unknown> & {
    id: number;
    status: string;
    vencimento: string;
    avisar_dias_antes: number;
    funcionaria_id: number | null;
    competencia: string;
    salario: number | null;
    dia_pagamento: number | null;
    valor_previsto: number | null;
  })[];
  return contas.map((c) => {
    let vales: ReturnType<typeof valesDoPeriodo> = [];
    let aPagar = c.valor_previsto;
    if (c.funcionaria_id && c.salario !== null && c.dia_pagamento !== null) {
      const p = periodoVales(c.competencia, c.dia_pagamento);
      vales = valesDoPeriodo(banco, c.funcionaria_id, p.de, p.ate);
      aPagar = Math.max(0, c.salario - vales.reduce((s, v) => s + v.valor, 0));
    }
    return { ...c, estado: estadoConta(c, hoje), vales, aPagar };
  });
}

export function pagarConta(
  banco: Banco,
  contaId: number,
  p: { valor: number; data: string; forma: FormaPagamento },
  a: Agora,
): number {
  return banco
    .transaction(() => {
      const c = banco.prepare('SELECT * FROM contas_a_pagar WHERE id = ?').get(contaId) as
        | { id: number; status: string; descricao: string; categoria_id: number; fornecedor: string; recorrente_id: number | null; competencia: string }
        | undefined;
      if (!c) throw new ErroUsuario('Conta não encontrada.', 404);
      if (c.status !== 'aberta') throw new ErroUsuario('Essa conta não está em aberto.');
      const despesaId = inserirDespesa(
        banco,
        {
          data: p.data,
          categoriaId: c.categoria_id,
          fornecedor: c.fornecedor,
          descricao: c.descricao,
          valor: p.valor,
          forma: p.forma,
          contaAPagarId: c.id,
        },
        a,
      );
      banco
        .prepare(`UPDATE contas_a_pagar SET status = 'paga', valor_pago = ?, data_pagamento = ?, forma = ?, despesa_id = ? WHERE id = ?`)
        .run(p.valor, p.data, p.forma, despesaId, c.id);
      if (c.recorrente_id) {
        banco
          .prepare('UPDATE contas_recorrentes SET parcelas_restantes = MAX(0, parcelas_restantes - 1) WHERE id = ? AND parcelas_restantes IS NOT NULL')
          .run(c.recorrente_id);
      }
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'contas_a_pagar', registroId: c.id, acao: 'paguei', depois: { ...p, despesaId } });
      return despesaId;
    })
    .immediate();
}

/** Desfaz o "Paguei": a despesa é desfeita e a conta volta a ficar em aberto. */
export function desfazerPagamentoConta(banco: Banco, contaId: number, a: Agora) {
  banco
    .transaction(() => {
      const c = banco.prepare('SELECT despesa_id, status FROM contas_a_pagar WHERE id = ?').get(contaId) as
        | { despesa_id: number | null; status: string }
        | undefined;
      if (!c || c.status !== 'paga') throw new ErroUsuario('Essa conta não está paga.');
      if (c.despesa_id) {
        banco.prepare('UPDATE despesas SET cancelado_em = ?, cancelado_por = ? WHERE id = ?').run(a.agora.toISOString(), a.usuarioId, c.despesa_id);
      }
      reabrirConta(banco, contaId);
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'contas_a_pagar', registroId: contaId, acao: 'desfazer_paguei' });
    })
    .immediate();
}

export function lancarVale(
  banco: Banco,
  v: { funcionariaId: number; data: string; valor: number; forma: FormaPagamento; obs?: string },
  a: Agora,
): number {
  return banco
    .transaction(() => {
      const f = banco.prepare('SELECT nome FROM funcionarias WHERE id = ?').get(v.funcionariaId) as { nome: string } | undefined;
      if (!f) throw new ErroUsuario('Funcionária não encontrada.', 404);
      const valeId = Number(
        banco
          .prepare('INSERT INTO vales (funcionaria_id, data, valor, forma, obs) VALUES (?, ?, ?, ?, ?)')
          .run(v.funcionariaId, v.data, v.valor, v.forma, v.obs?.trim() ?? '').lastInsertRowid,
      );
      const despesaId = inserirDespesa(
        banco,
        {
          data: v.data,
          categoriaId: idCategoriaPorNome(banco, CATEGORIA_FUNCIONARIOS),
          fornecedor: f.nome,
          descricao: 'Vale',
          valor: v.valor,
          forma: v.forma,
          obs: v.obs,
          valeId,
        },
        a,
      );
      banco.prepare('UPDATE vales SET despesa_id = ? WHERE id = ?').run(despesaId, valeId);
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'vales', registroId: valeId, acao: 'criar', depois: v });
      return valeId;
    })
    .immediate();
}

export function resumoFuncionarias(banco: Banco, agora: Date) {
  const hoje = dataLocal(agora);
  const fs = banco.prepare('SELECT * FROM funcionarias ORDER BY ativa DESC, nome').all() as (Funcionaria & { ativa: number })[];
  return fs.map((f) => {
    // Período atual: termina no próximo dia de pagamento (hoje incluso)
    let competencia = hoje.slice(0, 7);
    if (dataNoMes(competencia, f.dia_pagamento) < hoje) competencia = somarMeses(competencia, 1);
    const periodo = periodoVales(competencia, f.dia_pagamento);
    const vales = valesDoPeriodo(banco, f.id, periodo.de, periodo.ate);
    const totalVales = vales.reduce((s, v) => s + v.valor, 0);
    return { ...f, ativa: !!f.ativa, proximoPagamento: periodo.ate, periodo, vales, totalVales, saldo: Math.max(0, f.salario - totalVales) };
  });
}

/** Mês da última parcela: conta a partir da primeira parcela ainda não paga. */
export function previsaoQuitacao(
  banco: Banco,
  r: { id: number; dia_vencimento: number; parcelas_restantes: number | null },
  agora: Date,
): string | null {
  if (r.parcelas_restantes === null || r.parcelas_restantes === 0) return null;
  const hoje = dataLocal(agora);
  const aberta = banco
    .prepare(`SELECT MIN(competencia) FROM contas_a_pagar WHERE recorrente_id = ? AND status = 'aberta'`)
    .pluck()
    .get(r.id) as string | null;
  const ultimaPaga = banco
    .prepare(`SELECT MAX(competencia) FROM contas_a_pagar WHERE recorrente_id = ? AND status = 'paga'`)
    .pluck()
    .get(r.id) as string | null;
  let mes = aberta ?? (ultimaPaga ? somarMeses(ultimaPaga, 1) : hoje.slice(0, 7));
  if (!aberta && !ultimaPaga && dataNoMes(mes, r.dia_vencimento) < hoje) mes = somarMeses(mes, 1);
  return dataNoMes(somarMeses(mes, r.parcelas_restantes - 1), r.dia_vencimento);
}
