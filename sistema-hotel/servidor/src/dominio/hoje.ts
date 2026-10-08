import type { Banco } from '../banco/conexao.js';
import { dataLocal, diasEntre, formatarData, horaParaMinutos, minutosDoDia } from './datas.js';
import { formatarReais } from './dinheiro.js';

// Tela "Hoje" (seção 5.1) e alertas (seção 7).

export type Cor = 'vermelho' | 'laranja' | 'amarelo';

export interface Alerta {
  tipo: string;
  cor: Cor;
  titulo: string;
  texto: string;
  link?: string;
  estadiaId?: number;
  contaId?: number;
  expiraEm?: string;
}

const PESO: Record<Cor, number> = { vermelho: 0, laranja: 1, amarelo: 2 };

interface LinhaHospedagem {
  id: number;
  nome: string;
  telefone: string;
  quarto: string;
  quarto_id: number;
  data_entrada: string;
  data_saida: string;
  hora_chegada_prevista: string | null;
  chegada_real_em: string | null;
  pre_reserva_expira_em: string | null;
  pessoas: number;
  total: number;
  pago: number;
}

function config(banco: Banco, chave: string, padrao: string): string {
  return (banco.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as { valor: string } | undefined)?.valor ?? padrao;
}

export function painelHoje(banco: Banco, agora: Date) {
  const hoje = dataLocal(agora);
  const agoraIso = agora.toISOString();
  const passouCheckout = minutosDoDia(agora) >= horaParaMinutos(config(banco, 'hora_checkout', '12:00'));
  const base = `
    SELECT e.id, h.nome, h.telefone, q.codigo AS quarto, q.id AS quarto_id, e.data_entrada, e.data_saida,
      e.hora_chegada_prevista, e.chegada_real_em, e.pre_reserva_expira_em, e.pessoas, v.total, v.pago
    FROM estadias e JOIN hospedes h ON h.id = e.hospede_id JOIN quartos q ON q.id = e.quarto_id
    JOIN estadias_valores v ON v.estadia_id = e.id`;
  const comSaldo = (l: LinhaHospedagem) => ({ ...l, saldo: l.total - l.pago });

  const chegam = (
    banco
      .prepare(`${base} WHERE e.status = 'confirmada' AND e.data_entrada <= ? ORDER BY e.data_entrada, IFNULL(e.hora_chegada_prevista, '99'), q.ordem`)
      .all(hoje) as LinhaHospedagem[]
  ).map((l) => ({ ...comSaldo(l), atrasada: l.data_entrada < hoje }));

  const saem = (
    banco
      .prepare(`${base} WHERE e.status = 'hospedado' AND e.data_saida <= ? ORDER BY e.data_saida, q.ordem`)
      .all(hoje) as LinhaHospedagem[]
  ).map((l) => ({ ...comSaldo(l), atrasada: l.data_saida < hoje || passouCheckout }));

  const noHotel = (
    banco.prepare(`${base} WHERE e.status = 'hospedado' AND e.data_saida > ? ORDER BY q.ordem`).all(hoje) as LinhaHospedagem[]
  ).map(comSaldo);

  const preReservas = (
    banco
      .prepare(`${base} WHERE e.status = 'pre_reserva' AND e.pre_reserva_expira_em > ? ORDER BY e.pre_reserva_expira_em`)
      .all(agoraIso) as LinhaHospedagem[]
  ).map(comSaldo);

  const paraLimpar = banco
    .prepare(`SELECT id, codigo, limpar_desde FROM quartos WHERE ativo = 1 AND estado_limpeza = 'limpar' ORDER BY ordem`)
    .all() as { id: number; codigo: string; limpar_desde: string | null }[];

  const totalQuartos = banco.prepare('SELECT COUNT(*) FROM quartos WHERE ativo = 1').pluck().get() as number;
  // Ocupado hoje = alguém hospedado ou com reserva para a noite de hoje
  const ocupados = banco
    .prepare(
      `SELECT COUNT(DISTINCT e.quarto_id) FROM estadias e JOIN quartos q ON q.id = e.quarto_id
       WHERE q.ativo = 1 AND e.status IN ('confirmada','hospedado') AND e.data_entrada <= ? AND e.data_saida > ?`,
    )
    .pluck()
    .get(hoje, hoje) as number;

  return {
    hoje,
    numeros: {
      ocupados,
      livres: Math.max(0, totalQuartos - ocupados),
      chegadas: chegam.length,
      saidas: saem.length,
    },
    chegam,
    saem,
    noHotel,
    preReservas,
    paraLimpar,
    alertas: alertas(banco, agora, { chegam, saem, noHotel, preReservas, passouCheckout }),
  };
}

function alertas(
  banco: Banco,
  agora: Date,
  h: {
    chegam: (LinhaHospedagem & { saldo: number })[];
    saem: (LinhaHospedagem & { saldo: number; atrasada: boolean })[];
    noHotel: (LinhaHospedagem & { saldo: number })[];
    preReservas: (LinhaHospedagem & { saldo: number })[];
    passouCheckout: boolean;
  },
): Alerta[] {
  const hoje = dataLocal(agora);
  const lista: Alerta[] = [];

  // Contas a pagar (seção 7)
  const contas = banco
    .prepare(
      `SELECT id, descricao, vencimento, valor_previsto, avisar_dias_antes FROM contas_a_pagar
       WHERE status = 'aberta' AND vencimento <= date(?, '+' || avisar_dias_antes || ' days') ORDER BY vencimento`,
    )
    .all(hoje) as { id: number; descricao: string; vencimento: string; valor_previsto: number | null; avisar_dias_antes: number }[];
  for (const c of contas) {
    const valor = c.valor_previsto ? ` (${formatarReais(c.valor_previsto)})` : '';
    if (c.vencimento < hoje) {
      const dias = diasEntre(c.vencimento, hoje);
      lista.push({ tipo: 'conta_atrasada', cor: 'vermelho', titulo: 'Conta atrasada', texto: `${c.descricao}${valor} venceu em ${formatarData(c.vencimento)} (${dias} ${dias === 1 ? 'dia' : 'dias'}).`, link: '/contas', contaId: c.id });
    } else if (c.vencimento === hoje) {
      lista.push({ tipo: 'conta_hoje', cor: 'laranja', titulo: 'Conta vence hoje', texto: `${c.descricao}${valor}.`, link: '/contas', contaId: c.id });
    } else {
      lista.push({ tipo: 'conta_breve', cor: 'amarelo', titulo: 'Conta vence em breve', texto: `${c.descricao}${valor} vence em ${formatarData(c.vencimento)}.`, link: '/contas', contaId: c.id });
    }
  }

  for (const p of h.preReservas) {
    lista.push({ tipo: 'pre_reserva', cor: 'laranja', titulo: 'Pré-reserva aguardando Pix', texto: `${p.nome}, quarto ${p.quarto}.`, estadiaId: p.id, expiraEm: p.pre_reserva_expira_em ?? undefined });
  }

  for (const s of h.saem) {
    if (s.saldo > 0) {
      lista.push({ tipo: 'saida_com_saldo', cor: 'vermelho', titulo: 'Saindo com saldo em aberto', texto: `${s.nome} (quarto ${s.quarto}) ainda deve ${formatarReais(s.saldo)}.`, estadiaId: s.id });
    }
    if (s.atrasada) {
      lista.push({ tipo: 'saida_atrasada', cor: 'amarelo', titulo: 'Passou da hora da saída', texto: `Quarto ${s.quarto} (${s.nome}) ainda não foi liberado.`, estadiaId: s.id });
    }
  }

  // Chegou com sinal e ainda tem saldo a cobrar (na chegada)
  for (const e of [...h.noHotel, ...h.saem]) {
    if (e.saldo > 0 && e.chegada_real_em && dataLocal(new Date(e.chegada_real_em)) === hoje && e.pago > 0 && e.data_saida > hoje) {
      lista.push({ tipo: 'saldo_na_chegada', cor: 'amarelo', titulo: 'Chegou com saldo a cobrar', texto: `${e.nome} (quarto ${e.quarto}) pagou ${formatarReais(e.pago)} e falta ${formatarReais(e.saldo)}.`, estadiaId: e.id });
    }
  }

  // Backup atrasado (> 48h) — seção 3
  const ultimo = banco.prepare('SELECT MAX(feito_em) FROM backups WHERE ok = 1').pluck().get() as string | null;
  const temDados = banco.prepare('SELECT 1 FROM estadias LIMIT 1').get();
  if (temDados && (!ultimo || agora.getTime() - Date.parse(ultimo) > 48 * 3600_000)) {
    lista.push({
      tipo: 'backup_atrasado',
      cor: 'vermelho',
      titulo: 'Backup atrasado',
      texto: ultimo ? `O último backup foi em ${formatarData(dataLocal(new Date(ultimo)))}.` : 'Ainda não foi feito nenhum backup.',
      link: '/configuracoes/backup',
    });
  }

  return lista.sort((a, b) => PESO[a.cor] - PESO[b.cor]);
}
