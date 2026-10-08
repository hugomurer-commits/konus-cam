import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { garantirContas } from '../dominio/contas.js';
import { painelHoje } from '../dominio/hoje.js';

export function rotasHoje(app: FastifyInstance, ctx: Contexto) {
  app.get('/api/hoje', async () => {
    garantirContas(ctx.banco, ctx.agora());
    return painelHoje(ctx.banco, ctx.agora());
  });
  app.get('/api/hoje/contagem-alertas', async () => ({ total: painelHoje(ctx.banco, ctx.agora()).alertas.length }));
}
