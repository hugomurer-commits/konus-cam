import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { fazerBackup, precisaBackup, sugerirPastasDrive } from '../src/tarefas/backup.js';
import { criarAmbiente } from './ajuda.js';

describe('backup', () => {
  it('copia o banco (consistente) e as fotos; guarda 30 diários e 12 mensais', async () => {
    const amb = await criarAmbiente();
    const pasta = mkdtempSync(join(tmpdir(), 'hotel-drive-'));
    expect((await amb.api('PUT', '/api/backup/pasta', { pasta })).status).toBe(200);
    expect((await amb.api('PUT', '/api/backup/pasta', { pasta: '/nao/existe' })).status).toBe(400);
    mkdirSync(join(amb.ctx.dirDados, 'fotos', 'quarto-1'), { recursive: true });
    writeFileSync(join(amb.ctx.dirDados, 'fotos', 'quarto-1', 'a.webp'), 'foto');
    // Já existem 33 diários e 13 mensais antigos (arquivos de mentira, para o teste ser rápido)
    mkdirSync(join(pasta, 'diario'));
    mkdirSync(join(pasta, 'mensal'));
    for (let i = 1; i <= 33; i++) writeFileSync(join(pasta, 'diario', `hotel-2026-08-${String(i).padStart(2, '0')}.db`), 'x');
    for (let i = 1; i <= 13; i++) writeFileSync(join(pasta, 'mensal', `hotel-2025-${String(i).padStart(2, '0')}.db`), 'x');
    amb.relogio.agora = new Date('2026-10-31T10:00:00Z');
    expect((await fazerBackup(amb.ctx)).ok).toBe(true);
    amb.relogio.agora = new Date('2026-11-01T10:00:00Z');
    expect((await fazerBackup(amb.ctx)).ok).toBe(true);
    const diarios = readdirSync(join(pasta, 'diario')).sort();
    expect(diarios).toHaveLength(30);
    expect(diarios.slice(-2)).toEqual(['hotel-2026-10-31.db', 'hotel-2026-11-01.db']);
    const mensais = readdirSync(join(pasta, 'mensal')).sort();
    expect(mensais).toHaveLength(12);
    expect(mensais.slice(-2)).toEqual(['hotel-2026-10.db', 'hotel-2026-11.db']);
    expect(existsSync(join(pasta, 'fotos', 'quarto-1', 'a.webp'))).toBe(true);
    // O arquivo é um banco válido com os dados
    const copia = new Database(join(pasta, 'diario', diarios[diarios.length - 1]), { readonly: true });
    expect(copia.prepare('SELECT COUNT(*) FROM usuarios').pluck().get()).toBe(1);
    copia.close();
    const st = (await amb.api('GET', '/api/backup')).json;
    expect(st.atrasado).toBe(false);
  }, 30_000);

  it('hora do backup: depois das 3h se não teve hoje; sempre se passou de 26h', async () => {
    const amb = await criarAmbiente();
    const pasta = mkdtempSync(join(tmpdir(), 'hotel-drive-'));
    await amb.api('PUT', '/api/backup/pasta', { pasta });
    expect(precisaBackup(amb.banco, new Date('2026-10-08T05:00:00Z'))).toBe(true); // nunca fez
    amb.relogio.agora = new Date('2026-10-08T07:30:00Z'); // 03:30 em Cacoal
    await fazerBackup(amb.ctx);
    expect(precisaBackup(amb.banco, new Date('2026-10-08T20:00:00Z'))).toBe(false); // mesmo dia
    expect(precisaBackup(amb.banco, new Date('2026-10-09T06:00:00Z'))).toBe(false); // 02:00 do dia seguinte
    expect(precisaBackup(amb.banco, new Date('2026-10-09T07:05:00Z'))).toBe(true); // 03:05
  });

  it('falha fica registrada e aparece como atrasado', async () => {
    const amb = await criarAmbiente();
    amb.banco.prepare(`UPDATE config SET valor = '/pasta/que/sumiu' WHERE chave = 'backup_pasta'`).run();
    const r = await fazerBackup(amb.ctx);
    expect(r.ok).toBe(false);
    const st = (await amb.api('GET', '/api/backup')).json;
    expect(st.atrasado).toBe(true);
    expect(st.historico[0].ok).toBe(0);
  });

  it('acha a pasta do Google Drive (modo espelhar) e cria "Backup Hotel" dentro', async () => {
    const usuarios = mkdtempSync(join(tmpdir(), 'usuarios-'));
    mkdirSync(join(usuarios, 'Hotel', 'Meu Drive'), { recursive: true });
    mkdirSync(join(usuarios, 'Public', 'Meu Drive'), { recursive: true });
    const s = sugerirPastasDrive(usuarios);
    expect(s).toEqual([join(usuarios, 'Hotel', 'Meu Drive', 'Backup Hotel')]);
    const amb = await criarAmbiente();
    expect((await amb.api('PUT', '/api/backup/pasta', { pasta: s[0], criar: true })).status).toBe(200);
    expect(existsSync(s[0])).toBe(true);
  });
});
