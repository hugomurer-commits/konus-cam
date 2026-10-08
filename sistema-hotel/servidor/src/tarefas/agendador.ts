import type { FastifyBaseLogger } from 'fastify';
import type { Contexto } from '../contexto.js';
import { garantirContas } from '../dominio/contas.js';
import { falhouHaPouco, fazerBackup, precisaBackup } from './backup.js';

/** Tarefas de fundo, conferidas a cada minuto: backup diário e contas do mês. */
export function iniciarTarefas(ctx: Contexto, log: FastifyBaseLogger): () => void {
  async function rodada() {
    try {
      garantirContas(ctx.banco, ctx.agora());
      const agora = ctx.agora();
      if (precisaBackup(ctx.banco, agora) && !falhouHaPouco(ctx.banco, agora)) {
        const r = await fazerBackup(ctx);
        if (r.ok) log.info(`Backup feito: ${r.arquivo}`);
        else log.error(`Backup falhou: ${r.erro}`);
      }
    } catch (e) {
      log.error(e);
    }
  }
  // Primeira rodada logo depois de subir (PC desligado às 03h faz o backup ao ligar)
  const inicial = setTimeout(rodada, 20_000);
  const timer = setInterval(rodada, 60_000);
  inicial.unref();
  timer.unref();
  return () => {
    clearTimeout(inicial);
    clearInterval(timer);
  };
}
