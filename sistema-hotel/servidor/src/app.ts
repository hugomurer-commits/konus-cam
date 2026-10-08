import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { Contexto } from './contexto.js';
import { usuarioDaSessao } from './dominio/autenticacao.js';
import { ErroUsuario } from './erros.js';
import { COOKIE_SESSAO, rotasAutenticacao } from './rotas/autenticacao.js';
import { registrarRotas } from './rotas/index.js';

// Rotas que funcionam sem login
const ROTAS_ABERTAS = new Set([
  '/api/sistema/estado',
  '/api/sistema/primeiro-uso',
  '/api/auth/entrar',
  '/api/auth/sair',
]);

export async function criarApp(ctx: Contexto, opcoes: { log?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opcoes.log ? { level: 'info' } : false,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 2 } });

  app.decorateRequest('usuario', null);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const caminho = req.url.split('?')[0];
    const token = req.cookies[COOKIE_SESSAO];
    req.usuario = token ? usuarioDaSessao(ctx.banco, token, ctx.agora()) : null;
    if (!req.usuario && !ROTAS_ABERTAS.has(caminho)) {
      return reply.code(401).send({ erro: 'Entre com sua senha para continuar.' });
    }
  });

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof ErroUsuario) {
      return reply.code(erro.status).send({ erro: erro.message, codigo: erro.codigo });
    }
    const msg = String((erro as Error)?.message ?? '');
    if (msg.includes('QUARTO_OCUPADO')) {
      return reply.code(409).send({ erro: 'Esse quarto já está ocupado em alguma dessas noites.' });
    }
    const status = (erro as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ erro: 'Pedido inválido.' });
    }
    req.log.error(erro);
    if (!opcoes.log) console.error(erro);
    return reply.code(500).send({ erro: 'Algo deu errado no sistema. Tente de novo.' });
  });

  app.get('/health', async () => ({ ok: true }));

  rotasAutenticacao(app, ctx);
  registrarRotas(app, ctx);

  // Fotos dos quartos (sem dado de hóspede; a página pública da Fase 2 também usa)
  const dirFotos = join(ctx.dirDados, 'fotos');
  mkdirSync(dirFotos, { recursive: true });
  await app.register(fastifyStatic, {
    root: dirFotos,
    prefix: '/fotos/',
    decorateReply: false,
    maxAge: '7d',
  });

  if (ctx.dirPainel && existsSync(ctx.dirPainel)) {
    await app.register(fastifyStatic, { root: ctx.dirPainel, prefix: '/', wildcard: false });
    // Painel é uma SPA: qualquer caminho que não seja da API devolve o index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.code(404).send({ erro: 'Não encontrado.' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ erro: 'Não encontrado.' }));
  }

  return app;
}
