import Database from 'better-sqlite3';
import m001 from './migracoes/001_inicial.js';
import m002 from './migracoes/002_dados_iniciais.js';

export type Banco = Database.Database;

// Novas migrações entram sempre no fim, com versão maior. Nunca editar uma que já foi para o hotel.
const MIGRACOES: { versao: number; nome: string; sql: string }[] = [
  { versao: 1, nome: 'inicial', sql: m001 },
  { versao: 2, nome: 'dados_iniciais', sql: m002 },
];

export function abrirBanco(caminho: string): Banco {
  const banco = new Database(caminho);
  banco.pragma('journal_mode = WAL');
  banco.pragma('foreign_keys = ON');
  banco.pragma('busy_timeout = 5000');
  banco.pragma('synchronous = NORMAL');
  migrar(banco);
  return banco;
}

export function migrar(banco: Banco): number {
  banco.exec(`CREATE TABLE IF NOT EXISTS migracoes (
    versao INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const atual =
    (banco.prepare('SELECT MAX(versao) AS v FROM migracoes').get() as { v: number | null }).v ?? 0;
  const pendentes = MIGRACOES.filter((m) => m.versao > atual);
  for (const m of pendentes) {
    banco.transaction(() => {
      banco.exec(m.sql);
      banco.prepare('INSERT INTO migracoes (versao, nome) VALUES (?, ?)').run(m.versao, m.nome);
    })();
  }
  return pendentes.length;
}

export function versaoBanco(banco: Banco): number {
  return (banco.prepare('SELECT MAX(versao) AS v FROM migracoes').get() as { v: number }).v;
}
