import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react';

// Confirmação clara antes de mexer em dinheiro + aviso com "Desfazer" por alguns segundos (seção 5).

interface PedidoConfirmacao {
  titulo: string;
  mensagem: ReactNode;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
  /** Botão de confirmar verde (dinheiro entrando, check-in…) */
  verde?: boolean;
  icone?: LucideIcon;
  /** Classe de tom do ícone (tom-livre, tom-sai…) */
  tom?: string;
  /** Recibo em destaque: valor grande + como/quem */
  recibo?: { valor: ReactNode; detalhe?: ReactNode };
}

interface Aviso {
  id: number;
  texto: string;
  erro?: boolean;
  segundos: number;
  desfazer?: () => Promise<unknown> | unknown;
}

interface Interacao {
  confirmar: (p: PedidoConfirmacao) => Promise<boolean>;
  avisar: (texto: string, opcoes?: { desfazer?: Aviso['desfazer']; erro?: boolean }) => void;
}

const Ctx = createContext<Interacao | null>(null);

export const SEGUNDOS_DESFAZER = 10;

export function ProvedorInteracao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { responder: (ok: boolean) => void }) | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);

  const confirmar = useCallback(
    (p: PedidoConfirmacao) =>
      new Promise<boolean>((resolve) => {
        setPedido({
          ...p,
          responder: (ok) => {
            setPedido(null);
            resolve(ok);
          },
        });
      }),
    [],
  );

  const remover = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const avisar = useCallback<Interacao['avisar']>(
    (texto, opcoes = {}) => {
      const id = proximo.current++;
      const segundos = opcoes.desfazer ? SEGUNDOS_DESFAZER : 5;
      setAvisos((a) => [...a.slice(-2), { id, texto, segundos, ...opcoes }]);
      setTimeout(() => remover(id), segundos * 1000);
    },
    [remover],
  );

  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && <JanelaConfirmacao pedido={pedido} />}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso${a.erro ? ' erro' : ''}`} role={a.erro ? 'alert' : 'status'}>
            {a.erro ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            <span className="texto">{a.texto}</span>
            {a.desfazer && (
              <button
                className="desfazer"
                onClick={async () => {
                  remover(a.id);
                  try {
                    await a.desfazer!();
                    avisar('Desfeito.');
                  } catch (e) {
                    avisar((e as Error).message, { erro: true });
                  }
                }}
              >
                <Undo2 aria-hidden="true" />
                Desfazer
              </button>
            )}
            <button className="fechar" onClick={() => remover(a.id)}>
              Fechar
            </button>
            <span className="tempo" aria-hidden="true" style={{ ['--duracao' as string]: `${a.segundos}s` }} />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function JanelaConfirmacao({ pedido }: { pedido: PedidoConfirmacao & { responder: (ok: boolean) => void } }) {
  const botaoOk = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    botaoOk.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && pedido.responder(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [pedido]);
  return (
    <div className="fundo-janela" onClick={() => pedido.responder(false)}>
      <div className="janela" role="dialog" aria-modal="true" aria-labelledby="titulo-confirmacao" onClick={(e) => e.stopPropagation()}>
        <div className="janela-topo">
          <JanelaIcone
            icone={pedido.icone ?? (pedido.perigo ? TriangleAlert : CircleHelp)}
            tom={pedido.tom ?? (pedido.perigo ? 'tom-perigo' : pedido.verde ? 'tom-livre' : 'tom-ocupado')}
          />
          <h2 id="titulo-confirmacao">{pedido.titulo}</h2>
        </div>
        <div className="mensagem">{pedido.mensagem}</div>
        {pedido.recibo && (
          <div className="recibo">
            <span className="valor">{pedido.recibo.valor}</span>
            {pedido.recibo.detalhe && <span className="forma">{pedido.recibo.detalhe}</span>}
          </div>
        )}
        <div className="botoes direita">
          <button className="botao grande" onClick={() => pedido.responder(false)}>
            {pedido.cancelar ?? 'Voltar'}
          </button>
          <button
            ref={botaoOk}
            className={`botao grande principal${pedido.perigo ? ' perigo' : pedido.verde ? ' verde' : ''}`}
            onClick={() => pedido.responder(true)}
          >
            {pedido.confirmar ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useInteracao(): Interacao {
  const c = useContext(Ctx);
  if (!c) throw new Error('ProvedorInteracao ausente');
  return c;
}

function JanelaIcone({ icone: Icone, tom }: { icone: LucideIcon; tom: string }) {
  return (
    <span className={`chip-icone ${tom}`} aria-hidden="true">
      <Icone />
    </span>
  );
}

/** Janela genérica (formulários de Recebi, Paguei etc.). */
export function Janela({
  titulo,
  aoFechar,
  children,
  icone,
  tom = 'tom-ocupado',
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  icone?: LucideIcon;
  tom?: string;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  return (
    <div className="fundo-janela" onClick={aoFechar}>
      <div className="janela" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="janela-topo">
          {icone && <JanelaIcone icone={icone} tom={tom} />}
          <h2>{titulo}</h2>
        </div>
        <div className="corpo-janela">{children}</div>
      </div>
    </div>
  );
}
