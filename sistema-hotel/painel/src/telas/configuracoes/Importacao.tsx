import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, Dinheiro, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { dataHora, emReais, nomeMes } from '../../formato';

interface LinhaValidacao {
  item: string;
  planilha: number;
  sistema: number;
  dinheiro: boolean;
}

interface Importacao {
  id: number;
  arquivo: string;
  feitaEm: string;
  resumo: {
    validacao: LinhaValidacao[];
    porMes: { mes: string; diariasPlanilha: number; somaPlanilha: number; diariasSistema: number; somaSistema: number }[];
    receitaAntigaPorMes: { mes: string; receitaDigitada: number; diariasCadastro: number; diferenca: number }[];
    totaisNoTopoDaPlanilha: { cadastroValor: number | null; despesasColunaI: number | null };
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
    despesas: { importadas: number; receitasAntigas: number; categoriasCriadas: string[] };
    faturamentoMeses: number;
  };
  grupos: { tipo: string; titulo: string; total: number; abertas: number }[];
}

export function TelaImportacao() {
  const dados = useQuery({
    queryKey: ['importacao'],
    queryFn: () => api.get<{ importacao: Importacao | null; podeImportar: boolean }>('/api/importacao'),
  });
  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const imp = dados.data!.importacao;
  return (
    <>
      {!imp && dados.data!.podeImportar && <EnviarPlanilha />}
      {!imp && !dados.data!.podeImportar && (
        <div className="cartao">
          <p>O sistema já tem lançamentos feitos à mão, então a planilha antiga não pode mais ser importada.</p>
        </div>
      )}
      {imp && <Resultado imp={imp} />}
    </>
  );
}

function EnviarPlanilha() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const cliente = useQueryClient();
  const enviar = useMutation({
    mutationFn: async () => {
      const f = new FormData();
      f.append('planilha', arquivo!);
      return api.post('/api/importacao', f);
    },
    onSuccess: () => cliente.invalidateQueries(),
  });
  return (
    <div className="cartao">
      <h2>Importar a planilha antiga</h2>
      <p>
        Escolha o arquivo <strong>LANÇAMENTOS ATUAIS</strong> (.xlsx). O sistema traz os hóspedes, as diárias, os
        pagamentos e as despesas, e confere se os totais batem com a planilha.
      </p>
      <p className="suave">Use a versão mais recente da planilha. A importação só pode ser feita uma vez.</p>
      <div className="campo">
        <label htmlFor="arquivo">Arquivo da planilha</label>
        <input
          id="arquivo"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
      </div>
      <MensagemErro erro={enviar.error} />
      <button className="botao principal grande" disabled={!arquivo || enviar.isPending} onClick={() => enviar.mutate()}>
        {enviar.isPending ? 'Importando… (pode levar alguns segundos)' : 'Importar'}
      </button>
    </div>
  );
}

function valor(v: number, dinheiro: boolean) {
  return dinheiro ? emReais(v) : v.toLocaleString('pt-BR');
}

function Resultado({ imp }: { imp: Importacao }) {
  const r = imp.resumo;
  const tudoBate = r.validacao.every((v) => v.planilha === v.sistema);
  const mesesDiferentes = r.porMes.filter((m) => m.diariasPlanilha !== m.diariasSistema || m.somaPlanilha !== m.somaSistema);
  const [verMeses, setVerMeses] = useState(false);
  const [verReceita, setVerReceita] = useState(false);
  const STATUS: Record<string, string> = {
    finalizada: 'finalizadas',
    hospedado: 'hospedados agora',
    confirmada: 'reservas futuras',
    cancelada: 'canceladas (conflito)',
  };
  return (
    <>
      <div className="cartao">
        <div className="titulo-tela">
          <h2>Conferência dos totais</h2>
          {tudoBate ? <Etiqueta estado="pago">Tudo bate com a planilha</Etiqueta> : <Etiqueta estado="atrasado">Há diferenças</Etiqueta>}
        </div>
        <p className="suave">
          Planilha <strong>{imp.arquivo}</strong>, importada em {dataHora(imp.feitaEm)}.
        </p>
        <div className="rolagem-x">
          <table className="tabela">
            <thead>
              <tr>
                <th>Verificação</th>
                <th className="numero">Planilha</th>
                <th className="numero">Sistema</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {r.validacao.map((v) => (
                <tr key={v.item}>
                  <td>{v.item}</td>
                  <td className="numero">{valor(v.planilha, v.dinheiro)}</td>
                  <td className="numero">{valor(v.sistema, v.dinheiro)}</td>
                  <td>
                    {v.planilha === v.sistema ? (
                      <Etiqueta estado="pago">Bate</Etiqueta>
                    ) : (
                      <Etiqueta estado="atrasado">Diferente</Etiqueta>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.totaisNoTopoDaPlanilha.despesasColunaI !== null && (
          <p className="suave pequeno" style={{ marginTop: 10 }}>
            O topo da aba DESPESAS mostra {emReais(r.totaisNoTopoDaPlanilha.despesasColunaI)} (soma da coluna I). O sistema usa
            quantidade × valor unitário, como manda a especificação; as linhas que explicam a diferença estão em "Para
            conferir".
          </p>
        )}
        <div className="botoes" style={{ marginTop: 10 }}>
          <button className="botao pequeno" onClick={() => setVerMeses(!verMeses)}>
            {verMeses ? 'Esconder mês a mês' : `Ver mês a mês${mesesDiferentes.length ? ` (${mesesDiferentes.length} com diferença)` : ''}`}
          </button>
          <button className="botao pequeno" onClick={() => setVerReceita(!verReceita)}>
            {verReceita ? 'Esconder receita antiga' : 'Receita digitada × cadastro'}
          </button>
        </div>
        {verMeses && (
          <div className="rolagem-x" style={{ marginTop: 12 }}>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="numero">Diárias (planilha)</th>
                  <th className="numero">Diárias (sistema)</th>
                  <th className="numero">Soma (planilha)</th>
                  <th className="numero">Soma (sistema)</th>
                </tr>
              </thead>
              <tbody>
                {r.porMes.map((m) => (
                  <tr key={m.mes}>
                    <td>{nomeMes(m.mes)}</td>
                    <td className="numero">{m.diariasPlanilha}</td>
                    <td className="numero">{m.diariasSistema}</td>
                    <td className="numero">{emReais(m.somaPlanilha)}</td>
                    <td className="numero">{emReais(m.somaSistema)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {verReceita && (
          <div style={{ marginTop: 12 }}>
            <p className="suave">
              Na planilha antiga a receita era digitada de novo na aba DESPESAS. Ela <strong>não</strong> entra no caixa do
              sistema; serve só para ver o quanto não batia com as diárias do cadastro.
            </p>
            <div className="rolagem-x">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="numero">Receita digitada</th>
                    <th className="numero">Diárias do cadastro</th>
                    <th className="numero">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {r.receitaAntigaPorMes.map((m) => (
                    <tr key={m.mes}>
                      <td>{nomeMes(m.mes)}</td>
                      <td className="numero">{emReais(m.receitaDigitada)}</td>
                      <td className="numero">{emReais(m.diariasCadastro)}</td>
                      <td className="numero">{emReais(m.diferenca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="cartao">
        <h2>O que entrou no sistema</h2>
        <ul>
          <li>
            {r.estadias.total.toLocaleString('pt-BR')} hospedagens (
            {Object.entries(r.estadias.porStatus)
              .map(([s, n]) => `${n.toLocaleString('pt-BR')} ${STATUS[s] ?? s}`)
              .join(', ')}
            )
          </li>
          <li>{r.estadias.hospedes.toLocaleString('pt-BR')} hóspedes</li>
          <li>
            {r.estadias.pagamentos.toLocaleString('pt-BR')} pagamentos, somando <Dinheiro valor={r.estadias.somaPagamentos} />
          </li>
          <li>
            {r.estadias.quartos} quartos; ativos: {r.estadias.quartosAtivos.join(', ')}. Os outros ficaram desativados (o
            histórico continua lá). Confira em Quartos → Editar quartos.
          </li>
          <li>{r.estadias.noitesComDoisClientes} noites em que o quarto foi alugado de novo na mesma noite (normal: hóspede saiu antes)</li>
          <li>{r.despesas.importadas.toLocaleString('pt-BR')} despesas</li>
          {r.despesas.categoriasCriadas.length > 0 && <li>Categorias novas: {r.despesas.categoriasCriadas.join(', ')}</li>}
          <li>{r.faturamentoMeses} meses de faturamento antigo (2023 a jan/2025), só para comparação</li>
        </ul>
      </div>

      <ParaConferir grupos={imp.grupos} />
    </>
  );
}

function ParaConferir({ grupos }: { grupos: Importacao['grupos'] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const abertas = grupos.reduce((s, g) => s + g.abertas, 0);
  return (
    <div className="cartao">
      <h2>Para conferir ({abertas.toLocaleString('pt-BR')})</h2>
      <p className="suave">
        Nada foi apagado nem corrigido sozinho. Abra cada grupo, confira na planilha ou com quem lançou, corrija no sistema se
        precisar e marque "Conferido".
      </p>
      <ul className="lista">
        {grupos.map((g) => (
          <li key={g.tipo} style={{ display: 'block' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="principal-item">
                <div className="nome">{g.titulo}</div>
                <div className="suave pequeno">
                  {g.abertas === 0 ? 'Tudo conferido' : `${g.abertas} de ${g.total} para conferir`}
                </div>
              </div>
              {g.abertas === 0 ? <Etiqueta estado="pago">Conferido</Etiqueta> : <Etiqueta estado="chega">{g.abertas}</Etiqueta>}
              <button className="botao pequeno" onClick={() => setAberto(aberto === g.tipo ? null : g.tipo)}>
                {aberto === g.tipo ? 'Fechar' : 'Ver'}
              </button>
            </div>
            {aberto === g.tipo && <ListaPendencias tipo={g.tipo} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListaPendencias({ tipo }: { tipo: string }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const lista = useQuery({
    queryKey: ['pendencias', tipo],
    queryFn: () =>
      api.get<{ pendencias: { id: number; aba: string; linha: number | null; mensagem: string; resolvida_em: string | null }[] }>(
        `/api/importacao/pendencias?tipo=${encodeURIComponent(tipo)}`,
      ),
  });
  const marcar = useMutation({
    mutationFn: ({ id, resolvida }: { id: number; resolvida: boolean }) =>
      api.put(`/api/importacao/pendencias/${id}`, { resolvida }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['pendencias', tipo] });
      cliente.invalidateQueries({ queryKey: ['importacao'] });
    },
    onError: (e) => avisar((e as Error).message, { erro: true }),
  });
  if (lista.isLoading) return <p className="suave">Carregando…</p>;
  return (
    <ul className="lista" style={{ marginTop: 8, paddingLeft: 12, borderLeft: '4px solid var(--linha)' }}>
      {lista.data?.pendencias.map((p) => (
        <li key={p.id}>
          <div className="principal-item">
            <div>{p.mensagem}</div>
            {p.linha && (
              <div className="suave pequeno">
                Aba {p.aba}, linha {p.linha}
              </div>
            )}
          </div>
          <button
            className={`botao pequeno${p.resolvida_em ? ' verde' : ''}`}
            onClick={() => marcar.mutate({ id: p.id, resolvida: !p.resolvida_em })}
          >
            {p.resolvida_em ? '✓ Conferido' : 'Marcar conferido'}
          </button>
        </li>
      ))}
    </ul>
  );
}
