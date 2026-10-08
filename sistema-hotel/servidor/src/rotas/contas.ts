import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { auditar } from '../banco/auditoria.js';
import {
  desfazerPagamentoConta,
  garantirContas,
  lancarVale,
  listarContas,
  pagarConta,
  previsaoQuitacao,
  resumoFuncionarias,
} from '../dominio/contas.js';
import { dataLocal } from '../dominio/datas.js';
import { cancelarDespesa } from '../dominio/despesas.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar, zCentavos, zCentavosPositivo, zData, zFormaPagamento } from '../validacao.js';

export function rotasContas(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  const a = (req: FastifyRequest) => ({ agora: ctx.agora(), usuarioId: req.usuario!.id });

  app.get('/api/contas', async (req) => {
    const { mes } = validar(z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    garantirContas(banco, ctx.agora());
    const m = mes ?? dataLocal(ctx.agora()).slice(0, 7);
    return { mes: m, hoje: dataLocal(ctx.agora()), contas: listarContas(banco, m, ctx.agora()) };
  });

  app.post('/api/contas', async (req) => {
    const d = validar(
      z.object({
        descricao: z.string().trim().min(1, 'Descreva a conta.').max(120),
        categoriaId: z.number({ required_error: 'Escolha a categoria.' }).int().positive(),
        fornecedor: z.string().max(120).default(''),
        vencimento: zData,
        valorPrevisto: zCentavos.nullable(),
      }),
      req.body,
    );
    const id = Number(
      banco
        .prepare(
          `INSERT INTO contas_a_pagar (descricao, categoria_id, fornecedor, competencia, vencimento, valor_previsto, valor_variavel)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(d.descricao, d.categoriaId, d.fornecedor, d.vencimento.slice(0, 7), d.vencimento, d.valorPrevisto, d.valorPrevisto === null ? 1 : 0)
        .lastInsertRowid,
    );
    auditar(banco, { usuarioId: req.usuario!.id, tabela: 'contas_a_pagar', registroId: id, acao: 'criar', depois: d });
    return { id };
  });

  app.post('/api/contas/:id/paguei', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ valor: zCentavosPositivo, data: zData, forma: zFormaPagamento }), req.body);
    return { despesaId: pagarConta(banco, id, d, a(req)) };
  });

  app.post('/api/contas/:id/desfazer', async (req) => {
    const { id } = validar(paramsId, req.params);
    desfazerPagamentoConta(banco, id, a(req));
    return { ok: true };
  });

  app.post('/api/contas/:id/cancelar', async (req) => {
    const { id } = validar(paramsId, req.params);
    const r = banco.prepare(`UPDATE contas_a_pagar SET status = 'cancelada' WHERE id = ? AND status = 'aberta'`).run(id);
    if (!r.changes) throw new ErroUsuario('Só dá para tirar conta em aberto.');
    auditar(banco, { usuarioId: req.usuario!.id, tabela: 'contas_a_pagar', registroId: id, acao: 'cancelar' });
    return { ok: true };
  });

  // ── Recorrentes
  app.get('/api/contas-recorrentes', async () => {
    const rs = banco
      .prepare(
        `SELECT r.*, c.nome AS categoria FROM contas_recorrentes r JOIN categorias c ON c.id = r.categoria_id
         ORDER BY r.ativa DESC, r.dia_vencimento, r.nome`,
      )
      .all() as { id: number; dia_vencimento: number; parcelas_restantes: number | null }[];
    return { recorrentes: rs.map((r) => ({ ...r, quitacao: previsaoQuitacao(banco, r, ctx.agora()) })) };
  });

  const zRecorrente = z.object({
    nome: z.string().trim().min(1, 'Informe o nome da conta.').max(120),
    fornecedor: z.string().max(120).default(''),
    categoriaId: z.number({ required_error: 'Escolha a categoria.' }).int().positive(),
    valorPrevisto: zCentavos.nullable(),
    valorVariavel: z.boolean().default(false),
    diaVencimento: z.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
    parcelasRestantes: z.number().int().min(0).max(600).nullable(),
    avisarDiasAntes: z.number().int().min(0).max(30).default(3),
    ativa: z.boolean().default(true),
    obs: z.string().max(500).default(''),
  });
  const valoresRec = (d: z.infer<typeof zRecorrente>) => [
    d.nome, d.fornecedor, d.categoriaId, d.valorPrevisto, d.valorVariavel ? 1 : 0, d.diaVencimento,
    d.parcelasRestantes, d.avisarDiasAntes, d.ativa ? 1 : 0, d.obs,
  ];
  app.post('/api/contas-recorrentes', async (req) => {
    const d = validar(zRecorrente, req.body);
    const id = Number(
      banco
        .prepare(
          `INSERT INTO contas_recorrentes (nome, fornecedor, categoria_id, valor_previsto, valor_variavel, dia_vencimento,
             parcelas_restantes, avisar_dias_antes, ativa, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...valoresRec(d)).lastInsertRowid,
    );
    auditar(banco, { usuarioId: req.usuario!.id, tabela: 'contas_recorrentes', registroId: id, acao: 'criar', depois: d });
    return { id };
  });
  app.put('/api/contas-recorrentes/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zRecorrente, req.body);
    const antes = banco.prepare('SELECT * FROM contas_recorrentes WHERE id = ?').get(id);
    if (!antes) throw new ErroUsuario('Conta recorrente não encontrada.', 404);
    banco.transaction(() => {
      banco
        .prepare(
          `UPDATE contas_recorrentes SET nome = ?, fornecedor = ?, categoria_id = ?, valor_previsto = ?, valor_variavel = ?,
             dia_vencimento = ?, parcelas_restantes = ?, avisar_dias_antes = ?, ativa = ?, obs = ? WHERE id = ?`,
        )
        .run(...valoresRec(d), id);
      // Contas em aberto acompanham a mudança (valor, dia, aviso)
      banco
        .prepare(
          `UPDATE contas_a_pagar SET descricao = ?, fornecedor = ?, categoria_id = ?, valor_previsto = ?, valor_variavel = ?,
             avisar_dias_antes = ?, vencimento = substr(competencia, 1, 7) || '-' || printf('%02d', MIN(?, CAST(strftime('%d', date(competencia || '-01', '+1 month', '-1 day')) AS INTEGER)))
           WHERE recorrente_id = ? AND status = 'aberta'`,
        )
        .run(d.nome, d.fornecedor, d.categoriaId, d.valorPrevisto, d.valorVariavel ? 1 : 0, d.avisarDiasAntes, d.diaVencimento, id);
      if (!d.ativa) banco.prepare(`UPDATE contas_a_pagar SET status = 'cancelada' WHERE recorrente_id = ? AND status = 'aberta' AND vencimento > ?`).run(id, dataLocal(ctx.agora()));
      auditar(banco, { usuarioId: req.usuario!.id, tabela: 'contas_recorrentes', registroId: id, acao: 'editar', antes, depois: d });
    })();
    return { ok: true };
  });

  // ── Funcionárias e vales
  app.get('/api/funcionarias', async () => ({ funcionarias: resumoFuncionarias(banco, ctx.agora()) }));

  const zFuncionaria = z.object({
    nome: z.string().trim().min(1, 'Informe o nome.').max(80),
    salario: zCentavos,
    diaPagamento: z.number().int().min(1).max(31),
    ativa: z.boolean().default(true),
  });
  app.post('/api/funcionarias', async (req) => {
    const d = validar(zFuncionaria, req.body);
    const id = Number(
      banco
        .prepare('INSERT INTO funcionarias (nome, salario, dia_pagamento, ativa) VALUES (?, ?, ?, ?)')
        .run(d.nome, d.salario, d.diaPagamento, d.ativa ? 1 : 0).lastInsertRowid,
    );
    auditar(banco, { usuarioId: req.usuario!.id, tabela: 'funcionarias', registroId: id, acao: 'criar', depois: d });
    return { id };
  });
  app.put('/api/funcionarias/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zFuncionaria, req.body);
    const antes = banco.prepare('SELECT * FROM funcionarias WHERE id = ?').get(id);
    if (!antes) throw new ErroUsuario('Funcionária não encontrada.', 404);
    banco.transaction(() => {
      banco.prepare('UPDATE funcionarias SET nome = ?, salario = ?, dia_pagamento = ?, ativa = ? WHERE id = ?').run(d.nome, d.salario, d.diaPagamento, d.ativa ? 1 : 0, id);
      banco
        .prepare(
          `UPDATE contas_a_pagar SET descricao = ?, fornecedor = ?, valor_previsto = ?,
             vencimento = substr(competencia, 1, 7) || '-' || printf('%02d', MIN(?, CAST(strftime('%d', date(competencia || '-01', '+1 month', '-1 day')) AS INTEGER)))
           WHERE funcionaria_id = ? AND status = 'aberta'`,
        )
        .run(`Salário ${d.nome}`, d.nome, d.salario, d.diaPagamento, id);
      if (!d.ativa) banco.prepare(`UPDATE contas_a_pagar SET status = 'cancelada' WHERE funcionaria_id = ? AND status = 'aberta'`).run(id);
      auditar(banco, { usuarioId: req.usuario!.id, tabela: 'funcionarias', registroId: id, acao: 'editar', antes, depois: d });
    })();
    return { ok: true };
  });

  app.post('/api/vales', async (req) => {
    const d = validar(
      z.object({
        funcionariaId: z.number().int().positive(),
        data: zData,
        valor: zCentavosPositivo,
        forma: zFormaPagamento.default('dinheiro'),
        obs: z.string().max(300).optional(),
      }),
      req.body,
    );
    return { id: lancarVale(banco, d, a(req)) };
  });

  app.post('/api/vales/:id/cancelar', async (req) => {
    const { id } = validar(paramsId, req.params);
    const v = banco.prepare('SELECT despesa_id, cancelado_em FROM vales WHERE id = ?').get(id) as
      | { despesa_id: number | null; cancelado_em: string | null }
      | undefined;
    if (!v || v.cancelado_em) throw new ErroUsuario('Vale não encontrado.', 404);
    if (v.despesa_id) cancelarDespesa(banco, v.despesa_id, a(req));
    else banco.prepare('UPDATE vales SET cancelado_em = ? WHERE id = ?').run(ctx.agora().toISOString(), id);
    return { ok: true };
  });
}
