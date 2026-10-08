import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, MensagemErro, type Estado } from '../../componentes/Basicos';
import { useAcoesRapidas } from '../../componentes/AcoesEstadia';
import { dataCurta, diaDaSemana, hojeLocal, somarDias } from '../../formato';

interface EstadiaMapa {
  id: number;
  quarto_id: number;
  data_entrada: string;
  data_saida: string;
  status: string;
  nome: string;
  saldo: number;
}

interface DadosMapa {
  hoje: string;
  de: string;
  dias: string[];
  quartos: { id: number; codigo: string; nome: string; capacidade: number; estado_limpeza: 'limpo' | 'limpar' }[];
  estadias: EstadiaMapa[];
}

/** "MARIA APARECIDA DA SILVA" → "Maria A." (cabe na célula) */
function nomeCurto(n: string): string {
  const partes = n.replace(/\s+-\s+.*/, '').trim().split(/\s+/);
  const cap = (p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  return partes.length > 1 ? `${cap(partes[0])} ${partes[1].charAt(0).toUpperCase()}.` : cap(partes[0] ?? '');
}

function estadoNaNoite(e: EstadiaMapa, dia: string, hoje: string): { estado: Estado; texto: string } {
  if (e.status === 'pre_reserva') return { estado: 'sai', texto: 'Aguarda Pix' };
  if (e.status === 'finalizada') return { estado: 'neutro', texto: 'Saiu' };
  if (e.status === 'confirmada') {
    if (e.data_entrada < hoje) return { estado: 'atrasado', texto: 'Não chegou' };
    if (e.data_entrada === hoje && dia === hoje) return { estado: 'chega', texto: 'Chega hoje' };
    return { estado: 'reservado', texto: 'Reservado' };
  }
  // hospedado
  if (e.data_saida < hoje) return { estado: 'atrasado', texto: 'Saída atrasada' };
  return { estado: 'ocupado', texto: 'Ocupado' };
}

export function Mapa() {
  const hoje = hojeLocal();
  const [de, setDe] = useState(hoje);
  const [dias, setDias] = useState(14);
  const navegar = useNavigate();
  const acoes = useAcoesRapidas();
  const dados = useQuery({
    queryKey: ['mapa', de, dias],
    queryFn: () => api.get<DadosMapa>(`/api/mapa?de=${de}&dias=${dias}`),
    placeholderData: (anterior) => anterior,
  });
  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const d = dados.data!;

  const porQuarto = new Map<number, EstadiaMapa[]>();
  for (const e of d.estadias) porQuarto.set(e.quarto_id, [...(porQuarto.get(e.quarto_id) ?? []), e]);

  return (
    <>
      <div className="titulo-tela">
        <h1>Mapa dos quartos</h1>
        <div className="botoes">
          <button className="botao" onClick={() => setDe(somarDias(de, dias >= 28 ? -30 : -7))}>
            ← {dias >= 28 ? 'Mês' : 'Semana'}
          </button>
          <button className={`botao${de === hoje ? ' selecionado' : ''}`} onClick={() => setDe(hoje)}>
            Hoje
          </button>
          <button className="botao" onClick={() => setDe(somarDias(de, dias >= 28 ? 30 : 7))}>
            {dias >= 28 ? 'Mês' : 'Semana'} →
          </button>
          <button className="botao" onClick={() => setDias(dias >= 28 ? 14 : 31)}>
            {dias >= 28 ? 'Ver 2 semanas' : 'Ver o mês'}
          </button>
        </div>
      </div>
      <div className="mapa-rolagem" role="region" aria-label="Mapa de ocupação" tabIndex={0}>
        <table className="mapa">
          <thead>
            <tr>
              <th className="mapa-quarto">Quarto</th>
              {d.dias.map((dia) => (
                <th key={dia} className={dia === d.hoje ? 'mapa-hoje' : ''}>
                  <div className="pequeno">{diaDaSemana(dia, true)}</div>
                  <div>{dataCurta(dia)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.quartos.map((q) => {
              const es = porQuarto.get(q.id) ?? [];
              return (
                <tr key={q.id}>
                  <th className="mapa-quarto" scope="row">
                    {q.codigo}
                  </th>
                  {d.dias.map((dia) => {
                    const naNoite = es.filter((e) => e.data_entrada <= dia && e.data_saida > dia);
                    const saiHoje = dia === d.hoje ? es.filter((e) => e.status === 'hospedado' && e.data_saida === d.hoje) : [];
                    const limpar = dia === d.hoje && q.estado_limpeza === 'limpar';
                    const livre = naNoite.filter((e) => e.status !== 'finalizada').length === 0;
                    const podeReservar = livre && dia >= somarDias(d.hoje, -1) && !limpar;
                    return (
                      <td key={dia} className={dia === d.hoje ? 'mapa-hoje' : ''}>
                        <div className="mapa-celula">
                          {saiHoje.map((e) => (
                            <Link key={`s${e.id}`} to={`/estadia/${e.id}`} className="mapa-item est-sai">
                              <span>{nomeCurto(e.nome)}</span>
                              <span className="mapa-estado">Sai hoje</span>
                            </Link>
                          ))}
                          {naNoite.map((e) => {
                            const st = estadoNaNoite(e, dia, d.hoje);
                            return (
                              <Link key={e.id} to={`/estadia/${e.id}`} className={`mapa-item est-${st.estado}`} title={e.nome}>
                                <span>{nomeCurto(e.nome)}</span>
                                <span className="mapa-estado">{st.texto}</span>
                              </Link>
                            );
                          })}
                          {limpar && (
                            <button className="mapa-item est-limpar" onClick={() => acoes.quartoLimpo(q.id, q.codigo)} title="Marcar quarto limpo">
                              <span>Limpar</span>
                              <span className="mapa-estado">tocar = limpo</span>
                            </button>
                          )}
                          {podeReservar && (
                            <button
                              className="mapa-item mapa-livre est-livre"
                              onClick={() => navegar(`/nova-hospedagem?quarto=${q.id}&data=${dia}`)}
                              aria-label={`Quarto ${q.codigo} livre em ${dataCurta(dia)}: nova hospedagem`}
                            >
                              <span className="mapa-estado">Livre</span>
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="suave pequeno" style={{ marginTop: 8 }}>
        Toque num quarto livre para fazer uma hospedagem já com quarto e data. Toque num nome para ver a hospedagem.
      </p>
      {acoes.janela}
    </>
  );
}
