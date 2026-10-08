// Estrutura inicial do banco. Regras gerais:
// - dinheiro sempre em centavos (INTEGER);
// - datas de negócio (noite, pagamento, despesa, vencimento) como 'AAAA-MM-DD' no fuso do hotel;
// - instantes (chegou, saiu, criado_em) como ISO em UTC ('2026-10-08T16:40:00.000Z');
// - nada que envolve dinheiro é apagado: usa cancelado_em / ativa / status.

const AGORA = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const CARIMBOS = `criado_em TEXT NOT NULL DEFAULT ${AGORA},
  atualizado_em TEXT NOT NULL DEFAULT ${AGORA}`;

const ATIVA_PRE_RESERVA = (t: string) =>
  `(${t}.status IN ('confirmada','hospedado') OR (${t}.status = 'pre_reserva' AND ${t}.pre_reserva_expira_em > ${AGORA}))`;

const TABELAS = [
  'config', 'usuarios', 'sessoes', 'auditoria', 'quartos', 'quarto_fotos', 'tarifas',
  'contas_recebedoras', 'hospedes', 'estadias', 'estadia_noites', 'pagamentos', 'categorias',
  'despesas', 'contas_recorrentes', 'contas_a_pagar', 'funcionarias', 'vales', 'importacoes',
  'importacao_pendencias', 'receitas_planilha_antiga', 'faturamento_historico', 'backups',
];

const gatilhosAtualizadoEm = TABELAS.map(
  (t) => `CREATE TRIGGER ${t}_atualizado_em AFTER UPDATE ON ${t}
  WHEN NEW.atualizado_em = OLD.atualizado_em
  BEGIN UPDATE ${t} SET atualizado_em = ${AGORA} WHERE rowid = NEW.rowid; END;`,
).join('\n');

export default `
CREATE TABLE config (
  id INTEGER PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  ${CARIMBOS}
);

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  ${CARIMBOS}
);

CREATE TABLE sessoes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  token_hash TEXT NOT NULL UNIQUE,
  lembrar INTEGER NOT NULL DEFAULT 0,
  expira_em TEXT NOT NULL,
  ultimo_uso_em TEXT,
  encerrada_em TEXT,
  ${CARIMBOS}
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  em TEXT NOT NULL DEFAULT ${AGORA},
  usuario_id INTEGER REFERENCES usuarios(id),
  tabela TEXT NOT NULL,
  registro_id INTEGER,
  acao TEXT NOT NULL,
  antes TEXT,
  depois TEXT,
  ${CARIMBOS}
);
CREATE INDEX auditoria_registro ON auditoria(tabela, registro_id);

CREATE TABLE quartos (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL DEFAULT '',
  capacidade INTEGER NOT NULL DEFAULT 2 CHECK (capacidade >= 1),
  descricao TEXT NOT NULL DEFAULT '',
  comodidades TEXT NOT NULL DEFAULT '[]',
  ativo INTEGER NOT NULL DEFAULT 1,
  mostrar_no_site INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  estado_limpeza TEXT NOT NULL DEFAULT 'limpo' CHECK (estado_limpeza IN ('limpo','limpar')),
  limpar_desde TEXT,
  ${CARIMBOS}
);

CREATE TABLE quarto_fotos (
  id INTEGER PRIMARY KEY,
  quarto_id INTEGER NOT NULL REFERENCES quartos(id),
  arquivo TEXT NOT NULL,
  miniatura TEXT NOT NULL,
  capa INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  arquivada_em TEXT,
  ${CARIMBOS}
);
CREATE INDEX quarto_fotos_quarto ON quarto_fotos(quarto_id);

-- quarto_id vazio = tabela geral; preenchido = exceção daquele quarto
CREATE TABLE tarifas (
  id INTEGER PRIMARY KEY,
  quarto_id INTEGER REFERENCES quartos(id),
  pessoas INTEGER NOT NULL CHECK (pessoas >= 1),
  valor INTEGER NOT NULL CHECK (valor >= 0),
  ${CARIMBOS}
);
CREATE UNIQUE INDEX tarifas_unica ON tarifas(IFNULL(quarto_id, 0), pessoas);

-- Quem recebeu o dinheiro (H = Hugo, V = Valdo, N = Nereide na planilha)
CREATE TABLE contas_recebedoras (
  id INTEGER PRIMARY KEY,
  sigla TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  ${CARIMBOS}
);

CREATE TABLE hospedes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,
  cpf_cnpj TEXT,
  telefone TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  obs TEXT NOT NULL DEFAULT '',
  ${CARIMBOS}
);
CREATE UNIQUE INDEX hospedes_cpf ON hospedes(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX hospedes_telefone ON hospedes(telefone);
CREATE INDEX hospedes_nome ON hospedes(nome_busca);

-- data_saida é exclusiva: estadia de 1 noite em 08/10 tem saída 09/10
CREATE TABLE estadias (
  id INTEGER PRIMARY KEY,
  quarto_id INTEGER NOT NULL REFERENCES quartos(id),
  hospede_id INTEGER NOT NULL REFERENCES hospedes(id),
  data_entrada TEXT NOT NULL,
  data_saida TEXT NOT NULL,
  pessoas INTEGER NOT NULL DEFAULT 1 CHECK (pessoas >= 1),
  valor_diaria INTEGER NOT NULL DEFAULT 0 CHECK (valor_diaria >= 0),
  motivo_valor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN
    ('pre_reserva','confirmada','hospedado','finalizada','cancelada','no_show','expirada')),
  origem TEXT NOT NULL DEFAULT 'balcao' CHECK (origem IN ('balcao','whatsapp','link','planilha')),
  hora_chegada_prevista TEXT,
  chegada_real_em TEXT,
  saida_real_em TEXT,
  sinal_previsto INTEGER NOT NULL DEFAULT 0,
  pre_reserva_expira_em TEXT,
  reservado_em TEXT,
  cancelada_em TEXT,
  obs TEXT NOT NULL DEFAULT '',
  importacao_id INTEGER REFERENCES importacoes(id),
  linhas_planilha TEXT,
  ${CARIMBOS},
  CHECK (data_saida > data_entrada)
);
CREATE INDEX estadias_quarto_datas ON estadias(quarto_id, data_entrada, data_saida);
CREATE INDEX estadias_hospede ON estadias(hospede_id);
CREATE INDEX estadias_status ON estadias(status);

-- Regra anti-overbooking (seção 4): duas estadias ativas não podem dividir noites
-- no mesmo quarto. O serviço também confere antes, dentro de transação; este
-- gatilho é a segunda barreira, que vale até para quem mexer no banco por fora.
CREATE TRIGGER estadias_sem_sobreposicao_insert BEFORE INSERT ON estadias
WHEN ${ATIVA_PRE_RESERVA('NEW')}
BEGIN
  SELECT RAISE(ABORT, 'QUARTO_OCUPADO') WHERE EXISTS (
    SELECT 1 FROM estadias e
    WHERE e.quarto_id = NEW.quarto_id
      AND e.data_entrada < NEW.data_saida AND e.data_saida > NEW.data_entrada
      AND ${ATIVA_PRE_RESERVA('e')});
END;

CREATE TRIGGER estadias_sem_sobreposicao_update
BEFORE UPDATE OF quarto_id, data_entrada, data_saida, status, pre_reserva_expira_em ON estadias
WHEN ${ATIVA_PRE_RESERVA('NEW')}
BEGIN
  SELECT RAISE(ABORT, 'QUARTO_OCUPADO') WHERE EXISTS (
    SELECT 1 FROM estadias e
    WHERE e.quarto_id = NEW.quarto_id AND e.id <> NEW.id
      AND e.data_entrada < NEW.data_saida AND e.data_saida > NEW.data_entrada
      AND ${ATIVA_PRE_RESERVA('e')});
END;

-- Uma linha por noite vendida, com o valor daquela noite
CREATE TABLE estadia_noites (
  id INTEGER PRIMARY KEY,
  estadia_id INTEGER NOT NULL REFERENCES estadias(id),
  data TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor >= 0),
  linha_planilha INTEGER,
  ${CARIMBOS}
);
CREATE INDEX estadia_noites_estadia ON estadia_noites(estadia_id, data);
CREATE INDEX estadia_noites_data ON estadia_noites(data);

CREATE TABLE pagamentos (
  id INTEGER PRIMARY KEY,
  estadia_id INTEGER NOT NULL REFERENCES estadias(id),
  valor INTEGER NOT NULL CHECK (valor > 0),
  forma TEXT NOT NULL CHECK (forma IN ('pix','cartao','dinheiro','nao_informado')),
  tipo TEXT NOT NULL CHECK (tipo IN ('sinal','saldo','diaria','devolucao')),
  conta_recebedora_id INTEGER REFERENCES contas_recebedoras(id),
  data TEXT NOT NULL,
  obs TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  cancelado_em TEXT,
  cancelado_por INTEGER REFERENCES usuarios(id),
  importacao_id INTEGER REFERENCES importacoes(id),
  linha_planilha INTEGER,
  ${CARIMBOS}
);
CREATE INDEX pagamentos_estadia ON pagamentos(estadia_id);
CREATE INDEX pagamentos_data ON pagamentos(data);

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
  grupo TEXT NOT NULL CHECK (grupo IN
    ('operacao','obra','financiamento','investimento','casa_pessoal','retirada')),
  ativa INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 100,
  aviso TEXT NOT NULL DEFAULT '',
  ${CARIMBOS}
);

CREATE TABLE despesas (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  fornecedor TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  valor INTEGER NOT NULL CHECK (valor > 0),
  forma TEXT NOT NULL CHECK (forma IN ('pix','cartao','dinheiro','boleto','nao_informado')),
  conta_a_pagar_id INTEGER REFERENCES contas_a_pagar(id),
  vale_id INTEGER REFERENCES vales(id),
  obs TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  cancelado_em TEXT,
  cancelado_por INTEGER REFERENCES usuarios(id),
  importacao_id INTEGER REFERENCES importacoes(id),
  linha_planilha INTEGER,
  ${CARIMBOS}
);
CREATE INDEX despesas_data ON despesas(data);
CREATE INDEX despesas_categoria ON despesas(categoria_id);

CREATE TABLE contas_recorrentes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  fornecedor TEXT NOT NULL DEFAULT '',
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  valor_previsto INTEGER,
  valor_variavel INTEGER NOT NULL DEFAULT 0,
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  parcelas_restantes INTEGER CHECK (parcelas_restantes IS NULL OR parcelas_restantes >= 0),
  avisar_dias_antes INTEGER NOT NULL DEFAULT 3,
  ativa INTEGER NOT NULL DEFAULT 1,
  obs TEXT NOT NULL DEFAULT '',
  ${CARIMBOS}
);

-- "atrasada" não é gravada: é calculada pela data de vencimento
CREATE TABLE contas_a_pagar (
  id INTEGER PRIMARY KEY,
  recorrente_id INTEGER REFERENCES contas_recorrentes(id),
  funcionaria_id INTEGER REFERENCES funcionarias(id),
  descricao TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  fornecedor TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL,
  vencimento TEXT NOT NULL,
  valor_previsto INTEGER,
  valor_variavel INTEGER NOT NULL DEFAULT 0,
  valor_pago INTEGER,
  data_pagamento TEXT,
  forma TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  despesa_id INTEGER REFERENCES despesas(id),
  avisar_dias_antes INTEGER NOT NULL DEFAULT 3,
  obs TEXT NOT NULL DEFAULT '',
  ${CARIMBOS}
);
CREATE UNIQUE INDEX contas_recorrente_mes ON contas_a_pagar(recorrente_id, competencia)
  WHERE recorrente_id IS NOT NULL AND status <> 'cancelada';
CREATE UNIQUE INDEX contas_salario_mes ON contas_a_pagar(funcionaria_id, competencia)
  WHERE funcionaria_id IS NOT NULL AND status <> 'cancelada';
CREATE INDEX contas_vencimento ON contas_a_pagar(vencimento);

CREATE TABLE funcionarias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  salario INTEGER NOT NULL DEFAULT 0 CHECK (salario >= 0),
  dia_pagamento INTEGER NOT NULL DEFAULT 5 CHECK (dia_pagamento BETWEEN 1 AND 31),
  ativa INTEGER NOT NULL DEFAULT 1,
  ${CARIMBOS}
);

CREATE TABLE vales (
  id INTEGER PRIMARY KEY,
  funcionaria_id INTEGER NOT NULL REFERENCES funcionarias(id),
  data TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor > 0),
  forma TEXT NOT NULL DEFAULT 'dinheiro',
  obs TEXT NOT NULL DEFAULT '',
  despesa_id INTEGER REFERENCES despesas(id),
  cancelado_em TEXT,
  ${CARIMBOS}
);
CREATE INDEX vales_funcionaria ON vales(funcionaria_id, data);

CREATE TABLE importacoes (
  id INTEGER PRIMARY KEY,
  arquivo TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  feita_em TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  resumo TEXT NOT NULL DEFAULT '{}',
  ${CARIMBOS}
);

CREATE TABLE importacao_pendencias (
  id INTEGER PRIMARY KEY,
  importacao_id INTEGER NOT NULL REFERENCES importacoes(id),
  aba TEXT NOT NULL,
  linha INTEGER,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  resolvida_em TEXT,
  resolvida_obs TEXT NOT NULL DEFAULT '',
  ${CARIMBOS}
);
CREATE INDEX pendencias_tipo ON importacao_pendencias(importacao_id, tipo);

-- Receita como era digitada na aba DESPESAS: só para conferência, nunca entra no caixa
CREATE TABLE receitas_planilha_antiga (
  id INTEGER PRIMARY KEY,
  importacao_id INTEGER NOT NULL REFERENCES importacoes(id),
  data TEXT NOT NULL,
  valor INTEGER NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  linha INTEGER,
  ${CARIMBOS}
);

CREATE TABLE faturamento_historico (
  id INTEGER PRIMARY KEY,
  importacao_id INTEGER REFERENCES importacoes(id),
  mes TEXT NOT NULL UNIQUE,
  valor INTEGER NOT NULL,
  ${CARIMBOS}
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY,
  feito_em TEXT NOT NULL,
  destino TEXT NOT NULL,
  arquivo TEXT,
  tamanho INTEGER,
  ok INTEGER NOT NULL,
  erro TEXT,
  ${CARIMBOS}
);

-- Pagamento de devolução conta negativo; cancelados não contam
CREATE VIEW pagamentos_validos AS
  SELECT p.*, CASE WHEN p.tipo = 'devolucao' THEN -p.valor ELSE p.valor END AS valor_liquido
  FROM pagamentos p WHERE p.cancelado_em IS NULL;

CREATE VIEW estadias_valores AS
  SELECT e.id AS estadia_id,
    (SELECT IFNULL(SUM(n.valor), 0) FROM estadia_noites n WHERE n.estadia_id = e.id) AS total,
    (SELECT IFNULL(SUM(p.valor_liquido), 0) FROM pagamentos_validos p WHERE p.estadia_id = e.id) AS pago
  FROM estadias e;

${gatilhosAtualizadoEm}
`;
