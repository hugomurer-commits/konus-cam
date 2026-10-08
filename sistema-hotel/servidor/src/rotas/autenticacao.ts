import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import {
  conferirSenha,
  criarSessao,
  criarUsuario,
  encerrarSessao,
  existeUsuario,
  gerarHashSenha,
  validarSenhaNova,
  DURACAO_LEMBRAR,
} from '../dominio/autenticacao.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import { validar } from '../validacao.js';

export const COOKIE_SESSAO = 'hotel_sessao';

export function rotasAutenticacao(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;

  function gravarCookie(reply: import('fastify').FastifyReply, token: string, lembrar: boolean) {
    reply.setCookie(COOKIE_SESSAO, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // Sem maxAge = cookie some ao fechar o navegador (sessão normal, ex.: celular)
      ...(lembrar ? { maxAge: DURACAO_LEMBRAR / 1000 } : {}),
    });
  }

  app.get('/api/sistema/estado', async () => ({
    precisaPrimeiroUso: !existeUsuario(banco),
    nomeHotel:
      (banco.prepare(`SELECT valor FROM config WHERE chave = 'nome_hotel'`).get() as { valor: string })
        ?.valor ?? 'Hotel',
  }));

  // Primeiro uso: cria o primeiro usuário. Só funciona enquanto não existe nenhum.
  app.post('/api/sistema/primeiro-uso', async (req, reply) => {
    if (existeUsuario(banco)) throw new ErroUsuario('O sistema já foi configurado.', 409);
    const d = validar(
      z.object({
        nomeHotel: z.string().trim().min(1, 'Informe o nome do hotel.'),
        nome: z.string().trim().min(1, 'Informe seu nome.'),
        login: z.string().trim().min(2, 'Escolha um nome de acesso.'),
        senha: z.string(),
      }),
      req.body,
    );
    const id = await criarUsuario(banco, d.nome, d.login, d.senha);
    banco.prepare(`UPDATE config SET valor = ? WHERE chave = 'nome_hotel'`).run(d.nomeHotel);
    auditar(banco, { usuarioId: id, tabela: 'usuarios', registroId: id, acao: 'primeiro_uso' });
    const { token } = criarSessao(banco, id, true, ctx.agora());
    gravarCookie(reply, token, true);
    return { ok: true };
  });

  app.post('/api/auth/entrar', async (req, reply) => {
    const d = validar(
      z.object({
        login: z.string().trim().min(1, 'Informe o nome de acesso.'),
        senha: z.string().min(1, 'Informe a senha.'),
        lembrar: z.boolean().default(true),
      }),
      req.body,
    );
    const u = banco
      .prepare('SELECT id, nome, login, senha_hash FROM usuarios WHERE login = ? AND ativo = 1')
      .get(d.login) as { id: number; nome: string; login: string; senha_hash: string } | undefined;
    // Mesmo tempo de resposta com ou sem usuário, para não revelar quais existem
    const ok = u
      ? await conferirSenha(d.senha, u.senha_hash)
      : (await gerarHashSenha(d.senha), false);
    if (!u || !ok) throw new ErroUsuario('Nome de acesso ou senha não conferem.', 401);
    const { token } = criarSessao(banco, u.id, d.lembrar, ctx.agora());
    gravarCookie(reply, token, d.lembrar);
    return { usuario: { id: u.id, nome: u.nome, login: u.login } };
  });

  app.post('/api/auth/sair', async (req, reply) => {
    const token = req.cookies[COOKIE_SESSAO];
    if (token) encerrarSessao(banco, token, ctx.agora());
    reply.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/eu', async (req) => ({ usuario: req.usuario }));

  app.post('/api/auth/trocar-senha', async (req) => {
    const d = validar(
      z.object({ senhaAtual: z.string(), senhaNova: z.string() }),
      req.body,
    );
    validarSenhaNova(d.senhaNova);
    const u = banco
      .prepare('SELECT senha_hash FROM usuarios WHERE id = ?')
      .get(req.usuario!.id) as { senha_hash: string };
    if (!(await conferirSenha(d.senhaAtual, u.senha_hash)))
      throw new ErroUsuario('A senha atual não confere.');
    banco
      .prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')
      .run(await gerarHashSenha(d.senhaNova), req.usuario!.id);
    auditar(banco, {
      usuarioId: req.usuario!.id,
      tabela: 'usuarios',
      registroId: req.usuario!.id,
      acao: 'trocar_senha',
    });
    return { ok: true };
  });
}
