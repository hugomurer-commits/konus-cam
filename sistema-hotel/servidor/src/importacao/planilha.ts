import ExcelJS from 'exceljs';
import { reaisParaCentavos } from '../dominio/dinheiro.js';
import { soDigitos } from '../dominio/texto.js';

// Leitura "crua" da planilha antiga: só converte tipos, sem decidir nada de negócio.
// As regras (agrupamento, pendências) ficam em importar.ts.

type Valor = string | number | Date | boolean | null;

/** Valor de uma célula do exceljs, resolvendo fórmula, texto rico, link e erro. */
export function valorCelula(v: unknown): Valor {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Valor;
  const o = v as Record<string, unknown>;
  if ('error' in o) return null;
  if ('result' in o) return valorCelula(o.result);
  if ('formula' in o || 'sharedFormula' in o) return null;
  if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
  if ('text' in o) return String(o.text);
  return null;
}

export function texto(v: Valor): string {
  if (v === null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Data de célula do Excel (vem como Date em UTC meia-noite) → 'AAAA-MM-DD'. */
export function dataCelula(v: Valor): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;
}

export function numero(v: Valor): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\s*-?\d+([.,]\d+)?\s*$/.test(v)) return Number(v.replace(',', '.'));
  return null;
}

/** "12;00" → "12:00", "1;30" → "01:30", "24;00" → "00:00", "22;000" → "22:00". Inválida → null. */
export function horaPlanilha(v: Valor): string | null {
  let h: number;
  let m: number;
  if (typeof v === 'number') {
    // 3.21 digitado como número = 3h21
    h = Math.floor(v);
    m = Math.round((v - h) * 100);
  } else {
    const r = /^(\d{1,2})\s*[;:.,]\s*(\d{1,3})$/.exec(texto(v));
    if (!r) return null;
    h = Number(r[1]);
    m = Number(r[2].slice(0, 2));
  }
  if (h === 24 && m === 0) h = 0;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface LinhaCadastro {
  linha: number;
  apto: string; // já normalizado ("2A ", "1a" → "2A", "1A")
  data: string;
  cliente: string;
  documentoBruto: string;
  /** CPF (11) ou CNPJ (14) só com dígitos; null se vazio, mascarado ou incompleto */
  documento: string | null;
  documentoProblema: 'mascarado' | 'invalido' | null;
  telefone: string;
  cidade: string;
  uf: string;
  pessoas: number | null;
  hora: string | null;
  horaBruta: string;
  valor: number | null; // centavos
  pagoBruto: string; // 'PAGO', 'A REC', ''
  formaBruta: string;
  contaBruta: string;
  antecipacao: string;
  obs: string;
}

export interface LinhaDespesa {
  linha: number;
  data: string;
  tipo: string; // categoria como digitada
  fornecedor: string;
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  /** G×H em centavos (0 se faltar algum dos dois) */
  valor: number;
  /** Coluna I como estava na planilha (às vezes digitada à mão) */
  totalPlanilha: number | null;
  /** Coluna J numérica (receita) em centavos, ou null */
  receita: number | null;
  /** Coluna J quando é texto (ex.: "J.V.M", "NEREIDE") */
  colunaJTexto: string;
  colunaK: string;
}

export interface Planilha {
  cadastro: LinhaCadastro[];
  despesas: LinhaDespesa[];
  faturamento: { mes: string; valor: number }[];
  /** Totais que a própria planilha mostra no topo (fórmulas SUBTOTAL) */
  totaisDaPlanilha: { cadastroValor: number | null; despesasColunaI: number | null; receitasColunaJ: number | null };
}

function celulas(ws: ExcelJS.Worksheet, n: number): Valor[] {
  const vals = ws.getRow(n).values as unknown[];
  // exceljs devolve índice 1 = coluna A
  return Array.from({ length: 28 }, (_, i) => valorCelula(vals[i + 1]));
}

const ABA_CADASTRO = 'CADASTRO GERAL';
const ABA_DESPESAS = 'DESPESAS 2025';
const ABA_FATURAMENTO = 'FATURAMENTO';

export async function lerPlanilha(arquivo: Buffer | ArrayBuffer): Promise<Planilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as ArrayBuffer);
  const cad = wb.getWorksheet(ABA_CADASTRO);
  const desp = wb.getWorksheet(ABA_DESPESAS);
  if (!cad || !desp) {
    throw new Error(`A planilha precisa ter as abas "${ABA_CADASTRO}" e "${ABA_DESPESAS}".`);
  }

  const cadastro: LinhaCadastro[] = [];
  for (let n = 6; n <= cad.rowCount; n++) {
    const c = celulas(cad, n);
    const data = dataCelula(c[2]);
    if (!data) continue;
    const docBruto = texto(c[4]);
    const docDigitos = soDigitos(docBruto);
    let documento: string | null = null;
    let documentoProblema: LinhaCadastro['documentoProblema'] = null;
    if (docBruto.includes('*')) documentoProblema = 'mascarado';
    else if (docDigitos.length === 11 || docDigitos.length === 14) documento = docDigitos;
    else if (docBruto) documentoProblema = 'invalido';
    const valor = numero(c[10]);
    cadastro.push({
      linha: n,
      apto: texto(c[1]).toUpperCase(),
      data,
      cliente: texto(c[3]).replace(/\s+/g, ' '),
      documentoBruto: docBruto,
      documento,
      documentoProblema,
      telefone: soDigitos(texto(c[5])),
      cidade: texto(c[6]),
      uf: texto(c[7]).toUpperCase(),
      pessoas: numero(c[8]),
      hora: horaPlanilha(c[9]),
      horaBruta: texto(c[9]),
      valor: valor === null ? null : reaisParaCentavos(valor),
      pagoBruto: texto(c[11]).toUpperCase(),
      formaBruta: texto(c[12]),
      contaBruta: texto(c[13]),
      antecipacao: texto(c[14]),
      obs: texto(c[15]),
    });
  }

  const despesas: LinhaDespesa[] = [];
  for (let n = 4; n <= desp.rowCount; n++) {
    const c = celulas(desp, n);
    const data = dataCelula(c[1]);
    if (!data) continue;
    const qtd = numero(c[6]);
    const unit = numero(c[7]);
    const j = c[9];
    const receita = typeof j === 'number' && j !== 0 ? reaisParaCentavos(j) : null;
    const totalI = numero(c[8]);
    despesas.push({
      linha: n,
      data,
      tipo: texto(c[2]).replace(/\s+/g, ' '),
      fornecedor: texto(c[3]).replace(/\s+/g, ' '),
      descricao: texto(c[5]).replace(/\s+/g, ' '),
      quantidade: qtd,
      valorUnitario: unit,
      valor: qtd !== null && unit !== null ? reaisParaCentavos(qtd * unit) : 0,
      totalPlanilha: totalI === null ? null : reaisParaCentavos(totalI),
      receita,
      colunaJTexto: typeof j === 'string' ? j.trim() : '',
      colunaK: texto(c[10]),
    });
  }

  const faturamento: Planilha['faturamento'] = [];
  const fat = wb.getWorksheet(ABA_FATURAMENTO);
  if (fat) {
    for (let n = 2; n <= fat.rowCount; n++) {
      const c = celulas(fat, n);
      const d = dataCelula(c[1]);
      const v = numero(c[2]);
      if (d && v !== null) faturamento.push({ mes: d.slice(0, 7), valor: reaisParaCentavos(v) });
    }
  }

  const k3 = numero(celulas(cad, 3)[10]);
  const topoDesp = celulas(desp, 2);
  return {
    cadastro,
    despesas,
    faturamento,
    totaisDaPlanilha: {
      cadastroValor: k3 === null ? null : reaisParaCentavos(k3),
      despesasColunaI: numero(topoDesp[8]) === null ? null : reaisParaCentavos(numero(topoDesp[8])!),
      receitasColunaJ: numero(topoDesp[9]) === null ? null : reaisParaCentavos(numero(topoDesp[9])!),
    },
  };
}
