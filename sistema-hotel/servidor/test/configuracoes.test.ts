import { describe, expect, it } from 'vitest';
import { diariaSugerida } from '../src/dominio/tarifas.js';
import { criarAmbiente } from './ajuda.js';

// PNG 1x1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function multipart(campos: Record<string, Buffer>) {
  const limite = '----teste' + Math.random().toString(16).slice(2);
  const partes = Object.entries(campos).map(([nome, buf]) =>
    Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${nome}"; filename="${nome}.png"\r\nContent-Type: image/png\r\n\r\n`),
      buf,
      Buffer.from('\r\n'),
    ]),
  );
  return {
    payload: Buffer.concat([...partes, Buffer.from(`--${limite}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}

describe('configurações', () => {
  it('lê e grava a configuração do hotel, com validação', async () => {
    const { api } = await criarAmbiente();
    const r = await api('PUT', '/api/config', { cnpj: '12.345.678/0001-90', whatsapp_hotel: '(69) 99999-0000', sinal_percentual: 30 });
    expect(r.status).toBe(200);
    expect(r.json.config.cnpj).toBe('12345678000190');
    expect(r.json.config.whatsapp_hotel).toBe('69999990000');
    const ruim = await api('PUT', '/api/config', { hora_checkin: '25:00' });
    expect(ruim.status).toBe(400);
    expect(ruim.json.erro).toBe('Hora inválida.');
  });

  it('tabela de preço geral, exceção por quarto e pessoa extra', async () => {
    const { api, banco } = await criarAmbiente();
    const q = await api('POST', '/api/quartos', { codigo: '1a', capacidade: 4, ativo: true, mostrar_no_site: false });
    expect(q.json.quarto.codigo).toBe('1A');
    const id = q.json.quarto.id;
    expect(diariaSugerida(banco, id, 2)).toBe(20000);
    expect(diariaSugerida(banco, id, 7)).toBe(70000); // 5 pessoas = 500 + R$ 100 por pessoa a mais
    await api('PUT', '/api/tarifas', { quartoId: id, valores: [{ pessoas: 2, valor: 25000 }] });
    expect(diariaSugerida(banco, id, 2)).toBe(25000);
    expect(diariaSugerida(banco, id, 1)).toBe(15000);
    const t = await api('GET', '/api/tarifas');
    expect(t.json.excecoes).toEqual([{ quarto_id: id, codigo: '1A', pessoas: 2, valor: 25000 }]);
    const dup = await api('PUT', '/api/tarifas', { quartoId: null, valores: [{ pessoas: 1, valor: 1 }, { pessoas: 1, valor: 2 }] });
    expect(dup.status).toBe(400);
  });

  it('categorias e quem recebe', async () => {
    const { api } = await criarAmbiente();
    const c = await api('POST', '/api/categorias', { nome: 'Plano de saúde', grupo: 'casa_pessoal' });
    expect(c.status).toBe(200);
    const repetida = await api('POST', '/api/categorias', { nome: 'plano de saúde', grupo: 'operacao' });
    expect(repetida.status).toBe(400);
    const r = await api('POST', '/api/contas-recebedoras', { sigla: 'j', nome: 'Jéssica' });
    expect(r.status).toBe(200);
    const lista = await api('GET', '/api/contas-recebedoras');
    expect(lista.json.contas.map((x: { sigla: string }) => x.sigla)).toEqual(['H', 'V', 'N', 'J']);
  });

  it('quartos: código único, fotos com capa automática e "tirar" sem apagar', async () => {
    const { app, api, banco } = await criarAmbiente();
    const q = await api('POST', '/api/quartos', { codigo: '2A', capacidade: 3, ativo: true, mostrar_no_site: true, comodidades: ['Ar-condicionado'] });
    const id = q.json.quarto.id;
    expect((await api('POST', '/api/quartos', { codigo: '2a', capacidade: 2, ativo: true, mostrar_no_site: false })).status).toBe(400);

    const cookie = (await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { login: 'teste', senha: 'senha-forte-1' } }))
      .cookies[0].value;
    const envia = (campos: Record<string, Buffer>) =>
      app.inject({ method: 'POST', url: `/api/quartos/${id}/fotos`, cookies: { hotel_sessao: cookie }, ...multipart(campos) });
    const r1 = await envia({ foto: PNG, miniatura: PNG });
    expect(r1.statusCode).toBe(200);
    const r2 = await envia({ foto: PNG, miniatura: PNG });
    const fotos = r2.json().quarto.fotos;
    expect(fotos).toHaveLength(2);
    expect(fotos[0].capa).toBe(true);
    const falsa = await envia({ foto: Buffer.from('<script>alert(1)</script>') });
    expect(falsa.statusCode).toBe(400);

    const servida = await app.inject({ method: 'GET', url: fotos[0].url });
    expect(servida.statusCode).toBe(200);

    const tirar = await api('DELETE', `/api/quartos/${id}/fotos/${fotos[0].id}`);
    expect(tirar.json.quarto.fotos).toHaveLength(1);
    expect(tirar.json.quarto.fotos[0].capa).toBe(true); // a outra virou capa
    expect(banco.prepare('SELECT COUNT(*) FROM quarto_fotos').pluck().get()).toBe(2); // continua guardada
  });

  it('não desativa quarto com hóspede', async () => {
    const { api, banco } = await criarAmbiente();
    const q = await api('POST', '/api/quartos', { codigo: '3A', capacidade: 2, ativo: true, mostrar_no_site: false });
    banco.exec(`INSERT INTO hospedes (nome, nome_busca) VALUES ('X', 'X');
      INSERT INTO estadias (quarto_id, hospede_id, data_entrada, data_saida, status) VALUES (${q.json.quarto.id}, 1, '2026-10-08', '2026-10-09', 'hospedado');`);
    const r = await api('PUT', `/api/quartos/${q.json.quarto.id}`, { codigo: '3A', capacidade: 2, ativo: false, mostrar_no_site: false });
    expect(r.status).toBe(400);
  });

  it('cria outro usuário', async () => {
    const { api } = await criarAmbiente();
    expect((await api('POST', '/api/usuarios', { nome: 'Hugo', login: 'hugo', senha: 'curta' })).status).toBe(400);
    expect((await api('POST', '/api/usuarios', { nome: 'Hugo', login: 'hugo', senha: 'uma-senha-boa' })).status).toBe(200);
  });
});
