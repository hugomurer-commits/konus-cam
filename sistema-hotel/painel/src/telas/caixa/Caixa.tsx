import { useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BedDouble,
  Calendar1,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  List,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ChipIcone, Dinheiro, Etiqueta, MensagemErro, TituloTela } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, diaDaSemana, emReais, FORMAS, GRUPOS, hojeLocal, nomeMes, nomeProprio, somarDias } from '../../formato';
import { FormaComIcone, Folhinha, ICONE_FORMA, JanelaDespesa, LancarDespesa, maiuscula } from './LancarDespesa';
import '../../estilo/dinheiro.css';

type Modo = 'dia' | 'semana' | 'mes';

function periodo(modo: Modo, ref: string) {
  if (modo === 'dia') return { de: ref, ate: somarDias(ref, 1), titulo: `${diaDaSemana(ref)}, ${data(ref)}` };
  if (modo === 'semana') {
    const dow = new Date(`${ref}T12:00:00Z`).getUTCDay();
    const de = somarDias(ref, dow === 0 ? -6 : 1 - dow);
    return { de, ate: somarDias(de, 7), titulo: `semana de ${dataCurta(de)} a ${dataCurta(somarDias(de, 6))}` };
  }
  const de = `${ref.slice(0, 7)}-01`;
  const [a, m] = ref.split('-').map(Number);
  const ate = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { de, ate, titulo: nomeMes(ref.slice(0, 7)) };
}

function andar(modo: Modo, ref: string, n: number): string {
  if (modo === 'dia') return somarDias(ref, n);
  if (modo === 'semana') return somarDias(ref, 7 * n);
  const [a, m] = ref.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

interface Resumo {
  entradas: number;
  porGrupo: Record<string, number>;
  resultados: { resultadoHotel: number; depoisObra: number; sobrou: number };
  porForma: { forma: string; total: number }[];
  porConta: { sigla: string | null; nome: string; total: number }[];
  categorias: { id: number; nome: string; grupo: string; total: number; lancamentos: number }[];
  ocupacao: { diarias: number; quartosNoite: number; valorDiarias: number; capacidade: number };
  anterior: {
    de: string;
    entradas: number;
    porGrupo: Record<string, number>;
    resultados: { resultadoHotel: number };
    faturamentoPlanilhaAntiga: number | null;
  };
}

export function Caixa() {
  return (
    <div className="tela-dinheiro">
      <Routes>
        <Route index element={<ResumoCaixa />} />
        <Route path="despesa" element={<LancarDespesa />} />
      </Routes>
    </div>
  );
}

/** Parte de um total, para a barrinha (0 a 100). */
function pct(parte: number, total: number) {
  if (!total || parte <= 0) return 0;
  return Math.max(2, Math.min(100, Math.round((parte / total) * 100)));
}

function BarraValor({ parte, total }: { parte: number; total: number }) {
  return (
    <div className="barra-valor" aria-hidden="true">
      <span style={{ ['--pct' as string]: `${pct(parte, total)}%` }} />
    </div>
  );
}

/** Um passo da cascata Entrou → Saiu → Sobrou. */
function Cascata({ entrou, saiu, sobrou }: { entrou: number; saiu: number; sobrou: number }) {
  const faltou = sobrou < 0;
  return (
    <div className="resultados">
      <div className="resultado entrou">
        <div className="titulo">
          <TrendingUp aria-hidden="true" />
          Entrou
        </div>
        <div className="valor">{emReais(entrou)}</div>
        <div className="explica">Pagamentos das hospedagens (soma automática).</div>
      </div>
      <div className="resultado saiu">
        <div className="titulo">
          <TrendingDown aria-hidden="true" />
          Saiu
        </div>
        <div className="valor">{emReais(saiu)}</div>
        <div className="explica">Todas as despesas lançadas no período.</div>
      </div>
      <div className={`resultado${faltou ? ' negativo' : ''}`}>
        <div className="titulo">
          <PiggyBank aria-hidden="true" />
          {faltou ? 'Faltou' : 'Sobrou'}
        </div>
        <div className="valor">{emReais(sobrou)}</div>
        <div className="explica">{faltou ? 'Saiu mais dinheiro do que entrou.' : 'O que entrou menos o que saiu.'}</div>
      </div>
    </div>
  );
}

/** Os três resultados da seção 5.4, nessa ordem, com explicação em uma linha. */
function TresResultados({ r }: { r: Resumo }) {
  const passos = [
    { titulo: 'Resultado do hotel', valor: r.resultados.resultadoHotel, explicacao: 'Entradas menos os gastos de operação: mostra se o hotel dá lucro.' },
    { titulo: 'Depois da obra e do financiamento', valor: r.resultados.depoisObra, explicacao: 'Tirando também obra, equipamentos e parcelas do Sicoob.' },
    { titulo: 'O que sobrou de verdade', valor: r.resultados.sobrou, explicacao: 'Tirando também as compras da casa e as retiradas.' },
  ];
  return (
    <section className="cartao cartao-lista tom-ocupado">
      <header className="cartao-topo">
        <ChipIcone icone={Scale} />
        <h2>Resultados, passo a passo</h2>
      </header>
      <ol className="passos-resultado">
        {passos.map((p, i) => (
          <li key={p.titulo} className={p.valor < 0 ? 'negativo' : ''}>
            <span className="numero-passo" aria-hidden="true">
              {i + 1}
            </span>
            <div className="texto-passo">
              <div className="nome-passo">
                <span className="oculto-leitor">{i + 1}. </span>
                {p.titulo}
              </div>
              <div className="detalhe">{p.explicacao}</div>
            </div>
            <div className="valor-passo">
              <span className="dinheiro">{emReais(p.valor)}</span>
              {p.valor < 0 ? <Etiqueta estado="atrasado">Faltou</Etiqueta> : <Etiqueta estado="pago">Sobrou</Etiqueta>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function variacao(atual: number, antes: number) {
  if (!antes) return null;
  const p = Math.round(((atual - antes) / Math.abs(antes)) * 100);
  return (
    <Etiqueta estado={p >= 0 ? 'pago' : 'atrasado'}>
      {p >= 0 ? '+' : ''}
      {p}%
    </Etiqueta>
  );
}

const MODOS: { valor: Modo; texto: string; icone: LucideIcon }[] = [
  { valor: 'dia', texto: 'Dia', icone: Calendar1 },
  { valor: 'semana', texto: 'Semana', icone: CalendarRange },
  { valor: 'mes', texto: 'Mês', icone: CalendarDays },
];

function ResumoCaixa() {
  const navegar = useNavigate();
  const [modo, setModo] = useState<Modo>('mes');
  const [ref, setRef] = useState(hojeLocal());
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [verEntradas, setVerEntradas] = useState(false);
  const p = periodo(modo, ref);
  const dados = useQuery({
    queryKey: ['caixa', p.de, p.ate],
    queryFn: () => api.get<Resumo>(`/api/caixa?de=${p.de}&ate=${p.ate}`),
    placeholderData: (a) => a,
  });
  const r = dados.data;
  const totalSaidas = r ? Object.values(r.porGrupo).reduce((s, v) => s + v, 0) : 0;

  return (
    <>
      <TituloTela icone={Wallet} tom="tom-caixa" titulo="Caixa" subtitulo="Quanto entrou, quanto saiu e quanto sobrou.">
        <button className="botao principal grande" onClick={() => navegar('/caixa/despesa')}>
          <Plus aria-hidden="true" />
          Lançar despesa
        </button>
      </TituloTela>

      <div className="barra-periodo">
        <div className="abas" role="group" aria-label="Período">
          {MODOS.map((m) => (
            <button key={m.valor} type="button" className={`aba${modo === m.valor ? ' ativo' : ''}`} aria-pressed={modo === m.valor} onClick={() => setModo(m.valor)}>
              <m.icone aria-hidden="true" />
              {m.texto}
            </button>
          ))}
        </div>
        <div className="navegador">
          <button className="botao" aria-label="Período anterior" onClick={() => setRef(andar(modo, ref, -1))}>
            <ChevronLeft aria-hidden="true" />
            Anterior
          </button>
          <h2 className="periodo" aria-live="polite">
            {maiuscula(p.titulo)}
          </h2>
          <button className="botao" aria-label="Próximo período" onClick={() => setRef(andar(modo, ref, 1))}>
            Próximo
            <ChevronRight aria-hidden="true" />
          </button>
          <button className="botao sem-borda" onClick={() => setRef(hojeLocal())}>
            Hoje
          </button>
        </div>
      </div>

      {dados.isLoading && <Carregando />}
      <MensagemErro erro={dados.error} />
      {r && (
        <>
          <Cascata entrou={r.entradas} saiu={totalSaidas} sobrou={r.resultados.sobrou} />
          <TresResultados r={r} />

          <div className="grade-2">
            <section className="cartao cartao-lista tom-caixa">
              <header className="cartao-topo">
                <ChipIcone icone={TrendingUp} />
                <h2>Entradas</h2>
                <Dinheiro valor={r.entradas} className="total-topo" />
              </header>
              <p className="detalhe">Soma automática dos pagamentos das hospedagens.</p>
              <h3 className="subtitulo-cartao">Por forma de pagamento</h3>
              <ul className="lista-barras">
                {r.porForma.map((f) => (
                  <li key={f.forma}>
                    <div className="linha">
                      <span className="nome-item">
                        <FormaComIcone forma={f.forma} />
                      </span>
                      <Dinheiro valor={f.total} />
                    </div>
                    <BarraValor parte={f.total} total={r.entradas} />
                  </li>
                ))}
              </ul>
              <h3 className="subtitulo-cartao">Quem recebeu</h3>
              <ul className="lista-barras">
                {r.porConta.map((c) => (
                  <li key={c.sigla ?? 'nao'}>
                    <div className="linha">
                      <span className="nome-item">
                        <UserRound aria-hidden="true" />
                        {c.sigla ? `${c.sigla} · ${c.nome}` : c.nome}
                      </span>
                      <Dinheiro valor={c.total} />
                    </div>
                    <BarraValor parte={c.total} total={r.entradas} />
                  </li>
                ))}
              </ul>
              <p className="info-ocupacao">
                <BedDouble aria-hidden="true" />
                <span>
                  {r.ocupacao.diarias} diárias vendidas · {r.ocupacao.quartosNoite} quartos-noite ocupados
                  {r.ocupacao.capacidade > 0 && ` (${Math.round((r.ocupacao.quartosNoite / r.ocupacao.capacidade) * 100)}% de ocupação)`}
                </span>
              </p>
              <button className="botao" onClick={() => setVerEntradas(!verEntradas)} aria-expanded={verEntradas}>
                {verEntradas ? <ChevronUp aria-hidden="true" /> : <List aria-hidden="true" />}
                {verEntradas ? 'Esconder pagamentos' : 'Ver cada pagamento'}
              </button>
              {verEntradas && <ListaEntradas de={p.de} ate={p.ate} />}
            </section>

            <section className="cartao cartao-lista tom-sai">
              <header className="cartao-topo">
                <ChipIcone icone={TrendingDown} />
                <h2>Saídas</h2>
                <Dinheiro valor={totalSaidas} className="total-topo" />
              </header>
              <p className="detalhe">Separadas por grupo. Abra um grupo para ver as categorias.</p>
              <ul className="lista-barras">
                {Object.entries(GRUPOS).map(([g, titulo]) => {
                  const cats = r.categorias.filter((c) => c.grupo === g);
                  const valor = r.porGrupo[g] ?? 0;
                  return (
                    <li key={g}>
                      {cats.length > 0 ? (
                        <button type="button" className="linha abre" onClick={() => setAbertos({ ...abertos, [g]: !abertos[g] })} aria-expanded={!!abertos[g]}>
                          <span className="nome-item">
                            {abertos[g] ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                            {titulo}
                          </span>
                          <Dinheiro valor={valor} />
                        </button>
                      ) : (
                        <div className="linha sem-itens">
                          <span className="nome-item">{titulo}</span>
                          <Dinheiro valor={valor} />
                        </div>
                      )}
                      <BarraValor parte={valor} total={totalSaidas} />
                      {abertos[g] && (
                        <ul className="categorias">
                          {cats.map((c) => (
                            <li key={`c${c.id}`}>
                              <span>
                                {c.nome} <span className="suave">({c.lancamentos})</span>
                              </span>
                              <Dinheiro valor={c.total} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {modo === 'mes' && <Comparacao r={r} />}
          <ListaDespesas de={p.de} ate={p.ate} />
        </>
      )}
    </>
  );
}

function Comparacao({ r }: { r: Resumo }) {
  const a = r.anterior;
  const mesAnt = nomeMes(a.de.slice(0, 7));
  const topo = (
    <header className="cartao-topo">
      <ChipIcone icone={ChartColumn} />
      <h2>Comparação com {mesAnt}</h2>
    </header>
  );
  if (a.faturamentoPlanilhaAntiga !== null) {
    return (
      <section className="cartao cartao-lista tom-config">
        {topo}
        <p>
          Faturamento de {mesAnt} (planilha antiga): <Dinheiro valor={a.faturamentoPlanilhaAntiga} className="forte" /> · este mês:{' '}
          <Dinheiro valor={r.entradas} className="forte" /> {variacao(r.entradas, a.faturamentoPlanilhaAntiga)}
        </p>
      </section>
    );
  }
  return (
    <section className="cartao cartao-lista tom-config">
      {topo}
      <div className="rolagem-x comparacao">
        <table className="tabela">
          <thead>
            <tr>
              <th>
                <span className="oculto-leitor">O quê</span>
              </th>
              <th className="numero">{maiuscula(mesAnt)}</th>
              <th className="numero">Agora</th>
              <th>Mudou</th>
            </tr>
          </thead>
          <tbody>
            {[
              { titulo: 'Entradas', antes: a.entradas, agora: r.entradas, mudou: variacao(r.entradas, a.entradas) },
              { titulo: 'Gastos de operação', antes: a.porGrupo.operacao, agora: r.porGrupo.operacao, mudou: null },
              {
                titulo: 'Resultado do hotel',
                antes: a.resultados.resultadoHotel,
                agora: r.resultados.resultadoHotel,
                mudou: variacao(r.resultados.resultadoHotel, a.resultados.resultadoHotel),
              },
            ].map((l) => (
              <tr key={l.titulo}>
                <th scope="row">{l.titulo}</th>
                <td className="numero" data-rotulo={maiuscula(mesAnt)}>
                  <Dinheiro valor={l.antes} />
                </td>
                <td className="numero" data-rotulo="Agora">
                  <Dinheiro valor={l.agora} />
                </td>
                <td className="mudou">{l.mudou}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Despesa {
  id: number;
  data: string;
  fornecedor: string;
  descricao: string;
  valor: number;
  forma: string;
  obs: string;
  cancelado_em: string | null;
  conta_a_pagar_id: number | null;
  vale_id: number | null;
  categoria_id: number;
  categoria: string;
  grupo: string;
}

function ListaDespesas({ de, ate }: { de: string; ate: string }) {
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const [editando, setEditando] = useState<Despesa | null>(null);
  const dados = useQuery({
    queryKey: ['caixa-lancamentos', de, ate],
    queryFn: () => api.get<{ despesas: Despesa[] }>(`/api/caixa/lancamentos?de=${de}&ate=${ate}`),
  });
  const lista = dados.data?.despesas ?? [];
  async function desfazer(d: Despesa) {
    const ok = await confirmar({
      titulo: 'Desfazer despesa?',
      mensagem: `${d.categoria}${d.fornecedor ? ` · ${d.fornecedor}` : ''}: ${emReais(d.valor)}.${d.conta_a_pagar_id ? ' A conta volta a ficar em aberto.' : ''}${d.vale_id ? ' O vale também sai.' : ''}`,
      confirmar: 'Desfazer',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.post(`/api/despesas/${d.id}/cancelar`);
      cliente.invalidateQueries();
      avisar('Despesa desfeita.');
    } catch (e) {
      avisar((e as Error).message, { erro: true });
    }
  }
  return (
    <section className="cartao cartao-lista tom-caixa">
      <header className="cartao-topo">
        <ChipIcone icone={Receipt} />
        <h2>Despesas lançadas</h2>
        <span className="contagem" aria-label={`${lista.filter((d) => !d.cancelado_em).length} despesas`}>
          {lista.filter((d) => !d.cancelado_em).length}
        </span>
      </header>
      {lista.length === 0 && (
        <p className="vazio">
          <CircleCheck aria-hidden="true" />
          Nenhuma despesa no período.
        </p>
      )}
      <ul className="lista lista-contas lista-despesas">
        {lista.slice(0, 200).map((d) => (
          <li key={d.id} className={d.cancelado_em ? 'desfeita' : ''}>
            <Folhinha data={d.data} />
            <div className="principal-item">
              <div className="nome">
                {d.categoria}
                {d.fornecedor ? ` · ${d.fornecedor}` : ''}
              </div>
              <div className="detalhe com-icone">
                <span className="oculto-leitor">{data(d.data)} · </span>
                <FormaComIcone forma={d.forma} />
                {d.descricao ? ` · ${d.descricao}` : ''}
                {d.conta_a_pagar_id ? ' · conta paga' : ''}
              </div>
            </div>
            <div className="valor">
              <Dinheiro valor={d.valor} />
            </div>
            <div className="acoes">
              {d.cancelado_em ? (
                <Etiqueta estado="neutro">Desfeita</Etiqueta>
              ) : (
                <>
                  {!d.vale_id && (
                    <button className="botao pequeno" onClick={() => setEditando(d)}>
                      <Pencil aria-hidden="true" />
                      Mudar
                    </button>
                  )}
                  <button className="botao pequeno" onClick={() => desfazer(d)}>
                    <Undo2 aria-hidden="true" />
                    Desfazer
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {lista.length > 200 && <p className="suave">Mostrando as 200 mais recentes. Escolha um período menor para ver as outras.</p>}
      {editando && <JanelaDespesa despesa={editando} aoFechar={() => setEditando(null)} />}
      <p className="rodape-cartao">
        <Link to="/contas" className="botao sem-borda">
          <CalendarCheck aria-hidden="true" />
          Contas a pagar
          <ArrowRight aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

function ListaEntradas({ de, ate }: { de: string; ate: string }) {
  const dados = useQuery({
    queryKey: ['caixa-lancamentos', de, ate, 'entradas'],
    queryFn: () =>
      api.get<{ entradas: { id: number; data: string; valor: number; forma: string; conta: string | null; nome: string; quarto: string; estadia_id: number }[] }>(
        `/api/caixa/lancamentos?de=${de}&ate=${ate}`,
      ),
  });
  return (
    <ul className="lista lista-entradas">
      {(dados.data?.entradas ?? []).slice(0, 200).map((e) => {
        const Icone = ICONE_FORMA[e.forma];
        return (
          <li key={e.id}>
            <div className="principal-item">
              <Link to={`/estadia/${e.estadia_id}`} className="nome">
                {nomeProprio(e.nome)}
              </Link>
              <div className="detalhe com-icone">
                {dataCurta(e.data)} · quarto {e.quarto} · {Icone && <Icone aria-hidden="true" />}
                {FORMAS[e.forma]}
                {e.conta ? ` · ${e.conta}` : ''}
              </div>
            </div>
            <Dinheiro valor={e.valor} className="forte" />
          </li>
        );
      })}
    </ul>
  );
}
