import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { lancamentosDespesas, lancamentosEntradas, resumoCaixa } from '../dominio/caixa.js';
import { dataLocal, somarDias } from '../dominio/datas.js';
import { cancelarDespesa, categoriasMaisUsadas, editarDespesa, lancarDespesa, sugerirFornecedores } from '../dominio/despesas.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar, zCentavosPositivo, zData, zFormaPagamento } from '../validacao.js';

const zPeriodo = z.object({ de: zData, ate: zData });

const zDespesa = z.object({
  data: zData,
  categoriaId: z.number({ required_error: 'Escolha a categoria.' }).int().positive(),
  fornecedor: z.string().max(120).optional(),
  descricao: z.string().max(300).optional(),
  valor: zCentavosPositivo,
  forma: zFormaPagamento,
  obs: z.string().max(500).optional(),
});

export function rotasCaixa(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  const a = (req: FastifyRequest) => ({ agora: ctx.agora(), usuarioId: req.usuario!.id });
  const periodo = (q: unknown) => {
    const p = validar(zPeriodo, q);
    if (p.ate <= p.de) throw new ErroUsuario('Período inválido.');
    return p;
  };

  app.get('/api/caixa', async (req) => {
    const p = periodo(req.query);
    return { ...resumoCaixa(banco, p.de, p.ate), hoje: dataLocal(ctx.agora()) };
  });

  app.get('/api/caixa/lancamentos', async (req) => {
    const p = periodo(req.query);
    return { despesas: lancamentosDespesas(banco, p.de, p.ate), entradas: lancamentosEntradas(banco, p.de, p.ate) };
  });

  app.post('/api/despesas', async (req) => {
    const d = validar(zDespesa, req.body);
    if (d.data > somarDias(dataLocal(ctx.agora()), 1)) throw new ErroUsuario('A data da despesa não pode ser no futuro. Para contas futuras, use Contas.');
    return { id: lancarDespesa(banco, d, a(req)) };
  });

  app.put('/api/despesas/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    editarDespesa(banco, id, validar(zDespesa, req.body), a(req));
    return { ok: true };
  });

  app.post('/api/despesas/:id/cancelar', async (req) => {
    const { id } = validar(paramsId, req.params);
    cancelarDespesa(banco, id, a(req));
    return { ok: true };
  });

  app.get('/api/fornecedores', async (req) => {
    const { q } = validar(z.object({ q: z.string().max(80).default('') }), req.query);
    return { fornecedores: sugerirFornecedores(banco, q) };
  });

  app.get('/api/categorias/mais-usadas', async () => ({
    categorias: categoriasMaisUsadas(banco, somarDias(dataLocal(ctx.agora()), -120)),
  }));
}
