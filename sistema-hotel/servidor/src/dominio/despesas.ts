import type { Banco } from '../banco/conexao.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import type { Agora } from './estadias.js';

export type FormaPagamento = 'pix' | 'cartao' | 'dinheiro' | 'boleto';

export interface NovaDespesa {
  data: string;
  categoriaId: number;
  fornecedor?: string;
  descricao?: string;
  valor: number;
  forma: FormaPagamento;
  obs?: string;
  contaAPagarId?: number | null;
  valeId?: number | null;
}

/** Grava uma despesa (sem transação própria: quem chama decide). */
export function inserirDespesa(banco: Banco, d: NovaDespesa, a: Agora): number {
  const cat = banco.prepare('SELECT id FROM categorias WHERE id = ?').get(d.categoriaId);
  if (!cat) throw new ErroUsuario('Escolha a categoria.');
  const id = Number(
    banco
      .prepare(
        `INSERT INTO despesas (data, categoria_id, fornecedor, descricao, valor, forma, obs, conta_a_pagar_id, vale_id, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.data,
        d.categoriaId,
        d.fornecedor?.trim() ?? '',
        d.descricao?.trim() ?? '',
        d.valor,
        d.forma,
        d.obs?.trim() ?? '',
        d.contaAPagarId ?? null,
        d.valeId ?? null,
        a.usuarioId,
      ).lastInsertRowid,
  );
  auditar(banco, { usuarioId: a.usuarioId, tabela: 'despesas', registroId: id, acao: 'criar', depois: d });
  return id;
}

export function lancarDespesa(banco: Banco, d: NovaDespesa, a: Agora): number {
  return banco.transaction(() => inserirDespesa(banco, d, a)).immediate();
}

export function editarDespesa(banco: Banco, id: number, d: Omit<NovaDespesa, 'contaAPagarId' | 'valeId'>, a: Agora) {
  banco
    .transaction(() => {
      const antes = banco.prepare('SELECT * FROM despesas WHERE id = ?').get(id) as
        | { cancelado_em: string | null; conta_a_pagar_id: number | null; vale_id: number | null }
        | undefined;
      if (!antes) throw new ErroUsuario('Despesa não encontrada.', 404);
      if (antes.cancelado_em) throw new ErroUsuario('Essa despesa foi desfeita.');
      if (antes.vale_id) throw new ErroUsuario('Essa despesa é um vale: mude pela tela de funcionárias.');
      banco
        .prepare(
          'UPDATE despesas SET data = ?, categoria_id = ?, fornecedor = ?, descricao = ?, valor = ?, forma = ?, obs = ? WHERE id = ?',
        )
        .run(d.data, d.categoriaId, d.fornecedor?.trim() ?? '', d.descricao?.trim() ?? '', d.valor, d.forma, d.obs?.trim() ?? '', id);
      if (antes.conta_a_pagar_id) {
        banco
          .prepare('UPDATE contas_a_pagar SET valor_pago = ?, data_pagamento = ? WHERE id = ?')
          .run(d.valor, d.data, antes.conta_a_pagar_id);
      }
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'despesas', registroId: id, acao: 'editar', antes, depois: d });
    })
    .immediate();
}

/** Desfaz uma despesa. Se veio de uma conta, a conta volta a ficar em aberto; se é vale, o vale sai. */
export function cancelarDespesa(banco: Banco, id: number, a: Agora) {
  banco
    .transaction(() => {
      const d = banco.prepare('SELECT * FROM despesas WHERE id = ?').get(id) as
        | { cancelado_em: string | null; conta_a_pagar_id: number | null; vale_id: number | null }
        | undefined;
      if (!d) throw new ErroUsuario('Despesa não encontrada.', 404);
      if (d.cancelado_em) throw new ErroUsuario('Essa despesa já foi desfeita.');
      const agoraIso = a.agora.toISOString();
      banco.prepare('UPDATE despesas SET cancelado_em = ?, cancelado_por = ? WHERE id = ?').run(agoraIso, a.usuarioId, id);
      if (d.conta_a_pagar_id) reabrirConta(banco, d.conta_a_pagar_id);
      if (d.vale_id) banco.prepare('UPDATE vales SET cancelado_em = ? WHERE id = ?').run(agoraIso, d.vale_id);
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'despesas', registroId: id, acao: 'cancelar', antes: d });
    })
    .immediate();
}

export function reabrirConta(banco: Banco, contaId: number) {
  const c = banco.prepare('SELECT recorrente_id, status FROM contas_a_pagar WHERE id = ?').get(contaId) as
    | { recorrente_id: number | null; status: string }
    | undefined;
  if (!c || c.status !== 'paga') return;
  banco
    .prepare(`UPDATE contas_a_pagar SET status = 'aberta', valor_pago = NULL, data_pagamento = NULL, forma = NULL, despesa_id = NULL WHERE id = ?`)
    .run(contaId);
  if (c.recorrente_id) {
    banco
      .prepare('UPDATE contas_recorrentes SET parcelas_restantes = parcelas_restantes + 1 WHERE id = ? AND parcelas_restantes IS NOT NULL')
      .run(c.recorrente_id);
  }
}

export function idCategoriaPorNome(banco: Banco, nome: string, grupo = 'operacao'): number {
  const c = banco.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome) as { id: number } | undefined;
  if (c) return c.id;
  return Number(banco.prepare('INSERT INTO categorias (nome, grupo) VALUES (?, ?)').run(nome, grupo).lastInsertRowid);
}

/** Fornecedores já usados que combinam com o texto, com a última categoria (para preencher sozinho). */
export function sugerirFornecedores(banco: Banco, termo: string, limite = 10) {
  return banco
    .prepare(
      `SELECT d.fornecedor, d.categoria_id, c.nome AS categoria, MAX(d.data) AS ultima, COUNT(*) AS vezes
       FROM despesas d JOIN categorias c ON c.id = d.categoria_id
       WHERE d.cancelado_em IS NULL AND d.fornecedor <> '' AND d.fornecedor LIKE ?
       GROUP BY d.fornecedor COLLATE NOCASE ORDER BY vezes DESC LIMIT ?`,
    )
    .all(`%${termo.trim()}%`, limite) as { fornecedor: string; categoria_id: number; categoria: string; ultima: string; vezes: number }[];
}

export function categoriasMaisUsadas(banco: Banco, desde: string, limite = 8) {
  return banco
    .prepare(
      `SELECT c.id, c.nome, c.grupo, COUNT(d.id) AS usos FROM categorias c
       LEFT JOIN despesas d ON d.categoria_id = c.id AND d.data >= ? AND d.cancelado_em IS NULL
       WHERE c.ativa = 1 GROUP BY c.id ORDER BY usos DESC, c.ordem LIMIT ?`,
    )
    .all(desde, limite);
}
