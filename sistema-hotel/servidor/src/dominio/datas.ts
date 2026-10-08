// Datas de negócio ('AAAA-MM-DD') sempre no fuso do hotel. Rondônia não tem horário de verão,
// mas usamos o Intl com o fuso de verdade para não depender disso.
export const FUSO = 'America/Porto_Velho';

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partesLocais(instante: Date) {
  const p = Object.fromEntries(partes.formatToParts(instante).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

/** Data local (fuso do hotel) de um instante. */
export function dataLocal(instante: Date): string {
  return partesLocais(instante).data;
}

/** "HH:MM" local de um instante. */
export function horaLocal(instante: Date): string {
  const { hora, minuto } = partesLocais(instante);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

export function minutosDoDia(instante: Date): number {
  const { hora, minuto } = partesLocais(instante);
  return hora * 60 + minuto;
}

export function horaParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(d: string): boolean {
  if (!RE_DATA.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

export function somarDias(d: string, dias: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round(
    (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000,
  );
}

/** Noites de uma estadia: da entrada (inclusiva) até a saída (exclusiva). */
export function noitesEntre(entrada: string, saida: string): string[] {
  const n = diasEntre(entrada, saida);
  return Array.from({ length: Math.max(0, n) }, (_, i) => somarDias(entrada, i));
}

export function inicioDoMes(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function somarMeses(mes: string, n: number): string {
  // mes: 'AAAA-MM'
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Dia do mês ajustado para meses curtos (dia 31 em fevereiro vira 28/29). */
export function dataNoMes(mes: string, dia: number): string {
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, '0')}`;
}

/** Segunda-feira da semana de uma data. */
export function inicioDaSemana(d: string): string {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(d, dow === 0 ? -6 : 1 - dow);
}

export function formatarData(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
