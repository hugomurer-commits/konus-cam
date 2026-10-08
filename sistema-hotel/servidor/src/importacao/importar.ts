import type { Banco } from '../banco/conexao.js';
import { auditar } from '../banco/auditoria.js';
import { diasEntre, formatarData, somarDias } from '../dominio/datas.js';
import { normalizarBusca, primeiraMaiuscula } from '../dominio/texto.js';
import { ErroUsuario } from '../erros.js';
import type { LinhaCadastro, LinhaDespesa, Planilha } from './planilha.js';

// Importação da planilha antiga (seção 8). Regra de ouro: sinalizar, nunca corrigir em silêncio.
// Tudo acontece numa transação só: ou importa tudo, ou nada.

export const ABA_CADASTRO = 'CADASTRO GERAL';
export const ABA_DESPESAS = 'DESPESAS 2025';

/** Títulos das pendências na tela "Para conferir". */
export const TIPOS_PENDENCIA: Record<string, string> = {
  duplicidade: 'Diária lançada duas vezes (mesmo quarto, data e cliente)',
  sobreposicao: 'Dois clientes no mesmo quarto por mais de uma noite',
  conflito_reserva: 'Reserva atual ou futura em quarto já ocupado',
  sem_valor: 'Diária sem valor',
  a_receber: 'Diária marcada "A REC" (a receber)',
  sem_pago: 'Diária sem indicação de pago',
  forma_nao_informada: 'Forma de pagamento não informada (coluna C D P)',
  conta_nao_informada: 'Quem recebeu não informado (coluna H V N)',
  documento_invalido: 'CPF/CNPJ incompleto ou fora do padrão',
  sem_quarto: 'Diária sem quarto',
  quarto_suspeito: 'Código de quarto usado poucas vezes',
  sem_pessoas: 'Diária sem número de pessoas',
  sem_nome: 'Diária sem nome do cliente',
  despesa_sem_valor: 'Despesa sem valor nas colunas G × H',
  total_diferente: 'Total da coluna I diferente de G × H',
  despesa_e_receita: 'Linha com despesa e receita ao mesmo tempo',
  categoria_aviso: 'Categoria que precisa de atenção',
};

export interface LinhaValidacao {
  item: string;
  planilha: number;
  sistema: number;
  dinheiro: boolean;
}

export interface ResumoImportacao {
  arquivo: string;
  hoje: string;
  validacao: LinhaValidacao[];
  porMes: { mes: string; diariasPlanilha: number; somaPlanilha: number; diariasSistema: number; somaSistema: number }[];
  despesasPorMes: { mes: string; somaPlanilha: number; somaSistema: number }[];
  /** Seção 8.2: receita como era digitada na aba DESPESAS × diárias do cadastro, por mês */
  receitaAntigaPorMes: { mes: string; receitaDigitada: number; diariasCadastro: number; diferenca: number }[];
  totaisNoTopoDaPlanilha: Planilha['totaisDaPlanilha'];
  estadias: {
    total: number;
    porStatus: Record<string, number>;
    hospedes: number;
    quartos: number;
    quartosAtivos: string[];
    noitesComDoisClientes: number;
    pagamentos: number;
    somaPagamentos: number;
  };
  despesas: {
    linhasComData: number;
    importadas: number;
    soReceita: number;
    semValor: number;
    despesaEReceita: number;
    receitasAntigas: number;
    somaReceitasAntigas: number;
    categoriasCriadas: string[];
  };
  faturamentoMeses: number;
  pendencias: Record<string, number>;
}

interface Pendencia {
  aba: string;
  linha: number | null;
  tipo: string;
  mensagem: string;
  dados?: unknown;
}

const FORMAS: Record<string, string> = { C: 'cartao', D: 'dinheiro', P: 'pix' };

/** Quarto sem uso há mais que isso fica desativado (a obra trocou os quartos antigos pelos "A"). */
const DIAS_PARA_ATIVO = 90;

export function bancoTemDados(banco: Banco): boolean {
  return !!banco
    .prepare(
      `SELECT 1 FROM estadias UNION ALL SELECT 1 FROM despesas UNION ALL SELECT 1 FROM hospedes LIMIT 1`,
    )
    .get();
}

export function importarPlanilha(
  banco: Banco,
  planilha: Planilha,
  op: { arquivo: string; sha256: string; usuarioId: number | null; hoje: string; agoraIso: string },
): { importacaoId: number; resumo: ResumoImportacao } {
  if (bancoTemDados(banco)) {
    throw new ErroUsuario(
      'Já existem hospedagens, hóspedes ou despesas no sistema. A importação da planilha só pode ser feita com o sistema vazio.',
      409,
    );
  }
  if (planilha.cadastro.length === 0) throw new ErroUsuario('Não achei nenhuma diária com data na aba CADASTRO GERAL.');

  return banco.transaction(() => {
    const importacaoId = Number(
      banco
        .prepare(`INSERT INTO importacoes (arquivo, sha256, feita_em, usuario_id) VALUES (?, ?, ?, ?)`)
        .run(op.arquivo, op.sha256, op.agoraIso, op.usuarioId).lastInsertRowid,
    );
    const pendencias: Pendencia[] = [];
    const pendente = (p: Pendencia) => pendencias.push(p);

    const cad = importarCadastro(banco, planilha.cadastro, importacaoId, op, pendente);
    const desp = importarDespesas(banco, planilha.despesas, importacaoId, pendente);

    const insFat = banco.prepare(
      `INSERT INTO faturamento_historico (importacao_id, mes, valor) VALUES (?, ?, ?)
       ON CONFLICT(mes) DO UPDATE SET valor = excluded.valor, importacao_id = excluded.importacao_id`,
    );
    for (const f of planilha.faturamento) insFat.run(importacaoId, f.mes, f.valor);

    const insPend = banco.prepare(
      `INSERT INTO importacao_pendencias (importacao_id, aba, linha, tipo, mensagem, dados) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const p of pendencias) {
      insPend.run(importacaoId, p.aba, p.linha, p.tipo, p.mensagem, JSON.stringify(p.dados ?? {}));
    }

    const resumo = montarResumo(banco, planilha, importacaoId, op, cad, desp, pendencias);
    banco.prepare('UPDATE importacoes SET resumo = ? WHERE id = ?').run(JSON.stringify(resumo), importacaoId);
    auditar(banco, {
      usuarioId: op.usuarioId,
      tabela: 'importacoes',
      registroId: importacaoId,
      acao: 'importar_planilha',
      depois: { arquivo: op.arquivo, sha256: op.sha256 },
    });
    return { importacaoId, resumo };
  })();
}

// ───────────────────────── Cadastro geral (hóspedes, estadias, pagamentos) ─────────────────────────

interface Montada {
  quartoCodigo: string;
  hospede: number; // índice em hospedes
  linhas: LinhaCadastro[];
}

function importarCadastro(
  banco: Banco,
  linhas: LinhaCadastro[],
  importacaoId: number,
  op: { hoje: string; agoraIso: string },
  pendente: (p: Pendencia) => void,
) {
  const A = ABA_CADASTRO;
  const SEM_QUARTO = 'SEM QUARTO';
  const codigoQuarto = (l: LinhaCadastro) => l.apto || SEM_QUARTO;

  // ── Quartos: cria todos os códigos que aparecem; ativo = usado nos últimos 90 dias
  const usoQuarto = new Map<string, { noites: number; ultima: string; maxPessoas: number }>();
  for (const l of linhas) {
    const c = codigoQuarto(l);
    const u = usoQuarto.get(c) ?? { noites: 0, ultima: '', maxPessoas: 1 };
    u.noites++;
    if (l.data > u.ultima) u.ultima = l.data;
    u.maxPessoas = Math.max(u.maxPessoas, l.pessoas ?? 1);
    usoQuarto.set(c, u);
  }
  const ordenarCodigo = (a: string, b: string) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    const la = /[A-Z]$/.test(a) ? 0 : 1; // quartos novos ("A") primeiro
    const lb = /[A-Z]$/.test(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    return na - nb || a.localeCompare(b);
  };
  const quartoId = new Map<string, number>();
  const insQuarto = banco.prepare(
    `INSERT INTO quartos (codigo, nome, capacidade, ativo, ordem) VALUES (?, ?, ?, ?, ?)`,
  );
  const codigos = [...usoQuarto.keys()].sort(ordenarCodigo);
  const limiteAtivo = somarDias(op.hoje, -DIAS_PARA_ATIVO);
  codigos.forEach((c, i) => {
    const u = usoQuarto.get(c)!;
    const ativo = c !== SEM_QUARTO && u.ultima >= limiteAtivo;
    const nome = c === SEM_QUARTO ? 'Sem quarto (planilha)' : `Quarto ${c}`;
    const id = insQuarto.run(c, nome, Math.max(2, Math.min(u.maxPessoas, 10)), ativo ? 1 : 0, i + 1).lastInsertRowid;
    quartoId.set(c, Number(id));
    if (c !== SEM_QUARTO && u.noites <= 3) {
      pendente({
        aba: A,
        linha: null,
        tipo: 'quarto_suspeito',
        mensagem: `O quarto "${c}" aparece em só ${u.noites} ${u.noites === 1 ? 'noite' : 'noites'} (última em ${formatarData(u.ultima)}). Pode ser outro quarto digitado sem a letra.`,
        dados: { quarto: c, noites: u.noites },
      });
    }
  });

  // ── Hóspedes: um por CPF; sem CPF, por nome + telefone (seção 8.1)
  interface Hosp { linhas: LinhaCadastro[]; documento: string | null }
  const hospedes: Hosp[] = [];
  const porDoc = new Map<string, number>();
  const porNomeTel = new Map<string, number>();
  const chaveNomeTel = (l: LinhaCadastro) => `${normalizarBusca(l.cliente)}|${l.telefone}`;
  for (const l of linhas) {
    if (!l.documento) continue;
    let i = porDoc.get(l.documento);
    if (i === undefined) {
      i = hospedes.push({ linhas: [], documento: l.documento }) - 1;
      porDoc.set(l.documento, i);
    }
    hospedes[i].linhas.push(l);
    if (!porNomeTel.has(chaveNomeTel(l))) porNomeTel.set(chaveNomeTel(l), i);
  }
  for (const l of linhas) {
    if (l.documento) continue;
    const k = chaveNomeTel(l);
    let i = porNomeTel.get(k);
    if (i === undefined) {
      i = hospedes.push({ linhas: [], documento: null }) - 1;
      porNomeTel.set(k, i);
    }
    hospedes[i].linhas.push(l);
  }
  const insHosp = banco.prepare(
    `INSERT INTO hospedes (nome, nome_busca, cpf_cnpj, telefone, cidade, uf, obs) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const hospedeId: number[] = [];
  const hospedeDaLinha = new Map<number, number>();
  hospedes.forEach((h, i) => {
    const recente = [...h.linhas].sort((a, b) => b.data.localeCompare(a.data) || b.linha - a.linha)[0];
    const nome = recente.cliente || '(sem nome na planilha)';
    const docsRuins = [
      ...new Set(h.linhas.filter((l) => l.documentoProblema === 'invalido').map((l) => l.documentoBruto)),
    ];
    const obs = docsRuins.length ? `Documento na planilha: ${docsRuins.join(' / ')}` : '';
    const id = insHosp.run(
      nome,
      normalizarBusca(nome),
      h.documento,
      recente.telefone || h.linhas.find((l) => l.telefone)?.telefone || '',
      recente.cidade,
      recente.uf,
      obs,
    ).lastInsertRowid;
    hospedeId[i] = Number(id);
    for (const l of h.linhas) hospedeDaLinha.set(l.linha, i);
  });

  // ── Pendências por linha
  const vistos = new Set<string>();
  for (const l of linhas) {
    const base = { aba: A, linha: l.linha };
    const quem = `${l.cliente || '(sem nome)'}, quarto ${l.apto || '?'}, ${formatarData(l.data)}`;
    const chaveDup = `${l.apto}|${l.data}|${normalizarBusca(l.cliente)}`;
    if (vistos.has(chaveDup)) {
      pendente({ ...base, tipo: 'duplicidade', mensagem: `${quem}: já lançada em outra linha.`, dados: { valor: l.valor } });
    }
    vistos.add(chaveDup);
    if (!l.apto) pendente({ ...base, tipo: 'sem_quarto', mensagem: `${quem}: sem quarto. Ficou no "Sem quarto (planilha)".` });
    if (!l.cliente) pendente({ ...base, tipo: 'sem_nome', mensagem: `${quem}: sem nome do cliente.` });
    if (!l.valor) pendente({ ...base, tipo: 'sem_valor', mensagem: `${quem}: sem valor. Importada com R$ 0,00.` });
    else if (l.pagoBruto === 'A REC')
      pendente({ ...base, tipo: 'a_receber', mensagem: `${quem}: marcada a receber. Ficou com saldo em aberto.`, dados: { valor: l.valor } });
    else if (l.pagoBruto !== 'PAGO')
      pendente({ ...base, tipo: 'sem_pago', mensagem: `${quem}: sem "PAGO". Ficou com saldo em aberto.`, dados: { valor: l.valor } });
    if (!FORMAS[l.formaBruta.toUpperCase()])
      pendente({
        ...base,
        tipo: 'forma_nao_informada',
        mensagem: `${quem}: forma ${l.formaBruta ? `"${l.formaBruta}"` : 'vazia'}. Importada como "não informado".`,
        dados: { original: l.formaBruta },
      });
    if (!['H', 'V', 'N'].includes(l.contaBruta.toUpperCase()))
      pendente({
        ...base,
        tipo: 'conta_nao_informada',
        mensagem: `${quem}: quem recebeu ${l.contaBruta ? `"${l.contaBruta}"` : 'vazio'}. Importado como "não informado".`,
        dados: { original: l.contaBruta },
      });
    if (l.documentoProblema === 'invalido')
      pendente({ ...base, tipo: 'documento_invalido', mensagem: `${quem}: documento "${l.documentoBruto}".` });
    if (l.pessoas === null) pendente({ ...base, tipo: 'sem_pessoas', mensagem: `${quem}: sem nº de pessoas. Importada com 1.` });
  }

  // ── Estadias: noites seguidas, mesmo quarto, mesmo hóspede = uma estadia.
  // Diária repetida na mesma noite vira outra estadia (aparece em "Para conferir", não some).
  const grupos = new Map<string, LinhaCadastro[]>();
  for (const l of linhas) {
    const k = `${hospedeDaLinha.get(l.linha)}|${codigoQuarto(l)}`;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(l);
  }
  const montadas: Montada[] = [];
  for (const ls of grupos.values()) {
    ls.sort((a, b) => a.data.localeCompare(b.data) || a.linha - b.linha);
    const abertas: Montada[] = [];
    for (const l of ls) {
      const ontem = somarDias(l.data, -1);
      let m = abertas.find((e) => e.linhas[e.linhas.length - 1].data === ontem);
      if (!m) {
        m = { quartoCodigo: codigoQuarto(l), hospede: hospedeDaLinha.get(l.linha)!, linhas: [] };
        abertas.push(m);
        montadas.push(m);
      }
      m.linhas.push(l);
    }
  }
  const entrada = (m: Montada) => m.linhas[0].data;
  const saida = (m: Montada) => somarDias(m.linhas[m.linhas.length - 1].data, 1);
  montadas.sort((a, b) => entrada(a).localeCompare(entrada(b)) || a.linhas[0].linha - b.linhas[0].linha);

  // ── Noites com 2 clientes no mesmo quarto (seção 8.1). Legítimas na maioria:
  // a primeira estadia fica "finalizada". Só vira pendência se dividirem mais de uma noite.
  const clientesNaNoite = new Map<string, Set<string>>();
  for (const l of linhas) {
    const k = `${codigoQuarto(l)}|${l.data}`;
    (clientesNaNoite.get(k) ?? clientesNaNoite.set(k, new Set()).get(k)!).add(normalizarBusca(l.cliente));
  }
  const noitesComDoisClientes = [...clientesNaNoite.values()].filter((s) => s.size > 1).length;
  const porQuarto = new Map<string, Montada[]>();
  for (const m of montadas) (porQuarto.get(m.quartoCodigo) ?? porQuarto.set(m.quartoCodigo, []).get(m.quartoCodigo)!).push(m);
  for (const [codigo, ms] of porQuarto) {
    if (codigo === SEM_QUARTO) continue;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length && entrada(ms[j]) < saida(ms[i]); j++) {
        if (ms[i].hospede === ms[j].hospede) continue;
        const ini = entrada(ms[j]) > entrada(ms[i]) ? entrada(ms[j]) : entrada(ms[i]);
        const fim = saida(ms[j]) < saida(ms[i]) ? saida(ms[j]) : saida(ms[i]);
        const juntas = diasEntre(ini, fim);
        if (juntas > 1) {
          pendente({
            aba: A,
            linha: ms[j].linhas[0].linha,
            tipo: 'sobreposicao',
            mensagem: `Quarto ${codigo}: ${ms[i].linhas[0].cliente} e ${ms[j].linhas[0].cliente} dividem ${juntas} noites a partir de ${formatarData(ini)}.`,
            dados: { linhas: [ms[i].linhas[0].linha, ms[j].linhas[0].linha] },
          });
        }
      }
    }
  }

  // ── Grava estadias, noites e pagamentos
  const insEst = banco.prepare(
    `INSERT INTO estadias (quarto_id, hospede_id, data_entrada, data_saida, pessoas, valor_diaria, status, origem,
       hora_chegada_prevista, cancelada_em, obs, importacao_id, linhas_planilha)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'planilha', ?, ?, ?, ?, ?)`,
  );
  const insNoite = banco.prepare(
    `INSERT INTO estadia_noites (estadia_id, data, valor, linha_planilha) VALUES (?, ?, ?, ?)`,
  );
  const insPag = banco.prepare(
    `INSERT INTO pagamentos (estadia_id, valor, forma, tipo, conta_recebedora_id, data, obs, importacao_id, linha_planilha)
     VALUES (?, ?, ?, 'diaria', ?, ?, ?, ?, ?)`,
  );
  const contas = new Map(
    (banco.prepare('SELECT id, sigla FROM contas_recebedoras').all() as { id: number; sigla: string }[]).map((c) => [
      c.sigla.toUpperCase(),
      c.id,
    ]),
  );
  const ativasPorQuarto = new Map<string, { entrada: string; saida: string; cliente: string }[]>();
  let pagamentos = 0;
  let somaPagamentos = 0;
  const porStatus: Record<string, number> = {};

  for (const m of montadas) {
    const ent = entrada(m);
    const sai = saida(m);
    let status = sai <= op.hoje ? 'finalizada' : ent < op.hoje ? 'hospedado' : 'confirmada';
    let canceladaEm: string | null = null;
    const notas: string[] = [];
    if (status !== 'finalizada') {
      const ativas = ativasPorQuarto.get(m.quartoCodigo) ?? [];
      const choque = ativas.find((a) => a.entrada < sai && a.saida > ent);
      if (choque) {
        notas.push(`Conflito na importação: o quarto já estava com ${choque.cliente}. Confira e refaça se for o caso.`);
        pendente({
          aba: A,
          linha: m.linhas[0].linha,
          tipo: 'conflito_reserva',
          mensagem: `Quarto ${m.quartoCodigo}, ${formatarData(ent)}: ${m.linhas[0].cliente} chocou com ${choque.cliente}. Importada como cancelada.`,
        });
        status = 'cancelada';
        canceladaEm = op.agoraIso;
      } else {
        ativas.push({ entrada: ent, saida: sai, cliente: m.linhas[0].cliente });
        ativasPorQuarto.set(m.quartoCodigo, ativas);
      }
    }
    porStatus[status] = (porStatus[status] ?? 0) + 1;
    for (const l of m.linhas) {
      const partes = [l.antecipacao && `antecipação: ${l.antecipacao}`, l.obs].filter(Boolean);
      if (partes.length) notas.push(`${formatarData(l.data).slice(0, 5)}: ${partes.join(' · ')}`);
    }
    const primeira = m.linhas[0];
    const estId = Number(
      insEst.run(
        quartoId.get(m.quartoCodigo),
        hospedeId[m.hospede],
        ent,
        sai,
        Math.max(1, ...m.linhas.map((l) => l.pessoas ?? 1)),
        primeira.valor ?? 0,
        status,
        primeira.hora,
        canceladaEm,
        notas.join('\n'),
        importacaoId,
        m.linhas.map((l) => l.linha).join(','),
      ).lastInsertRowid,
    );
    for (const l of m.linhas) {
      insNoite.run(estId, l.data, l.valor ?? 0, l.linha);
      if (l.valor && l.valor > 0 && l.pagoBruto === 'PAGO') {
        const forma = FORMAS[l.formaBruta.toUpperCase()] ?? 'nao_informado';
        const conta = contas.get(l.contaBruta.toUpperCase());
        const obs = [
          forma === 'nao_informado' && l.formaBruta && `Coluna C D P na planilha: ${l.formaBruta}`,
          !conta && l.contaBruta && `Coluna H V N na planilha: ${l.contaBruta}`,
        ]
          .filter(Boolean)
          .join(' · ');
        insPag.run(estId, l.valor, forma, conta ?? null, l.data, obs, importacaoId, l.linha);
        pagamentos++;
        somaPagamentos += l.valor;
      }
    }
  }

  const ativos = codigos.filter((c) => c !== SEM_QUARTO && usoQuarto.get(c)!.ultima >= limiteAtivo);
  return {
    estadias: montadas.length,
    porStatus,
    hospedes: hospedes.length,
    quartos: codigos.length,
    quartosAtivos: ativos,
    noitesComDoisClientes,
    pagamentos,
    somaPagamentos,
  };
}

// ───────────────────────── Despesas ─────────────────────────

// Categoria da planilha (sem acento, maiúsculas) → categoria do sistema (seção 8.2)
const CATEGORIAS: Record<string, string> = {
  'CAFE DA MANHA': 'Café da manhã',
  ALIMENTACAO: 'Alimentação',
  FUNCIONARIOS: 'Funcionários',
  MANUTENCAO: 'Manutenção',
  LAVANDERIA: 'Lavanderia',
  'MATERIAL LIMPEZA': 'Material de limpeza',
  'CONTA LUZ': 'Conta de luz',
  'CONTA DE LUZ': 'Conta de luz',
  'AGUA E ESGOTO': 'Água e esgoto',
  INTERNET: 'Internet',
  TELEFONE: 'Telefone',
  GAZ: 'Gás',
  'CONTA GAZ': 'Gás',
  COMBUSTIVEL: 'Combustível',
  IMPOSTOS: 'Impostos',
  IMPOSTO: 'Impostos',
  CONTABILIDADE: 'Contabilidade',
  SEGUROS: 'Seguros',
  ENXOVAL: 'Enxoval',
  CONSTRUCAO: 'Construção',
  'PRO-LABORE': 'Pró-labore',
};

function importarDespesas(
  banco: Banco,
  linhas: LinhaDespesa[],
  importacaoId: number,
  pendente: (p: Pendencia) => void,
) {
  const A = ABA_DESPESAS;
  const catId = new Map(
    (banco.prepare('SELECT id, nome FROM categorias').all() as { id: number; nome: string }[]).map((c) => [
      normalizarBusca(c.nome),
      c.id,
    ]),
  );
  const criadas: string[] = [];
  const insCat = banco.prepare(`INSERT INTO categorias (nome, grupo, ordem) VALUES (?, 'operacao', 90)`);
  function categoria(l: LinhaDespesa): number {
    const tipo = normalizarBusca(l.tipo);
    let nome: string;
    if (tipo === 'IMOBILIZADO') {
      nome = normalizarBusca(l.fornecedor).startsWith('FINAN SICOOB') ? 'Financiamento Sicoob' : 'Equipamentos e móveis';
    } else if (tipo === 'HOSPEDAGENS') {
      nome = 'Hospedagens (conferir)';
    } else {
      nome = CATEGORIAS[tipo] ?? (primeiraMaiuscula(l.tipo) || 'Sem categoria');
    }
    const k = normalizarBusca(nome);
    let id = catId.get(k);
    if (id === undefined) {
      id = Number(insCat.run(nome).lastInsertRowid);
      catId.set(k, id);
      criadas.push(nome);
    }
    return id;
  }

  const insDesp = banco.prepare(
    `INSERT INTO despesas (data, categoria_id, fornecedor, descricao, valor, forma, obs, importacao_id, linha_planilha)
     VALUES (?, ?, ?, ?, ?, 'nao_informado', ?, ?, ?)`,
  );
  const insRec = banco.prepare(
    `INSERT INTO receitas_planilha_antiga (importacao_id, data, valor, descricao, linha) VALUES (?, ?, ?, ?, ?)`,
  );
  let importadas = 0;
  let soReceita = 0;
  let semValor = 0;
  let ambas = 0;
  let receitas = 0;
  let somaReceitas = 0;
  for (const l of linhas) {
    const base = { aba: A, linha: l.linha };
    const quem = `${formatarData(l.data)}, ${l.tipo || 'sem tipo'}, ${l.fornecedor || 'sem fornecedor'}`;
    if (l.receita !== null) {
      insRec.run(importacaoId, l.data, l.receita, [l.fornecedor, l.descricao].filter(Boolean).join(' · '), l.linha);
      receitas++;
      somaReceitas += l.receita;
    }
    if (l.valor > 0) {
      const obs = l.colunaJTexto ? `Coluna J na planilha: ${l.colunaJTexto}` : '';
      insDesp.run(l.data, categoria(l), l.fornecedor, l.descricao, l.valor, obs, importacaoId, l.linha);
      importadas++;
      if (l.receita !== null) {
        ambas++;
        pendente({
          ...base,
          tipo: 'despesa_e_receita',
          mensagem: `${quem}: tem despesa (G × H) e receita (coluna J). A despesa entrou; a receita ficou só na conferência.`,
          dados: { despesa: l.valor, receita: l.receita },
        });
      }
    } else if (l.receita !== null) {
      soReceita++;
    } else {
      semValor++;
      pendente({
        ...base,
        tipo: 'despesa_sem_valor',
        mensagem: `${quem}: "${l.descricao}" sem valor unitário. Não foi importada.${l.colunaK ? ` Coluna K: ${l.colunaK}.` : ''}`,
        dados: { colunaK: l.colunaK, colunaJ: l.colunaJTexto },
      });
    }
    if ((l.totalPlanilha ?? 0) !== l.valor) {
      pendente({
        ...base,
        tipo: 'total_diferente',
        mensagem: `${quem}: G × H dá ${(l.valor / 100).toFixed(2).replace('.', ',')}, mas a coluna I mostra ${((l.totalPlanilha ?? 0) / 100).toFixed(2).replace('.', ',')}. Entrou o G × H.`,
        dados: { gxh: l.valor, colunaI: l.totalPlanilha },
      });
    }
  }
  const alimentacao = banco.prepare(`SELECT aviso FROM categorias WHERE nome = 'Alimentação'`).get() as
    | { aviso: string }
    | undefined;
  if (alimentacao?.aviso) {
    pendente({ aba: A, linha: null, tipo: 'categoria_aviso', mensagem: `Alimentação: ${alimentacao.aviso}` });
  }
  if (criadas.includes('Hospedagens (conferir)')) {
    pendente({
      aba: A,
      linha: null,
      tipo: 'categoria_aviso',
      mensagem: 'Categoria "Hospedagens (conferir)" foi criada para uma despesa lançada como HOSPEDAGENS. Mude a categoria dela.',
    });
  }
  return {
    linhasComData: linhas.length,
    importadas,
    soReceita,
    semValor,
    despesaEReceita: ambas,
    receitasAntigas: receitas,
    somaReceitasAntigas: somaReceitas,
    categoriasCriadas: criadas,
  };
}

// ───────────────────────── Conferência (seção 8.3) ─────────────────────────

function montarResumo(
  banco: Banco,
  planilha: Planilha,
  importacaoId: number,
  op: { arquivo: string; hoje: string },
  cad: ReturnType<typeof importarCadastro>,
  desp: ReturnType<typeof importarDespesas>,
  pendencias: Pendencia[],
): ResumoImportacao {
  // Lado "planilha": direto das linhas lidas. Lado "sistema": consulta ao banco já gravado.
  const noitesSistema = banco
    .prepare(
      `SELECT substr(n.data, 1, 7) AS mes, COUNT(*) AS q, SUM(n.valor) AS s
       FROM estadia_noites n JOIN estadias e ON e.id = n.estadia_id
       WHERE e.importacao_id = ? GROUP BY mes`,
    )
    .all(importacaoId) as { mes: string; q: number; s: number }[];
  const despSistema = banco
    .prepare(
      `SELECT substr(data, 1, 7) AS mes, COUNT(*) AS q, SUM(valor) AS s FROM despesas WHERE importacao_id = ? GROUP BY mes`,
    )
    .all(importacaoId) as { mes: string; q: number; s: number }[];

  const meses = new Map<string, ResumoImportacao['porMes'][number]>();
  const mes = (m: string) =>
    meses.get(m) ?? meses.set(m, { mes: m, diariasPlanilha: 0, somaPlanilha: 0, diariasSistema: 0, somaSistema: 0 }).get(m)!;
  for (const l of planilha.cadastro) {
    const x = mes(l.data.slice(0, 7));
    x.diariasPlanilha++;
    x.somaPlanilha += l.valor ?? 0;
  }
  for (const r of noitesSistema) {
    const x = mes(r.mes);
    x.diariasSistema = r.q;
    x.somaSistema = r.s;
  }
  const porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  const dMeses = new Map<string, { mes: string; somaPlanilha: number; somaSistema: number }>();
  const dm = (m: string) => dMeses.get(m) ?? dMeses.set(m, { mes: m, somaPlanilha: 0, somaSistema: 0 }).get(m)!;
  for (const l of planilha.despesas) dm(l.data.slice(0, 7)).somaPlanilha += l.valor;
  for (const r of despSistema) dm(r.mes).somaSistema = r.s;
  const despesasPorMes = [...dMeses.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  const rec = new Map<string, number>();
  for (const l of planilha.despesas) if (l.receita !== null) rec.set(l.data.slice(0, 7), (rec.get(l.data.slice(0, 7)) ?? 0) + l.receita);
  const receitaAntigaPorMes = [...new Set([...rec.keys(), ...porMes.map((p) => p.mes)])]
    .sort()
    .map((m) => {
      const receitaDigitada = rec.get(m) ?? 0;
      const diariasCadastro = meses.get(m)?.somaSistema ?? 0;
      return { mes: m, receitaDigitada, diariasCadastro, diferenca: receitaDigitada - diariasCadastro };
    });

  const somaPl = (f: (l: LinhaCadastro) => boolean) =>
    planilha.cadastro.filter(f).reduce((s, l) => s + (l.valor ?? 0), 0);
  const contaPl = (f: (l: LinhaCadastro) => boolean) => planilha.cadastro.filter(f).length;
  const sis = (filtro: string) =>
    banco
      .prepare(
        `SELECT COUNT(*) AS q, IFNULL(SUM(n.valor), 0) AS s FROM estadia_noites n JOIN estadias e ON e.id = n.estadia_id
         WHERE e.importacao_id = ? ${filtro}`,
      )
      .get(importacaoId) as { q: number; s: number };
  const validacao: LinhaValidacao[] = [];
  const total = sis('');
  validacao.push({ item: 'Diárias com data no cadastro', planilha: planilha.cadastro.length, sistema: total.q, dinheiro: false });
  validacao.push({ item: 'Soma das diárias', planilha: somaPl(() => true), sistema: total.s, dinheiro: true });
  const anos = [...new Set(planilha.cadastro.map((l) => l.data.slice(0, 4)))].sort();
  for (const a of anos) {
    const s = sis(`AND substr(n.data, 1, 4) = '${a}'`);
    validacao.push({ item: `Diárias ${a}`, planilha: contaPl((l) => l.data.startsWith(a)), sistema: s.q, dinheiro: false });
    validacao.push({ item: `Soma ${a}`, planilha: somaPl((l) => l.data.startsWith(a)), sistema: s.s, dinheiro: true });
  }
  const despTotal = banco
    .prepare('SELECT COUNT(*) AS q, IFNULL(SUM(valor), 0) AS s FROM despesas WHERE importacao_id = ?')
    .get(importacaoId) as { q: number; s: number };
  const recTotal = banco
    .prepare('SELECT COUNT(*) AS q, IFNULL(SUM(valor), 0) AS s FROM receitas_planilha_antiga WHERE importacao_id = ?')
    .get(importacaoId) as { q: number; s: number };
  const pendDespSemValor = pendencias.filter((p) => p.tipo === 'despesa_sem_valor').length;
  validacao.push({
    item: 'Linhas de despesa (com data)',
    planilha: planilha.despesas.length,
    // cada linha vira despesa, receita antiga ou pendência; as que são as duas contam uma vez
    sistema: despTotal.q + recTotal.q - desp.despesaEReceita + pendDespSemValor,
    dinheiro: false,
  });
  validacao.push({
    item: 'Soma das despesas (G × H)',
    planilha: planilha.despesas.reduce((s, l) => s + l.valor, 0),
    sistema: despTotal.s,
    dinheiro: true,
  });
  validacao.push({
    item: 'Receitas antigas da aba DESPESAS (só conferência)',
    planilha: planilha.despesas.reduce((s, l) => s + (l.receita ?? 0), 0),
    sistema: recTotal.s,
    dinheiro: true,
  });

  const contagem: Record<string, number> = {};
  for (const p of pendencias) contagem[p.tipo] = (contagem[p.tipo] ?? 0) + 1;

  return {
    arquivo: op.arquivo,
    hoje: op.hoje,
    validacao,
    porMes,
    despesasPorMes,
    receitaAntigaPorMes,
    totaisNoTopoDaPlanilha: planilha.totaisDaPlanilha,
    estadias: {
      total: cad.estadias,
      porStatus: cad.porStatus,
      hospedes: cad.hospedes,
      quartos: cad.quartos,
      quartosAtivos: cad.quartosAtivos,
      noitesComDoisClientes: cad.noitesComDoisClientes,
      pagamentos: cad.pagamentos,
      somaPagamentos: cad.somaPagamentos,
    },
    despesas: desp,
    faturamentoMeses: planilha.faturamento.length,
    pendencias: contagem,
  };
}
