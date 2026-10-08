import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Barcode,
  CalendarCheck,
  Check,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  Lightbulb,
  Pencil,
  Plus,
  QrCode,
  Receipt,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { CampoReais, Escolha, MensagemErro, TituloTela } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { dataCurta, emReais, FORMAS, GRUPOS, hojeLocal, somarDias } from '../../formato';
import '../../estilo/dinheiro.css';

type Forma = 'pix' | 'cartao' | 'dinheiro' | 'boleto';

/** Ícone de cada forma de pagamento (usado no Caixa e em Contas). */
export const ICONE_FORMA: Record<string, LucideIcon> = {
  pix: QrCode,
  cartao: CreditCard,
  dinheiro: Banknote,
  boleto: Barcode,
  nao_informado: CircleHelp,
};

/** Forma de pagamento com ícone ("Pix", "Dinheiro"…). */
export function FormaComIcone({ forma, prefixo = '' }: { forma: string; prefixo?: string }) {
  const Icone = ICONE_FORMA[forma] ?? CircleHelp;
  return (
    <>
      <Icone aria-hidden="true" />
      {prefixo}
      {FORMAS[forma] ?? forma}
    </>
  );
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Folhinha de calendário: mês abreviado em cima, dia embaixo. A data já vem escrita no texto ao lado. */
export function Folhinha({ data, classe = '', mes, dia }: { data?: string | null; classe?: string; mes?: string; dia?: string | number }) {
  const m = mes ?? (data ? MESES_CURTOS[Number(data.slice(5, 7)) - 1] : '');
  const d = dia ?? (data ? data.slice(8, 10) : '');
  return (
    <span className={`folhinha ${classe}`} aria-hidden="true">
      <span className="mes">{m}</span>
      <span className="dia">{String(d).padStart(2, '0')}</span>
    </span>
  );
}

/** "outubro de 2026" → "Outubro de 2026" */
export function maiuscula(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface Categoria {
  id: number;
  nome: string;
  grupo: string;
  ativa: number;
  aviso?: string;
}

export function useCategorias() {
  return useQuery({ queryKey: ['categorias'], queryFn: () => api.get<{ categorias: Categoria[] }>('/api/categorias') });
}

interface FormDespesa {
  data: string;
  categoriaId: number | null;
  fornecedor: string;
  descricao: string;
  valor: number | null;
  forma: Forma;
}

/** Na tela cheia cada parte vira um cartão numerado (como a Nova hospedagem); na janela fica tudo junto. */
function Bloco({ emCartao, numero, titulo, children }: { emCartao: boolean; numero: number; titulo: string; children: ReactNode }) {
  if (!emCartao) return <>{children}</>;
  return (
    <section className="cartao passo">
      <span className="passo-numero" aria-hidden="true">
        {numero}
      </span>
      <h2 className="rotulo">{titulo}</h2>
      {children}
    </section>
  );
}

/** Campos da despesa: rápido como o check-in (seção 5.4). */
function CamposDespesa({ f, setF, emCartoes = false }: { f: FormDespesa; setF: (f: FormDespesa) => void; emCartoes?: boolean }) {
  const hoje = hojeLocal();
  const categorias = useCategorias();
  const maisUsadas = useQuery({
    queryKey: ['categorias-mais-usadas'],
    queryFn: () => api.get<{ categorias: Categoria[] }>('/api/categorias/mais-usadas'),
  });
  const [termo, setTermo] = useState(f.fornecedor);
  const sugestoes = useQuery({
    queryKey: ['fornecedores', termo],
    queryFn: () =>
      api.get<{ fornecedores: { fornecedor: string; categoria_id: number; categoria: string }[] }>(`/api/fornecedores?q=${encodeURIComponent(termo)}`),
    enabled: termo.trim().length >= 2,
  });
  const ativas = (categorias.data?.categorias ?? []).filter((c) => c.ativa);
  const botoes = maisUsadas.data?.categorias ?? [];
  const escolhida = ativas.find((c) => c.id === f.categoriaId);
  const foraDosBotoes = f.categoriaId !== null && !botoes.some((b) => b.id === f.categoriaId);

  return (
    <>
      <Bloco emCartao={emCartoes} numero={1} titulo="Quando e onde">
        <div className="campo">
          <span className="rotulo">Quando</span>
          <div className="botoes">
            <Escolha
              rotulo="Data"
              valor={f.data === hoje ? 'hoje' : f.data === somarDias(hoje, -1) ? 'ontem' : 'outra'}
              aoEscolher={(v) => v !== 'outra' && setF({ ...f, data: v === 'hoje' ? hoje : somarDias(hoje, -1) })}
              opcoes={[
                { valor: 'hoje', texto: `Hoje (${dataCurta(hoje)})` },
                { valor: 'ontem', texto: 'Ontem' },
              ]}
            />
            <input
              type="date"
              className="entrada campo-data"
              aria-label="Outra data"
              value={f.data}
              max={hoje}
              onChange={(e) => e.target.value && setF({ ...f, data: e.target.value })}
            />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="fornecedor">Fornecedor / onde comprou</label>
          <div className="campo-busca">
            <Store aria-hidden="true" />
            <input
              id="fornecedor"
              list="lista-fornecedores"
              autoComplete="off"
              value={f.fornecedor}
              onChange={(e) => {
                const v = e.target.value;
                setTermo(v);
                // Escolheu um fornecedor conhecido: já marca a categoria de sempre
                const conhecido = sugestoes.data?.fornecedores.find((s) => s.fornecedor.toLowerCase() === v.toLowerCase());
                setF({ ...f, fornecedor: v, categoriaId: conhecido && f.categoriaId === null ? conhecido.categoria_id : f.categoriaId });
              }}
            />
          </div>
          <datalist id="lista-fornecedores">
            {sugestoes.data?.fornecedores.map((s) => (
              <option key={s.fornecedor} value={s.fornecedor}>
                {s.categoria}
              </option>
            ))}
          </datalist>
        </div>
      </Bloco>
      <Bloco emCartao={emCartoes} numero={2} titulo="O que foi comprado">
        <div className="campo">
          <span className="rotulo">Categoria</span>
          <div className="botoes escolha" role="group" aria-label="Categoria">
            {botoes.map((c) => (
              <button
                key={c.id}
                type="button"
                className="opcao"
                aria-pressed={f.categoriaId === c.id}
                onClick={() => setF({ ...f, categoriaId: c.id })}
              >
                <span className="marca" aria-hidden="true">
                  <Check />
                </span>
                {c.nome}
              </button>
            ))}
            <select
              className={`entrada campo-categoria${foraDosBotoes ? ' selecionado' : ''}`}
              aria-label="Outra categoria"
              value={foraDosBotoes ? String(f.categoriaId) : ''}
              onChange={(e) => e.target.value && setF({ ...f, categoriaId: Number(e.target.value) })}
            >
              <option value="">Outra categoria…</option>
              {Object.entries(GRUPOS).map(([g, t]) => (
                <optgroup key={g} label={t}>
                  {ativas
                    .filter((c) => c.grupo === g)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          {escolhida && (
            <span className="ajuda">
              Entra em: <strong>{GRUPOS[escolhida.grupo]}</strong>
              {escolhida.aviso ? ` · ${escolhida.aviso}` : ''}
            </span>
          )}
        </div>
        <div className="campo">
          <label htmlFor="descricao-despesa">O que foi (opcional)</label>
          <input id="descricao-despesa" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
      </Bloco>
      <Bloco emCartao={emCartoes} numero={3} titulo="Valor e pagamento">
        <CampoReais id="valor-despesa" rotulo="Valor" valor={f.valor} aoMudar={(valor) => setF({ ...f, valor })} grande />
        <div className="campo">
          <span className="rotulo">Como pagou</span>
          <Escolha
            rotulo="Forma de pagamento"
            valor={f.forma}
            aoEscolher={(forma) => setF({ ...f, forma })}
            opcoes={(['pix', 'dinheiro', 'cartao', 'boleto'] as Forma[]).map((x) => ({ valor: x, texto: FORMAS[x], icone: ICONE_FORMA[x] }))}
          />
        </div>
      </Bloco>
    </>
  );
}

function validarForm(f: FormDespesa): string | null {
  if (!f.categoriaId) return 'Escolha a categoria.';
  if (!f.valor) return 'Informe o valor.';
  return null;
}

export function LancarDespesa() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const categorias = useCategorias();
  const [f, setF] = useState<FormDespesa>({ data: hojeLocal(), categoriaId: null, fornecedor: '', descricao: '', valor: null, forma: 'pix' });
  const [erro, setErro] = useState<unknown>(null);

  async function salvar(continuar: boolean) {
    setErro(null);
    const problema = validarForm(f);
    if (problema) return setErro(new Error(problema));
    const cat = categorias.data?.categorias.find((c) => c.id === f.categoriaId)?.nome;
    const ok = await confirmar({
      titulo: 'Confirmar despesa',
      icone: Receipt,
      tom: 'tom-caixa',
      mensagem: (
        <>
          Confirmar despesa de <strong>{cat}</strong>
          {f.fornecedor ? `, ${f.fornecedor}` : ''}, dia {dataCurta(f.data)}?
        </>
      ),
      recibo: { valor: emReais(f.valor), detalhe: <FormaComIcone forma={f.forma} prefixo="em " /> },
    });
    if (!ok) return;
    try {
      const r = await api.post<{ id: number }>('/api/despesas', f);
      cliente.invalidateQueries();
      avisar(`Despesa de ${emReais(f.valor)} lançada.`, {
        desfazer: async () => {
          await api.post(`/api/despesas/${r.id}/cancelar`);
          cliente.invalidateQueries();
        },
      });
      if (continuar) setF({ ...f, categoriaId: null, fornecedor: '', descricao: '', valor: null });
      else navegar('/caixa');
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <>
      <TituloTela icone={Receipt} tom="tom-caixa" titulo="Lançar despesa" subtitulo="Quando, o que foi, quanto custou e como pagou.">
        <button className="botao" onClick={() => navegar('/caixa')}>
          <ChevronLeft aria-hidden="true" />
          Voltar
        </button>
      </TituloTela>
      <CamposDespesa f={f} setF={setF} emCartoes />
      <MensagemErro erro={erro} />
      <div className="botoes acoes-despesa">
        <button className="botao principal grande" onClick={() => salvar(false)}>
          <Check aria-hidden="true" />
          Salvar despesa
        </button>
        <button className="botao grande" onClick={() => salvar(true)}>
          <Plus aria-hidden="true" />
          Salvar e lançar outra
        </button>
      </div>
      <p className="dica">
        <Lightbulb aria-hidden="true" />
        <span>
          Conta que chega todo mês (luz, água, financiamento)? Use{' '}
          <strong>
            <CalendarCheck aria-hidden="true" className="icone-texto" /> Contas → Paguei
          </strong>
          : a despesa é lançada sozinha.
        </span>
      </p>
    </>
  );
}

/** Mudar uma despesa já lançada. */
export function JanelaDespesa({
  despesa,
  aoFechar,
}: {
  despesa: { id: number; data: string; categoria_id: number; fornecedor: string; descricao: string; valor: number; forma: string };
  aoFechar: () => void;
}) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [f, setF] = useState<FormDespesa>({
    data: despesa.data,
    categoriaId: despesa.categoria_id,
    fornecedor: despesa.fornecedor,
    descricao: despesa.descricao,
    valor: despesa.valor,
    forma: (['pix', 'cartao', 'dinheiro', 'boleto'].includes(despesa.forma) ? despesa.forma : 'pix') as Forma,
  });
  const [erro, setErro] = useState<unknown>(null);
  useEffect(() => setErro(null), [f]);
  async function salvar() {
    const problema = validarForm(f);
    if (problema) return setErro(new Error(problema));
    try {
      await api.put(`/api/despesas/${despesa.id}`, f);
      cliente.invalidateQueries();
      avisar('Despesa atualizada.');
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo="Mudar despesa" aoFechar={aoFechar} icone={Pencil} tom="tom-caixa">
      {despesa.forma === 'nao_informado' && <p className="dica">
        <CircleHelp aria-hidden="true" />
        <span>Veio da planilha sem forma de pagamento: escolha a certa se souber.</span>
      </p>}
      <CamposDespesa f={f} setF={setF} />
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
