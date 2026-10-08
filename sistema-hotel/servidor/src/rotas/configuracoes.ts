import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { auditar } from '../banco/auditoria.js';
import { criarUsuario } from '../dominio/autenticacao.js';
import { tabelaDoQuarto, tabelaGeral } from '../dominio/tarifas.js';
import { soDigitos } from '../dominio/texto.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar, zCentavos, zHora } from '../validacao.js';

export const GRUPOS = ['operacao', 'obra', 'financiamento', 'investimento', 'casa_pessoal', 'retirada'] as const;

const zConfig = z
  .object({
    nome_hotel: z.string().trim().min(1, 'Informe o nome do hotel.').max(80),
    cidade_hotel: z.string().trim().max(80),
    cnpj: z.string().trim().max(20).transform(soDigitos),
    pix_chave: z.string().trim().max(77),
    pix_nome_recebedor: z.string().trim().max(25, 'Nome do recebedor do Pix: no máximo 25 letras.'),
    pix_cidade_recebedor: z.string().trim().max(15, 'Cidade do recebedor do Pix: no máximo 15 letras.'),
    whatsapp_hotel: z.string().trim().max(20).transform(soDigitos),
    sinal_percentual: z.coerce.number().int().min(0).max(100).transform(String),
    minutos_segura: z.coerce.number().int().min(5).max(240).transform(String),
    hora_checkin: zHora,
    hora_checkout: zHora,
    politica_cancelamento: z.string().trim().max(2000),
    backup_pasta: z.string().trim().max(500),
  })
  .partial();

export function lerConfig(banco: Contexto['banco']): Record<string, string> {
  const linhas = banco.prepare('SELECT chave, valor FROM config').all() as { chave: string; valor: string }[];
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

export function rotasConfiguracoes(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  const usuario = (req: { usuario: { id: number } | null }) => req.usuario!.id;

  app.get('/api/config', async () => ({ config: lerConfig(banco) }));

  app.put('/api/config', async (req) => {
    const d = validar(zConfig, req.body);
    const antes = lerConfig(banco);
    banco.transaction(() => {
      const up = banco.prepare(
        `INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      );
      for (const [k, v] of Object.entries(d)) if (v !== undefined) up.run(k, String(v));
      auditar(banco, { usuarioId: usuario(req), tabela: 'config', registroId: null, acao: 'editar', antes, depois: d });
    })();
    return { config: lerConfig(banco) };
  });

  // ── Tabela de preço (seção 5.6)
  app.get('/api/tarifas', async () => {
    const excecoes = banco
      .prepare(
        `SELECT t.quarto_id, q.codigo, t.pessoas, t.valor FROM tarifas t JOIN quartos q ON q.id = t.quarto_id
         ORDER BY q.ordem, t.pessoas`,
      )
      .all();
    return { geral: tabelaGeral(banco), excecoes };
  });

  app.put('/api/tarifas', async (req) => {
    const d = validar(
      z.object({
        quartoId: z.number().int().positive().nullable(),
        valores: z
          .array(z.object({ pessoas: z.number().int().min(1).max(20), valor: zCentavos }))
          .max(20),
      }),
      req.body,
    );
    if (d.quartoId === null && d.valores.length === 0) throw new ErroUsuario('A tabela geral precisa ter pelo menos uma linha.');
    if (new Set(d.valores.map((v) => v.pessoas)).size !== d.valores.length)
      throw new ErroUsuario('Cada número de pessoas só pode aparecer uma vez.');
    banco.transaction(() => {
      const antes = d.quartoId === null ? tabelaGeral(banco) : tabelaDoQuarto(banco, d.quartoId);
      if (d.quartoId === null) banco.prepare('DELETE FROM tarifas WHERE quarto_id IS NULL').run();
      else banco.prepare('DELETE FROM tarifas WHERE quarto_id = ?').run(d.quartoId);
      const ins = banco.prepare('INSERT INTO tarifas (quarto_id, pessoas, valor) VALUES (?, ?, ?)');
      for (const v of d.valores) ins.run(d.quartoId, v.pessoas, v.valor);
      auditar(banco, { usuarioId: usuario(req), tabela: 'tarifas', registroId: d.quartoId, acao: 'editar', antes, depois: d.valores });
    })();
    return { ok: true };
  });

  // ── Quem recebe (H/V/N)
  app.get('/api/contas-recebedoras', async () => ({
    contas: banco.prepare('SELECT id, sigla, nome, ativa, ordem FROM contas_recebedoras ORDER BY ordem, id').all(),
    // Sugestão para quem recebeu: a conta mais usada nos últimos 200 pagamentos
    maisUsada:
      (banco
        .prepare(
          `SELECT conta_recebedora_id FROM (SELECT conta_recebedora_id FROM pagamentos_validos
             WHERE conta_recebedora_id IS NOT NULL ORDER BY id DESC LIMIT 200)
           GROUP BY conta_recebedora_id ORDER BY COUNT(*) DESC LIMIT 1`,
        )
        .pluck()
        .get() as number | undefined) ?? null,
  }));

  const zRecebedora = z.object({
    sigla: z.string().trim().min(1, 'Informe a sigla.').max(3).transform((s) => s.toUpperCase()),
    nome: z.string().trim().min(1, 'Informe o nome.').max(40),
    ativa: z.boolean().default(true),
  });
  app.post('/api/contas-recebedoras', async (req) => {
    const d = validar(zRecebedora, req.body);
    if (banco.prepare('SELECT 1 FROM contas_recebedoras WHERE sigla = ?').get(d.sigla))
      throw new ErroUsuario('Já existe essa sigla.');
    const ordem = (banco.prepare('SELECT IFNULL(MAX(ordem), 0) + 1 FROM contas_recebedoras').pluck().get() as number);
    const id = Number(
      banco
        .prepare('INSERT INTO contas_recebedoras (sigla, nome, ativa, ordem) VALUES (?, ?, ?, ?)')
        .run(d.sigla, d.nome, d.ativa ? 1 : 0, ordem).lastInsertRowid,
    );
    auditar(banco, { usuarioId: usuario(req), tabela: 'contas_recebedoras', registroId: id, acao: 'criar', depois: d });
    return { id };
  });
  app.put('/api/contas-recebedoras/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zRecebedora, req.body);
    if (banco.prepare('SELECT 1 FROM contas_recebedoras WHERE sigla = ? AND id <> ?').get(d.sigla, id))
      throw new ErroUsuario('Já existe essa sigla.');
    const antes = banco.prepare('SELECT * FROM contas_recebedoras WHERE id = ?').get(id);
    if (!antes) throw new ErroUsuario('Não encontrado.', 404);
    banco
      .prepare('UPDATE contas_recebedoras SET sigla = ?, nome = ?, ativa = ? WHERE id = ?')
      .run(d.sigla, d.nome, d.ativa ? 1 : 0, id);
    auditar(banco, { usuarioId: usuario(req), tabela: 'contas_recebedoras', registroId: id, acao: 'editar', antes, depois: d });
    return { ok: true };
  });

  // ── Categorias de despesa e seus grupos
  app.get('/api/categorias', async () => ({
    categorias: banco
      .prepare(
        `SELECT c.id, c.nome, c.grupo, c.ativa, c.ordem, c.aviso,
           (SELECT COUNT(*) FROM despesas d WHERE d.categoria_id = c.id AND d.cancelado_em IS NULL) AS usos
         FROM categorias c ORDER BY c.ordem, c.nome`,
      )
      .all(),
  }));

  const zCategoria = z.object({
    nome: z.string().trim().min(1, 'Informe o nome.').max(60),
    grupo: z.enum(GRUPOS, { errorMap: () => ({ message: 'Escolha o grupo.' }) }),
    ativa: z.boolean().default(true),
    aviso: z.string().trim().max(300).default(''),
  });
  app.post('/api/categorias', async (req) => {
    const d = validar(zCategoria, req.body);
    if (banco.prepare('SELECT 1 FROM categorias WHERE nome = ?').get(d.nome)) throw new ErroUsuario('Já existe essa categoria.');
    const id = Number(
      banco
        .prepare('INSERT INTO categorias (nome, grupo, ativa, aviso, ordem) VALUES (?, ?, ?, ?, 50)')
        .run(d.nome, d.grupo, d.ativa ? 1 : 0, d.aviso).lastInsertRowid,
    );
    auditar(banco, { usuarioId: usuario(req), tabela: 'categorias', registroId: id, acao: 'criar', depois: d });
    return { id };
  });
  app.put('/api/categorias/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zCategoria, req.body);
    if (banco.prepare('SELECT 1 FROM categorias WHERE nome = ? AND id <> ?').get(d.nome, id))
      throw new ErroUsuario('Já existe essa categoria.');
    const antes = banco.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    if (!antes) throw new ErroUsuario('Categoria não encontrada.', 404);
    banco
      .prepare('UPDATE categorias SET nome = ?, grupo = ?, ativa = ?, aviso = ? WHERE id = ?')
      .run(d.nome, d.grupo, d.ativa ? 1 : 0, d.aviso, id);
    auditar(banco, { usuarioId: usuario(req), tabela: 'categorias', registroId: id, acao: 'editar', antes, depois: d });
    return { ok: true };
  });

  // ── Usuários (o dono e o Hugo)
  app.get('/api/usuarios', async () => ({
    usuarios: banco.prepare('SELECT id, nome, login, ativo FROM usuarios ORDER BY id').all(),
  }));
  app.post('/api/usuarios', async (req) => {
    const d = validar(
      z.object({
        nome: z.string().trim().min(1, 'Informe o nome.'),
        login: z.string().trim().min(2, 'Escolha um nome de acesso.'),
        senha: z.string(),
      }),
      req.body,
    );
    const id = await criarUsuario(banco, d.nome, d.login, d.senha);
    auditar(banco, { usuarioId: usuario(req), tabela: 'usuarios', registroId: id, acao: 'criar', depois: { nome: d.nome, login: d.login } });
    return { id };
  });
}
