import type { Banco } from './conexao.js';

export function auditar(
  banco: Banco,
  dados: {
    usuarioId: number | null;
    tabela: string;
    registroId: number | null;
    acao: string;
    antes?: unknown;
    depois?: unknown;
  },
): void {
  banco
    .prepare(
      `INSERT INTO auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      dados.usuarioId,
      dados.tabela,
      dados.registroId,
      dados.acao,
      dados.antes === undefined ? null : JSON.stringify(dados.antes),
      dados.depois === undefined ? null : JSON.stringify(dados.depois),
    );
}

export function buscarLinha<T>(banco: Banco, tabela: string, id: number): T | undefined {
  return banco.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id) as T | undefined;
}
