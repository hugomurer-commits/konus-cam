import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  BedDouble,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  DoorOpen,
  HandCoins,
  HardDrive,
  Hourglass,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  SprayCan,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api';
import { Carregando, ChipIcone, Dinheiro, Etiqueta, MensagemErro } from '../componentes/Basicos';
import { useAcoesRapidas } from '../componentes/AcoesEstadia';
import { useSessao } from '../sessao';
import { dataCurta, diaDaSemana, diasEntre, hora, nomeMes, nomeProprio, noites } from '../formato';
import '../estilo/hoje.css';

interface Linha {
  id: number;
  nome: string;
  quarto: string;
  quarto_id: number;
  data_entrada: string;
  data_saida: string;
  hora_chegada_prevista: string | null;
  pre_reserva_expira_em: string | null;
  pessoas: number;
  total: number;
  pago: number;
  saldo: number;
  atrasada?: boolean;
}

interface Alerta {
  tipo: string;
  cor: 'vermelho' | 'laranja' | 'amarelo';
  titulo: string;
  texto: string;
  link?: string;
  estadiaId?: number;
  expiraEm?: string;
}

interface PainelHoje {
  hoje: string;
  numeros: { ocupados: number; livres: number; chegadas: number; saidas: number };
  chegam: Linha[];
  saem: Linha[];
  noHotel: Linha[];
  preReservas: Linha[];
  paraLimpar: { id: number; codigo: string; limpar_desde: string | null }[];
  alertas: Alerta[];
}

/** Quantos avisos aparecem antes do "Ver mais". */
const AVISOS_VISIVEIS = 2;

/** Ícone de cada tipo de aviso (o aviso já tem cor e texto; o ícone ajuda a reconhecer de longe). */
const ICONE_ALERTA: Record<string, LucideIcon> = {
  backup_atrasado: HardDrive,
  conta_atrasada: TriangleAlert,
  conta_hoje: CalendarClock,
  conta_breve: CalendarClock,
  pre_reserva: Hourglass,
  saida_com_saldo: HandCoins,
  saida_atrasada: AlarmClock,
  saldo_na_chegada: HandCoins,
};

function iconeAlerta(a: Alerta): LucideIcon {
  return ICONE_ALERTA[a.tipo] ?? (a.cor === 'vermelho' ? TriangleAlert : CircleAlert);
}

/** "Bom dia" / "Boa tarde" / "Boa noite" pela hora deste computador. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** 'AAAA-MM-DD' → "Quinta-feira, 8 de outubro de 2026" */
function dataPorExtenso(d: string): string {
  const dia = diaDaSemana(d);
  const semana = dia === 'sábado' || dia === 'domingo' ? dia : `${dia}-feira`;
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${Number(d.slice(8, 10))} de ${nomeMes(d.slice(0, 7))}`;
}

function Contador({ ate }: { ate: string }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.parse(ate) - agora) / 1000));
  return (
    <strong className="dinheiro">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </strong>
  );
}

function Saldo({ l }: { l: Linha }) {
  if (l.saldo > 0)
    return (
      <span className="saldo falta">
        Falta <Dinheiro valor={l.saldo} />
      </span>
    );
  return (
    <span className="saldo pago">
      <Check aria-hidden="true" />
      Pago
    </span>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="vazio">
      <CircleCheck aria-hidden="true" />
      {texto}
    </p>
  );
}

function TopoLista({ icone, titulo, total }: { icone: LucideIcon; titulo: string; total: number }) {
  return (
    <header className="cartao-topo">
      <ChipIcone icone={icone} />
      <h2>{titulo}</h2>
      <span className="contagem">{total}</span>
    </header>
  );
}

export function Hoje() {
  const navegar = useNavigate();
  const { usuario } = useSessao();
  const [todosAvisos, setTodosAvisos] = useState(false);
  const dados = useQuery({
    queryKey: ['hoje'],
    queryFn: () => api.get<PainelHoje>('/api/hoje'),
    refetchInterval: 60_000,
  });
  const acoes = useAcoesRapidas();
  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const d = dados.data!;

  const primeiroNome = nomeProprio(usuario?.nome ?? '').trim().split(/\s+/)[0];
  const escondidos = Math.max(0, d.alertas.length - AVISOS_VISIVEIS);
  const alertasVisiveis = todosAvisos ? d.alertas : d.alertas.slice(0, AVISOS_VISIVEIS);
  // Ocupados + livres = quartos em uso (ativos)
  const totalQuartos = d.numeros.ocupados + d.numeros.livres;
  const pctOcupado = totalQuartos > 0 ? Math.round((d.numeros.ocupados / totalQuartos) * 100) : 0;

  return (
    <>
      <header className="saudacao">
        <div>
          <h1>
            <span className="sol-logo" aria-hidden="true" />
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ''}
          </h1>
          <p className="data-extenso">{dataPorExtenso(d.hoje)}</p>
        </div>
        <button className="botao principal enorme" onClick={() => navegar('/nova-hospedagem')}>
          <span className="bolha">
            <Plus aria-hidden="true" />
          </span>
          Nova hospedagem
        </button>
      </header>

      {d.alertas.length > 0 && (
        <section className="alertas" aria-label="Alertas">
          {alertasVisiveis.map((a, i) => (
            <div key={i} className={`alerta ${a.cor}`}>
              <ChipIcone icone={iconeAlerta(a)} />
              <div className="texto">
                <span className="tipo">{a.titulo}: </span>
                {a.texto}
                {a.expiraEm && (
                  <>
                    {' '}
                    Expira em <Contador ate={a.expiraEm} />
                  </>
                )}
              </div>
              <div className="botoes alerta-botoes">
                {a.estadiaId && (
                  <Link to={`/estadia/${a.estadiaId}`} className="botao pequeno">
                    Abrir
                  </Link>
                )}
                {a.link && (
                  <Link to={a.link} className="botao pequeno">
                    Ver
                  </Link>
                )}
              </div>
            </div>
          ))}
          {escondidos > 0 && (
            <button
              type="button"
              className="botao pequeno sem-borda mais-avisos"
              aria-expanded={todosAvisos}
              onClick={() => setTodosAvisos((v) => !v)}
            >
              {todosAvisos ? (
                <>
                  <ChevronUp aria-hidden="true" />
                  Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown aria-hidden="true" />
                  Ver mais {escondidos} {escondidos === 1 ? 'aviso' : 'avisos'}
                </>
              )}
            </button>
          )}
        </section>
      )}

      <section className="cartao resumo-dia" aria-label="Resumo de hoje">
        <div className="kpis">
          <div className="kpi tom-ocupado">
            <ChipIcone icone={BedDouble} />
            <span className="kpi-valor">{d.numeros.ocupados}</span>
            <span className="kpi-rotulo">Ocupados</span>
          </div>
          <div className="kpi tom-livre">
            <ChipIcone icone={DoorOpen} />
            <span className="kpi-valor">{d.numeros.livres}</span>
            <span className="kpi-rotulo">Livres</span>
          </div>
          <div className="kpi tom-chega">
            <ChipIcone icone={LogIn} />
            <span className="kpi-valor">{d.numeros.chegadas}</span>
            <span className="kpi-rotulo">Chegam</span>
          </div>
          <div className="kpi tom-sai">
            <ChipIcone icone={LogOut} />
            <span className="kpi-valor">{d.numeros.saidas}</span>
            <span className="kpi-rotulo">Saem</span>
          </div>
        </div>
        {totalQuartos > 0 && (
          <div className="ocupacao">
            <div className="ocupacao-texto">
              <strong>Hotel {pctOcupado}% ocupado</strong>{' '}
              <span>
                · {d.numeros.ocupados} de {totalQuartos} {totalQuartos === 1 ? 'quarto' : 'quartos'}
              </span>
            </div>
            <div className="ocupacao-trilho" aria-hidden="true">
              <div className="ocupacao-barra" style={{ '--pct': `${pctOcupado}%` } as CSSProperties} />
            </div>
          </div>
        )}
      </section>

      {d.preReservas.length > 0 && (
        <section className="cartao cartao-lista tom-hoje">
          <TopoLista icone={Hourglass} titulo="Pré-reservas aguardando Pix" total={d.preReservas.length} />
          <ul className="lista lista-hospedes">
            {d.preReservas.map((p) => (
              <li key={p.id}>
                <span className="chaveiro" aria-hidden="true">
                  {p.quarto}
                </span>
                <div className="principal-item">
                  <div className="nome">{nomeProprio(p.nome)}</div>
                  <div className="detalhe">
                    Quarto <strong>{p.quarto}</strong> · {dataCurta(p.data_entrada)} a {dataCurta(p.data_saida)} · expira em{' '}
                    {p.pre_reserva_expira_em && <Contador ate={p.pre_reserva_expira_em} />}
                  </div>
                </div>
                <Link to={`/estadia/${p.id}`} className="botao">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grade-2">
        <section className="cartao cartao-lista tom-chega">
          <TopoLista icone={LogIn} titulo="Chegam hoje" total={d.chegam.length} />
          {d.chegam.length === 0 && <Vazio texto="Ninguém para chegar." />}
          <ul className="lista lista-hospedes">
            {d.chegam.map((l) => (
              <li key={l.id}>
                <span className="chaveiro" aria-hidden="true">
                  {l.quarto}
                </span>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {nomeProprio(l.nome)}
                  </Link>
                  <div className="detalhe">
                    Quarto <strong>{l.quarto}</strong>
                    {l.hora_chegada_prevista ? ` · chega ${l.hora_chegada_prevista}` : ''}
                    {l.atrasada && (
                      <>
                        {' '}
                        <Etiqueta estado="atrasado">Era para {dataCurta(l.data_entrada)}</Etiqueta>
                      </>
                    )}
                  </div>
                  <Saldo l={l} />
                </div>
                <button className="botao principal grande" onClick={() => acoes.chegou(l.id, l.nome)}>
                  <LogIn aria-hidden="true" />
                  Chegou
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao cartao-lista tom-sai">
          <TopoLista icone={LogOut} titulo="Saem hoje" total={d.saem.length} />
          {d.saem.length === 0 && <Vazio texto="Ninguém para sair." />}
          <ul className="lista lista-hospedes">
            {d.saem.map((l) => (
              <li key={l.id}>
                <span className="chaveiro" aria-hidden="true">
                  {l.quarto}
                </span>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {nomeProprio(l.nome)}
                  </Link>
                  <div className="detalhe">
                    Quarto <strong>{l.quarto}</strong> · {noites(diasEntre(l.data_entrada, l.data_saida))}
                    {l.atrasada && (
                      <>
                        {' '}
                        <Etiqueta estado="atrasado">Passou da hora</Etiqueta>
                      </>
                    )}
                  </div>
                  <Saldo l={l} />
                </div>
                <button className="botao principal grande" onClick={() => acoes.saiu({ id: l.id, nome: l.nome })}>
                  <LogOut aria-hidden="true" />
                  Saiu
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao cartao-lista tom-limpar">
          <TopoLista icone={SprayCan} titulo="Para limpar" total={d.paraLimpar.length} />
          {d.paraLimpar.length === 0 && <Vazio texto="Nenhum quarto esperando limpeza." />}
          <ul className="lista lista-hospedes">
            {d.paraLimpar.map((q) => (
              <li key={q.id}>
                <span className="chaveiro" aria-hidden="true">
                  {q.codigo}
                </span>
                <div className="principal-item">
                  <div className="nome">Quarto {q.codigo}</div>
                  {q.limpar_desde && <div className="detalhe">Desde {hora(q.limpar_desde)}</div>}
                </div>
                <button className="botao verde principal grande" onClick={() => acoes.quartoLimpo(q.id, q.codigo)}>
                  <Sparkles aria-hidden="true" />
                  Quarto limpo
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="cartao cartao-lista tom-ocupado">
          <TopoLista icone={BedDouble} titulo="No hotel" total={d.noHotel.length} />
          {d.noHotel.length === 0 && <Vazio texto="Ninguém hospedado além de quem sai hoje." />}
          <ul className="lista lista-hospedes">
            {d.noHotel.map((l) => (
              <li key={l.id}>
                <span className="chaveiro" aria-hidden="true">
                  {l.quarto}
                </span>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {nomeProprio(l.nome)}
                  </Link>
                  <div className="detalhe">
                    Quarto <strong>{l.quarto}</strong> · sai {diaDaSemana(l.data_saida, true)} {dataCurta(l.data_saida)}
                  </div>
                  <Saldo l={l} />
                </div>
                <button className="botao" onClick={() => acoes.saiu({ id: l.id, nome: l.nome })}>
                  <LogOut aria-hidden="true" />
                  Saiu
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {acoes.janela}
    </>
  );
}
