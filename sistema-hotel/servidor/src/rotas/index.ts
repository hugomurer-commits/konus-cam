import type { FastifyInstance } from 'fastify';
import type { Contexto } from '../contexto.js';
import { rotasCaixa } from './caixa.js';
import { rotasConfiguracoes } from './configuracoes.js';
import { rotasContas } from './contas.js';
import { rotasEstadias } from './estadias.js';
import { rotasHoje } from './hoje.js';
import { rotasHospedes } from './hospedes.js';
import { rotasImportacao } from './importacao.js';
import { rotasMapa } from './mapa.js';
import { rotasQuartos } from './quartos.js';

export function registrarRotas(app: FastifyInstance, ctx: Contexto) {
  rotasCaixa(app, ctx);
  rotasConfiguracoes(app, ctx);
  rotasContas(app, ctx);
  rotasEstadias(app, ctx);
  rotasHoje(app, ctx);
  rotasHospedes(app, ctx);
  rotasImportacao(app, ctx);
  rotasMapa(app, ctx);
  rotasQuartos(app, ctx);
}
