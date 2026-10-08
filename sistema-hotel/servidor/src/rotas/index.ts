import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasConfiguracoes } from './configuracoes.js';
import { rotasImportacao } from './importacao.js';
import { rotasQuartos } from './quartos.js';

export function registrarRotas(app: FastifyInstance, ctx: Contexto) {
  rotasConfiguracoes(app, ctx);
  rotasImportacao(app, ctx);
  rotasQuartos(app, ctx);
}
