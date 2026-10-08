import { describe, expect, it } from 'vitest';
import { criarAmbiente, type Ambiente } from './ajuda.js';

const cat = (amb: Ambiente, nome: string) => amb.banco.prepare('SELECT id FROM categorias WHERE nome = ?').pluck().get(nome) as number;

describe('caixa', () => {
  it('entradas vêm dos pagamentos; saídas por grupo; os 3 resultados', async () => {
    const amb = await criarAmbiente(); // 08/10/2026
    const q = (await amb.api('POST', '/api/quartos', { codigo: '1A', capacidade: 2, ativo: true, mostrar_no_site: false })).json.quarto.id;
    const hosp = await amb.api('POST', '/api/estadias', {
      hospede: { nome: 'Ana' }, quartoId: q, entrada: '2026-10-08', saida: '2026-10-10', pessoas: 2, valorDiaria: 20000, jaChegou: true,
      pagamento: { valor: 30000, forma: 'pix', contaRecebedoraId: 1 },
    });
    await amb.api('POST', `/api/estadias/${hosp.json.id}/receber`, { valor: 10000, forma: 'dinheiro', contaRecebedoraId: 2 });
    const lanca = (categoria: string, valor: number) =>
      amb.api('POST', '/api/despesas', { data: '2026-10-08', categoriaId: cat(amb, categoria), valor, forma: 'pix', fornecedor: 'X' });
    await lanca('Café da manhã', 5000);
    await lanca('Construção', 8000);
    await lanca('Financiamento Sicoob', 6000);
    await lanca('Compras da casa', 3000);
    await lanca('Pró-labore', 10000);
    const desfeita = await lanca('Lavanderia', 99900);
    await amb.api('POST', `/api/despesas/${desfeita.json.id}/cancelar`);

    const c = (await amb.api('GET', '/api/caixa?de=2026-10-01&ate=2026-11-01')).json;
    expect(c.entradas).toBe(40000);
    expect(c.porForma).toEqual([
      { forma: 'pix', total: 30000 },
      { forma: 'dinheiro', total: 10000 },
    ]);
    expect(c.porGrupo).toMatchObject({ operacao: 5000, obra: 8000, financiamento: 6000, casa_pessoal: 3000, retirada: 10000 });
    expect(c.resultados).toEqual({ resultadoHotel: 35000, depoisObra: 21000, sobrou: 8000 });
    expect(c.ocupacao).toMatchObject({ diarias: 2, quartosNoite: 2, valorDiarias: 40000 });
  });

  it('diárias vendidas podem passar dos quartos-noite (quarto alugado duas vezes na mesma noite)', async () => {
    const amb = await criarAmbiente();
    const q = (await amb.api('POST', '/api/quartos', { codigo: '1A', capacidade: 2, ativo: true, mostrar_no_site: false })).json.quarto.id;
    const base = { quartoId: q, entrada: '2026-10-08', saida: '2026-10-09', pessoas: 1, valorDiaria: 15000, jaChegou: true };
    const a = await amb.api('POST', '/api/estadias', { ...base, hospede: { nome: 'A' } });
    amb.relogio.agora = new Date('2026-10-09T00:00:00Z');
    await amb.api('POST', `/api/estadias/${a.json.id}/saiu`, {});
    await amb.api('POST', `/api/quartos/${q}/limpo`);
    await amb.api('POST', '/api/estadias', { ...base, hospede: { nome: 'B' } });
    const c = (await amb.api('GET', '/api/caixa?de=2026-10-08&ate=2026-10-09')).json;
    expect(c.ocupacao).toMatchObject({ diarias: 2, quartosNoite: 1, valorDiarias: 30000 });
  });

  it('compara com o mesmo período do ano anterior', async () => {
    const amb = await criarAmbiente();
    amb.banco.exec(`INSERT INTO faturamento_historico (mes, valor) VALUES ('2024-10', 2908000)`);
    const c = (await amb.api('GET', '/api/caixa?de=2025-10-01&ate=2025-11-01')).json;
    expect(c.anterior).toMatchObject({ de: '2024-10-01', ate: '2024-11-01', faturamentoPlanilhaAntiga: 2908000 });
  });

  it('fornecedor já usado sugere a categoria', async () => {
    const amb = await criarAmbiente();
    await amb.api('POST', '/api/despesas', { data: '2026-10-08', categoriaId: cat(amb, 'Lavanderia'), valor: 1000, forma: 'pix', fornecedor: 'Dona Maria' });
    const f = (await amb.api('GET', '/api/fornecedores?q=maria')).json.fornecedores;
    expect(f[0]).toMatchObject({ fornecedor: 'Dona Maria', categoria: 'Lavanderia' });
    expect((await amb.api('POST', '/api/despesas', { data: '2026-12-01', categoriaId: 1, valor: 1, forma: 'pix' })).status).toBe(400);
  });
});

describe('contas a pagar', () => {
  it('gera as recorrentes; se o vencimento deste mês já passou, começa no próximo', async () => {
    const amb = await criarAmbiente(); // 08/10/2026
    const out = (await amb.api('GET', '/api/contas?mes=2026-10')).json.contas;
    const nomes = out.map((c: { descricao: string }) => c.descricao);
    expect(nomes).toContain('Energisa (luz)'); // dia 21
    expect(nomes).toContain('Financiamento Sicoob, parcela 2'); // dia 10
    expect(nomes).not.toContain('Internet Duxnet'); // dia 5 já passou
    const nov = (await amb.api('GET', '/api/contas?mes=2026-11')).json.contas.map((c: { descricao: string }) => c.descricao);
    expect(nov).toContain('Internet Duxnet');
    // Rodar de novo não duplica
    await amb.api('GET', '/api/contas?mes=2026-10');
    expect(amb.banco.prepare(`SELECT COUNT(*) FROM contas_a_pagar WHERE descricao = 'Energisa (luz)'`).pluck().get()).toBe(2);
  });

  it('Paguei gera a despesa, desconta parcela; desfazer volta tudo', async () => {
    const amb = await criarAmbiente();
    const contas = (await amb.api('GET', '/api/contas?mes=2026-10')).json.contas;
    const sicoob = contas.find((c: { descricao: string }) => c.descricao === 'Financiamento Sicoob, parcela 2');
    expect(sicoob).toMatchObject({ vencimento: '2026-10-10', estado: 'vence_breve', parcelas_restantes: 9 });
    const p = await amb.api('POST', `/api/contas/${sicoob.id}/paguei`, { valor: 241500, data: '2026-10-08', forma: 'boleto' });
    expect(p.status).toBe(200);
    const desp = amb.banco.prepare('SELECT d.valor, c.grupo FROM despesas d JOIN categorias c ON c.id = d.categoria_id WHERE d.id = ?').get(p.json.despesaId);
    expect(desp).toEqual({ valor: 241500, grupo: 'financiamento' });
    expect(amb.banco.prepare(`SELECT parcelas_restantes FROM contas_recorrentes WHERE nome = 'Financiamento Sicoob, parcela 2'`).pluck().get()).toBe(8);
    const rec = (await amb.api('GET', '/api/contas-recorrentes')).json.recorrentes.find((r: { nome: string }) => r.nome.endsWith('parcela 2'));
    expect(rec.quitacao).toBe('2027-06-10'); // outubro paga; faltam 8: novembro a junho
    expect((await amb.api('POST', `/api/contas/${sicoob.id}/paguei`, { valor: 1, data: '2026-10-08', forma: 'pix' })).status).toBe(400);
    await amb.api('POST', `/api/contas/${sicoob.id}/desfazer`);
    expect(amb.banco.prepare(`SELECT parcelas_restantes FROM contas_recorrentes WHERE nome = 'Financiamento Sicoob, parcela 2'`).pluck().get()).toBe(9);
    expect(amb.banco.prepare('SELECT cancelado_em IS NOT NULL FROM despesas WHERE id = ?').pluck().get(p.json.despesaId)).toBe(1);
  });

  it('atrasada continua aparecendo nos meses seguintes até pagar', async () => {
    const amb = await criarAmbiente();
    await amb.api('POST', '/api/contas', { descricao: 'IPTU', categoriaId: cat(amb, 'Impostos'), vencimento: '2026-09-15', valorPrevisto: 50000 });
    const out = (await amb.api('GET', '/api/contas?mes=2026-10')).json.contas;
    expect(out.find((c: { descricao: string }) => c.descricao === 'IPTU').estado).toBe('atrasada');
    const hoje = (await amb.api('GET', '/api/hoje')).json;
    expect(hoje.alertas.some((a: { tipo: string; texto: string }) => a.tipo === 'conta_atrasada' && a.texto.includes('IPTU'))).toBe(true);
  });
});

describe('funcionárias e vales', () => {
  it('vale vira despesa na hora; salário a pagar = salário − vales do período', async () => {
    const amb = await criarAmbiente(); // 08/10
    const f = await amb.api('POST', '/api/funcionarias', { nome: 'Daiane', salario: 180000, diaPagamento: 10 });
    await amb.api('POST', '/api/vales', { funcionariaId: f.json.id, data: '2026-10-02', valor: 20000, forma: 'dinheiro' });
    const v2 = await amb.api('POST', '/api/vales', { funcionariaId: f.json.id, data: '2026-10-05', valor: 10000, forma: 'pix' });
    await amb.api('POST', '/api/vales', { funcionariaId: f.json.id, data: '2026-09-05', valor: 5000, forma: 'pix' }); // período anterior
    const r = (await amb.api('GET', '/api/funcionarias')).json.funcionarias[0];
    expect(r).toMatchObject({ proximoPagamento: '2026-10-10', totalVales: 30000, saldo: 150000 });
    const contas = (await amb.api('GET', '/api/contas?mes=2026-10')).json.contas;
    const sal = contas.find((c: { descricao: string }) => c.descricao === 'Salário Daiane');
    expect(sal.aPagar).toBe(150000);
    await amb.api('POST', `/api/contas/${sal.id}/paguei`, { valor: 150000, data: '2026-10-10', forma: 'pix' });
    const total = amb.banco
      .prepare(`SELECT SUM(valor) FROM despesas WHERE fornecedor = 'Daiane' AND cancelado_em IS NULL AND data BETWEEN '2026-09-11' AND '2026-10-10'`)
      .pluck()
      .get();
    expect(total).toBe(180000);
    // Desfazer um vale desfaz a despesa
    await amb.api('POST', `/api/vales/${v2.json.id}/cancelar`);
    expect((await amb.api('GET', '/api/funcionarias')).json.funcionarias[0].totalVales).toBe(20000);
  });
});
