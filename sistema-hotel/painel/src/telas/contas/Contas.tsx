import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { CampoReais, Carregando, Dinheiro, Escolha, Etiqueta, MensagemErro, type Estado } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, emReais, FORMAS, GRUPOS, hojeLocal, nomeMes } from '../../formato';
import { useCategorias } from '../caixa/LancarDespesa';
import { Funcionarias } from './Funcionarias';

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

const ESTADOS: Record<Conta['estado'], { texto: string; estado: Estado }> = {
  paga: { texto: 'Paga', estado: 'pago' },
  atrasada: { texto: 'Atrasada', estado: 'atrasado' },
  vence_hoje: { texto: 'Vence hoje', estado: 'sai' },
  vence_breve: { texto: 'Vence em breve', estado: 'chega' },
  aberta: { texto: 'Em aberto', estado: 'neutro' },
};

export function Contas() {
  return (
    <>
      <nav className="abas" aria-label="Seções de contas">
        {[
          { para: '/contas', texto: 'Contas do mês', fim: true },
          { para: '/contas/recorrentes', texto: 'Contas que se repetem' },
          { para: '/contas/funcionarias', texto: 'Funcionárias e vales' },
        ].map((a) => (
          <NavLink key={a.para} to={a.para} end={a.fim} className={({ isActive }) => `botao${isActive ? ' selecionado' : ''}`}>
            {a.texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<ContasDoMes />} />
        <Route path="recorrentes" element={<Recorrentes />} />
        <Route path="funcionarias" element={<Funcionarias />} />
      </Routes>
    </>
  );
}

function somarMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
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
      <div className="titulo-tela">
        <div className="botoes">
          <button className="botao" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>
            ←
          </button>
          <h1 style={{ margin: 0, minWidth: 240, textAlign: 'center' }}>{nomeMes(mes)}</h1>
          <button className="botao" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>
            →
          </button>
        </div>
        <button className="botao principal" onClick={() => setNova(true)}>
          + Conta avulsa
        </button>
      </div>
      <div className="grade-4">
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--vermelho-alerta)' }}>
            {emReais(totalAberto)}
          </div>
          <div className="rotulo">A pagar ({abertas.length})</div>
        </div>
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--verde-escuro)' }}>
            {emReais(totalPago)}
          </div>
          <div className="rotulo">Já pago</div>
        </div>
      </div>
      {dados.isLoading && <Carregando />}
      <div className="cartao">
        {contas.length === 0 && <p className="vazio">Nenhuma conta neste mês.</p>}
        <ul className="lista">
          {contas.map((c) => {
            const est = ESTADOS[c.estado];
            const valor = c.status === 'paga' ? c.valor_pago : c.aPagar ?? c.valor_previsto;
            return (
              <li key={c.id}>
                <div style={{ minWidth: 110 }}>
                  <Etiqueta estado={est.estado}>{est.texto}</Etiqueta>
                </div>
                <div className="principal-item">
                  <div className="nome">{c.descricao}</div>
                  <div className="suave pequeno">
                    {c.status === 'paga'
                      ? `Paga em ${data(c.data_pagamento)}${c.forma ? ` · ${FORMAS[c.forma]}` : ''}`
                      : `Vence ${data(c.vencimento)}`}
                    {c.competencia !== mes && ` · de ${nomeMes(c.competencia)}`}
                    {c.parcelas_restantes !== null && c.status === 'aberta' && ` · faltam ${c.parcelas_restantes} parcelas`}
                    {c.funcionaria_id && c.vales.length > 0 && c.status === 'aberta' && ` · descontados ${c.vales.length} vales`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {valor !== null ? <Dinheiro valor={valor} className="forte" /> : <span className="suave">variável</span>}
                  {c.valor_variavel === 1 && c.status === 'aberta' && valor !== null && <div className="suave pequeno">mais ou menos</div>}
                </div>
                {c.status === 'aberta' ? (
                  <>
                    <button className="botao principal grande" onClick={() => setPagando(c)}>
                      Paguei
                    </button>
                    <button className="botao pequeno sem-borda" onClick={() => tirar(c)}>
                      Tirar
                    </button>
                  </>
                ) : (
                  <button className="botao pequeno" onClick={() => desfazer(c)}>
                    Desfazer
                  </button>
                )}
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
      mensagem: (
        <>
          Paguei <strong>{conta.descricao}</strong>: <strong>{emReais(valor)}</strong> em {FORMAS[forma]}, dia {dataCurta(dia)}?
        </>
      ),
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
    <Janela titulo={`Paguei: ${conta.descricao}`} aoFechar={aoFechar}>
      {conta.funcionaria_id && conta.vales.length > 0 && (
        <p className="suave">
          Salário menos {conta.vales.length} {conta.vales.length === 1 ? 'vale' : 'vales'} ({conta.vales.map((v) => `${dataCurta(v.data)}: ${emReais(v.valor)}`).join(', ')}).
        </p>
      )}
      {conta.valor_variavel === 1 && sugerido !== null && <p className="suave">Costuma ser perto de {emReais(sugerido)}. Digite o valor da conta.</p>}
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
          opcoes={(['pix', 'boleto', 'dinheiro', 'cartao'] as Forma[]).map((f) => ({ valor: f, texto: FORMAS[f] }))}
        />
      </div>
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
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
    <Janela titulo="Conta avulsa" aoFechar={aoFechar}>
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

function Recorrentes() {
  const dados = useQuery({ queryKey: ['contas-recorrentes'], queryFn: () => api.get<{ recorrentes: Recorrente[] }>('/api/contas-recorrentes') });
  const [editando, setEditando] = useState<Recorrente | 'nova' | null>(null);
  if (dados.isLoading) return <Carregando />;
  return (
    <>
      <div className="titulo-tela">
        <h1>Contas que se repetem</h1>
        <button className="botao principal" onClick={() => setEditando('nova')}>
          + Nova
        </button>
      </div>
      <p className="suave">Todo mês o sistema cria estas contas sozinho e avisa antes de vencer.</p>
      <div className="cartao">
        <ul className="lista">
          {dados.data!.recorrentes.map((r) => (
            <li key={r.id} style={r.ativa ? {} : { opacity: 0.6 }}>
              <div className="principal-item">
                <div className="nome">{r.nome}</div>
                <div className="suave pequeno">
                  Dia {r.dia_vencimento} · {r.categoria}
                  {r.parcelas_restantes !== null &&
                    (r.parcelas_restantes > 0
                      ? ` · faltam ${r.parcelas_restantes} parcelas${r.quitacao ? `, termina em ${data(r.quitacao)}` : ''}`
                      : ' · quitado')}
                  {r.obs ? ` · ${r.obs}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {r.valor_previsto !== null ? <Dinheiro valor={r.valor_previsto} /> : <span className="suave">variável</span>}
                {r.valor_variavel === 1 && r.valor_previsto !== null && <div className="suave pequeno">varia</div>}
              </div>
              {!r.ativa && <Etiqueta estado="neutro">Parada</Etiqueta>}
              <button className="botao" onClick={() => setEditando(r)}>
                Mudar
              </button>
            </li>
          ))}
        </ul>
      </div>
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
    <Janela titulo={r ? `Mudar: ${r.nome}` : 'Nova conta que se repete'} aoFechar={aoFechar}>
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
          Salvar
        </button>
      </div>
    </Janela>
  );
}
