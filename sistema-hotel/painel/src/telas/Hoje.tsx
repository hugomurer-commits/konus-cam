import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Carregando, Dinheiro, Etiqueta, MensagemErro } from '../componentes/Basicos';
import { useAcoesRapidas } from '../componentes/AcoesEstadia';
import { data, dataCurta, diaDaSemana, hora } from '../formato';

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
      <span className="saldo-destaque">
        Falta <Dinheiro valor={l.saldo} />
      </span>
    );
  return <span className="pago-ok">Pago</span>;
}

export function Hoje() {
  const navegar = useNavigate();
  const dados = useQuery({
    queryKey: ['hoje'],
    queryFn: () => api.get<PainelHoje>('/api/hoje'),
    refetchInterval: 60_000,
  });
  const acoes = useAcoesRapidas();
  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const d = dados.data!;

  return (
    <>
      <div className="titulo-tela">
        <h1>
          Hoje <span className="subtitulo">{diaDaSemana(d.hoje)}, {data(d.hoje)}</span>
        </h1>
      </div>

      {d.alertas.length > 0 && (
        <section className="alertas" aria-label="Alertas">
          {d.alertas.map((a, i) => (
            <div key={i} className={`alerta ${a.cor}`}>
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
          ))}
        </section>
      )}

      <div className="grade-4">
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--azul-escuro)' }}>
            {d.numeros.ocupados}
          </div>
          <div className="rotulo">Ocupados hoje</div>
        </div>
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--verde-escuro)' }}>
            {d.numeros.livres}
          </div>
          <div className="rotulo">Livres</div>
        </div>
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--chega-texto)' }}>
            {d.numeros.chegadas}
          </div>
          <div className="rotulo">Chegam</div>
        </div>
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--laranja-escuro)' }}>
            {d.numeros.saidas}
          </div>
          <div className="rotulo">Saem</div>
        </div>
      </div>

      <button className="botao principal enorme" style={{ marginBottom: 16 }} onClick={() => navegar('/nova-hospedagem')}>
        + Nova hospedagem
      </button>

      {d.preReservas.length > 0 && (
        <div className="cartao">
          <h2>Pré-reservas aguardando Pix</h2>
          <ul className="lista">
            {d.preReservas.map((p) => (
              <li key={p.id}>
                <div className="principal-item">
                  <div className="nome">{p.nome}</div>
                  <div className="suave">
                    Quarto {p.quarto} · {dataCurta(p.data_entrada)} a {dataCurta(p.data_saida)} · expira em{' '}
                    {p.pre_reserva_expira_em && <Contador ate={p.pre_reserva_expira_em} />}
                  </div>
                </div>
                <Link to={`/estadia/${p.id}`} className="botao">
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grade-2">
        <div className="cartao">
          <h2>
            <Etiqueta estado="chega">Chegam hoje</Etiqueta>
          </h2>
          {d.chegam.length === 0 && <p className="vazio">Ninguém para chegar.</p>}
          <ul className="lista">
            {d.chegam.map((l) => (
              <li key={l.id}>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {l.nome}
                  </Link>
                  <div className="suave">
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
                  Chegou
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="cartao">
          <h2>
            <Etiqueta estado="sai">Saem hoje</Etiqueta>
          </h2>
          {d.saem.length === 0 && <p className="vazio">Ninguém para sair.</p>}
          <ul className="lista">
            {d.saem.map((l) => (
              <li key={l.id}>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {l.nome}
                  </Link>
                  <div className="suave">
                    Quarto <strong>{l.quarto}</strong>{' '}
                    {l.atrasada && <Etiqueta estado="atrasado">Passou da hora</Etiqueta>}
                  </div>
                  <Saldo l={l} />
                </div>
                <button className="botao principal grande" onClick={() => acoes.saiu({ id: l.id, nome: l.nome })}>
                  Saiu
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="cartao">
          <h2>
            <Etiqueta estado="limpar">Para limpar</Etiqueta>
          </h2>
          {d.paraLimpar.length === 0 && <p className="vazio">Nenhum quarto esperando limpeza.</p>}
          <ul className="lista">
            {d.paraLimpar.map((q) => (
              <li key={q.id}>
                <div className="principal-item">
                  <div className="nome">Quarto {q.codigo}</div>
                  {q.limpar_desde && <div className="suave">Desde {hora(q.limpar_desde)}</div>}
                </div>
                <button className="botao verde principal grande" onClick={() => acoes.quartoLimpo(q.id, q.codigo)}>
                  Quarto limpo
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="cartao">
          <h2>
            <Etiqueta estado="ocupado">No hotel</Etiqueta>
          </h2>
          {d.noHotel.length === 0 && <p className="vazio">Ninguém hospedado além de quem sai hoje.</p>}
          <ul className="lista">
            {d.noHotel.map((l) => (
              <li key={l.id}>
                <div className="principal-item">
                  <Link to={`/estadia/${l.id}`} className="nome">
                    {l.nome}
                  </Link>
                  <div className="suave">
                    Quarto <strong>{l.quarto}</strong> · sai {diaDaSemana(l.data_saida, true)} {dataCurta(l.data_saida)}
                  </div>
                  <Saldo l={l} />
                </div>
                <button className="botao" onClick={() => acoes.saiu({ id: l.id, nome: l.nome })}>
                  Saiu
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {acoes.janela}
    </>
  );
}
