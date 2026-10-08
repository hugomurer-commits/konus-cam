import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Hourglass,
  Info,
  Landmark,
  Pencil,
  Plus,
  Repeat,
  TriangleAlert,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { CampoReais, Carregando, ChipIcone, Dinheiro, Escolha, Etiqueta, MensagemErro, TituloTela, type Estado } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, emReais, FORMAS, GRUPOS, hojeLocal, nomeMes } from '../../formato';
import { FormaComIcone, Folhinha, ICONE_FORMA, maiuscula, useCategorias } from '../caixa/LancarDespesa';
import { Funcionarias } from './Funcionarias';
import '../../estilo/dinheiro.css';

type Forma = 'pix' | 'cartao' | 'dinheiro' | 'boleto';

interface Conta {
  id: number;
  descricao: string;
  categoria: string;
  fornecedor: string;
  competencia: string;
  vencimento: string;
  valor_previsto: number | null;
  valor_variavel: number;
  valor_pago: number | null;
  data_pagamento: string | null;
  forma: string | null;
  status: string;
  estado: 'paga' | 'atrasada' | 'vence_hoje' | 'vence_breve' | 'aberta';
  parcelas_restantes: number | null;
  funcionaria_id: number | null;
  vales: { id: number; data: string; valor: number }[];
  aPagar: number | null;
}

/** Estado da conta: cor + ícone + texto (a folhinha e a linha usam a mesma classe). */
const ESTADOS: Record<Conta['estado'], { texto: string; estado: Estado; icone: LucideIcon; classe: string }> = {
  paga: { texto: 'Paga', estado: 'pago', icone: Check, classe: 'paga' },
  atrasada: { texto: 'Atrasada', estado: 'atrasado', icone: TriangleAlert, classe: 'atrasada' },
  vence_hoje: { texto: 'Vence hoje', estado: 'sai', icone: AlarmClock, classe: 'vence-hoje' },
  vence_breve: { texto: 'Vence em breve', estado: 'chega', icone: Clock, classe: 'vence-breve' },
  aberta: { texto: 'Em aberto', estado: 'neutro', icone: Hourglass, classe: 'aberta' },
};

function EtiquetaConta({ estado }: { estado: Conta['estado'] }) {
  const e = ESTADOS[estado];
  return (
    <span className={`etiqueta est-${e.estado}`}>
      <e.icone aria-hidden="true" />
      {e.texto}
    </span>
  );
}

const ABAS = [
  { para: '/contas', texto: 'Contas do mês', icone: CalendarDays, fim: true },
  { para: '/contas/recorrentes', texto: 'Contas que se repetem', icone: Repeat },
  { para: '/contas/funcionarias', texto: 'Funcionárias e vales', icone: Users },
];

export function Contas() {
  return (
    <div className="tela-dinheiro">
      <TituloTela icone={CalendarCheck} tom="tom-contas" titulo="Contas" subtitulo="O que pagar, o que já foi pago, salários e vales." />
      <nav className="abas abas-contas" aria-label="Seções de contas">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} end={a.fim} className={({ isActive }) => `aba${isActive ? ' ativo' : ''}`}>
            <a.icone aria-hidden="true" />
            {a.texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<ContasDoMes />} />
        <Route path="recorrentes" element={<Recorrentes />} />
        <Route path="funcionarias" element={<Funcionarias />} />
      </Routes>
    </div>
  );
}

function somarMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** 'AAAA-MM' → 'Setembro' (com o ano só quando muda de ano). */
function nomeMesCurto(mes: string, referencia: string) {
  const nome = maiuscula(nomeMes(mes));
  return mes.slice(0, 4) === referencia.slice(0, 4) ? nome.replace(/ de \d{4}$/, '') : nome;
}

function ContasDoMes() {
  const [mes, setMes] = useState(hojeLocal().slice(0, 7));
  const [pagando, setPagando] = useState<Conta | null>(null);
  const [nova, setNova] = useState(false);
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const dados = useQuery({
    queryKey: ['contas', mes],
    queryFn: () => api.get<{ contas: Conta[]; hoje: string }>(`/api/contas?mes=${mes}`),
    placeholderData: (a) => a,
  });
  const contas = dados.data?.contas ?? [];
  const abertas = contas.filter((c) => c.status === 'aberta');
  const totalAberto = abertas.reduce((s, c) => s + (c.aPagar ?? c.valor_previsto ?? 0), 0);
  const totalPago = contas.filter((c) => c.status === 'paga').reduce((s, c) => s + (c.valor_pago ?? 0), 0);
  const anterior = somarMes(mes, -1);
  const proximo = somarMes(mes, 1);

  async function desfazer(c: Conta) {
    const ok = await confirmar({
      titulo: 'Desfazer pagamento?',
      mensagem: `${c.descricao} volta a ficar em aberto e a despesa de ${emReais(c.valor_pago)} sai do caixa.`,
      confirmar: 'Desfazer',
      perigo: true,
    });
    if (!ok) return;
    await api.post(`/api/contas/${c.id}/desfazer`);
    cliente.invalidateQueries();
    avisar('Pagamento desfeito.');
  }

  async function tirar(c: Conta) {
    const ok = await confirmar({
      titulo: 'Tirar esta conta?',
      mensagem: `"${c.descricao}" de ${nomeMes(c.competencia)} sai da lista (ex.: lançada por engano). Não gera despesa.`,
      confirmar: 'Tirar',
      perigo: true,
    });
    if (!ok) return;
    await api.post(`/api/contas/${c.id}/cancelar`);
    cliente.invalidateQueries();
  }

  return (
    <>
      <div className="barra-mes">
        <div className="navegador">
          <button className="botao" onClick={() => setMes(anterior)}>
            <ChevronLeft aria-hidden="true" />
            <span className="oculto-leitor">Mês anterior: </span>
            {nomeMesCurto(anterior, mes)}
          </button>
          <h2 className="periodo" aria-live="polite">
            {maiuscula(nomeMes(mes))}
          </h2>
          <button className="botao" onClick={() => setMes(proximo)}>
            <span className="oculto-leitor">Próximo mês: </span>
            {nomeMesCurto(proximo, mes)}
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <button className="botao principal" onClick={() => setNova(true)}>
          <Plus aria-hidden="true" />
          Conta avulsa
        </button>
      </div>
      <div className="resumo-contas">
        <div className={`numero-grande ${abertas.length > 0 ? 'tom-perigo' : 'tom-config'}`}>
          <ChipIcone icone={abertas.length > 0 ? CircleAlert : CircleCheck} />
          <div>
            <span className="valor">{emReais(totalAberto)}</span>
            <span className="rotulo">A pagar ({abertas.length})</span>
          </div>
        </div>
        <div className="numero-grande tom-caixa">
          <ChipIcone icone={CircleCheck} />
          <div>
            <span className="valor">{emReais(totalPago)}</span>
            <span className="rotulo">Já pago</span>
          </div>
        </div>
      </div>
      {dados.isLoading && <Carregando />}
      <div className="cartao">
        {contas.length === 0 && !dados.isLoading && (
          <p className="vazio">
            <CircleCheck aria-hidden="true" />
            Nenhuma conta neste mês.
          </p>
        )}
        <ul className="lista lista-contas">
          {contas.map((c) => {
            const est = ESTADOS[c.estado];
            const valor = c.status === 'paga' ? c.valor_pago : c.aPagar ?? c.valor_previsto;
            const paga = c.status === 'paga';
            return (
              <li key={c.id} className={est.classe}>
                <Folhinha data={paga ? c.data_pagamento ?? c.vencimento : c.vencimento} classe={est.classe} />
                <div className="principal-item">
                  <EtiquetaConta estado={c.estado} />
                  <div className="nome">{c.descricao}</div>
                  <div className="detalhe com-icone">
                    {paga ? (
                      <>
                        Paga em {data(c.data_pagamento)}
                        {c.forma && (
                          <>
                            {' · '}
                            <FormaComIcone forma={c.forma} />
                          </>
                        )}
                      </>
                    ) : (
                      `${c.estado === 'atrasada' ? 'Venceu' : 'Vence'} ${data(c.vencimento)}`
                    )}
                    {c.competencia !== mes && ` · de ${nomeMes(c.competencia)}`}
                    {c.parcelas_restantes !== null && c.status === 'aberta' && ` · faltam ${c.parcelas_restantes} parcelas`}
                    {c.funcionaria_id &&
                      c.vales.length > 0 &&
                      c.status === 'aberta' &&
                      ` · ${c.vales.length === 1 ? 'descontado 1 vale' : `descontados ${c.vales.length} vales`}`}
                  </div>
                </div>
                <div className="valor">
                  {valor !== null ? <Dinheiro valor={valor} /> : <span className="variavel">variável</span>}
                  {c.valor_variavel === 1 && c.status === 'aberta' && valor !== null && <span className="ajuste">mais ou menos</span>}
                </div>
                <div className="acoes">
                  {c.status === 'aberta' ? (
                    <>
                      <button className="botao principal grande" onClick={() => setPagando(c)}>
                        <Check aria-hidden="true" />
                        Paguei
                      </button>
                      <button className="botao pequeno sem-borda" onClick={() => tirar(c)}>
                        <X aria-hidden="true" />
                        Tirar
                      </button>
                    </>
                  ) : (
                    <button className="botao" onClick={() => desfazer(c)}>
                      <Undo2 aria-hidden="true" />
                      Desfazer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {pagando && <JanelaPaguei conta={pagando} aoFechar={() => setPagando(null)} />}
      {nova && <JanelaContaAvulsa aoFechar={() => setNova(false)} />}
    </>
  );
}

function JanelaPaguei({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const sugerido = conta.aPagar ?? conta.valor_previsto;
  const [valor, setValor] = useState<number | null>(conta.valor_variavel ? null : sugerido);
  const [dia, setDia] = useState(hojeLocal());
  const [forma, setForma] = useState<Forma>('pix');
  const [erro, setErro] = useState<unknown>(null);
  async function salvar() {
    if (!valor) return setErro(new Error('Informe quanto pagou.'));
    const ok = await confirmar({
      titulo: 'Confirmar pagamento',
      icone: CalendarCheck,
      tom: 'tom-contas',
      mensagem: (
        <>
          Paguei <strong>{conta.descricao}</strong>, dia {dataCurta(dia)}?
        </>
      ),
      recibo: { valor: emReais(valor), detalhe: <FormaComIcone forma={forma} prefixo="em " /> },
    });
    if (!ok) return;
    try {
      await api.post(`/api/contas/${conta.id}/paguei`, { valor, data: dia, forma });
      cliente.invalidateQueries();
      avisar(`${conta.descricao} paga. A despesa já entrou no caixa.`, {
        desfazer: async () => {
          await api.post(`/api/contas/${conta.id}/desfazer`);
          cliente.invalidateQueries();
        },
      });
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo={`Paguei: ${conta.descricao}`} aoFechar={aoFechar} icone={CalendarCheck} tom="tom-contas">
      {conta.funcionaria_id && conta.vales.length > 0 && (
        <p className="dica">
          <Info aria-hidden="true" />
          <span>
            Salário menos {conta.vales.length} {conta.vales.length === 1 ? 'vale' : 'vales'} ({conta.vales.map((v) => `${dataCurta(v.data)}: ${emReais(v.valor)}`).join(', ')}).
          </span>
        </p>
      )}
      {conta.valor_variavel === 1 && sugerido !== null && (
        <p className="dica">
          <Info aria-hidden="true" />
          <span>Costuma ser perto de {emReais(sugerido)}. Digite o valor da conta.</span>
        </p>
      )}
      <CampoReais id="valor-paguei" rotulo="Valor pago" valor={valor} aoMudar={setValor} grande autoFocus />
      <div className="campo">
        <label htmlFor="dia-paguei">Dia do pagamento</label>
        <input id="dia-paguei" type="date" value={dia} max={hojeLocal()} onChange={(e) => e.target.value && setDia(e.target.value)} />
      </div>
      <div className="campo">
        <span className="rotulo">Como pagou</span>
        <Escolha
          rotulo="Forma"
          valor={forma}
          aoEscolher={setForma}
          opcoes={(['pix', 'boleto', 'dinheiro', 'cartao'] as Forma[]).map((f) => ({ valor: f, texto: FORMAS[f], icone: ICONE_FORMA[f] }))}
        />
      </div>
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
          <Check aria-hidden="true" />
          Paguei {valor ? emReais(valor) : ''}
        </button>
      </div>
    </Janela>
  );
}

function SeletorCategoria({ valor, aoMudar }: { valor: number | null; aoMudar: (id: number) => void }) {
  const categorias = useCategorias();
  return (
    <div className="campo">
      <label htmlFor="categoria-conta">Categoria</label>
      <select id="categoria-conta" value={valor ?? ''} onChange={(e) => aoMudar(Number(e.target.value))}>
        <option value="">Escolha…</option>
        {Object.entries(GRUPOS).map(([g, t]) => (
          <optgroup key={g} label={t}>
            {(categorias.data?.categorias ?? [])
              .filter((c) => c.grupo === g && c.ativa)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function JanelaContaAvulsa({ aoFechar }: { aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [f, setF] = useState({ descricao: '', fornecedor: '', categoriaId: null as number | null, vencimento: hojeLocal(), valorPrevisto: null as number | null });
  const [erro, setErro] = useState<unknown>(null);
  async function salvar() {
    try {
      await api.post('/api/contas', f);
      cliente.invalidateQueries({ queryKey: ['contas'] });
      avisar('Conta adicionada.');
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo="Conta avulsa" aoFechar={aoFechar} icone={CalendarPlus} tom="tom-contas">
      <div className="campo">
        <label htmlFor="desc-avulsa">O que é</label>
        <input id="desc-avulsa" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: IPTU 2026" autoFocus />
      </div>
      <div className="campo">
        <label htmlFor="forn-avulsa">Fornecedor</label>
        <input id="forn-avulsa" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
      </div>
      <SeletorCategoria valor={f.categoriaId} aoMudar={(categoriaId) => setF({ ...f, categoriaId })} />
      <div className="campo">
        <label htmlFor="venc-avulsa">Vencimento</label>
        <input id="venc-avulsa" type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
      </div>
      <CampoReais id="valor-avulsa" rotulo="Valor (deixe vazio se ainda não sabe)" valor={f.valorPrevisto} aoMudar={(valorPrevisto) => setF({ ...f, valorPrevisto })} />
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
          <Plus aria-hidden="true" />
          Adicionar
        </button>
      </div>
    </Janela>
  );
}

interface Recorrente {
  id: number;
  nome: string;
  fornecedor: string;
  categoria_id: number;
  categoria: string;
  valor_previsto: number | null;
  valor_variavel: number;
  dia_vencimento: number;
  parcelas_restantes: number | null;
  avisar_dias_antes: number;
  ativa: number;
  obs: string;
  quitacao: string | null;
}

function LinhaRecorrente({ r, aoMudar }: { r: Recorrente; aoMudar: () => void }) {
  const financiamento = r.parcelas_restantes !== null;
  const quitado = financiamento && r.parcelas_restantes === 0;
  return (
    <li className={r.ativa ? '' : 'parada'}>
      <Folhinha mes="dia" dia={r.dia_vencimento} classe={quitado ? 'paga' : ''} />
      <div className="principal-item">
        {!r.ativa && <Etiqueta estado="neutro">Parada</Etiqueta>}
        {quitado && <Etiqueta estado="pago">Quitado</Etiqueta>}
        <div className="nome">{r.nome}</div>
        <div className="detalhe">
          Dia {r.dia_vencimento} · {r.categoria}
          {financiamento && !quitado && ` · faltam ${r.parcelas_restantes} parcelas`}
        </div>
        {financiamento && !quitado && r.quitacao && (
          <div className="quitacao">
            <CalendarCheck aria-hidden="true" />
            Termina em {data(r.quitacao)}
          </div>
        )}
        {r.obs && <div className="obs">{r.obs}</div>}
      </div>
      <div className="valor">
        {r.valor_previsto !== null ? <Dinheiro valor={r.valor_previsto} /> : <span className="variavel">variável</span>}
        {r.valor_variavel === 1 && r.valor_previsto !== null && <span className="ajuste">varia</span>}
      </div>
      <div className="acoes">
        <button className="botao" onClick={aoMudar}>
          <Pencil aria-hidden="true" />
          Mudar
        </button>
      </div>
    </li>
  );
}

function Recorrentes() {
  const dados = useQuery({ queryKey: ['contas-recorrentes'], queryFn: () => api.get<{ recorrentes: Recorrente[] }>('/api/contas-recorrentes') });
  const [editando, setEditando] = useState<Recorrente | 'nova' | null>(null);
  if (dados.isLoading) return <Carregando />;
  const todas = dados.data!.recorrentes;
  const financiamentos = todas.filter((r) => r.parcelas_restantes !== null);
  const fixas = todas.filter((r) => r.parcelas_restantes === null);
  return (
    <>
      <h2 className="oculto-leitor">Contas que se repetem</h2>
      <div className="barra-acoes">
        <p className="dica">
          <Info aria-hidden="true" />
          <span>Todo mês o sistema cria estas contas sozinho e avisa antes de vencer.</span>
        </p>
        <button className="botao principal" onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" />
          Nova
        </button>
      </div>
      {financiamentos.length > 0 && (
        <section className="cartao cartao-lista tom-ocupado">
          <header className="cartao-topo">
            <ChipIcone icone={Landmark} />
            <h3>Financiamentos</h3>
            <span className="contagem">{financiamentos.length}</span>
          </header>
          <p className="detalhe">Parcelas que faltam e quando cada um termina (previsão).</p>
          <ul className="lista lista-contas">
            {financiamentos.map((r) => (
              <LinhaRecorrente key={r.id} r={r} aoMudar={() => setEditando(r)} />
            ))}
          </ul>
        </section>
      )}
      <section className="cartao cartao-lista tom-contas">
        <header className="cartao-topo">
          <ChipIcone icone={Repeat} />
          <h3>Contas de todo mês</h3>
          <span className="contagem">{fixas.length}</span>
        </header>
        {fixas.length === 0 && (
          <p className="vazio">
            <CircleCheck aria-hidden="true" />
            Nenhuma conta cadastrada.
          </p>
        )}
        <ul className="lista lista-contas">
          {fixas.map((r) => (
            <LinhaRecorrente key={r.id} r={r} aoMudar={() => setEditando(r)} />
          ))}
        </ul>
      </section>
      {editando && <JanelaRecorrente r={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function JanelaRecorrente({ r, aoFechar }: { r: Recorrente | null; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [f, setF] = useState({
    nome: r?.nome ?? '',
    fornecedor: r?.fornecedor ?? '',
    categoriaId: r?.categoria_id ?? null,
    valorPrevisto: r?.valor_previsto ?? null,
    valorVariavel: !!r?.valor_variavel,
    diaVencimento: r?.dia_vencimento ?? 10,
    parcelasRestantes: r?.parcelas_restantes ?? null,
    avisarDiasAntes: r?.avisar_dias_antes ?? 3,
    ativa: r ? !!r.ativa : true,
    obs: r?.obs ?? '',
  });
  const [temParcelas, setTemParcelas] = useState(r?.parcelas_restantes !== null && r?.parcelas_restantes !== undefined);
  const [erro, setErro] = useState<unknown>(null);
  async function salvar() {
    const corpo = { ...f, parcelasRestantes: temParcelas ? f.parcelasRestantes ?? 0 : null };
    try {
      if (r) await api.put(`/api/contas-recorrentes/${r.id}`, corpo);
      else await api.post('/api/contas-recorrentes', corpo);
      cliente.invalidateQueries();
      avisar('Conta salva.');
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo={r ? `Mudar: ${r.nome}` : 'Nova conta que se repete'} aoFechar={aoFechar} icone={r ? Pencil : Repeat} tom="tom-contas">
      <div className="campo">
        <label htmlFor="r-nome">Nome</label>
        <input id="r-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
      </div>
      <div className="campo">
        <label htmlFor="r-forn">Fornecedor</label>
        <input id="r-forn" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
      </div>
      <SeletorCategoria valor={f.categoriaId} aoMudar={(categoriaId) => setF({ ...f, categoriaId })} />
      <CampoReais id="r-valor" rotulo="Valor de sempre (aproximado se variar)" valor={f.valorPrevisto} aoMudar={(valorPrevisto) => setF({ ...f, valorPrevisto })} />
      <label className="marcar">
        <input type="checkbox" checked={f.valorVariavel} onChange={(e) => setF({ ...f, valorVariavel: e.target.checked })} />
        O valor muda todo mês (pede o valor certo no "Paguei")
      </label>
      <div className="linha-campos">
        <div className="campo">
          <label htmlFor="r-dia">Dia do vencimento</label>
          <input id="r-dia" type="number" min={1} max={31} value={f.diaVencimento} onChange={(e) => setF({ ...f, diaVencimento: Number(e.target.value) })} />
        </div>
        <div className="campo">
          <label htmlFor="r-aviso">Avisar quantos dias antes</label>
          <input id="r-aviso" type="number" min={0} max={30} value={f.avisarDiasAntes} onChange={(e) => setF({ ...f, avisarDiasAntes: Number(e.target.value) })} />
        </div>
      </div>
      <label className="marcar">
        <input type="checkbox" checked={temParcelas} onChange={(e) => setTemParcelas(e.target.checked)} />
        Tem número de parcelas (financiamento)
      </label>
      {temParcelas && (
        <div className="campo">
          <label htmlFor="r-parcelas">Parcelas que faltam (contando a deste mês, se não foi paga)</label>
          <input id="r-parcelas" type="number" min={0} value={f.parcelasRestantes ?? ''} onChange={(e) => setF({ ...f, parcelasRestantes: Number(e.target.value) })} />
        </div>
      )}
      <div className="campo">
        <label htmlFor="r-obs">Observação</label>
        <input id="r-obs" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} />
      </div>
      <label className="marcar">
        <input type="checkbox" checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />
        Continua (desmarque se acabou)
      </label>
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
          <Check aria-hidden="true" />
          Salvar
        </button>
      </div>
    </Janela>
  );
}
