import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { fazerBackup, precisaBackup } from '../src/tarefas/backup.js';
import { criarAmbiente } from './ajuda.js';

describe('backup', () => {
  it('copia o banco (consistente) e as fotos; guarda 30 diários e 12 mensais', async () => {
    const amb = await criarAmbiente();
    const pasta = mkdtempSync(join(tmpdir(), 'hotel-drive-'));
    expect((await amb.api('PUT', '/api/backup/pasta', { pasta })).status).toBe(200);
    expect((await amb.api('PUT', '/api/backup/pasta', { pasta: '/nao/existe' })).status).toBe(400);
    mkdirSync(join(amb.ctx.dirDados, 'fotos', 'quarto-1'), { recursive: true });
    writeFileSync(join(amb.ctx.dirDados, 'fotos', 'quarto-1', 'a.webp'), 'foto');
    // 35 dias seguidos de backup
    for (let i = 0; i < 35; i++) {
      amb.relogio.agora = new Date(Date.UTC(2026, 9, 1 + i, 10));
      expect((await fazerBackup(amb.ctx)).ok).toBe(true);
    }
    const diarios = readdirSync(join(pasta, 'diario'));
    expect(diarios).toHaveLength(30);
    expect(readdirSync(join(pasta, 'mensal')).sort()).toEqual(['hotel-2026-10.db', 'hotel-2026-11.db']);
    expect(existsSync(join(pasta, 'fotos', 'quarto-1', 'a.webp'))).toBe(true);
    // O arquivo é um banco válido com os dados
    const copia = new Database(join(pasta, 'diario', diarios[diarios.length - 1]), { readonly: true });
    expect(copia.prepare('SELECT COUNT(*) FROM usuarios').pluck().get()).toBe(1);
    copia.close();
    const st = (await amb.api('GET', '/api/backup')).json;
    expect(st.atrasado).toBe(false);
  });

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
});
