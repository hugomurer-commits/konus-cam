const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function emReais(centavos: number | null | undefined): string {
  return reais.format((centavos ?? 0) / 100);
}

/** "200", "200,50", "1.234,56", "R$ 80" → centavos. Devolve null se não der para entender. */
export function lerReais(texto: string): number | null {
  let t = texto.replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Number((n * 100).toFixed(6)));
}

/** Centavos → texto para editar ("200,50"; "200" quando inteiro). */
export function reaisParaTexto(centavos: number | null | undefined): string {
  if (centavos == null) return '';
  return centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2).replace('.', ',');
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'AAAA-MM-DD' → 'dd/mm/aaaa' */
export function data(d: string | null | undefined): string {
  if (!d) return '';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** 'AAAA-MM-DD' → 'dd/mm' */
export function dataCurta(d: string | null | undefined): string {
  if (!d) return '';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

export function diaDaSemana(d: string, curto = false): string {
  const i = new Date(`${d}T12:00:00Z`).getUTCDay();
  return curto ? DIAS_CURTOS[i] : DIAS[i];
}

export function nomeMes(mes: string): string {
  // 'AAAA-MM' → 'outubro de 2026'
  return `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
}

/** Instante ISO → 'dd/mm hh:mm' no fuso do hotel */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Porto_Velho',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function hora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Porto_Velho',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function somarDias(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Porto_Velho' }).format(new Date());
}

export function noites(n: number): string {
  return n === 1 ? '1 noite' : `${n} noites`;
}

export function telefone(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? '';
}

export function documento(d: string | null | undefined): string {
  if (!d) return '';
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

export const FORMAS: Record<string, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  nao_informado: 'Não informado',
};

export const GRUPOS: Record<string, string> = {
  operacao: 'Operação',
  obra: 'Obra',
  financiamento: 'Financiamento',
  investimento: 'Investimento',
  casa_pessoal: 'Casa / pessoal',
  retirada: 'Retiradas',
};

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "HAZAEL FRANCISCO DOS SANTOS" → "Hazael Francisco dos Santos" (só para mostrar; o cadastro fica como foi digitado). */
export function nomeProprio(nome: string | null | undefined): string {
  if (!nome) return '';
  if (nome !== nome.toUpperCase()) return nome; // já tem maiúsculas e minúsculas: respeita
  return nome
    .toLowerCase()
    .split(/(\s+)/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}
