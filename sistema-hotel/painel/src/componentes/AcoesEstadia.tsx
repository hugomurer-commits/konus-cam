import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarX, CircleAlert, CreditCard, HandCoins, LogOut, QrCode, type LucideIcon } from 'lucide-react';
import { api } from '../api';
import { emReais, FORMAS, dataCurta, nomeProprio, noites } from '../formato';
import { CampoReais, Escolha, MensagemErro } from './Basicos';
import { Janela, useInteracao } from './Interacao';
import '../estilo/hospedagem.css';

export type Forma = 'pix' | 'cartao' | 'dinheiro';

export interface ContaRecebedora {
  id: number;
  sigla: string;
  nome: string;
  ativa: number;
}

export function useContasRecebedoras() {
  return useQuery({
    queryKey: ['contas-recebedoras'],
    queryFn: () => api.get<{ contas: ContaRecebedora[]; maisUsada: number | null }>('/api/contas-recebedoras'),
    staleTime: 5 * 60_000,
  });
}

// Lembra a última forma e conta usadas neste navegador (a maioria é Pix e sempre a mesma conta)
const CHAVE_PREF = 'hotel-ultimo-pagamento';
export function preferenciaPagamento(): { forma: Forma; contaId: number | null } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREF) ?? '');
    return { forma: p.forma ?? 'pix', contaId: p.contaId ?? null };
  } catch {
    return { forma: 'pix', contaId: null };
  }
}
export function lembrarPagamento(forma: Forma, contaId: number | null) {
  try {
    localStorage.setItem(CHAVE_PREF, JSON.stringify({ forma, contaId }));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export interface Pagamento {
  valor: number | null;
  forma: Forma;
  contaRecebedoraId: number | null;
}

/** Ícone de cada forma de pagamento (Pix, Cartão, Dinheiro). */
export const ICONE_FORMA: Record<string, LucideIcon> = { pix: QrCode, cartao: CreditCard, dinheiro: Banknote };

/** Forma (Pix/Cartão/Dinheiro) + quem recebeu (H/V/N) + valor. */
export function CamposPagamento({ valor, aoMudar, idBase }: { valor: Pagamento; aoMudar: (p: Pagamento) => void; idBase: string }) {
  const contas = useContasRecebedoras();
  const sugerida = contas.data?.maisUsada ?? null;
  // Sem preferência guardada neste navegador: já vem marcada a conta que mais recebe
  useEffect(() => {
    if (valor.contaRecebedoraId === null && sugerida !== null) aoMudar({ ...valor, contaRecebedoraId: sugerida });
  }, [sugerida, valor, aoMudar]);
  return (
    <>
      <div className="campo">
        <span className="rotulo">Como pagou</span>
        <Escolha
          rotulo="Forma de pagamento"
          valor={valor.forma}
          aoEscolher={(forma) => aoMudar({ ...valor, forma })}
          opcoes={(['pix', 'cartao', 'dinheiro'] as Forma[]).map((f) => ({ valor: f, texto: FORMAS[f], icone: ICONE_FORMA[f] }))}
        />
      </div>
      <div className="campo">
        <span className="rotulo">Quem recebeu</span>
        <Escolha
          rotulo="Quem recebeu"
          valor={valor.contaRecebedoraId}
          aoEscolher={(contaRecebedoraId) => aoMudar({ ...valor, contaRecebedoraId })}
          opcoes={(contas.data?.contas ?? [])
            .filter((c) => c.ativa)
            .map((c) => ({ valor: c.id, texto: `${c.sigla} · ${c.nome}` }))}
        />
      </div>
      <CampoReais id={`${idBase}-valor`} rotulo="Valor recebido" valor={valor.valor} aoMudar={(v) => aoMudar({ ...valor, valor: v })} grande />
    </>
  );
}

export function textoPagamento(p: Pagamento, contas: ContaRecebedora[] | undefined): string {
  const conta = contas?.find((c) => c.id === p.contaRecebedoraId);
  return `${emReais(p.valor)} em ${FORMAS[p.forma]}${conta ? ` (${conta.nome})` : ''}`;
}

/** Detalhe do recibo da confirmação: ícone da forma + "em Pix · Hugo". */
export function detalhePagamento(p: Pagamento, contas: ContaRecebedora[] | undefined): ReactNode {
  const conta = contas?.find((c) => c.id === p.contaRecebedoraId);
  const Icone = ICONE_FORMA[p.forma];
  return (
    <>
      {Icone && <Icone aria-hidden="true" />}
      em {FORMAS[p.forma]}
      {conta ? ` · ${conta.nome}` : ''}
    </>
  );
}

/** Janela "Recebi": confirma e registra; aviso com Desfazer. */
export function JanelaReceber({
  estadiaId,
  nome,
  saldo,
  aoFechar,
  aoConcluir,
  titulo = 'Recebi',
  rodape,
}: {
  estadiaId: number;
  nome: string;
  saldo: number;
  aoFechar: () => void;
  aoConcluir?: () => void;
  titulo?: string;
  rodape?: ReactNode;
}) {
  const pref = preferenciaPagamento();
  const [p, setP] = useState<Pagamento>({ valor: saldo > 0 ? saldo : null, forma: pref.forma, contaRecebedoraId: pref.contaId });
  const [erro, setErro] = useState<unknown>(null);
  const contas = useContasRecebedoras();
  const { confirmar, avisar } = useInteracao();
  const cliente = useQueryClient();

  async function salvar() {
    setErro(null);
    if (!p.valor) return setErro(new Error('Informe o valor.'));
    if (!p.contaRecebedoraId) return setErro(new Error('Escolha quem recebeu.'));
    const ok = await confirmar({
      titulo: 'Confirmar pagamento',
      mensagem: (
        <>
          Confirmar o pagamento de <strong>{nomeProprio(nome)}</strong>?
        </>
      ),
      confirmar: 'Confirmar',
      verde: true,
      icone: HandCoins,
      recibo: { valor: emReais(p.valor), detalhe: detalhePagamento(p, contas.data?.contas) },
    });
    if (!ok) return;
    try {
      const r = await api.post<{ pagamentoId: number }>(`/api/estadias/${estadiaId}/receber`, p);
      lembrarPagamento(p.forma, p.contaRecebedoraId);
      cliente.invalidateQueries();
      avisar(`Recebido ${emReais(p.valor)}.`, {
        desfazer: async () => {
          await api.post(`/api/pagamentos/${r.pagamentoId}/cancelar`, { motivo: 'desfeito na hora' });
          cliente.invalidateQueries();
        },
      });
      aoConcluir?.();
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <Janela titulo={titulo} aoFechar={aoFechar} icone={HandCoins} tom="tom-livre">
      <div className="quem-paga">
        <span className="forte">{nomeProprio(nome)}</span>
        {saldo > 0 ? (
          <span className="saldo falta">
            <CircleAlert aria-hidden="true" />
            Falta pagar {emReais(saldo)}
          </span>
        ) : (
          <span className="suave">nada a receber</span>
        )}
      </div>
      <CamposPagamento valor={p} aoMudar={setP} idBase="receber" />
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        {rodape}
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande verde principal" onClick={salvar}>
          <HandCoins aria-hidden="true" />
          Recebi {p.valor ? emReais(p.valor) : ''}
        </button>
      </div>
    </Janela>
  );
}

interface ResumoParaSaida {
  id: number;
  nome: string;
}

/**
 * Ações rápidas usadas em Hoje, no mapa e no detalhe: "Chegou", "Saiu" (cobra antes se tiver saldo
 * e pergunta das noites não usadas), "Quarto limpo".
 */
export function useAcoesRapidas() {
  const { confirmar, avisar } = useInteracao();
  const cliente = useQueryClient();
  const [janela, setJanela] = useState<ReactNode>(null);

  async function chegou(id: number, nome: string) {
    try {
      await api.post(`/api/estadias/${id}/chegou`);
      cliente.invalidateQueries();
      avisar(`${nomeProprio(nome)} chegou.`);
    } catch (e) {
      avisar((e as Error).message, { erro: true });
    }
  }

  async function registrarSaida(e: ResumoParaSaida, tirar: boolean) {
    try {
      await api.post(`/api/estadias/${e.id}/saiu`, { tirarNoitesNaoUsadas: tirar });
      cliente.invalidateQueries();
      avisar(`${nomeProprio(e.nome)} saiu. Quarto marcado para limpar.`);
    } catch (err) {
      avisar((err as Error).message, { erro: true });
    }
  }

  async function saiu(e: ResumoParaSaida) {
    const d = await api.get<{ saldo: number; noitesNaoUsadas: string[]; noites: { data: string; valor: number }[] }>(
      `/api/estadias/${e.id}`,
    );
    // 1) Saída antecipada: pergunta das noites que não vai usar (a diária desta noite fica)
    let tirar = false;
    if (d.noitesNaoUsadas.length) {
      tirar = await confirmar({
        titulo: 'Saiu antes do previsto',
        icone: CalendarX,
        tom: 'tom-sai',
        mensagem: (
          <>
            {nomeProprio(e.nome)} tinha mais {noites(d.noitesNaoUsadas.length)} ({d.noitesNaoUsadas.map(dataCurta).join(', ')}). Tirar da
            conta as noites que não vai usar?
            <br />
            <span className="suave pequeno">A diária desta noite continua cobrada.</span>
          </>
        ),
        confirmar: 'Sim, tirar',
        cancelar: 'Não, manter',
      });
    }
    const tiradas = tirar ? d.noites.filter((n) => d.noitesNaoUsadas.includes(n.data)).reduce((s, n) => s + n.valor, 0) : 0;
    const saldo = d.saldo - tiradas;
    // 2) Com saldo, cobra antes de sair (seção 5.1)
    if (saldo > 0) {
      setJanela(
        <JanelaReceber
          titulo={`${nomeProprio(e.nome)} vai sair: falta pagar`}
          estadiaId={e.id}
          nome={e.nome}
          saldo={saldo}
          aoFechar={() => setJanela(null)}
          aoConcluir={() => registrarSaida(e, tirar)}
          rodape={
            <button
              className="botao grande perigo"
              onClick={async () => {
                setJanela(null);
                const ok = await confirmar({
                  titulo: 'Sair sem pagar?',
                  mensagem: (
                    <>
                      <strong>{nomeProprio(e.nome)}</strong> vai sair devendo <strong>{emReais(saldo)}</strong>. O saldo fica anotado
                      na hospedagem.
                    </>
                  ),
                  confirmar: 'Saiu sem pagar',
                  perigo: true,
                });
                if (ok) registrarSaida(e, tirar);
              }}
            >
              <LogOut aria-hidden="true" />
              Sair sem pagar
            </button>
          }
        />,
      );
      return;
    }
    const ok = await confirmar({
      titulo: 'Saiu',
      mensagem: (
        <>
          Confirmar a saída de <strong>{nomeProprio(e.nome)}</strong>?
        </>
      ),
      confirmar: 'Saiu',
      icone: LogOut,
      tom: 'tom-sai',
    });
    if (ok) registrarSaida(e, tirar);
  }

  async function quartoLimpo(quartoId: number, codigo: string) {
    try {
      await api.post(`/api/quartos/${quartoId}/limpo`);
      cliente.invalidateQueries();
      avisar(`Quarto ${codigo} limpo e liberado.`);
    } catch (e) {
      avisar((e as Error).message, { erro: true });
    }
  }

  function receber(id: number, nome: string, saldo: number) {
    setJanela(<JanelaReceber estadiaId={id} nome={nome} saldo={saldo} aoFechar={() => setJanela(null)} />);
  }

  return { chegou, saiu, quartoLimpo, receber, janela };
}
