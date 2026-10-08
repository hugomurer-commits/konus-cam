import { createHash } from 'node:crypto';
import type { Banco } from '../banco/conexao.js';
import { dataLocal } from '../dominio/datas.js';
import { ErroUsuario } from '../erros.js';
import { importarPlanilha, TIPOS_PENDENCIA, type ResumoImportacao } from './importar.js';
import { lerPlanilha } from './planilha.js';

export async function importarArquivo(
  banco: Banco,
  conteudo: Buffer,
  nomeArquivo: string,
  usuarioId: number | null,
  agora: Date,
) {
  let planilha;
  try {
    planilha = await lerPlanilha(conteudo);
  } catch (e) {
    throw new ErroUsuario(
      e instanceof Error && e.message.includes('abas')
        ? e.message
        : 'Não consegui abrir esse arquivo. Ele precisa ser a planilha do Excel (.xlsx).',
    );
  }
  return importarPlanilha(banco, planilha, {
    arquivo: nomeArquivo,
    sha256: createHash('sha256').update(conteudo).digest('hex'),
    usuarioId,
    hoje: dataLocal(agora),
    agoraIso: agora.toISOString(),
  });
}

export function ultimaImportacao(banco: Banco) {
  const imp = banco
    .prepare('SELECT id, arquivo, feita_em, resumo FROM importacoes ORDER BY id DESC LIMIT 1')
    .get() as { id: number; arquivo: string; feita_em: string; resumo: string } | undefined;
  if (!imp) return null;
  const grupos = banco
    .prepare(
      `SELECT tipo, COUNT(*) AS total, SUM(resolvida_em IS NULL) AS abertas
       FROM importacao_pendencias WHERE importacao_id = ? GROUP BY tipo`,
    )
    .all(imp.id) as { tipo: string; total: number; abertas: number }[];
  const ordem = Object.keys(TIPOS_PENDENCIA);
  grupos.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
  return {
    id: imp.id,
    arquivo: imp.arquivo,
    feitaEm: imp.feita_em,
    resumo: JSON.parse(imp.resumo) as ResumoImportacao,
    grupos: grupos.map((g) => ({ ...g, titulo: TIPOS_PENDENCIA[g.tipo] ?? g.tipo })),
  };
}

export function pendenciasDoTipo(banco: Banco, importacaoId: number, tipo: string) {
  return banco
    .prepare(
      `SELECT id, aba, linha, mensagem, resolvida_em, resolvida_obs FROM importacao_pendencias
       WHERE importacao_id = ? AND tipo = ? ORDER BY linha, id`,
    )
    .all(importacaoId, tipo);
}
