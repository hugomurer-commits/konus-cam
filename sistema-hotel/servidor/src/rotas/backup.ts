import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import {
  criarPastaSePreciso,
  fazerBackup,
  MANTER_DIARIOS,
  MANTER_MENSAIS,
  pastaBackup,
  sugerirPastasDrive,
  testarPasta,
  ultimoBackupOk,
} from '../tarefas/backup.js';
import { validar } from '../validacao.js';

export function rotasBackup(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;

  app.get('/api/backup', async () => {
    const ultimo = ultimoBackupOk(banco);
    return {
      pasta: pastaBackup(ctx),
      pastaPadrao: join(ctx.dirDados, 'backups'),
      configurada: !!(banco.prepare(`SELECT valor FROM config WHERE chave = 'backup_pasta'`).pluck().get() as string),
      ultimo,
      atrasado: !ultimo || ctx.agora().getTime() - Date.parse(ultimo) > 48 * 3600_000,
      historico: banco.prepare('SELECT feito_em, ok, erro, tamanho FROM backups ORDER BY id DESC LIMIT 10').all(),
      manter: { diarios: MANTER_DIARIOS, mensais: MANTER_MENSAIS },
      sugestoes: sugerirPastasDrive(),
    };
  });

  app.put('/api/backup/pasta', async (req) => {
    const { pasta, criar } = validar(z.object({ pasta: z.string().trim().max(500), criar: z.boolean().default(false) }), req.body);
    if (pasta && criar) criarPastaSePreciso(pasta);
    if (pasta) testarPasta(pasta);
    banco
      .prepare(`INSERT INTO config (chave, valor) VALUES ('backup_pasta', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`)
      .run(pasta);
    auditar(banco, { usuarioId: req.usuario!.id, tabela: 'config', registroId: null, acao: 'backup_pasta', depois: { pasta } });
    return { ok: true };
  });

  app.post('/api/backup/agora', async () => {
    const r = await fazerBackup(ctx);
    if (!r.ok) throw new ErroUsuario(`O backup não deu certo: ${r.erro}`, 500);
    return r;
  });
}
