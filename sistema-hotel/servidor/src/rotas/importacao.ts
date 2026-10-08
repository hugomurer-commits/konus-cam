import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import { bancoTemDados } from '../importacao/importar.js';
import { importarArquivo, pendenciasDoTipo, ultimaImportacao } from '../importacao/servico.js';
import { paramsId, validar } from '../validacao.js';

export function rotasImportacao(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;

  app.get('/api/importacao', async () => ({
    importacao: ultimaImportacao(banco),
    podeImportar: !bancoTemDados(banco),
  }));

  app.post('/api/importacao', async (req) => {
    const arquivo = await req.file();
    if (!arquivo) throw new ErroUsuario('Escolha o arquivo da planilha.');
    const conteudo = await arquivo.toBuffer();
    const { resumo } = await importarArquivo(banco, conteudo, arquivo.filename, req.usuario!.id, ctx.agora());
    return { resumo };
  });

  app.get('/api/importacao/pendencias', async (req) => {
    const { tipo } = validar(z.object({ tipo: z.string().min(1) }), req.query);
    const imp = ultimaImportacao(banco);
    return { pendencias: imp ? pendenciasDoTipo(banco, imp.id, tipo) : [] };
  });

  app.put('/api/importacao/pendencias/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ resolvida: z.boolean(), obs: z.string().max(500).default('') }), req.body);
    const r = banco
      .prepare('UPDATE importacao_pendencias SET resolvida_em = ?, resolvida_obs = ? WHERE id = ?')
      .run(d.resolvida ? ctx.agora().toISOString() : null, d.obs, id);
    if (!r.changes) throw new ErroUsuario('Pendência não encontrada.', 404);
    auditar(banco, {
      usuarioId: req.usuario!.id,
      tabela: 'importacao_pendencias',
      registroId: id,
      acao: d.resolvida ? 'conferida' : 'reaberta',
      depois: d,
    });
    return { ok: true };
  });
}
