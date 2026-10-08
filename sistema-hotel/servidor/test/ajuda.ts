import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { abrirBanco, type Banco } from '../src/banco/conexao.js';
import { criarApp } from '../src/app.js';
import type { Contexto } from '../src/contexto.js';

export interface Ambiente {
  app: FastifyInstance;
  banco: Banco;
  ctx: Contexto;
  relogio: { agora: Date };
  /** Chamada autenticada; devolve status e JSON. */
  api: <T = any>(metodo: string, url: string, corpo?: unknown) => Promise<{ status: number; json: T }>;
}

/** Banco em memória, pasta temporária e um usuário já logado. Hora padrão: 08/10/2026 15:00 em Cacoal. */
export async function criarAmbiente(agoraIso = '2026-10-08T19:00:00.000Z'): Promise<Ambiente> {
  const banco = abrirBanco(':memory:');
  const relogio = { agora: new Date(agoraIso) };
  const ctx: Contexto = {
    banco,
    agora: () => new Date(relogio.agora),
    dirDados: mkdtempSync(join(tmpdir(), 'hotel-teste-')),
  };
  const app = await criarApp(ctx);
  const r = await app.inject({
    method: 'POST',
    url: '/api/sistema/primeiro-uso',
    payload: { nomeHotel: 'Hotel Tropical', nome: 'Teste', login: 'teste', senha: 'senha-forte-1' },
  });
  if (r.statusCode !== 200) throw new Error(r.body);
  const cookie = r.cookies.find((c) => c.name === 'hotel_sessao')!;
  const api = async (metodo: string, url: string, corpo?: unknown) => {
    const opts: InjectOptions = {
      method: metodo as InjectOptions['method'],
      url,
      cookies: { hotel_sessao: cookie.value },
    };
    if (corpo !== undefined) opts.payload = corpo as InjectOptions['payload'];
    const res = await app.inject(opts);
    return { status: res.statusCode, json: res.body ? res.json() : null };
  };
  return { app, banco, ctx, relogio, api };
}
