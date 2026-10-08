// Importação com uma planilha inventada (sem dados reais), cobrindo os casos da seção 8.
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco, type Banco } from '../src/banco/conexao.js';
import { horaPlanilha } from '../src/importacao/planilha.js';
import { importarArquivo } from '../src/importacao/servico.js';
import type { ResumoImportacao } from '../src/importacao/importar.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// [apto, data, cliente, cpf, fone, cidade, uf, pessoas, hora, valor, pago, CDP, HVN, antecipação, obs]
type Linha = [unknown, string, string, string | null, string, string, string, number | null, unknown, number | null, string | null, unknown, unknown, unknown?, unknown?];
const CADASTRO: Linha[] = [
  // Ana: 2 noites seguidas no 1A → uma estadia
  ['1A', '2026-09-01', 'ANA SOUZA', '111 222 333 44', '69 99999 0001', 'CACOAL', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H', 'PRIMEIRA'],
  ['1a ', '2026-09-02', 'ANA SOUZA', '111 222 333 44', '69 99999 0001', 'CACOAL', 'RO', 2, '12;00', 250, 'PAGO', 'C', 'V', 'SEGUNDA'],
  // Bruno: mascarado, mas mesmo nome + telefone de outra linha com CPF → mesmo hóspede
  ['2A', '2026-09-01', 'BRUNO LIMA', '*** 977 432 **', '69 98888 0002', 'JI-PARANÁ', 'RO', 1, '18;00', 150, 'PAGO', 'D', 'N'],
  ['2A', '2026-09-10', 'BRUNO LIMA', '555 666 777 88', '69 98888 0002', 'JI-PARANÁ', 'RO', 1, '1;30', 150, 'PAGO', '20.02', 'PIX'],
  // Duplicidade exata (mesmo quarto, data e cliente)
  ['3A', '2026-09-05', 'CARLA DIAS', '222 333 444 55', '69 97777 0003', 'VILHENA', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  ['3A', '2026-09-05', 'CARLA DIAS', '222 333 444 55', '69 97777 0003', 'VILHENA', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  // Mesma noite, dois clientes (saiu antes e alugou de novo): legítimo, sem pendência
  ['11', '2026-09-07', 'DANIEL ROCHA', '333 444 555 66', '69 96666 0004', 'CACOAL', 'RO', 1, '12;00', 150, 'PAGO', 'P', 'H'],
  ['11', '2026-09-07', 'EDUARDO REIS', '444 555 666 77', '69 95555 0005', 'CACOAL', 'RO', 1, '22;00', 150, 'PAGO', 'D', 'H'],
  // Sobreposição real de 2 noites → pendência
  ['12', '2026-09-08', 'FABIO MELO', '555 000 111 22', '69 94444 0006', 'CACOAL', 'RO', 1, '12;00', 150, 'PAGO', 'P', 'H'],
  ['12', '2026-09-09', 'FABIO MELO', '555 000 111 22', '69 94444 0006', 'CACOAL', 'RO', 1, '12;00', 150, 'PAGO', 'P', 'H'],
  ['12', '2026-09-08', 'GABI NUNES', '666 000 111 22', '69 93333 0007', 'CACOAL', 'RO', 1, '12;00', 150, 'PAGO', 'P', 'H'],
  ['12', '2026-09-09', 'GABI NUNES', '666 000 111 22', '69 93333 0007', 'CACOAL', 'RO', 1, '12;00', 150, 'PAGO', 'P', 'H'],
  // A receber e sem valor
  ['15', '2026-09-20', 'HELIO PAZ', null, '69 92222 0008', 'CACOAL', 'RO', 3, '24;00', 300, 'A REC', null, null],
  ['15', '2026-09-21', 'IARA LUZ', '777 888 999 00', '69 91111 0009', 'CACOAL', 'RO', null, '18;88', null, 'PAGO', 'P', 'H'],
  // Hospedado agora (07 a 09/10) e reserva futura; e um conflito futuro
  ['6A', '2026-10-07', 'JOAO VAZ', '888 999 000 11', '69 90000 0010', 'CACOAL', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  ['6A', '2026-10-08', 'JOAO VAZ', '888 999 000 11', '69 90000 0010', 'CACOAL', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  ['7A', '2026-10-10', 'KAREN LEE', '999 000 111 22', '69 98000 0011', 'CACOAL', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  ['7A', '2026-10-10', 'LUCAS BIA', '000 111 222 33', '69 97000 0012', 'CACOAL', 'RO', 2, '12;00', 200, 'PAGO', 'P', 'H'],
  // Sem quarto; quarto antigo sem uso recente
  [null, '2025-04-26', 'MARIA SEM QUARTO', '123 123 123 12', '69 96000 0013', 'CACOAL', 'RO', 1, '12;00', 100, 'PAGO', 'P', 'H'],
  [16, '2025-03-10', 'NINA VELHA', 'R118887 PASSAPORT', '', 'LIMA', 'PE', 1, 3.21, 120, 'PAGO', 'C', 'H'],
];

// [data, tipo, fornecedor, descrição, qtd, unit, totalI, receitaJ]
const DESPESAS: [string, string, string, string, number | null, number | null, number | null, unknown][] = [
  ['2026-09-02', 'CONTA DE LUZ', 'ENERGISA', 'REF SET', 1, 2100.55, 2100.55, null],
  ['2026-09-05', 'IMOBILIZADO', 'FINAN SICOOB', 'PARCELA', 1, 1369, 1369, 'J.V.M'],
  ['2026-09-06', 'IMOBILIZADO', 'HAVAN', 'TV', 1, 1500, 1500, null],
  ['2026-09-07', 'CONSTRUÇÃO', 'DEPOSITO', 'CIMENTO', 2, 35.5, 71, null],
  ['2026-09-08', 'HOSPEDAGENS', 'HOTEL TROPICAL', 'DIÁRIAS', 1, null, 0, 1600],
  ['2026-09-09', 'CONSTRUÇÃO', 'MÃO DE OBRA', 'PEDREIRO COMBINADO', 1, null, 0, null],
  ['2026-09-10', 'ALIMENTAÇÃO', 'MERCADO', 'COMPRAS', 1, 194.24, 104, null],
  ['2026-09-11', 'PLANO SAUDE', 'UNIMED', 'MENSAL', 1, 300, 300, null],
];

async function planilhaDeTeste(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cad = wb.addWorksheet('CADASTRO GERAL');
  cad.getRow(3).values = [null, 'APTO', 'DATA', 'CLIENTE', 'CPF/CNPJ', 'FONE', 'CID. ORIGEM', null, 'HOSP.', 'HORA', 0];
  CADASTRO.forEach((l, i) => {
    cad.getRow(6 + i).values = [null, l[0], d(l[1]), ...l.slice(2)] as ExcelJS.CellValue[];
  });
  const desp = wb.addWorksheet('DESPESAS 2025');
  DESPESAS.forEach((l, i) => {
    desp.getRow(4 + i).values = [9, d(l[0]), l[1], l[2], null, l[3], l[4], l[5], l[6], l[7]] as ExcelJS.CellValue[];
  });
  const fat = wb.addWorksheet('FATURAMENTO');
  fat.getRow(2).values = [1, d('2024-01-01'), 36400];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('importação (planilha de teste)', () => {
  let banco: Banco;
  let resumo: ResumoImportacao;
  const q = <T = any>(sql: string, ...p: unknown[]) => banco.prepare(sql).get(...p) as T;
  const todas = <T = any>(sql: string, ...p: unknown[]) => banco.prepare(sql).all(...p) as T[];

  beforeAll(async () => {
    banco = abrirBanco(':memory:');
    resumo = (await importarArquivo(banco, await planilhaDeTeste(), 'teste.xlsx', null, new Date('2026-10-08T15:00:00Z')))
      .resumo;
  });

  it('valida totais planilha × sistema', () => {
    for (const v of resumo.validacao) expect(v.sistema, v.item).toBe(v.planilha);
  });

  it('junta noites seguidas do mesmo hóspede no mesmo quarto (e normaliza "1a ")', () => {
    const ana = q(`SELECT e.* FROM estadias e JOIN hospedes h ON h.id = e.hospede_id WHERE h.nome = 'ANA SOUZA'`);
    expect(ana).toMatchObject({ data_entrada: '2026-09-01', data_saida: '2026-09-03', status: 'finalizada', pessoas: 2 });
    expect(todas('SELECT valor FROM estadia_noites WHERE estadia_id = ? ORDER BY data', ana.id)).toEqual([
      { valor: 20000 },
      { valor: 25000 },
    ]);
    const pags = todas(
      `SELECT p.valor, p.forma, c.sigla FROM pagamentos p LEFT JOIN contas_recebedoras c ON c.id = p.conta_recebedora_id
       WHERE estadia_id = ? ORDER BY p.data`,
      ana.id,
    );
    expect(pags).toEqual([
      { valor: 20000, forma: 'pix', sigla: 'H' },
      { valor: 25000, forma: 'cartao', sigla: 'V' },
    ]);
    expect(ana.obs).toContain('antecipação: PRIMEIRA');
  });

  it('hóspede único por CPF; sem CPF, por nome + telefone', () => {
    expect(q(`SELECT COUNT(*) AS n FROM hospedes WHERE nome = 'BRUNO LIMA'`).n).toBe(1);
    expect(q(`SELECT cpf_cnpj FROM hospedes WHERE nome = 'BRUNO LIMA'`).cpf_cnpj).toBe('55566677788');
    expect(q(`SELECT obs FROM hospedes WHERE nome = 'NINA VELHA'`).obs).toContain('R118887 PASSAPORT');
  });

  it('forma e conta fora do padrão viram "não informado" e vão para conferência', () => {
    const p = q(`SELECT forma, conta_recebedora_id, obs FROM pagamentos WHERE data = '2026-09-10'`);
    expect(p.forma).toBe('nao_informado');
    expect(p.conta_recebedora_id).toBeNull();
    expect(p.obs).toContain('20.02');
    expect(p.obs).toContain('PIX');
    expect(resumo.pendencias.forma_nao_informada).toBe(2);
    expect(resumo.pendencias.conta_nao_informada).toBe(2);
  });

  it('duplicidade vira outra estadia + pendência (nada some)', () => {
    expect(resumo.pendencias.duplicidade).toBe(1);
    expect(q(`SELECT COUNT(*) AS n FROM estadia_noites WHERE data = '2026-09-05'`).n).toBe(2);
  });

  it('mesma noite com 2 clientes é aceita; sobreposição de 2+ noites vira pendência', () => {
    expect(resumo.estadias.noitesComDoisClientes).toBe(4); // 11, 12 (2 noites), 7A; a duplicidade é o mesmo cliente
    expect(resumo.pendencias.sobreposicao).toBe(1);
    const ordem = todas(
      `SELECT h.nome FROM estadias e JOIN hospedes h ON h.id = e.hospede_id JOIN quartos q ON q.id = e.quarto_id
       WHERE q.codigo = '11' ORDER BY e.id`,
    );
    expect(ordem.map((o) => o.nome)).toEqual(['DANIEL ROCHA', 'EDUARDO REIS']);
  });

  it('a receber e sem valor ficam com saldo e na conferência', () => {
    expect(resumo.pendencias.a_receber).toBe(1);
    expect(resumo.pendencias.sem_valor).toBe(1);
    expect(resumo.pendencias.sem_pessoas).toBe(1);
    const helio = q(
      `SELECT v.total, v.pago FROM estadias e JOIN hospedes h ON h.id = e.hospede_id
       JOIN estadias_valores v ON v.estadia_id = e.id WHERE h.nome = 'HELIO PAZ'`,
    );
    expect(helio).toEqual({ total: 30000, pago: 0 });
    expect(q(`SELECT hora_chegada_prevista AS h FROM estadias WHERE data_entrada = '2026-09-20'`).h).toBe('00:00');
  });

  it('status pelo dia de hoje; conflito futuro vira cancelada + pendência', () => {
    expect(q(`SELECT status FROM estadias WHERE data_entrada = '2026-10-07'`).status).toBe('hospedado');
    const futuras = todas(`SELECT status FROM estadias WHERE data_entrada = '2026-10-10' ORDER BY id`);
    expect(futuras.map((f) => f.status)).toEqual(['confirmada', 'cancelada']);
    expect(resumo.pendencias.conflito_reserva).toBe(1);
  });

  it('quartos: cria todos, ativo só se usado nos últimos 90 dias', () => {
    const q16 = q(`SELECT ativo FROM quartos WHERE codigo = '16'`);
    expect(q16.ativo).toBe(0);
    expect(q(`SELECT ativo FROM quartos WHERE codigo = '6A'`).ativo).toBe(1);
    expect(q(`SELECT ativo FROM quartos WHERE codigo = 'SEM QUARTO'`).ativo).toBe(0);
    expect(resumo.pendencias.sem_quarto).toBe(1);
  });

  it('despesas: categorias e grupos da seção 8.2', () => {
    const grupo = (fornecedor: string) =>
      q(
        `SELECT c.nome, c.grupo FROM despesas d JOIN categorias c ON c.id = d.categoria_id WHERE d.fornecedor = ?`,
        fornecedor,
      );
    expect(grupo('FINAN SICOOB')).toEqual({ nome: 'Financiamento Sicoob', grupo: 'financiamento' });
    expect(grupo('HAVAN')).toEqual({ nome: 'Equipamentos e móveis', grupo: 'investimento' });
    expect(grupo('DEPOSITO')).toEqual({ nome: 'Construção', grupo: 'obra' });
    expect(grupo('ENERGISA')).toEqual({ nome: 'Conta de luz', grupo: 'operacao' });
    expect(grupo('UNIMED')).toEqual({ nome: 'Plano saude', grupo: 'operacao' });
    expect(q(`SELECT obs FROM despesas WHERE fornecedor = 'FINAN SICOOB'`).obs).toContain('J.V.M');
    expect(q(`SELECT valor FROM despesas WHERE fornecedor = 'DEPOSITO'`).valor).toBe(7100);
  });

  it('receita da aba DESPESAS não entra como receita; linhas problemáticas vão para conferência', () => {
    expect(q('SELECT COUNT(*) AS n, SUM(valor) AS s FROM receitas_planilha_antiga')).toEqual({ n: 1, s: 160000 });
    expect(resumo.pendencias.despesa_sem_valor).toBe(1);
    expect(resumo.pendencias.total_diferente).toBe(1);
    expect(q('SELECT COUNT(*) AS n FROM despesas').n).toBe(6);
  });

  it('importa o histórico de faturamento', () => {
    expect(q('SELECT mes, valor FROM faturamento_historico')).toEqual({ mes: '2024-01', valor: 3640000 });
  });
});

describe('hora da planilha', () => {
  it.each([
    ['12;00', '12:00'],
    ['1;30', '01:30'],
    ['24;00', '00:00'],
    ['22;000', '22:00'],
    ['22.30', '22:30'],
    ['18;88', null],
    [3.21, '03:21'],
    ['', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(horaPlanilha(entrada as string)).toBe(esperado);
  });
});
