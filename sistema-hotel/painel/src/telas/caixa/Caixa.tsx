import { useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, Dinheiro, Escolha, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, diaDaSemana, emReais, FORMAS, GRUPOS, hojeLocal, nomeMes, somarDias } from '../../formato';
import { JanelaDespesa, LancarDespesa } from './LancarDespesa';

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
    <Routes>
      <Route index element={<ResumoCaixa />} />
      <Route path="despesa" element={<LancarDespesa />} />
    </Routes>
  );
}

function Resultado({ titulo, valor, explicacao }: { titulo: string; valor: number; explicacao: string }) {
  const positivo = valor >= 0;
  return (
    <div className="numero-grande" style={{ borderLeft: `8px solid ${positivo ? 'var(--verde-escuro)' : 'var(--vermelho-alerta)'}` }}>
      <div className="rotulo forte" style={{ color: 'var(--tinta)' }}>
        {titulo}
      </div>
      <div className="valor" style={{ color: positivo ? 'var(--verde-escuro)' : 'var(--vermelho-alerta)' }}>
        {emReais(valor)}
      </div>
      <div className="rotulo pequeno">{explicacao}</div>
    </div>
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
      <div className="titulo-tela">
        <h1>Caixa</h1>
        <button className="botao principal grande" onClick={() => navegar('/caixa/despesa')}>
          + Lançar despesa
        </button>
      </div>
      <div className="cartao">
        <div className="botoes">
          <Escolha
            rotulo="Período"
            grande={false}
            valor={modo}
            aoEscolher={setModo}
            opcoes={[
              { valor: 'dia', texto: 'Dia' },
              { valor: 'semana', texto: 'Semana' },
              { valor: 'mes', texto: 'Mês' },
            ]}
          />
          <span style={{ flex: 1 }} />
          <button className="botao" aria-label="Período anterior" onClick={() => setRef(andar(modo, ref, -1))}>
            ←
          </button>
          <strong style={{ fontSize: '1.15rem', minWidth: 200, textAlign: 'center' }}>{p.titulo}</strong>
          <button className="botao" aria-label="Próximo período" onClick={() => setRef(andar(modo, ref, 1))}>
            →
          </button>
          <button className="botao" onClick={() => setRef(hojeLocal())}>
            Hoje
          </button>
        </div>
      </div>
      {dados.isLoading && <Carregando />}
      <MensagemErro erro={dados.error} />
      {r && (
        <>
          <h2>Resultados</h2>
          <div className="grade-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Resultado titulo="1. Resultado do hotel" valor={r.resultados.resultadoHotel} explicacao="Entradas menos os gastos de operação: mostra se o hotel dá lucro." />
            <Resultado titulo="2. Depois da obra e do financiamento" valor={r.resultados.depoisObra} explicacao="Tirando também obra, equipamentos e parcelas do Sicoob." />
            <Resultado titulo="3. O que sobrou de verdade" valor={r.resultados.sobrou} explicacao="Tirando também as compras da casa e as retiradas." />
          </div>

          <div className="grade-2">
            <div className="cartao">
              <h2>
                Entradas <Dinheiro valor={r.entradas} />
              </h2>
              <p className="suave pequeno">Soma automática dos pagamentos das hospedagens.</p>
              <table className="tabela">
                <tbody>
                  {r.porForma.map((f) => (
                    <tr key={f.forma}>
                      <td>{FORMAS[f.forma]}</td>
                      <td className="numero">
                        <Dinheiro valor={f.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ marginTop: 14 }}>Quem recebeu</h3>
              <table className="tabela">
                <tbody>
                  {r.porConta.map((c) => (
                    <tr key={c.sigla ?? 'nao'}>
                      <td>{c.sigla ? `${c.sigla} · ${c.nome}` : c.nome}</td>
                      <td className="numero">
                        <Dinheiro valor={c.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pequeno" style={{ marginTop: 12 }}>
                {r.ocupacao.diarias} diárias vendidas · {r.ocupacao.quartosNoite} quartos-noite ocupados
                {r.ocupacao.capacidade > 0 && ` (${Math.round((r.ocupacao.quartosNoite / r.ocupacao.capacidade) * 100)}% de ocupação)`}
              </p>
              <button className="botao pequeno" onClick={() => setVerEntradas(!verEntradas)}>
                {verEntradas ? 'Esconder pagamentos' : 'Ver cada pagamento'}
              </button>
              {verEntradas && <ListaEntradas de={p.de} ate={p.ate} />}
            </div>

            <div className="cartao">
              <h2>
                Saídas <Dinheiro valor={totalSaidas} />
              </h2>
              <table className="tabela">
                <tbody>
                  {Object.entries(GRUPOS).map(([g, titulo]) => {
                    const cats = r.categorias.filter((c) => c.grupo === g);
                    return [
                      <tr key={g}>
                        <td>
                          {cats.length > 0 ? (
                            <button className="botao pequeno sem-borda" onClick={() => setAbertos({ ...abertos, [g]: !abertos[g] })} aria-expanded={!!abertos[g]}>
                              {abertos[g] ? '▾' : '▸'} {titulo}
                            </button>
                          ) : (
                            <span style={{ paddingLeft: 20 }}>{titulo}</span>
                          )}
                        </td>
                        <td className="numero forte">
                          <Dinheiro valor={r.porGrupo[g] ?? 0} />
                        </td>
                      </tr>,
                      ...(abertos[g]
                        ? cats.map((c) => (
                            <tr key={`c${c.id}`} className="pequeno">
                              <td style={{ paddingLeft: 44 }}>
                                {c.nome} <span className="suave">({c.lancamentos})</span>
                              </td>
                              <td className="numero">
                                <Dinheiro valor={c.total} />
                              </td>
                            </tr>
                          ))
                        : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
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
  if (a.faturamentoPlanilhaAntiga !== null) {
    return (
      <div className="cartao">
        <h2>Comparação com {mesAnt}</h2>
        <p>
          Faturamento de {mesAnt} (planilha antiga): <Dinheiro valor={a.faturamentoPlanilhaAntiga} className="forte" /> · este mês:{' '}
          <Dinheiro valor={r.entradas} className="forte" /> {variacao(r.entradas, a.faturamentoPlanilhaAntiga)}
        </p>
      </div>
    );
  }
  return (
    <div className="cartao">
      <h2>Comparação com {mesAnt}</h2>
      <table className="tabela">
        <thead>
          <tr>
            <th></th>
            <th className="numero">{mesAnt}</th>
            <th className="numero">Agora</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Entradas</td>
            <td className="numero">
              <Dinheiro valor={a.entradas} />
            </td>
            <td className="numero">
              <Dinheiro valor={r.entradas} />
            </td>
            <td>{variacao(r.entradas, a.entradas)}</td>
          </tr>
          <tr>
            <td>Gastos de operação</td>
            <td className="numero">
              <Dinheiro valor={a.porGrupo.operacao} />
            </td>
            <td className="numero">
              <Dinheiro valor={r.porGrupo.operacao} />
            </td>
            <td></td>
          </tr>
          <tr>
            <td>Resultado do hotel</td>
            <td className="numero">
              <Dinheiro valor={a.resultados.resultadoHotel} />
            </td>
            <td className="numero">
              <Dinheiro valor={r.resultados.resultadoHotel} />
            </td>
            <td>{variacao(r.resultados.resultadoHotel, a.resultados.resultadoHotel)}</td>
          </tr>
        </tbody>
      </table>
    </div>
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
    <div className="cartao">
      <h2>Despesas lançadas ({lista.filter((d) => !d.cancelado_em).length})</h2>
      {lista.length === 0 && <p className="vazio">Nenhuma despesa no período.</p>}
      <ul className="lista">
        {lista.slice(0, 200).map((d) => (
          <li key={d.id} style={d.cancelado_em ? { opacity: 0.55 } : {}}>
            <div className="principal-item">
              <div className="nome" style={d.cancelado_em ? { textDecoration: 'line-through' } : {}}>
                {d.categoria}
                {d.fornecedor ? ` · ${d.fornecedor}` : ''}
              </div>
              <div className="suave pequeno">
                {dataCurta(d.data)} · {FORMAS[d.forma]}
                {d.descricao ? ` · ${d.descricao}` : ''}
                {d.conta_a_pagar_id ? ' · conta paga' : ''}
              </div>
            </div>
            <Dinheiro valor={d.valor} className="forte" />
            {d.cancelado_em ? (
              <Etiqueta estado="neutro">Desfeita</Etiqueta>
            ) : (
              <>
                {!d.vale_id && (
                  <button className="botao pequeno" onClick={() => setEditando(d)}>
                    Mudar
                  </button>
                )}
                <button className="botao pequeno" onClick={() => desfazer(d)}>
                  Desfazer
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {lista.length > 200 && <p className="suave">Mostrando as 200 mais recentes. Escolha um período menor para ver as outras.</p>}
      {editando && <JanelaDespesa despesa={editando} aoFechar={() => setEditando(null)} />}
      <p style={{ marginTop: 8 }}>
        <Link to="/contas">Contas a pagar →</Link>
      </p>
    </div>
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
    <ul className="lista">
      {(dados.data?.entradas ?? []).slice(0, 200).map((e) => (
        <li key={e.id}>
          <div className="principal-item">
            <Link to={`/estadia/${e.estadia_id}`}>{e.nome}</Link>
            <div className="suave pequeno">
              {dataCurta(e.data)} · quarto {e.quarto} · {FORMAS[e.forma]}
              {e.conta ? ` · ${e.conta}` : ''}
            </div>
          </div>
          <Dinheiro valor={e.valor} />
        </li>
      ))}
    </ul>
  );
}
