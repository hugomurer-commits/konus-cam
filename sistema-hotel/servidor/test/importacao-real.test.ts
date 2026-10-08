// Seção 8.3: validação obrigatória com a planilha real.
// A planilha tem dados pessoais e fica fora do git (dados-originais/). Sem ela, este teste
// aparece como PULADO (nunca como aprovado).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco, type Banco } from '../src/banco/conexao.js';
import { importarArquivo } from '../src/importacao/servico.js';
import type { ResumoImportacao } from '../src/importacao/importar.js';

const ARQUIVO = join(__dirname, '..', '..', 'dados-originais', 'LANÇAMENTOS ATUAIS 24.09.2026.xlsx');
const temPlanilha = existsSync(ARQUIVO);
if (!temPlanilha) {
  console.warn(`\n⚠️  Teste da seção 8.3 PULADO: planilha não encontrada em ${ARQUIVO}\n`);
}

describe.skipIf(!temPlanilha)('importação da planilha real (seção 8.3)', () => {
  let banco: Banco;
  let resumo: ResumoImportacao;
  const linha = (item: string) => resumo.validacao.find((v) => v.item === item)!;
  const q = <T = number>(sql: string, ...p: unknown[]) => banco.prepare(sql).pluck().get(...p) as T;

  beforeAll(async () => {
    banco = abrirBanco(':memory:');
    // "Hoje" fixo: dia em que a especificação foi escrita
    const r = await importarArquivo(
      banco,
      readFileSync(ARQUIVO),
      'LANÇAMENTOS ATUAIS 24.09.2026.xlsx',
      null,
      new Date('2026-10-08T15:00:00Z'),
    );
    resumo = r.resumo;
  }, 60_000);

  it('diárias com data: 3.382, somando R$ 639.762,00', () => {
    expect(linha('Diárias com data no cadastro')).toMatchObject({ planilha: 3382, sistema: 3382 });
    expect(linha('Soma das diárias')).toMatchObject({ planilha: 63976200, sistema: 63976200 });
    expect(q('SELECT COUNT(*) FROM estadia_noites')).toBe(3382);
    expect(q('SELECT SUM(valor) FROM estadia_noites')).toBe(63976200);
  });

  it('2025: 2.140 diárias / R$ 382.675,00', () => {
    expect(q(`SELECT COUNT(*) FROM estadia_noites WHERE data LIKE '2025-%'`)).toBe(2140);
    expect(q(`SELECT SUM(valor) FROM estadia_noites WHERE data LIKE '2025-%'`)).toBe(38267500);
  });

  it('2026: 1.242 diárias / R$ 257.087,00', () => {
    expect(q(`SELECT COUNT(*) FROM estadia_noites WHERE data LIKE '2026-%'`)).toBe(1242);
    expect(q(`SELECT SUM(valor) FROM estadia_noites WHERE data LIKE '2026-%'`)).toBe(25708700);
  });

  it('set/2026: 144 diárias / R$ 32.500,00', () => {
    expect(q(`SELECT COUNT(*) FROM estadia_noites WHERE data LIKE '2026-09-%'`)).toBe(144);
    expect(q(`SELECT SUM(valor) FROM estadia_noites WHERE data LIKE '2026-09-%'`)).toBe(3250000);
  });

  it('despesas: 2.516 linhas, soma G×H R$ 650.974,79', () => {
    expect(linha('Linhas de despesa (com data)')).toMatchObject({ planilha: 2516, sistema: 2516 });
    expect(q('SELECT SUM(valor) FROM despesas')).toBe(65097479);
    // As 2.516 linhas = 1.878 despesas + 627 receitas antigas (2 são as duas coisas) + 13 sem valor
    expect(q('SELECT COUNT(*) FROM despesas')).toBe(1878);
    expect(q('SELECT COUNT(*) FROM receitas_planilha_antiga')).toBe(627);
    expect(q('SELECT SUM(valor) FROM receitas_planilha_antiga')).toBe(65204400);
    expect(resumo.pendencias.despesa_sem_valor).toBe(13);
    expect(resumo.pendencias.despesa_e_receita).toBe(2);
  });

  it('mês a mês, planilha e sistema batem', () => {
    const diferentes = resumo.porMes.filter(
      (m) => m.diariasPlanilha !== m.diariasSistema || m.somaPlanilha !== m.somaSistema,
    );
    expect(diferentes).toEqual([]);
    const despDif = resumo.despesasPorMes.filter((m) => m.somaPlanilha !== m.somaSistema);
    expect(despDif).toEqual([]);
  });

  it('a diferença entre o total da coluna I e G×H está toda explicada', () => {
    // Topo da planilha (coluna I) mostra R$ 650.914,55; G×H dá R$ 650.974,79. Diferença: 3 linhas.
    expect(resumo.totaisNoTopoDaPlanilha.despesasColunaI).toBe(65091455);
    expect(resumo.totaisNoTopoDaPlanilha.cadastroValor).toBe(63976200);
    expect(resumo.pendencias.total_diferente).toBe(3);
    const explicada = (
      banco
        .prepare(`SELECT dados FROM importacao_pendencias WHERE tipo = 'total_diferente'`)
        .pluck()
        .all() as string[]
    )
      .map((d) => JSON.parse(d))
      .reduce((s, d) => s + d.gxh - (d.colunaI ?? 0), 0);
    expect(65091455 + explicada).toBe(65097479);
  });

  it('sinaliza os problemas da seção 8.1 sem apagar nada', () => {
    expect(resumo.pendencias.duplicidade).toBe(15);
    expect(resumo.estadias.noitesComDoisClientes).toBe(45);
    // 245 linhas com PIX/D/J/C digitados por engano + 48 vazias
    expect(resumo.pendencias.conta_nao_informada).toBe(293);
    expect(resumo.pendencias.sem_valor).toBe(7);
    expect(resumo.pendencias.sem_quarto).toBe(2);
    expect(resumo.pendencias.quarto_suspeito).toBe(2); // "1" e "5"
  });

  it('cria quartos, deixando ativos só os usados nos últimos 90 dias', () => {
    expect(resumo.estadias.quartos).toBe(24); // 23 códigos + "Sem quarto"
    expect(resumo.estadias.quartosAtivos).toEqual(['1A', '2A', '3A', '5A', '6A', '7A', '11', '12', '14', '15']);
  });

  it('hóspedes únicos por CPF ou nome + telefone (~1.527 na especificação)', () => {
    expect(resumo.estadias.hospedes).toBeGreaterThan(1450);
    expect(resumo.estadias.hospedes).toBeLessThan(1600);
    expect(q('SELECT COUNT(*) FROM hospedes WHERE cpf_cnpj IS NOT NULL')).toBe(
      q('SELECT COUNT(DISTINCT cpf_cnpj) FROM hospedes'),
    );
  });

  it('estadias de hoje e futuras ficam ativas; passadas, finalizadas', () => {
    expect(resumo.estadias.porStatus.hospedado).toBe(1); // 6A, 07 a 09/10
    expect(resumo.estadias.porStatus.confirmada).toBe(2); // 2A e 6A em 10/10
    expect(q(`SELECT COUNT(*) FROM estadias WHERE status = 'cancelada'`)).toBe(0);
  });

  it('receita nunca vem da aba DESPESAS: caixa = pagamentos do cadastro', () => {
    const pago = q('SELECT SUM(valor_liquido) FROM pagamentos_validos');
    const aReceber = q(
      `SELECT IFNULL(SUM(n.valor), 0) FROM estadia_noites n WHERE NOT EXISTS
         (SELECT 1 FROM pagamentos p WHERE p.linha_planilha = n.linha_planilha)`,
    );
    expect(pago + aReceber).toBe(63976200);
  });

  it('não deixa importar duas vezes', async () => {
    await expect(
      importarArquivo(banco, readFileSync(ARQUIVO), 'x.xlsx', null, new Date('2026-10-08T15:00:00Z')),
    ).rejects.toThrow(/sistema vazio/);
  });
});
