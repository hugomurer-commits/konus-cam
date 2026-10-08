import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { garantirHospede } from '../dominio/estadias.js';
import { historicoHospede, hospedePorId, maisFrequentes, procurarHospedes } from '../dominio/hospedes.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar } from '../validacao.js';

export function rotasHospedes(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;

  app.get('/api/hospedes', async (req) => {
    const { busca } = validar(z.object({ busca: z.string().max(80).default('') }), req.query);
    return { hospedes: busca.trim() ? procurarHospedes(banco, busca, 40) : [] };
  });

  app.get('/api/hospedes/frequentes', async () => ({ hospedes: maisFrequentes(banco, 40) }));

  app.get('/api/hospedes/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const hospede = hospedePorId(banco, id);
    if (!hospede) throw new ErroUsuario('Hóspede não encontrado.', 404);
    return { hospede, estadias: historicoHospede(banco, id) };
  });

  app.put('/api/hospedes/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(
      z.object({
        nome: z.string().trim().min(1, 'Informe o nome.').max(120),
        cpfCnpj: z.string().max(25).default(''),
        telefone: z.string().max(25).default(''),
        cidade: z.string().max(80).default(''),
        uf: z.string().max(4).default(''),
        obs: z.string().max(1000).optional(),
      }),
      req.body,
    );
    banco.transaction(() => {
      garantirHospede(banco, { id, ...d }, req.usuario!.id);
      // garantirHospede só preenche CPF/telefone quando vêm; aqui a tela manda tudo, então vazio limpa
      if (!d.cpfCnpj.replace(/\D/g, '')) banco.prepare('UPDATE hospedes SET cpf_cnpj = NULL WHERE id = ?').run(id);
      if (d.obs !== undefined) banco.prepare('UPDATE hospedes SET obs = ? WHERE id = ?').run(d.obs.trim(), id);
    })();
    return { hospede: hospedePorId(banco, id) };
  });
}
