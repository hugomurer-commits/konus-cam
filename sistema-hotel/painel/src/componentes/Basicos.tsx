import { useEffect, useState, type ReactNode } from 'react';
import { emReais, lerReais, reaisParaTexto } from '../formato';

export function Dinheiro({ valor, className = '' }: { valor: number | null | undefined; className?: string }) {
  return <span className={`dinheiro ${className}`}>{emReais(valor)}</span>;
}

export type Estado =
  | 'livre'
  | 'ocupado'
  | 'reservado'
  | 'chega'
  | 'sai'
  | 'limpar'
  | 'atrasado'
  | 'neutro'
  | 'pago';

export function Etiqueta({ estado, children }: { estado: Estado; children: ReactNode }) {
  return <span className={`etiqueta est-${estado}`}>{children}</span>;
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <img src="/logo.png" alt="" />
      <span className="suave">{texto}</span>
    </div>
  );
}

export function MensagemErro({ erro }: { erro: unknown }) {
  if (!erro) return null;
  return (
    <p className="erro-form" role="alert">
      {(erro as Error).message ?? String(erro)}
    </p>
  );
}

/** Campo de dinheiro: aceita "200", "200,50", "1.234,56". */
export function CampoReais({
  id,
  rotulo,
  valor,
  aoMudar,
  ajuda,
  grande,
  autoFocus,
}: {
  id: string;
  rotulo: string;
  valor: number | null;
  aoMudar: (centavos: number | null) => void;
  ajuda?: string;
  grande?: boolean;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState(reaisParaTexto(valor));
  useEffect(() => {
    if (lerReais(texto) !== valor) setTexto(reaisParaTexto(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={grande ? 'entrada-grande' : ''}
        autoFocus={autoFocus}
        value={texto}
        placeholder="R$ 0,00"
        onChange={(e) => {
          setTexto(e.target.value);
          aoMudar(lerReais(e.target.value));
        }}
      />
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </div>
  );
}

/** Grupo de botões grandes para escolher uma opção (forma de pagamento, nº de pessoas…). */
export function Escolha<T extends string | number>({
  opcoes,
  valor,
  aoEscolher,
  rotulo,
  grande = true,
}: {
  opcoes: { valor: T; texto: ReactNode; desabilitado?: boolean }[];
  valor: T | null | undefined;
  aoEscolher: (v: T) => void;
  rotulo: string;
  grande?: boolean;
}) {
  return (
    <div className="botoes" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={o.desabilitado}
          className={`botao${grande ? ' grande' : ''}${valor === o.valor ? ' selecionado' : ''}`}
          onClick={() => aoEscolher(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
