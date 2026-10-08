import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { dataLocal, noitesEntre, somarDias } from '../dominio/datas.js';
import { validar, zData } from '../validacao.js';

// Mapa (seção 5.3): linhas = quartos, colunas = dias. Uma célula pode ter 2 hóspedes
// na mesma noite (saiu antes + quarto alugado de novo), em ordem.
export function rotasMapa(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  app.get('/api/mapa', async (req) => {
    const hoje = dataLocal(ctx.agora());
    const d = validar(z.object({ de: zData.optional(), dias: z.coerce.number().int().min(1).max(62).default(14) }), req.query);
    const de = d.de ?? hoje;
    const ate = somarDias(de, d.dias);
    const quartos = banco
      .prepare('SELECT id, codigo, nome, capacidade, estado_limpeza FROM quartos WHERE ativo = 1 ORDER BY ordem, codigo')
      .all();
    const estadias = banco
      .prepare(
        `SELECT e.id, e.quarto_id, e.data_entrada, e.data_saida, e.status, e.pre_reserva_expira_em, h.nome,
           v.total - v.pago AS saldo
         FROM estadias e JOIN hospedes h ON h.id = e.hospede_id JOIN estadias_valores v ON v.estadia_id = e.id
         WHERE e.data_entrada < @ate AND e.data_saida > @de
           AND (e.status IN ('confirmada','hospedado','finalizada')
                OR (e.status = 'pre_reserva' AND e.pre_reserva_expira_em > @agora))
         ORDER BY e.quarto_id, e.data_entrada, e.id`,
      )
      .all({ de, ate, agora: ctx.agora().toISOString() }) as {
      id: number;
      quarto_id: number;
      data_entrada: string;
      data_saida: string;
      status: string;
    }[];
    return { hoje, de, dias: noitesEntre(de, ate), quartos, estadias };
  });
}
