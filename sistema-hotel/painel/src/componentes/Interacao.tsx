import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Confirmação clara antes de mexer em dinheiro + aviso com "Desfazer" por alguns segundos (seção 5).

interface PedidoConfirmacao {
  titulo: string;
  mensagem: ReactNode;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
}

interface Aviso {
  id: number;
  texto: string;
  erro?: boolean;
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
      setAvisos((a) => [...a.slice(-2), { id, texto, ...opcoes }]);
      setTimeout(() => remover(id), (opcoes.desfazer ? SEGUNDOS_DESFAZER : 5) * 1000);
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
            <span className="texto">{a.texto}</span>
            {a.desfazer && (
              <button
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
                Desfazer
              </button>
            )}
            <button aria-label="Fechar aviso" onClick={() => remover(a.id)}>
              ✕
            </button>
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
        <h2 id="titulo-confirmacao">{pedido.titulo}</h2>
        <div className="mensagem">{pedido.mensagem}</div>
        <div className="botoes direita">
          <button className="botao grande" onClick={() => pedido.responder(false)}>
            {pedido.cancelar ?? 'Voltar'}
          </button>
          <button
            ref={botaoOk}
            className={`botao grande principal${pedido.perigo ? ' perigo' : ''}`}
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

/** Janela genérica (formulários de Recebi, Paguei etc.). */
export function Janela({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  return (
    <div className="fundo-janela" onClick={aoFechar}>
      <div className="janela" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}
