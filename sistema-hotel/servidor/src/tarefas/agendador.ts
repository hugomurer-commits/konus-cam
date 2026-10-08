import type { FastifyBaseLogger } from 'fastify';
import type { Contexto } from '../contexto.js';

/** Tarefas de fundo (backup, expiração de pré-reserva). Confere a cada minuto. */
export function iniciarTarefas(_ctx: Contexto, _log: FastifyBaseLogger): () => void {
  const tarefas: (() => void)[] = [];
  const timer = setInterval(() => {
    for (const t of tarefas) t();
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
