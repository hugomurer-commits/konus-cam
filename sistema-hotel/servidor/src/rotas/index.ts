import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasImportacao } from './importacao.js';

export function registrarRotas(app: FastifyInstance, ctx: Contexto) {
  rotasImportacao(app, ctx);
}
