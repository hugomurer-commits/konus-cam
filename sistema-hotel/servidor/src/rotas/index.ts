import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasConfiguracoes } from './configuracoes.js';
import { rotasEstadias } from './estadias.js';
import { rotasHoje } from './hoje.js';
import { rotasHospedes } from './hospedes.js';
import { rotasImportacao } from './importacao.js';
import { rotasQuartos } from './quartos.js';

export function registrarRotas(app: FastifyInstance, ctx: Contexto) {
  rotasConfiguracoes(app, ctx);
  rotasEstadias(app, ctx);
  rotasHoje(app, ctx);
  rotasHospedes(app, ctx);
  rotasImportacao(app, ctx);
  rotasQuartos(app, ctx);
}
