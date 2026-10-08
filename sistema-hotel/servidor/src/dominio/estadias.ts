import type { Banco } from '../banco/conexao.js';
import { auditar } from '../banco/auditoria.js';
import { ErroUsuario } from '../erros.js';
import { dataLocal, diasEntre, formatarData, horaParaMinutos, minutosDoDia, noitesEntre, somarDias } from './datas.js';
import { normalizarBusca, soDigitos } from './texto.js';

// Regras de hospedagem (seções 4 e 5.2). Toda escrita roda em transação IMMEDIATE:
// a conferência de quarto livre e a gravação acontecem sem ninguém no meio.

export type Status = 'pre_reserva' | 'confirmada' | 'hospedado' | 'finalizada' | 'cancelada' | 'no_show' | 'expirada';
export type FormaRecebimento = 'pix' | 'cartao' | 'dinheiro';

export interface Agora {
  agora: Date;
  usuarioId: number | null;
}

const MAX_NOITES = 60;

export interface EstadiaLinha {
  id: number;
  quarto_id: number;
  hospede_id: number;
  data_entrada: string;
  data_saida: string;
  pessoas: number;
  valor_diaria: number;
  motivo_valor: string;
  status: Status;
  origem: string;
  hora_chegada_prevista: string | null;
  chegada_real_em: string | null;
  saida_real_em: string | null;
  pre_reserva_expira_em: string | null;
  cancelada_em: string | null;
  reservado_em: string | null;
  obs: string;
  criado_em: string;
}

function horaCheckout(banco: Banco): string {
  return (
    (banco.prepare(`SELECT valor FROM config WHERE chave = 'hora_checkout'`).get() as { valor: string } | undefined)?.valor ??
    '12:00'
  );
}

/** Condição SQL de estadia que ocupa o quarto (a mesma do gatilho do banco). */
export const SQL_ATIVA = (t = 'e') =>
  `(${t}.status IN ('confirmada','hospedado') OR (${t}.status = 'pre_reserva' AND ${t}.pre_reserva_expira_em > @agoraIso))`;

export function buscarEstadia(banco: Banco, id: number): EstadiaLinha {
  const e = banco.prepare('SELECT * FROM estadias WHERE id = ?').get(id) as EstadiaLinha | undefined;
  if (!e) throw new ErroUsuario('Hospedagem não encontrada.', 404);
  return e;
}

/** Quem já ocupa o quarto em alguma das noites (ignorando a própria estadia). */
export function conflitos(
  banco: Banco,
  quartoId: number,
  entrada: string,
  saida: string,
  agoraIso: string,
  ignorarId: number | null = null,
) {
  return banco
    .prepare(
      `SELECT e.id, e.data_entrada, e.data_saida, h.nome FROM estadias e JOIN hospedes h ON h.id = e.hospede_id
       WHERE e.quarto_id = @quartoId AND e.id IS NOT @ignorarId
         AND e.data_entrada < @saida AND e.data_saida > @entrada AND ${SQL_ATIVA()}`,
    )
    .all({ quartoId, entrada, saida, agoraIso, ignorarId }) as {
    id: number;
    data_entrada: string;
    data_saida: string;
    nome: string;
  }[];
}

function exigirLivre(banco: Banco, quartoId: number, entrada: string, saida: string, agoraIso: string, ignorarId: number | null = null) {
  const c = conflitos(banco, quartoId, entrada, saida, agoraIso, ignorarId)[0];
  if (c) {
    const codigo = (banco.prepare('SELECT codigo FROM quartos WHERE id = ?').get(quartoId) as { codigo: string }).codigo;
    const noite = c.data_entrada > entrada ? c.data_entrada : entrada;
    throw new ErroUsuario(`O quarto ${codigo} já está ocupado na noite de ${formatarData(noite)} (${c.nome}).`, 409, 'QUARTO_OCUPADO');
  }
}

export interface QuartoDisponivel {
  id: number;
  codigo: string;
  nome: string;
  capacidade: number;
  livre: boolean;
  precisaLimpar: boolean;
  ocupadoPor: string | null;
}

/** Todos os quartos em uso, dizendo quais estão livres para as datas. */
export function disponibilidade(banco: Banco, entrada: string, saida: string, agora: Date, ignorarId: number | null = null): QuartoDisponivel[] {
  const hoje = dataLocal(agora);
  const quartos = banco
    .prepare('SELECT id, codigo, nome, capacidade, estado_limpeza FROM quartos WHERE ativo = 1 ORDER BY ordem, codigo')
    .all() as { id: number; codigo: string; nome: string; capacidade: number; estado_limpeza: string }[];
  return quartos.map((q) => {
    const c = conflitos(banco, q.id, entrada, saida, agora.toISOString(), ignorarId)[0];
    return {
      id: q.id,
      codigo: q.codigo,
      nome: q.nome,
      capacidade: q.capacidade,
      livre: !c,
      // Hóspede anterior saiu e o quarto ainda não foi limpo: só libera depois do "Quarto limpo"
      precisaLimpar: q.estado_limpeza === 'limpar' && entrada <= hoje,
      ocupadoPor: c?.nome ?? null,
    };
  });
}

function validarDatas(entrada: string, saida: string, hoje: string) {
  if (saida <= entrada) throw new ErroUsuario('A saída precisa ser depois da entrada.');
  if (diasEntre(entrada, saida) > MAX_NOITES) throw new ErroUsuario(`No máximo ${MAX_NOITES} noites por hospedagem.`);
  // Até a noite de ontem (quem chega de madrugada ainda está na noite anterior)
  if (entrada < somarDias(hoje, -1)) throw new ErroUsuario('A entrada não pode ser antes de ontem.');
}

export interface DadosHospede {
  id?: number | null;
  nome?: string;
  cpfCnpj?: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
}

/** Usa o hóspede existente (atualizando contato) ou cria um novo. CPF repetido reaproveita o cadastro. */
export function garantirHospede(banco: Banco, h: DadosHospede, usuarioId: number | null): number {
  const cpf = soDigitos(h.cpfCnpj) || null;
  if (cpf && cpf.length !== 11 && cpf.length !== 14) throw new ErroUsuario('O CPF precisa ter 11 números (ou CNPJ, 14).');
  const telefone = soDigitos(h.telefone);
  let id = h.id ?? null;
  if (!id && cpf) id = (banco.prepare('SELECT id FROM hospedes WHERE cpf_cnpj = ?').get(cpf) as { id: number } | undefined)?.id ?? null;
  if (id) {
    const antes = banco.prepare('SELECT * FROM hospedes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!antes) throw new ErroUsuario('Hóspede não encontrado.', 404);
    const novo = {
      nome: h.nome?.trim() || (antes.nome as string),
      cpf_cnpj: cpf ?? (antes.cpf_cnpj as string | null),
      telefone: telefone || (antes.telefone as string),
      cidade: h.cidade?.trim() ?? (antes.cidade as string),
      uf: h.uf?.trim().toUpperCase() ?? (antes.uf as string),
    };
    if (novo.cpf_cnpj && novo.cpf_cnpj !== antes.cpf_cnpj) {
      const outro = banco.prepare('SELECT nome FROM hospedes WHERE cpf_cnpj = ? AND id <> ?').get(novo.cpf_cnpj, id) as
        | { nome: string }
        | undefined;
      if (outro) throw new ErroUsuario(`Esse CPF já é de outro hóspede: ${outro.nome}.`);
    }
    const mudou = (Object.keys(novo) as (keyof typeof novo)[]).some((k) => novo[k] !== antes[k]);
    if (mudou) {
      banco
        .prepare('UPDATE hospedes SET nome = ?, nome_busca = ?, cpf_cnpj = ?, telefone = ?, cidade = ?, uf = ? WHERE id = ?')
        .run(novo.nome, normalizarBusca(novo.nome), novo.cpf_cnpj, novo.telefone, novo.cidade, novo.uf, id);
      auditar(banco, { usuarioId, tabela: 'hospedes', registroId: id, acao: 'editar', antes, depois: novo });
    }
    return id;
  }
  const nome = h.nome?.trim();
  if (!nome) throw new ErroUsuario('Informe o nome do hóspede.');
  const novoId = Number(
    banco
      .prepare('INSERT INTO hospedes (nome, nome_busca, cpf_cnpj, telefone, cidade, uf) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nome, normalizarBusca(nome), cpf, telefone, h.cidade?.trim() ?? '', h.uf?.trim().toUpperCase() ?? '').lastInsertRowid,
  );
  auditar(banco, { usuarioId, tabela: 'hospedes', registroId: novoId, acao: 'criar' });
  return novoId;
}

export interface DadosPagamento {
  valor: number;
  forma: FormaRecebimento;
  contaRecebedoraId: number | null;
  obs?: string;
}

export interface NovaHospedagem {
  hospede: DadosHospede;
  quartoId: number;
  entrada: string;
  saida: string;
  pessoas: number;
  valorDiaria: number;
  motivoValor?: string;
  origem: 'balcao' | 'whatsapp';
  horaChegadaPrevista?: string | null;
  jaChegou: boolean;
  obs?: string;
  pagamento?: DadosPagamento | null;
}

export function criarHospedagem(banco: Banco, d: NovaHospedagem, a: Agora): number {
  const hoje = dataLocal(a.agora);
  const agoraIso = a.agora.toISOString();
  validarDatas(d.entrada, d.saida, hoje);
  return banco
    .transaction(() => {
      const q = banco.prepare('SELECT * FROM quartos WHERE id = ?').get(d.quartoId) as
        | { id: number; codigo: string; ativo: number; capacidade: number; estado_limpeza: string }
        | undefined;
      if (!q || !q.ativo) throw new ErroUsuario('Escolha um quarto em uso.');
      if (d.pessoas > q.capacidade)
        throw new ErroUsuario(`No quarto ${q.codigo} cabem até ${q.capacidade} pessoas. Mude a capacidade em Editar quartos se precisar.`);
      exigirLivre(banco, q.id, d.entrada, d.saida, agoraIso);
      if (q.estado_limpeza === 'limpar' && d.entrada <= hoje)
        throw new ErroUsuario(`O quarto ${q.codigo} ainda está para limpar. Marque "Quarto limpo" antes.`, 409, 'PRECISA_LIMPAR');
      const hospedeId = garantirHospede(banco, d.hospede, a.usuarioId);
      const chegou = d.jaChegou && d.entrada <= hoje;
      const id = Number(
        banco
          .prepare(
            `INSERT INTO estadias (quarto_id, hospede_id, data_entrada, data_saida, pessoas, valor_diaria, motivo_valor,
               status, origem, hora_chegada_prevista, chegada_real_em, reservado_em, obs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            q.id,
            hospedeId,
            d.entrada,
            d.saida,
            d.pessoas,
            d.valorDiaria,
            d.motivoValor?.trim() ?? '',
            chegou ? 'hospedado' : 'confirmada',
            d.origem,
            d.horaChegadaPrevista ?? null,
            chegou ? agoraIso : null,
            agoraIso,
            d.obs?.trim() ?? '',
          ).lastInsertRowid,
      );
      const insNoite = banco.prepare('INSERT INTO estadia_noites (estadia_id, data, valor) VALUES (?, ?, ?)');
      for (const n of noitesEntre(d.entrada, d.saida)) insNoite.run(id, n, d.valorDiaria);
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'estadias', registroId: id, acao: 'criar', depois: d });
      if (d.pagamento && d.pagamento.valor > 0) {
        inserirPagamento(banco, id, { ...d.pagamento, tipo: d.entrada > hoje ? 'sinal' : 'diaria', data: hoje }, a);
      }
      return id;
    })
    .immediate();
}

function inserirPagamento(
  banco: Banco,
  estadiaId: number,
  p: DadosPagamento & { tipo: 'sinal' | 'saldo' | 'diaria' | 'devolucao'; data: string },
  a: Agora,
): number {
  if (p.contaRecebedoraId !== null) {
    const c = banco.prepare('SELECT ativa FROM contas_recebedoras WHERE id = ?').get(p.contaRecebedoraId) as { ativa: number } | undefined;
    if (!c) throw new ErroUsuario('Escolha quem recebeu.');
  }
  const id = Number(
    banco
      .prepare(
        `INSERT INTO pagamentos (estadia_id, valor, forma, tipo, conta_recebedora_id, data, obs, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(estadiaId, p.valor, p.forma, p.tipo, p.contaRecebedoraId, p.data, p.obs?.trim() ?? '', a.usuarioId).lastInsertRowid,
  );
  auditar(banco, { usuarioId: a.usuarioId, tabela: 'pagamentos', registroId: id, acao: 'criar', depois: { estadiaId, ...p } });
  return id;
}

export function valores(banco: Banco, estadiaId: number) {
  const v = banco.prepare('SELECT total, pago FROM estadias_valores WHERE estadia_id = ?').get(estadiaId) as {
    total: number;
    pago: number;
  };
  return { ...v, saldo: v.total - v.pago };
}

/** "Recebi": registra um pagamento. Tipo: sinal antes da entrada, saldo depois de um sinal, diária no resto. */
export function receber(banco: Banco, estadiaId: number, p: DadosPagamento, a: Agora): number {
  const hoje = dataLocal(a.agora);
  return banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (['cancelada', 'expirada'].includes(e.status)) throw new ErroUsuario('Essa hospedagem está cancelada.');
      const temSinal = banco
        .prepare(`SELECT 1 FROM pagamentos_validos WHERE estadia_id = ? AND tipo = 'sinal'`)
        .get(estadiaId);
      const tipo = e.data_entrada > hoje ? 'sinal' : temSinal ? 'saldo' : 'diaria';
      return inserirPagamento(banco, estadiaId, { ...p, tipo, data: hoje }, a);
    })
    .immediate();
}

export function cancelarPagamento(banco: Banco, pagamentoId: number, motivo: string, a: Agora) {
  banco
    .transaction(() => {
      const p = banco.prepare('SELECT * FROM pagamentos WHERE id = ?').get(pagamentoId) as { cancelado_em: string | null } | undefined;
      if (!p) throw new ErroUsuario('Pagamento não encontrado.', 404);
      if (p.cancelado_em) throw new ErroUsuario('Esse pagamento já foi desfeito.');
      banco
        .prepare('UPDATE pagamentos SET cancelado_em = ?, cancelado_por = ?, obs = trim(obs || ? ) WHERE id = ?')
        .run(a.agora.toISOString(), a.usuarioId, motivo ? ` (desfeito: ${motivo})` : ' (desfeito)', pagamentoId);
      auditar(banco, { usuarioId: a.usuarioId, tabela: 'pagamentos', registroId: pagamentoId, acao: 'cancelar', antes: p, depois: { motivo } });
    })
    .immediate();
}

function mudarStatus(banco: Banco, e: EstadiaLinha, novo: Partial<EstadiaLinha>, acao: string, a: Agora) {
  const campos = Object.keys(novo);
  banco
    .prepare(`UPDATE estadias SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
    .run({ ...novo, id: e.id });
  auditar(banco, { usuarioId: a.usuarioId, tabela: 'estadias', registroId: e.id, acao, antes: e, depois: novo });
}

/** "Chegou": reserva vira hospedado. */
export function chegou(banco: Banco, estadiaId: number, a: Agora) {
  const hoje = dataLocal(a.agora);
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (e.status !== 'confirmada' && e.status !== 'pre_reserva') throw new ErroUsuario('Essa hospedagem não está aguardando chegada.');
      if (e.data_entrada > hoje) throw new ErroUsuario(`A entrada é só em ${formatarData(e.data_entrada)}.`);
      mudarStatus(banco, e, { status: 'hospedado', chegada_real_em: a.agora.toISOString() }, 'chegou', a);
    })
    .immediate();
}

/**
 * Noite em que o hóspede está agora: antes do horário de saída (12h) ainda é a noite de ontem.
 * Quem sai de manhã usou a noite anterior; quem sai à tarde/noite está na noite de hoje.
 */
export function noiteAtual(banco: Banco, agora: Date): string {
  const hoje = dataLocal(agora);
  return minutosDoDia(agora) < horaParaMinutos(horaCheckout(banco)) ? somarDias(hoje, -1) : hoje;
}

/** Noites que ainda não foram usadas se o hóspede sair agora. */
export function noitesNaoUsadas(banco: Banco, e: EstadiaLinha, agora: Date): string[] {
  const atual = noiteAtual(banco, agora);
  const ultimaUsada = atual < e.data_entrada ? e.data_entrada : atual;
  return noitesEntre(e.data_entrada, e.data_saida).filter((n) => n > ultimaUsada);
}

/**
 * "Saiu": finaliza, marca o quarto para limpar. A diária da noite atual não é devolvida (seção 4).
 * tirarNoitesNaoUsadas: noites futuras saem da conta (saída antecipada de estadia longa).
 */
export function saiu(banco: Banco, estadiaId: number, op: { tirarNoitesNaoUsadas: boolean }, a: Agora) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (e.status !== 'hospedado') throw new ErroUsuario('Esse hóspede não está no hotel.');
      const novo: Partial<EstadiaLinha> = { status: 'finalizada', saida_real_em: a.agora.toISOString() };
      if (op.tirarNoitesNaoUsadas) {
        const tirar = noitesNaoUsadas(banco, e, a.agora);
        if (tirar.length) {
          const noites = banco.prepare('SELECT data, valor FROM estadia_noites WHERE estadia_id = ? AND data >= ?').all(e.id, tirar[0]);
          banco.prepare('DELETE FROM estadia_noites WHERE estadia_id = ? AND data >= ?').run(e.id, tirar[0]);
          novo.data_saida = tirar[0];
          auditar(banco, { usuarioId: a.usuarioId, tabela: 'estadia_noites', registroId: e.id, acao: 'tirar_noites', antes: noites });
        }
      }
      mudarStatus(banco, e, novo, 'saiu', a);
      banco
        .prepare(`UPDATE quartos SET estado_limpeza = 'limpar', limpar_desde = ? WHERE id = ?`)
        .run(a.agora.toISOString(), e.quarto_id);
    })
    .immediate();
}

/** "Quarto limpo": libera o quarto, inclusive para outra estadia na mesma noite. */
export function quartoLimpo(banco: Banco, quartoId: number, a: Agora) {
  const r = banco
    .prepare(`UPDATE quartos SET estado_limpeza = 'limpo', limpar_desde = NULL WHERE id = ? AND estado_limpeza = 'limpar'`)
    .run(quartoId);
  if (r.changes) auditar(banco, { usuarioId: a.usuarioId, tabela: 'quartos', registroId: quartoId, acao: 'limpo' });
}

/** Mais noites no fim da estadia, com a mesma diária. */
export function estender(banco: Banco, estadiaId: number, novaSaida: string, a: Agora) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (!['confirmada', 'hospedado'].includes(e.status)) throw new ErroUsuario('Só dá para estender hospedagem ativa.');
      if (novaSaida <= e.data_saida) throw new ErroUsuario('A nova saída precisa ser depois da saída atual.');
      if (diasEntre(e.data_entrada, novaSaida) > MAX_NOITES) throw new ErroUsuario(`No máximo ${MAX_NOITES} noites por hospedagem.`);
      exigirLivre(banco, e.quarto_id, e.data_saida, novaSaida, a.agora.toISOString(), e.id);
      const ins = banco.prepare('INSERT INTO estadia_noites (estadia_id, data, valor) VALUES (?, ?, ?)');
      for (const n of noitesEntre(e.data_saida, novaSaida)) ins.run(e.id, n, e.valor_diaria);
      mudarStatus(banco, e, { data_saida: novaSaida }, 'estender', a);
    })
    .immediate();
}

export function trocarQuarto(banco: Banco, estadiaId: number, novoQuartoId: number, a: Agora) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (!['confirmada', 'hospedado'].includes(e.status)) throw new ErroUsuario('Só dá para trocar quarto de hospedagem ativa.');
      if (novoQuartoId === e.quarto_id) return;
      const q = banco.prepare('SELECT ativo, capacidade, codigo FROM quartos WHERE id = ?').get(novoQuartoId) as
        | { ativo: number; capacidade: number; codigo: string }
        | undefined;
      if (!q?.ativo) throw new ErroUsuario('Escolha um quarto em uso.');
      if (e.pessoas > q.capacidade) throw new ErroUsuario(`No quarto ${q.codigo} cabem até ${q.capacidade} pessoas.`);
      exigirLivre(banco, novoQuartoId, e.data_entrada, e.data_saida, a.agora.toISOString(), e.id);
      mudarStatus(banco, e, { quarto_id: novoQuartoId }, 'trocar_quarto', a);
      if (e.status === 'hospedado') {
        banco
          .prepare(`UPDATE quartos SET estado_limpeza = 'limpar', limpar_desde = ? WHERE id = ?`)
          .run(a.agora.toISOString(), e.quarto_id);
      }
    })
    .immediate();
}

/** Cancelar (ou "não veio"). Devolução opcional vira um pagamento do tipo devolução. */
export function cancelar(
  banco: Banco,
  estadiaId: number,
  op: { naoVeio?: boolean; motivo?: string; devolucao?: DadosPagamento | null },
  a: Agora,
) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      if (!['confirmada', 'hospedado', 'pre_reserva'].includes(e.status)) throw new ErroUsuario('Essa hospedagem não pode ser cancelada.');
      if (op.naoVeio && e.status === 'hospedado') throw new ErroUsuario('O hóspede já chegou.');
      const obs = op.motivo?.trim() ? `${e.obs ? `${e.obs}\n` : ''}Cancelada: ${op.motivo.trim()}` : e.obs;
      mudarStatus(
        banco,
        e,
        { status: op.naoVeio ? 'no_show' : 'cancelada', cancelada_em: a.agora.toISOString(), obs },
        op.naoVeio ? 'nao_veio' : 'cancelar',
        a,
      );
      if (op.devolucao && op.devolucao.valor > 0) {
        const { pago } = valores(banco, estadiaId);
        if (op.devolucao.valor > pago) throw new ErroUsuario('A devolução não pode ser maior que o que foi pago.');
        inserirPagamento(banco, estadiaId, { ...op.devolucao, tipo: 'devolucao', data: dataLocal(a.agora) }, a);
      }
      if (e.status === 'hospedado') {
        banco.prepare(`UPDATE quartos SET estado_limpeza = 'limpar', limpar_desde = ? WHERE id = ?`).run(a.agora.toISOString(), e.quarto_id);
      }
    })
    .immediate();
}

/** Desfaz uma hospedagem recém-criada (botão "Desfazer" do aviso): cancela a estadia e os pagamentos dela. */
export function desfazerCriacao(banco: Banco, estadiaId: number, a: Agora) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      const idade = a.agora.getTime() - Date.parse(e.reservado_em ?? e.criado_em);
      if (idade > 5 * 60_000) throw new ErroUsuario('Já passou o tempo de desfazer. Use "Cancelar" na hospedagem.');
      if (!['confirmada', 'hospedado'].includes(e.status)) throw new ErroUsuario('Essa hospedagem já mudou.');
      mudarStatus(banco, e, { status: 'cancelada', cancelada_em: a.agora.toISOString() }, 'desfazer_criacao', a);
      const pags = banco.prepare('SELECT id FROM pagamentos WHERE estadia_id = ? AND cancelado_em IS NULL').all(estadiaId) as { id: number }[];
      for (const p of pags) {
        banco.prepare('UPDATE pagamentos SET cancelado_em = ?, cancelado_por = ? WHERE id = ?').run(a.agora.toISOString(), a.usuarioId, p.id);
        auditar(banco, { usuarioId: a.usuarioId, tabela: 'pagamentos', registroId: p.id, acao: 'cancelar', depois: { motivo: 'desfazer hospedagem' } });
      }
    })
    .immediate();
}

/** Muda pessoas, diária, hora prevista ou observação. Diária nova vale para todas as noites. */
export function editarEstadia(
  banco: Banco,
  estadiaId: number,
  d: { pessoas?: number; valorDiaria?: number; motivoValor?: string; horaChegadaPrevista?: string | null; obs?: string },
  a: Agora,
) {
  banco
    .transaction(() => {
      const e = buscarEstadia(banco, estadiaId);
      const novo: Partial<EstadiaLinha> = {};
      if (d.pessoas !== undefined && d.pessoas !== e.pessoas) {
        const cap = (banco.prepare('SELECT capacidade FROM quartos WHERE id = ?').get(e.quarto_id) as { capacidade: number }).capacidade;
        if (d.pessoas > cap) throw new ErroUsuario(`Nesse quarto cabem até ${cap} pessoas.`);
        novo.pessoas = d.pessoas;
      }
      if (d.valorDiaria !== undefined && d.valorDiaria !== e.valor_diaria) {
        novo.valor_diaria = d.valorDiaria;
        banco.prepare('UPDATE estadia_noites SET valor = ? WHERE estadia_id = ?').run(d.valorDiaria, e.id);
      }
      if (d.motivoValor !== undefined) novo.motivo_valor = d.motivoValor.trim();
      if (d.horaChegadaPrevista !== undefined) novo.hora_chegada_prevista = d.horaChegadaPrevista;
      if (d.obs !== undefined) novo.obs = d.obs.trim();
      if (Object.keys(novo).length) mudarStatus(banco, e, novo, 'editar', a);
    })
    .immediate();
}

export function detalhesEstadia(banco: Banco, id: number, agora: Date) {
  const e = buscarEstadia(banco, id);
  const hospede = banco.prepare('SELECT * FROM hospedes WHERE id = ?').get(e.hospede_id);
  const quarto = banco.prepare('SELECT id, codigo, nome, capacidade, estado_limpeza FROM quartos WHERE id = ?').get(e.quarto_id);
  const noites = banco.prepare('SELECT data, valor FROM estadia_noites WHERE estadia_id = ? ORDER BY data').all(id);
  const pagamentos = banco
    .prepare(
      `SELECT p.id, p.valor, p.forma, p.tipo, p.data, p.obs, p.cancelado_em, p.criado_em, c.sigla AS conta, c.nome AS conta_nome
       FROM pagamentos p LEFT JOIN contas_recebedoras c ON c.id = p.conta_recebedora_id
       WHERE p.estadia_id = ? ORDER BY p.data, p.id`,
    )
    .all(id);
  const visitas = banco
    .prepare(`SELECT COUNT(*) FROM estadias WHERE hospede_id = ? AND status NOT IN ('cancelada','expirada')`)
    .pluck()
    .get(e.hospede_id) as number;
  return {
    estadia: e,
    hospede,
    quarto,
    noites,
    pagamentos,
    ...valores(banco, id),
    visitas,
    noitesNaoUsadas: e.status === 'hospedado' ? noitesNaoUsadas(banco, e, agora) : [],
  };
}
