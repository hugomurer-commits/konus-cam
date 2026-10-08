// Valores pré-carregados (seções 5.6, 7.1 e 8.2). Tudo editável depois na tela.

const POLITICA =
  'Para garantir sua reserva, cobramos 30% do valor como sinal. Se você cancelar em até 7 dias ' +
  'depois de fazer a reserva, devolvemos o sinal. Depois desse prazo, ou se não comparecer, o ' +
  'sinal fica como garantia e não é devolvido. O restante é pago na chegada.';

const config: [string, string][] = [
  ['nome_hotel', 'Hotel Tropical'],
  ['cidade_hotel', 'Cacoal/RO'],
  ['cnpj', ''],
  ['pix_chave', ''],
  ['pix_nome_recebedor', ''],
  ['pix_cidade_recebedor', 'CACOAL'],
  ['whatsapp_hotel', ''],
  ['sinal_percentual', '30'],
  ['minutos_segura', '30'],
  ['hora_checkin', '12:00'],
  ['hora_checkout', '12:00'],
  ['politica_cancelamento', POLITICA],
  ['backup_pasta', ''],
];

// [nome, grupo, ordem, aviso]
const categorias: [string, string, number, string][] = [
  ['Café da manhã', 'operacao', 1, ''],
  ['Alimentação', 'operacao', 2,
    'Até out/2026 a planilha misturava compras da casa e do hotel. Daqui pra frente, compras da casa vão em "Compras da casa".'],
  ['Funcionários', 'operacao', 3, ''],
  ['Manutenção', 'operacao', 4, ''],
  ['Lavanderia', 'operacao', 5, ''],
  ['Material de limpeza', 'operacao', 6, ''],
  ['Conta de luz', 'operacao', 7, ''],
  ['Água e esgoto', 'operacao', 8, ''],
  ['Internet', 'operacao', 9, ''],
  ['Telefone', 'operacao', 10, ''],
  ['Gás', 'operacao', 11, ''],
  ['Combustível', 'operacao', 12, ''],
  ['Impostos', 'operacao', 13, ''],
  ['Contabilidade', 'operacao', 14, ''],
  ['Seguros', 'operacao', 15, ''],
  ['Enxoval', 'operacao', 16, ''],
  ['Construção', 'obra', 30, ''],
  ['Financiamento Sicoob', 'financiamento', 40, ''],
  ['Equipamentos e móveis', 'investimento', 50, ''],
  ['Compras da casa', 'casa_pessoal', 60, ''],
  ['Pró-labore', 'retirada', 70, ''],
];

// [nome, fornecedor, categoria, valor previsto (centavos) ou null, variável, dia, parcelas, obs]
const recorrentes: [string, string, string, number | null, number, number, number | null, string][] = [
  ['Financiamento Sicoob, parcela 1', 'Sicoob', 'Financiamento Sicoob', 136900, 1, 5, 9,
    'Valor decrescente. Confirmar dia e parcelas restantes no app do Sicoob.'],
  ['Financiamento Sicoob, parcela 2', 'Sicoob', 'Financiamento Sicoob', 242100, 1, 10, 9,
    'Confirmar dia e parcelas restantes no app do Sicoob.'],
  ['Energisa (luz)', 'Energisa', 'Conta de luz', 210000, 1, 21, null, 'Dia 21 confirmado pelo dono.'],
  ['SAAE (água)', 'SAAE', 'Água e esgoto', 25000, 1, 20, null, ''],
  ['Internet Duxnet', 'Duxnet', 'Internet', 13000, 0, 5, null, ''],
  ['Contabilidade', 'Gestão Contábil', 'Contabilidade', 46000, 0, 20, null, ''],
  ['Seguro Sicoob', 'Sicoob', 'Seguros', 14508, 0, 15, null, ''],
  ['Receita Federal (impostos)', 'Receita Federal', 'Impostos', null, 1, 20, null,
    'Conferir valor e dia com a contabilidade.'],
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export default [
  ...config.map(([c, v]) => `INSERT INTO config (chave, valor) VALUES (${q(c)}, ${q(v)});`),
  // Seção 5.6: 3 pessoas ainda a confirmar com o dono (planilha tem 250 e 300)
  `INSERT INTO tarifas (quarto_id, pessoas, valor) VALUES
     (NULL, 1, 15000), (NULL, 2, 20000), (NULL, 3, 30000), (NULL, 4, 40000), (NULL, 5, 50000);`,
  `INSERT INTO contas_recebedoras (sigla, nome, ordem) VALUES
     ('H', 'Hugo', 1), ('V', 'Valdo', 2), ('N', 'Nereide', 3);`,
  ...categorias.map(
    ([n, g, o, a]) =>
      `INSERT INTO categorias (nome, grupo, ordem, aviso) VALUES (${q(n)}, ${q(g)}, ${o}, ${q(a)});`,
  ),
  ...recorrentes.map(
    ([n, f, c, v, vv, d, p, obs]) =>
      `INSERT INTO contas_recorrentes
         (nome, fornecedor, categoria_id, valor_previsto, valor_variavel, dia_vencimento, parcelas_restantes, obs)
       VALUES (${q(n)}, ${q(f)}, (SELECT id FROM categorias WHERE nome = ${q(c)}), ${v ?? 'NULL'}, ${vv}, ${d}, ${p ?? 'NULL'}, ${q(obs)});`,
  ),
].join('\n');
