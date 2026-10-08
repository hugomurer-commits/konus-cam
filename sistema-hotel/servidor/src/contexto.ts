import type { Banco } from './banco/conexao.js';
import type { Usuario } from './dominio/autenticacao.js';

export interface Contexto {
  banco: Banco;
  /** Relógio injetável: os testes usam uma data fixa. */
  agora: () => Date;
  /** Pasta de dados (banco, fotos, backups). No hotel: C:\SistemaHotel\dados */
  dirDados: string;
  /** Painel compilado (painel/dist). Ausente nos testes de API. */
  dirPainel?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
  }
}
