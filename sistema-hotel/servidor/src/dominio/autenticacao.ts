import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Banco } from '../banco/conexao.js';
import { ErroUsuario } from '../erros.js';

const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt vem no próprio Node (sem módulo nativo extra para compilar no Windows).
const N = 2 ** 15;
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024;

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, 64, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, sal, hash] = guardado.split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await scryptAsync(senha, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(esperado, obtido);
}

export function validarSenhaNova(senha: string): void {
  if (senha.length < 8) throw new ErroUsuario('A senha precisa ter pelo menos 8 caracteres.');
}

const DIA = 86_400_000;
export const DURACAO_LEMBRAR = 365 * DIA;
export const DURACAO_NORMAL = 12 * 60 * 60 * 1000;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface Usuario {
  id: number;
  nome: string;
  login: string;
}

export function criarSessao(banco: Banco, usuarioId: number, lembrar: boolean, agora: Date) {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(agora.getTime() + (lembrar ? DURACAO_LEMBRAR : DURACAO_NORMAL));
  banco
    .prepare(
      `INSERT INTO sessoes (usuario_id, token_hash, lembrar, expira_em, ultimo_uso_em) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(usuarioId, hashToken(token), lembrar ? 1 : 0, expira.toISOString(), agora.toISOString());
  return { token, expira };
}

/** Confere o token do cookie. Sessão "lembrar" se renova sozinha a cada uso. */
export function usuarioDaSessao(banco: Banco, token: string, agora: Date): Usuario | null {
  const s = banco
    .prepare(
      `SELECT s.id, s.lembrar, s.expira_em, u.id AS usuario_id, u.nome, u.login
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.encerrada_em IS NULL AND u.ativo = 1`,
    )
    .get(hashToken(token)) as
    | { id: number; lembrar: number; expira_em: string; usuario_id: number; nome: string; login: string }
    | undefined;
  if (!s || s.expira_em <= agora.toISOString()) return null;
  const novaExpiracao = s.lembrar
    ? new Date(agora.getTime() + DURACAO_LEMBRAR).toISOString()
    : s.expira_em;
  banco
    .prepare('UPDATE sessoes SET ultimo_uso_em = ?, expira_em = ? WHERE id = ?')
    .run(agora.toISOString(), novaExpiracao, s.id);
  return { id: s.usuario_id, nome: s.nome, login: s.login };
}

export function encerrarSessao(banco: Banco, token: string, agora: Date): void {
  banco
    .prepare('UPDATE sessoes SET encerrada_em = ? WHERE token_hash = ?')
    .run(agora.toISOString(), hashToken(token));
}

export function existeUsuario(banco: Banco): boolean {
  return !!banco.prepare('SELECT 1 FROM usuarios LIMIT 1').get();
}

export async function criarUsuario(banco: Banco, nome: string, login: string, senha: string) {
  validarSenhaNova(senha);
  const existe = banco.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(login);
  if (existe) throw new ErroUsuario('Já existe um usuário com esse nome de acesso.');
  const hash = await gerarHashSenha(senha);
  const r = banco
    .prepare('INSERT INTO usuarios (nome, login, senha_hash) VALUES (?, ?, ?)')
    .run(nome.trim(), login.trim(), hash);
  return Number(r.lastInsertRowid);
}
