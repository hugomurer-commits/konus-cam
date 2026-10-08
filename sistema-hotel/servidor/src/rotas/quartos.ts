import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Contexto } from '../contexto.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import { paramsId, validar } from '../validacao.js';

interface QuartoLinha {
  id: number;
  codigo: string;
  nome: string;
  capacidade: number;
  descricao: string;
  comodidades: string;
  ativo: number;
  mostrar_no_site: number;
  ordem: number;
  estado_limpeza: string;
  limpar_desde: string | null;
}

const zQuarto = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'Informe o código do quarto (ex.: 1A).')
    .max(10)
    .transform((s) => s.toUpperCase()),
  nome: z.string().trim().max(60).default(''),
  capacidade: z.number().int().min(1, 'Capacidade mínima: 1 pessoa.').max(20),
  descricao: z.string().trim().max(2000).default(''),
  comodidades: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  ativo: z.boolean(),
  mostrar_no_site: z.boolean(),
});

/** Tipo da imagem pelos primeiros bytes (não confia no nome nem no que o navegador diz). */
function tipoImagem(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function rotasQuartos(app: FastifyInstance, ctx: Contexto) {
  const { banco } = ctx;
  const usuario = (req: { usuario: { id: number } | null }) => req.usuario!.id;

  function fotos(quartoId: number) {
    return banco
      .prepare(
        `SELECT id, arquivo, miniatura, capa, ordem FROM quarto_fotos
         WHERE quarto_id = ? AND arquivada_em IS NULL ORDER BY capa DESC, ordem, id`,
      )
      .all(quartoId) as { id: number; arquivo: string; miniatura: string; capa: number; ordem: number }[];
  }

  function formatar(q: QuartoLinha) {
    const f = fotos(q.id);
    return {
      ...q,
      comodidades: JSON.parse(q.comodidades) as string[],
      ativo: !!q.ativo,
      mostrar_no_site: !!q.mostrar_no_site,
      fotos: f.map((x) => ({ ...x, url: `/fotos/${x.arquivo}`, miniaturaUrl: `/fotos/${x.miniatura}`, capa: !!x.capa })),
    };
  }

  function buscar(id: number): QuartoLinha {
    const q = banco.prepare('SELECT * FROM quartos WHERE id = ?').get(id) as QuartoLinha | undefined;
    if (!q) throw new ErroUsuario('Quarto não encontrado.', 404);
    return q;
  }

  app.get('/api/quartos', async (req) => {
    const { todos } = validar(z.object({ todos: z.coerce.boolean().default(false) }), req.query);
    const qs = banco
      .prepare(`SELECT * FROM quartos ${todos ? '' : 'WHERE ativo = 1'} ORDER BY ativo DESC, ordem, codigo`)
      .all() as QuartoLinha[];
    return { quartos: qs.map(formatar) };
  });

  app.get('/api/quartos/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    return { quarto: formatar(buscar(id)) };
  });

  app.post('/api/quartos', async (req) => {
    const d = validar(zQuarto, req.body);
    if (banco.prepare('SELECT 1 FROM quartos WHERE codigo = ?').get(d.codigo))
      throw new ErroUsuario(`Já existe o quarto ${d.codigo}.`);
    const ordem = banco.prepare('SELECT IFNULL(MAX(ordem), 0) + 1 FROM quartos').pluck().get() as number;
    const id = Number(
      banco
        .prepare(
          `INSERT INTO quartos (codigo, nome, capacidade, descricao, comodidades, ativo, mostrar_no_site, ordem)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          d.codigo,
          d.nome || `Quarto ${d.codigo}`,
          d.capacidade,
          d.descricao,
          JSON.stringify(d.comodidades),
          d.ativo ? 1 : 0,
          d.mostrar_no_site ? 1 : 0,
          ordem,
        ).lastInsertRowid,
    );
    auditar(banco, { usuarioId: usuario(req), tabela: 'quartos', registroId: id, acao: 'criar', depois: d });
    return { quarto: formatar(buscar(id)) };
  });

  app.put('/api/quartos/:id', async (req) => {
    const { id } = validar(paramsId, req.params);
    const d = validar(zQuarto, req.body);
    const antes = buscar(id);
    if (banco.prepare('SELECT 1 FROM quartos WHERE codigo = ? AND id <> ?').get(d.codigo, id))
      throw new ErroUsuario(`Já existe o quarto ${d.codigo}.`);
    if (!d.ativo && antes.ativo) {
      const ativa = banco
        .prepare(
          `SELECT 1 FROM estadias WHERE quarto_id = ? AND status IN ('confirmada','hospedado','pre_reserva') LIMIT 1`,
        )
        .get(id);
      if (ativa) throw new ErroUsuario('Esse quarto tem hóspede ou reserva. Resolva antes de desativar.');
    }
    banco
      .prepare(
        `UPDATE quartos SET codigo = ?, nome = ?, capacidade = ?, descricao = ?, comodidades = ?, ativo = ?, mostrar_no_site = ?
         WHERE id = ?`,
      )
      .run(
        d.codigo,
        d.nome || `Quarto ${d.codigo}`,
        d.capacidade,
        d.descricao,
        JSON.stringify(d.comodidades),
        d.ativo ? 1 : 0,
        d.mostrar_no_site ? 1 : 0,
        id,
      );
    auditar(banco, { usuarioId: usuario(req), tabela: 'quartos', registroId: id, acao: 'editar', antes, depois: d });
    return { quarto: formatar(buscar(id)) };
  });

  app.put('/api/quartos-ordem', async (req) => {
    const { ids } = validar(z.object({ ids: z.array(z.number().int().positive()).max(200) }), req.body);
    const up = banco.prepare('UPDATE quartos SET ordem = ? WHERE id = ?');
    banco.transaction(() => ids.forEach((id, i) => up.run(i + 1, id)))();
    return { ok: true };
  });

  // Fotos: o navegador já manda redimensionada (máx. 1600px) e a miniatura (seção 3).
  app.post('/api/quartos/:id/fotos', async (req) => {
    const { id } = validar(paramsId, req.params);
    buscar(id);
    const partes: Record<string, Buffer> = {};
    for await (const parte of req.parts()) {
      if (parte.type === 'file') partes[parte.fieldname] = await parte.toBuffer();
    }
    const foto = partes.foto;
    const mini = partes.miniatura ?? partes.foto;
    if (!foto) throw new ErroUsuario('Escolha uma foto.');
    const tf = tipoImagem(foto);
    const tm = tipoImagem(mini);
    if (!tf || !tm) throw new ErroUsuario('Esse arquivo não é uma foto (use JPG, PNG ou WebP).');
    if (foto.length > 6 * 1024 * 1024) throw new ErroUsuario('Foto grande demais.');
    const pasta = `quarto-${id}`;
    mkdirSync(join(ctx.dirDados, 'fotos', pasta), { recursive: true });
    const nome = randomUUID();
    const arquivo = `${pasta}/${nome}.${tf}`;
    const miniatura = `${pasta}/${nome}-mini.${tm}`;
    writeFileSync(join(ctx.dirDados, 'fotos', arquivo), foto);
    writeFileSync(join(ctx.dirDados, 'fotos', miniatura), mini);
    const temCapa = banco
      .prepare('SELECT 1 FROM quarto_fotos WHERE quarto_id = ? AND capa = 1 AND arquivada_em IS NULL')
      .get(id);
    const ordem = banco
      .prepare('SELECT IFNULL(MAX(ordem), 0) + 1 FROM quarto_fotos WHERE quarto_id = ?')
      .pluck()
      .get(id) as number;
    const fotoId = Number(
      banco
        .prepare('INSERT INTO quarto_fotos (quarto_id, arquivo, miniatura, capa, ordem) VALUES (?, ?, ?, ?, ?)')
        .run(id, arquivo, miniatura, temCapa ? 0 : 1, ordem).lastInsertRowid,
    );
    auditar(banco, { usuarioId: usuario(req), tabela: 'quarto_fotos', registroId: fotoId, acao: 'criar', depois: { arquivo } });
    return { quarto: formatar(buscar(id)) };
  });

  app.put('/api/quartos/:id/fotos/:fotoId/capa', async (req) => {
    const { id, fotoId } = validar(z.object({ id: z.coerce.number(), fotoId: z.coerce.number() }), req.params);
    banco.transaction(() => {
      banco.prepare('UPDATE quarto_fotos SET capa = 0 WHERE quarto_id = ?').run(id);
      banco.prepare('UPDATE quarto_fotos SET capa = 1 WHERE id = ? AND quarto_id = ?').run(fotoId, id);
    })();
    return { quarto: formatar(buscar(id)) };
  });

  app.put('/api/quartos/:id/fotos-ordem', async (req) => {
    const { id } = validar(paramsId, req.params);
    const { ids } = validar(z.object({ ids: z.array(z.number().int().positive()).max(100) }), req.body);
    const up = banco.prepare('UPDATE quarto_fotos SET ordem = ? WHERE id = ? AND quarto_id = ?');
    banco.transaction(() => ids.forEach((f, i) => up.run(i + 1, f, id)))();
    return { quarto: formatar(buscar(id)) };
  });

  // "Tirar" a foto: some do site e do painel, mas o arquivo fica guardado (nada é apagado de verdade)
  app.delete('/api/quartos/:id/fotos/:fotoId', async (req) => {
    const { id, fotoId } = validar(z.object({ id: z.coerce.number(), fotoId: z.coerce.number() }), req.params);
    banco.transaction(() => {
      const f = banco.prepare('SELECT capa FROM quarto_fotos WHERE id = ? AND quarto_id = ?').get(fotoId, id) as
        | { capa: number }
        | undefined;
      if (!f) throw new ErroUsuario('Foto não encontrada.', 404);
      banco
        .prepare('UPDATE quarto_fotos SET arquivada_em = ?, capa = 0 WHERE id = ?')
        .run(ctx.agora().toISOString(), fotoId);
      if (f.capa) {
        banco
          .prepare(
            `UPDATE quarto_fotos SET capa = 1 WHERE id = (
               SELECT id FROM quarto_fotos WHERE quarto_id = ? AND arquivada_em IS NULL ORDER BY ordem, id LIMIT 1)`,
          )
          .run(id);
      }
      auditar(banco, { usuarioId: usuario(req), tabela: 'quarto_fotos', registroId: fotoId, acao: 'arquivar' });
    })();
    return { quarto: formatar(buscar(id)) };
  });
}
