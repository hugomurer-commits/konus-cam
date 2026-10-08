import { useEffect, useState, type ReactNode } from 'react';
import {
  BedDouble,
  CalendarClock,
  Check,
  CircleAlert,
  DoorOpen,
  LogIn,
  LogOut,
  SprayCan,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
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

/** Ícone de cada estado: o estado nunca é só cor (cor + ícone + texto). */
export const ICONE_ESTADO: Record<Estado, LucideIcon | null> = {
  livre: DoorOpen,
  ocupado: BedDouble,
  reservado: CalendarClock,
  chega: LogIn,
  sai: LogOut,
  limpar: SprayCan,
  atrasado: TriangleAlert,
  neutro: null,
  pago: Check,
};

export function Etiqueta({ estado, children }: { estado: Estado; children: ReactNode }) {
  const Icone = ICONE_ESTADO[estado];
  return (
    <span className={`etiqueta est-${estado}`}>
      {Icone && <Icone aria-hidden="true" />}
      {children}
    </span>
  );
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
      <CircleAlert aria-hidden="true" />
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

/** Grupo de opções grandes para escolher uma (forma de pagamento, nº de pessoas…): a marcada ganha o ✓. */
export function Escolha<T extends string | number>({
  opcoes,
  valor,
  aoEscolher,
  rotulo,
}: {
  opcoes: { valor: T; texto: ReactNode; icone?: LucideIcon; desabilitado?: boolean }[];
  valor: T | null | undefined;
  aoEscolher: (v: T) => void;
  rotulo: string;
  /** @deprecated as opções já são grandes */
  grande?: boolean;
}) {
  return (
    <div className="escolha" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={o.desabilitado}
          className="opcao"
          onClick={() => aoEscolher(o.valor)}
        >
          <span className="marca" aria-hidden="true">
            <Check />
          </span>
          {o.icone && <o.icone className="icone-opcao" aria-hidden="true" />}
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Ícone num quadradinho colorido (use com as classes tom-chega, tom-sai, tom-livre…). */
export function ChipIcone({ icone: Icone, tom = '' }: { icone: LucideIcon; tom?: string }) {
  return (
    <span className={`chip-icone ${tom}`} aria-hidden="true">
      <Icone />
    </span>
  );
}

/** Título de tela com ícone da área e botões à direita. */
export function TituloTela({
  icone,
  tom,
  titulo,
  subtitulo,
  children,
}: {
  icone?: LucideIcon;
  tom?: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="titulo-tela">
      <div>
        <h1>
          {icone && <ChipIcone icone={icone} tom={tom} />}
          {titulo}
        </h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
      </div>
      {children && <div className="botoes">{children}</div>}
    </div>
  );
}
