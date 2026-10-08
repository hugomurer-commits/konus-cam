import { beforeEach, describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ajuda.js';

// Hora padrão do ambiente: 08/10/2026 15:00 em Cacoal
let amb: Ambiente;
let q1: number;
let q2: number;

async function novaHospedagem(extra: Record<string, unknown> = {}) {
  return amb.api('POST', '/api/estadias', {
    hospede: { nome: 'José da Silva', cpfCnpj: '123.456.789-01', telefone: '(69) 99999-1111', cidade: 'Cacoal', uf: 'ro' },
    quartoId: q1,
    entrada: '2026-10-08',
    saida: '2026-10-09',
    pessoas: 2,
    valorDiaria: 20000,
    jaChegou: true,
    pagamento: { valor: 20000, forma: 'pix', contaRecebedoraId: 1 },
    ...extra,
  });
}

beforeEach(async () => {
  amb = await criarAmbiente();
  q1 = (await amb.api('POST', '/api/quartos', { codigo: '1A', capacidade: 3, ativo: true, mostrar_no_site: true })).json.quarto.id;
  q2 = (await amb.api('POST', '/api/quartos', { codigo: '2A', capacidade: 2, ativo: true, mostrar_no_site: true })).json.quarto.id;
});

describe('nova hospedagem', () => {
  it('cria hóspede, estadia, noites e pagamento', async () => {
    const r = await novaHospedagem({ saida: '2026-10-10', pagamento: { valor: 30000, forma: 'pix', contaRecebedoraId: 1 } });
    expect(r.status).toBe(200);
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.estadia.status).toBe('hospedado');
    expect(d.estadia.chegada_real_em).toBe('2026-10-08T19:00:00.000Z');
    expect(d.hospede).toMatchObject({ nome: 'José da Silva', cpf_cnpj: '12345678901', telefone: '69999991111', uf: 'RO' });
    expect(d.noites).toEqual([
      { data: '2026-10-08', valor: 20000 },
      { data: '2026-10-09', valor: 20000 },
    ]);
    expect(d).toMatchObject({ total: 40000, pago: 30000, saldo: 10000 });
    expect(d.pagamentos[0]).toMatchObject({ forma: 'pix', tipo: 'diaria', conta: 'H', data: '2026-10-08' });
  });

  it('hóspede que volta: acha por telefone sem DDD e reaproveita o cadastro', async () => {
    await novaHospedagem();
    const busca = (await amb.api('GET', '/api/hospedes/procurar?q=99999-1111')).json.hospedes;
    expect(busca).toHaveLength(1);
    expect(busca[0]).toMatchObject({ nome: 'José da Silva', visitas: 1, ultima: '2026-10-08', total_gasto: 20000 });
    const porNome = (await amb.api('GET', '/api/hospedes/procurar?q=silva%20jose')).json.hospedes;
    expect(porNome).toHaveLength(1);
    const r = await novaHospedagem({ hospede: { id: busca[0].id }, quartoId: q2, entrada: '2026-10-10', saida: '2026-10-11', jaChegou: false, pagamento: null });
    expect(r.status).toBe(200);
    expect(amb.banco.prepare('SELECT COUNT(*) FROM hospedes').pluck().get()).toBe(1);
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.estadia.status).toBe('confirmada');
    expect(d.visitas).toBe(2);
  });

  it('CPF já cadastrado reaproveita o hóspede mesmo sem escolher na busca', async () => {
    await novaHospedagem();
    await novaHospedagem({ quartoId: q2, hospede: { nome: 'JOSE SILVA', cpfCnpj: '12345678901' } });
    expect(amb.banco.prepare('SELECT COUNT(*) FROM hospedes').pluck().get()).toBe(1);
  });

  it('anti-overbooking: não deixa ocupar quarto ocupado', async () => {
    await novaHospedagem({ saida: '2026-10-11' });
    const r = await novaHospedagem({ hospede: { nome: 'Outro' }, entrada: '2026-10-10', saida: '2026-10-12', jaChegou: false });
    expect(r.status).toBe(409);
    expect(r.json.erro).toContain('10/10/2026');
    const disp = (await amb.api('GET', '/api/disponibilidade?entrada=2026-10-10&saida=2026-10-11')).json.quartos;
    expect(disp.find((q: { id: number }) => q.id === q1)).toMatchObject({ livre: false, ocupadoPor: 'José da Silva' });
    expect(disp.find((q: { id: number }) => q.id === q2)).toMatchObject({ livre: true });
  });

  it('confere capacidade e datas', async () => {
    expect((await novaHospedagem({ quartoId: q2, pessoas: 3 })).status).toBe(400);
    expect((await novaHospedagem({ saida: '2026-10-08' })).status).toBe(400);
    expect((await novaHospedagem({ entrada: '2026-10-01', saida: '2026-10-02' })).status).toBe(400);
  });

  it('pagamento antes da entrada é sinal', async () => {
    const r = await novaHospedagem({ entrada: '2026-10-15', saida: '2026-10-16', jaChegou: false, pagamento: { valor: 6000, forma: 'pix', contaRecebedoraId: 1 } });
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.pagamentos[0].tipo).toBe('sinal');
    expect(d.estadia.status).toBe('confirmada');
  });

  it('desfazer cancela a hospedagem e o pagamento', async () => {
    const r = await novaHospedagem();
    expect((await amb.api('POST', `/api/estadias/${r.json.id}/desfazer`)).status).toBe(200);
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.estadia.status).toBe('cancelada');
    expect(d.pago).toBe(0);
    // Quarto volta a ficar livre
    expect((await novaHospedagem({ hospede: { nome: 'Outro' } })).status).toBe(200);
  });
});

describe('saída e reaproveitamento do quarto (seção 4)', () => {
  it('saiu antes: quarto vai para "limpar", e só depois do "limpo" aceita outro na mesma noite', async () => {
    const r = await novaHospedagem();
    // Outro hóspede não entra: quarto ocupado
    expect((await novaHospedagem({ hospede: { nome: 'Maria' } })).status).toBe(409);
    amb.relogio.agora = new Date('2026-10-09T00:30:00Z'); // 20:30 do dia 08
    expect((await amb.api('POST', `/api/estadias/${r.json.id}/saiu`, {})).status).toBe(200);
    expect(amb.banco.prepare('SELECT estado_limpeza FROM quartos WHERE id = ?').pluck().get(q1)).toBe('limpar');
    const sujo = await novaHospedagem({ hospede: { nome: 'Maria' } });
    expect(sujo.status).toBe(409);
    expect(sujo.json.erro).toContain('limpar');
    await amb.api('POST', `/api/quartos/${q1}/limpo`);
    const nova = await novaHospedagem({ hospede: { nome: 'Maria' } });
    expect(nova.status).toBe(200);
    // Mapa mostra os dois na mesma noite, em ordem
    const mapa = (await amb.api('GET', '/api/mapa?de=2026-10-08&dias=2')).json;
    expect(mapa.estadias.filter((e: { quarto_id: number }) => e.quarto_id === q1).map((e: { nome: string; status: string }) => [e.nome, e.status])).toEqual([
      ['José da Silva', 'finalizada'],
      ['Maria', 'hospedado'],
    ]);
    // Duas diárias na mesma noite; a primeira não foi devolvida
    const noite = amb.banco.prepare(`SELECT COUNT(*) AS n, SUM(valor) AS s FROM estadia_noites WHERE data = '2026-10-08'`).get();
    expect(noite).toEqual({ n: 2, s: 40000 });
  });

  it('saída antecipada de estadia longa pode tirar as noites não usadas', async () => {
    const r = await novaHospedagem({ saida: '2026-10-11', pagamento: null });
    amb.relogio.agora = new Date('2026-10-09T13:00:00Z'); // 09:00 do dia 09: usou só a noite de 08
    const antes = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(antes.noitesNaoUsadas).toEqual(['2026-10-09', '2026-10-10']);
    await amb.api('POST', `/api/estadias/${r.json.id}/saiu`, { tirarNoitesNaoUsadas: true });
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.estadia).toMatchObject({ status: 'finalizada', data_saida: '2026-10-09' });
    expect(d.total).toBe(20000);
  });

  it('chegou, estender, trocar quarto, receber saldo', async () => {
    const r = await novaHospedagem({ jaChegou: false, pagamento: null });
    const id = r.json.id;
    expect((await amb.api('POST', `/api/estadias/${id}/chegou`)).status).toBe(200);
    expect((await amb.api('POST', `/api/estadias/${id}/estender`, { novaSaida: '2026-10-11' })).status).toBe(200);
    expect((await amb.api('POST', `/api/estadias/${id}/trocar-quarto`, { quartoId: q2 })).status).toBe(200);
    expect(amb.banco.prepare('SELECT estado_limpeza FROM quartos WHERE id = ?').pluck().get(q1)).toBe('limpar');
    const rec = await amb.api('POST', `/api/estadias/${id}/receber`, { valor: 60000, forma: 'dinheiro', contaRecebedoraId: 2 });
    expect(rec.status).toBe(200);
    const d = (await amb.api('GET', `/api/estadias/${id}`)).json;
    expect(d).toMatchObject({ total: 60000, pago: 60000, saldo: 0 });
    expect(d.quarto.codigo).toBe('2A');
    // Desfazer o pagamento
    await amb.api('POST', `/api/pagamentos/${rec.json.pagamentoId}/cancelar`, { motivo: 'errado' });
    expect((await amb.api('GET', `/api/estadias/${id}`)).json.saldo).toBe(60000);
  });

  it('estender não passa por cima de outra reserva', async () => {
    const r = await novaHospedagem();
    await novaHospedagem({ hospede: { nome: 'Próximo' }, entrada: '2026-10-09', saida: '2026-10-10', jaChegou: false, pagamento: null });
    const e = await amb.api('POST', `/api/estadias/${r.json.id}/estender`, { novaSaida: '2026-10-10' });
    expect(e.status).toBe(409);
  });

  it('cancelar com devolução e "não veio"', async () => {
    const a = await novaHospedagem({ entrada: '2026-10-12', saida: '2026-10-13', jaChegou: false, pagamento: { valor: 6000, forma: 'pix', contaRecebedoraId: 1 } });
    const c = await amb.api('POST', `/api/estadias/${a.json.id}/cancelar`, {
      motivo: 'desistiu em 2 dias',
      devolucao: { valor: 6000, forma: 'pix', contaRecebedoraId: 1 },
    });
    expect(c.status).toBe(200);
    const d = (await amb.api('GET', `/api/estadias/${a.json.id}`)).json;
    expect(d.estadia.status).toBe('cancelada');
    expect(d.pago).toBe(0);
    const b = await novaHospedagem({ entrada: '2026-10-08', jaChegou: false, pagamento: { valor: 6000, forma: 'pix', contaRecebedoraId: 1 } });
    await amb.api('POST', `/api/estadias/${b.json.id}/cancelar`, { naoVeio: true });
    const db = (await amb.api('GET', `/api/estadias/${b.json.id}`)).json;
    expect(db.estadia.status).toBe('no_show');
    expect(db.pago).toBe(6000); // sinal fica como garantia
  });

  it('editar diária muda todas as noites e grava auditoria', async () => {
    const r = await novaHospedagem({ saida: '2026-10-10' });
    await amb.api('PUT', `/api/estadias/${r.json.id}`, { valorDiaria: 18000, motivoValor: 'cliente fixo' });
    const d = (await amb.api('GET', `/api/estadias/${r.json.id}`)).json;
    expect(d.total).toBe(36000);
    expect(d.estadia.motivo_valor).toBe('cliente fixo');
    const aud = amb.banco.prepare(`SELECT COUNT(*) FROM auditoria WHERE tabela = 'estadias' AND acao = 'editar'`).pluck().get();
    expect(aud).toBe(1);
  });

  it('diária sugerida pela tabela', async () => {
    expect((await amb.api('GET', `/api/diaria-sugerida?quartoId=${q1}&pessoas=3`)).json.valor).toBe(30000);
  });
});
