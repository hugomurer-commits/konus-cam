import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BedDouble,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  History,
  Info,
  PackageCheck,
  Receipt,
  Repeat,
  Scale,
  Tags,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ChipIcone, Dinheiro, Etiqueta, MensagemErro } from '../../componentes/Basicos';
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
        <div className="cartao aviso-cartao">
          <ChipIcone icone={Info} tom="tom-config" />
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
    <section className="cartao">
      <header className="cartao-topo">
        <ChipIcone icone={FileSpreadsheet} tom="tom-livre" />
        <h2>Importar a planilha antiga</h2>
      </header>
      <p>
        Escolha o arquivo <strong>LANÇAMENTOS ATUAIS</strong> (.xlsx). O sistema traz os hóspedes, as diárias, os
        pagamentos e as despesas, e confere se os totais batem com a planilha.
      </p>
      <p className="apoio">Use a versão mais recente da planilha. A importação só pode ser feita uma vez.</p>
      <div className="campo campo-arquivo">
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
        <Upload aria-hidden="true" />
        {enviar.isPending ? 'Importando… (pode levar alguns segundos)' : 'Importar'}
      </button>
    </section>
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
      <section className={`cartao cartao-lista ${tudoBate ? 'tom-livre' : 'tom-perigo'}`}>
        <header className="cartao-topo topo-quebra">
          <ChipIcone icone={ClipboardCheck} tom={tudoBate ? 'tom-livre' : 'tom-perigo'} />
          <h2>Conferência dos totais</h2>
          {tudoBate ? <Etiqueta estado="pago">Tudo bate com a planilha</Etiqueta> : <Etiqueta estado="atrasado">Há diferenças</Etiqueta>}
        </header>
        <p className="apoio">
          Planilha <strong>{imp.arquivo}</strong>, importada em {dataHora(imp.feitaEm)}.
        </p>
        <div className="rolagem-x">
          <table className="tabela tabela-conferencia">
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
                  <td className="item-verificacao">{v.item}</td>
                  <td className="numero" data-rotulo="Planilha">
                    {valor(v.planilha, v.dinheiro)}
                  </td>
                  <td className="numero" data-rotulo="Sistema">
                    {valor(v.sistema, v.dinheiro)}
                  </td>
                  <td className="resultado-verificacao">
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
          <p className="nota-importacao">
            O topo da aba DESPESAS mostra {emReais(r.totaisNoTopoDaPlanilha.despesasColunaI)} (soma da coluna I). O sistema usa
            quantidade × valor unitário, como manda a especificação; as linhas que explicam a diferença estão em "Para
            conferir".
          </p>
        )}
        <div className="botoes" style={{ marginTop: 14 }}>
          <button className="botao" aria-expanded={verMeses} onClick={() => setVerMeses(!verMeses)}>
            {verMeses ? <ChevronUp aria-hidden="true" /> : <CalendarRange aria-hidden="true" />}
            {verMeses ? 'Esconder mês a mês' : `Ver mês a mês${mesesDiferentes.length ? ` (${mesesDiferentes.length} com diferença)` : ''}`}
          </button>
          <button className="botao" aria-expanded={verReceita} onClick={() => setVerReceita(!verReceita)}>
            {verReceita ? <ChevronUp aria-hidden="true" /> : <Scale aria-hidden="true" />}
            {verReceita ? 'Esconder receita antiga' : 'Receita digitada × cadastro'}
          </button>
        </div>
        {verMeses && (
          <div className="rolagem-x" style={{ marginTop: 16 }}>
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
          <div style={{ marginTop: 16 }}>
            <p className="apoio">
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
      </section>

      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={PackageCheck} tom="tom-ocupado" />
          <h2>O que entrou no sistema</h2>
        </header>
        <ul className="resumo-importacao">
          <li className="largo">
            <ChipIcone icone={BedDouble} tom="tom-ocupado" />
            <span className="texto">
              <span className="numero-destaque">{r.estadias.total.toLocaleString('pt-BR')}</span> hospedagens (
              {Object.entries(r.estadias.porStatus)
                .map(([s, n]) => `${n.toLocaleString('pt-BR')} ${STATUS[s] ?? s}`)
                .join(', ')}
              )
            </span>
          </li>
          <li>
            <ChipIcone icone={Users} tom="tom-livre" />
            <span className="texto">
              <span className="numero-destaque">{r.estadias.hospedes.toLocaleString('pt-BR')}</span> hóspedes
            </span>
          </li>
          <li>
            <ChipIcone icone={Wallet} tom="tom-caixa" />
            <span className="texto">
              <span className="numero-destaque">{r.estadias.pagamentos.toLocaleString('pt-BR')}</span> pagamentos, somando{' '}
              <Dinheiro valor={r.estadias.somaPagamentos} className="forte" />
            </span>
          </li>
          <li className="largo">
            <ChipIcone icone={DoorOpen} tom="tom-livre" />
            <span className="texto">
              <span className="numero-destaque">{r.estadias.quartos}</span> quartos; ativos: {r.estadias.quartosAtivos.join(', ')}. Os
              outros ficaram desativados (o histórico continua lá). Confira em Quartos → Editar quartos.
            </span>
          </li>
          <li className="largo">
            <ChipIcone icone={Repeat} tom="tom-sai" />
            <span className="texto">
              <span className="numero-destaque">{r.estadias.noitesComDoisClientes}</span> noites em que o quarto foi alugado de novo na
              mesma noite (normal: hóspede saiu antes)
            </span>
          </li>
          <li>
            <ChipIcone icone={Receipt} tom="tom-contas" />
            <span className="texto">
              <span className="numero-destaque">{r.despesas.importadas.toLocaleString('pt-BR')}</span> despesas
            </span>
          </li>
          <li>
            <ChipIcone icone={History} tom="tom-config" />
            <span className="texto">
              <span className="numero-destaque">{r.faturamentoMeses}</span> meses de faturamento antigo (2023 a jan/2025), só para
              comparação
            </span>
          </li>
          {r.despesas.categoriasCriadas.length > 0 && (
            <li className="largo">
              <ChipIcone icone={Tags} tom="tom-contas" />
              <span className="texto">Categorias novas: {r.despesas.categoriasCriadas.join(', ')}</span>
            </li>
          )}
        </ul>
      </section>

      <ParaConferir grupos={imp.grupos} />
    </>
  );
}

function ParaConferir({ grupos }: { grupos: Importacao['grupos'] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const abertas = grupos.reduce((s, g) => s + g.abertas, 0);
  return (
    <section className={`cartao cartao-lista ${abertas === 0 ? 'tom-livre' : 'tom-chega'}`}>
      <header className="cartao-topo">
        <ChipIcone icone={ClipboardList} tom={abertas === 0 ? 'tom-livre' : 'tom-chega'} />
        <h2>Para conferir</h2>
        <span className="contagem" aria-label={`${abertas.toLocaleString('pt-BR')} para conferir`}>
          {abertas.toLocaleString('pt-BR')}
        </span>
      </header>
      <p className="apoio">
        Nada foi apagado nem corrigido sozinho. Abra cada grupo, confira na planilha ou com quem lançou, corrija no sistema se
        precisar e marque "Conferido".
      </p>
      <ul className="grupos-conferir">
        {grupos.map((g) => (
          <li key={g.tipo}>
            <div className="grupo-linha">
              <div>
                <div className="nome">{g.titulo}</div>
                <div className="suave pequeno">
                  {g.abertas === 0 ? 'Tudo conferido' : `${g.abertas} de ${g.total} para conferir`}
                </div>
              </div>
              {g.abertas === 0 ? (
                <Etiqueta estado="pago">Conferido</Etiqueta>
              ) : (
                <span className="etiqueta est-chega">
                  <CircleDashed aria-hidden="true" />
                  Falta {g.abertas.toLocaleString('pt-BR')}
                </span>
              )}
              <button className="botao" aria-expanded={aberto === g.tipo} onClick={() => setAberto(aberto === g.tipo ? null : g.tipo)}>
                {aberto === g.tipo ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                {aberto === g.tipo ? 'Fechar' : 'Ver'}
              </button>
            </div>
            {aberto === g.tipo && <ListaPendencias tipo={g.tipo} />}
          </li>
        ))}
      </ul>
    </section>
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
    <ul className="lista-pendencias">
      {lista.data?.pendencias.map((p) => (
        <li key={p.id}>
          <div>
            <div>{p.mensagem}</div>
            {p.linha && (
              <div className="suave pequeno">
                Aba {p.aba}, linha {p.linha}
              </div>
            )}
          </div>
          <button
            className={`botao${p.resolvida_em ? ' verde' : ''}`}
            onClick={() => marcar.mutate({ id: p.id, resolvida: !p.resolvida_em })}
          >
            {p.resolvida_em ? <Check aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}
            {p.resolvida_em ? 'Conferido' : 'Marcar conferido'}
          </button>
        </li>
      ))}
    </ul>
  );
}
