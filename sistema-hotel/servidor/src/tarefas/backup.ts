import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Banco } from '../banco/conexao.js';
import type { Contexto } from '../contexto.js';
import { dataLocal, minutosDoDia } from '../dominio/datas.js';
import { ErroUsuario } from '../erros.js';

// Backup diário (seção 3): cópia consistente do SQLite + fotos, numa pasta sincronizada pelo
// Google Drive para computador. Guarda 30 diários + 12 mensais.

export const MANTER_DIARIOS = 30;
export const MANTER_MENSAIS = 12;
const HORA_BACKUP = 3 * 60; // 03:00

export function pastaBackup(ctx: Contexto): string {
  const c = ctx.banco.prepare(`SELECT valor FROM config WHERE chave = 'backup_pasta'`).get() as { valor: string } | undefined;
  return c?.valor?.trim() || join(ctx.dirDados, 'backups');
}

/** Confere se a pasta existe e se o sistema consegue escrever nela (o serviço do Windows roda como outro usuário). */
export function testarPasta(pasta: string) {
  if (!existsSync(pasta)) throw new ErroUsuario(`O sistema não encontrou a pasta "${pasta}". Confira o caminho.`);
  const teste = join(pasta, `.teste-hotel-${process.pid}`);
  try {
    writeFileSync(teste, 'ok');
    unlinkSync(teste);
  } catch {
    throw new ErroUsuario(`O sistema não tem permissão para gravar em "${pasta}".`);
  }
}

/**
 * Pastas do Google Drive para computador (modo "espelhar") encontradas no Windows.
 * O serviço roda como sistema e não enxerga a letra G: do modo "streaming", só pastas reais.
 */
export function sugerirPastasDrive(raizUsuarios = 'C:\\Users'): string[] {
  if (process.platform !== 'win32' && raizUsuarios === 'C:\\Users') return [];
  const nomes = ['Meu Drive', 'My Drive', join('Google Drive', 'Meu Drive'), join('Google Drive', 'My Drive')];
  const achadas: string[] = [];
  let usuarios: string[] = [];
  try {
    usuarios = readdirSync(raizUsuarios).filter((u) => !['Public', 'Default', 'Default User', 'All Users'].includes(u));
  } catch {
    return [];
  }
  for (const u of usuarios) {
    for (const n of nomes) {
      const drive = join(raizUsuarios, u, n);
      try {
        if (statSync(drive).isDirectory()) achadas.push(join(drive, 'Backup Hotel'));
      } catch {
        /* não existe */
      }
    }
  }
  return achadas;
}

/** Cria a pasta do backup se a de cima existir (ex.: "Backup Hotel" dentro do "Meu Drive"). */
export function criarPastaSePreciso(pasta: string) {
  if (!existsSync(pasta) && existsSync(dirname(pasta))) mkdirSync(pasta);
}

function manterUltimos(pasta: string, prefixo: string, quantos: number) {
  const arquivos = readdirSync(pasta)
    .filter((a) => a.startsWith(prefixo) && a.endsWith('.db'))
    .sort();
  for (const a of arquivos.slice(0, Math.max(0, arquivos.length - quantos))) unlinkSync(join(pasta, a));
}

/** Copia fotos novas ou mudadas (as fotos nunca são apagadas no sistema, então só acrescenta). */
function espelharFotos(origem: string, destino: string) {
  if (!existsSync(origem)) return;
  mkdirSync(destino, { recursive: true });
  for (const item of readdirSync(origem, { withFileTypes: true })) {
    const o = join(origem, item.name);
    const d = join(destino, item.name);
    if (item.isDirectory()) espelharFotos(o, d);
    else if (!existsSync(d) || statSync(d).size !== statSync(o).size) copyFileSync(o, d);
  }
}

let rodando = false;

export async function fazerBackup(ctx: Contexto): Promise<{ ok: boolean; arquivo?: string; erro?: string }> {
  if (rodando) return { ok: false, erro: 'Já tem um backup em andamento.' };
  rodando = true;
  const agora = ctx.agora();
  const pasta = pastaBackup(ctx);
  try {
    // Sem pasta escolhida, usa dados\backups: cria se ainda não existe
    if (pasta === join(ctx.dirDados, 'backups')) mkdirSync(pasta, { recursive: true });
    testarPasta(pasta);
    const hoje = dataLocal(agora);
    const diarios = join(pasta, 'diario');
    const mensais = join(pasta, 'mensal');
    mkdirSync(diarios, { recursive: true });
    mkdirSync(mensais, { recursive: true });
    const arquivo = join(diarios, `hotel-${hoje}.db`);
    const temporario = `${arquivo}.parcial`;
    if (existsSync(temporario)) rmSync(temporario);
    // API de backup do SQLite: cópia consistente mesmo com o sistema em uso
    await ctx.banco.backup(temporario);
    renameSync(temporario, arquivo);
    const mensal = join(mensais, `hotel-${hoje.slice(0, 7)}.db`);
    if (!existsSync(mensal)) copyFileSync(arquivo, mensal);
    manterUltimos(diarios, 'hotel-', MANTER_DIARIOS);
    manterUltimos(mensais, 'hotel-', MANTER_MENSAIS);
    espelharFotos(join(ctx.dirDados, 'fotos'), join(pasta, 'fotos'));
    const tamanho = statSync(arquivo).size;
    registrar(ctx.banco, { feitoEm: agora.toISOString(), destino: pasta, arquivo, tamanho, ok: true });
    return { ok: true, arquivo };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    registrar(ctx.banco, { feitoEm: agora.toISOString(), destino: pasta, ok: false, erro });
    return { ok: false, erro };
  } finally {
    rodando = false;
  }
}

function registrar(banco: Banco, b: { feitoEm: string; destino: string; arquivo?: string; tamanho?: number; ok: boolean; erro?: string }) {
  banco
    .prepare('INSERT INTO backups (feito_em, destino, arquivo, tamanho, ok, erro) VALUES (?, ?, ?, ?, ?, ?)')
    .run(b.feitoEm, b.destino, b.arquivo ?? null, b.tamanho ?? null, b.ok ? 1 : 0, b.erro ?? null);
}

export function ultimoBackupOk(banco: Banco): string | null {
  return banco.prepare('SELECT MAX(feito_em) FROM backups WHERE ok = 1').pluck().get() as string | null;
}

/**
 * Está na hora? Depois das 03h, se ainda não houve backup hoje. Se o PC estava desligado às 03h,
 * faz assim que o sistema subir. E nunca deixa passar de 26h sem backup.
 */
export function precisaBackup(banco: Banco, agora: Date): boolean {
  const ultimo = ultimoBackupOk(banco);
  if (!ultimo) return true;
  if (agora.getTime() - Date.parse(ultimo) > 26 * 3600_000) return true;
  return minutosDoDia(agora) >= HORA_BACKUP && dataLocal(new Date(ultimo)) !== dataLocal(agora);
}

/** Não insiste a cada minuto se a pasta estiver com problema: tenta de novo depois de 1 hora. */
export function falhouHaPouco(banco: Banco, agora: Date): boolean {
  const u = banco.prepare('SELECT feito_em, ok FROM backups ORDER BY id DESC LIMIT 1').get() as { feito_em: string; ok: number } | undefined;
  return !!u && !u.ok && agora.getTime() - Date.parse(u.feito_em) < 3600_000;
}
