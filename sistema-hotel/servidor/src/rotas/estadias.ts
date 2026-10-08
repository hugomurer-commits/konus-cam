import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { dataLocal } from '../dominio/datas.js';
import {
  cancelar,
  cancelarPagamento,
  chegou,
  criarHospedagem,
  desfazerCriacao,
  detalhesEstadia,
  disponibilidade,
  editarEstadia,
  estender,
  quartoLimpo,
  receber,
  saiu,
  trocarQuarto,
} from '../dominio/estadias.js';
import { procurarHospedes } from '../dominio/hospedes.js';
import { diariaSugerida } from '../dominio/tarifas.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar, zCentavos, zCentavosPositivo, zData, zFormaRecebimento, zHora } from '../validacao.js';

const zPagamento = z.object({
  valor: zCentavosPositivo,
  forma: zFormaRecebimento,
  contaRecebedoraId: z.number().int().positive().nullable(),
  obs: z.string().max(300).optional(),
});

export function rotasEstadias(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  const a = (req: FastifyRequest) => ({ agora: ctx.agora(), usuarioId: req.usuario!.id });

  app.get('/api/disponibilidade', async (req) => {
    const d = validar(z.object({ entrada: zData, saida: zData, ignorar: z.coerce.number().int().optional() }), req.query);
    if (d.saida <= d.entrada) throw new ErroUsuario('A saída precisa ser depois da entrada.');
    return { quartos: disponibilidade(banco, d.entrada, d.saida, ctx.agora(), d.ignorar ?? null) };
  });

  app.get('/api/diaria-sugerida', async (req) => {
    const d = validar(z.object({ quartoId: z.coerce.number().int().optional(), pessoas: z.coerce.number().int().min(1).max(20) }), req.query);
    return { valor: diariaSugerida(banco, d.quartoId ?? null, d.pessoas) };
  });

  app.get('/api/hospedes/procurar', async (req) => {
    const { q } = validar(z.object({ q: z.string().max(80) }), req.query);
    return { hospedes: procurarHospedes(banco, q) };
  });

  app.post('/api/estadias', async (req) => {
    const d = validar(
      z.object({
        hospede: z.object({
          id: z.number().int().positive().nullable().optional(),
          nome: z.string().max(120).optional(),
          cpfCnpj: z.string().max(25).optional(),
          telefone: z.string().max(25).optional(),
          cidade: z.string().max(80).optional(),
          uf: z.string().max(4).optional(),
        }),
        quartoId: z.number({ required_error: 'Escolha o quarto.' }).int().positive(),
        entrada: zData,
        saida: zData,
        pessoas: z.number().int().min(1, 'Informe quantas pessoas.').max(20),
        valorDiaria: zCentavos,
        motivoValor: z.string().max(200).optional(),
        origem: z.enum(['balcao', 'whatsapp']).default('balcao'),
        horaChegadaPrevista: zHora.nullable().optional(),
        jaChegou: z.boolean().default(true),
        obs: z.string().max(1000).optional(),
        pagamento: zPagamento.nullable().optional(),
      }),
      req.body,
    );
    const id = criarHospedagem(banco, d, a(req));
    return { id };
  });

  app.get('/api/estadias/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    return { ...detalhesEstadia(banco, id, ctx.agora()), hoje: dataLocal(ctx.agora()) };
  });

  app.put('/api/estadias/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(
      z.object({
        pessoas: z.number().int().min(1).max(20).optional(),
        valorDiaria: zCentavos.optional(),
        motivoValor: z.string().max(200).optional(),
        horaChegadaPrevista: zHora.nullable().optional(),
        obs: z.string().max(2000).optional(),
      }),
      req.body,
    );
    editarEstadia(banco, id, d, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/receber', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zPagamento, req.body);
    return { pagamentoId: receber(banco, id, d, a(req)) };
  });

  app.post('/api/estadias/:id/chegou', async (req) => {
    const { id } = validar(paramsId, req.params);
    chegou(banco, id, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/saiu', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ tirarNoitesNaoUsadas: z.boolean().default(false) }), req.body);
    saiu(banco, id, d, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/estender', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ novaSaida: zData }), req.body);
    estender(banco, id, d.novaSaida, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/trocar-quarto', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ quartoId: z.number().int().positive() }), req.body);
    trocarQuarto(banco, id, d.quartoId, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/cancelar', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(
      z.object({ naoVeio: z.boolean().default(false), motivo: z.string().max(300).optional(), devolucao: zPagamento.nullable().optional() }),
      req.body,
    );
    cancelar(banco, id, d, a(req));
    return { ok: true };
  });

  app.post('/api/estadias/:id/desfazer', async (req) => {
    const { id } = validar(paramsId, req.params);
    desfazerCriacao(banco, id, a(req));
    return { ok: true };
  });

  app.post('/api/pagamentos/:id/cancelar', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(z.object({ motivo: z.string().max(200).default('') }), req.body);
    cancelarPagamento(banco, id, d.motivo, a(req));
    return { ok: true };
  });

  app.post('/api/quartos/:id/limpo', async (req) => {
    const { id } = validar(paramsId, req.params);
    quartoLimpo(banco, id, a(req));
    return { ok: true };
  });
}
