import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Ban,
  BedDouble,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Clock,
  HandCoins,
  History,
  IdCard,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Repeat,
  StickyNote,
  Undo2,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api';
import { CampoReais, Carregando, ChipIcone, Dinheiro, Escolha, Etiqueta, MensagemErro, TituloTela, type Estado } from '../componentes/Basicos';
import {
  CamposPagamento,
  ICONE_FORMA,
  preferenciaPagamento,
  textoPagamento,
  useAcoesRapidas,
  useContasRecebedoras,
  type Pagamento,
} from '../componentes/AcoesEstadia';
import { Janela, useInteracao } from '../componentes/Interacao';
import { data, dataCurta, dataHora, diaDaSemana, documento, emReais, FORMAS, nomeProprio, noites, somarDias, telefone } from '../formato';
import '../estilo/hospedagem.css';

export interface DetalheEstadia {
  estadia: {
    id: number;
    quarto_id: number;
    data_entrada: string;
    data_saida: string;
    pessoas: number;
    valor_diaria: number;
    motivo_valor: string;
    status: string;
    origem: string;
    hora_chegada_prevista: string | null;
    chegada_real_em: string | null;
    saida_real_em: string | null;
    cancelada_em: string | null;
    obs: string;
  };
  hospede: { id: number; nome: string; telefone: string; cpf_cnpj: string | null; cidade: string; uf: string };
  quarto: { id: number; codigo: string; capacidade: number };
  noites: { data: string; valor: number }[];
  pagamentos: {
    id: number;
    valor: number;
    forma: string;
    tipo: string;
    data: string;
    obs: string;
    cancelado_em: string | null;
    conta: string | null;
    conta_nome: string | null;
  }[];
  total: number;
  pago: number;
  saldo: number;
  visitas: number;
  noitesNaoUsadas: string[];
  hoje: string;
}

export const STATUS: Record<string, { texto: string; estado: Estado }> = {
  pre_reserva: { texto: 'Aguardando Pix', estado: 'sai' },
  confirmada: { texto: 'Reservado', estado: 'reservado' },
  hospedado: { texto: 'No hotel', estado: 'ocupado' },
  finalizada: { texto: 'Já saiu', estado: 'neutro' },
  cancelada: { texto: 'Cancelada', estado: 'atrasado' },
  no_show: { texto: 'Não veio', estado: 'atrasado' },
  expirada: { texto: 'Expirou', estado: 'neutro' },
};

const TIPOS: Record<string, string> = { sinal: 'Sinal', saldo: 'Saldo', diaria: 'Diária', devolucao: 'Devolução' };

export function linkWhatsapp(tel: string): string | null {
  let d = tel.replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

/** Uma linha de informação com ícone: "Telefone (69) 9…", "Chegou 07/10 14:00". */
function Info({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo?: string; children: ReactNode }) {
  return (
    <li className="linha-info">
      <Icone aria-hidden="true" />
      <span>
        {rotulo && <span className="rotulo-info">{rotulo} </span>}
        {children}
      </span>
    </li>
  );
}

export function TelaEstadia() {
  const { id } = useParams();
  const dados = useQuery({ queryKey: ['estadia', id], queryFn: () => api.get<DetalheEstadia>(`/api/estadias/${id}`) });
  const acoes = useAcoesRapidas();
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const [janela, setJanela] = useState<'estender' | 'trocar' | 'cancelar' | 'editar' | null>(null);

  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const d = dados.data!;
  const e = d.estadia;
  const st = STATUS[e.status] ?? { texto: e.status, estado: 'neutro' as Estado };
  const ativa = e.status === 'confirmada' || e.status === 'hospedado';
  const wa = linkWhatsapp(d.hospede.telefone);
  const atrasoSaida = e.status === 'hospedado' && e.data_saida <= d.hoje;
  const nome = nomeProprio(d.hospede.nome);
  const origem = e.origem === 'whatsapp' ? 'WhatsApp' : e.origem === 'link' ? 'site' : e.origem === 'planilha' ? 'planilha antiga' : 'balcão';

  async function desfazerPagamento(pid: number, valor: number) {
    const ok = await confirmar({
      titulo: 'Desfazer pagamento?',
      mensagem: `O pagamento de ${emReais(valor)} deixa de contar no caixa. Fica registrado que foi desfeito.`,
      confirmar: 'Desfazer pagamento',
      perigo: true,
      icone: Undo2,
    });
    if (!ok) return;
    try {
      await api.post(`/api/pagamentos/${pid}/cancelar`, { motivo: 'desfeito na hospedagem' });
      cliente.invalidateQueries();
      avisar('Pagamento desfeito.');
    } catch (err) {
      avisar((err as Error).message, { erro: true });
    }
  }

  return (
    <div className="tela-estadia">
      <TituloTela
        titulo={
          <>
            <span className="chaveiro" aria-hidden="true">
              {d.quarto.codigo}
            </span>
            <span className="titulo-estadia">
              <span className="nome-estadia">{nome}</span>
              <Etiqueta estado={atrasoSaida ? 'atrasado' : st.estado}>{atrasoSaida ? 'Saída atrasada' : st.texto}</Etiqueta>
            </span>
          </>
        }
        subtitulo={
          <>
            Quarto <strong>{d.quarto.codigo}</strong> · {noites(d.noites.length)} · {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'} · entra{' '}
            {diaDaSemana(e.data_entrada)} {data(e.data_entrada)}, sai {diaDaSemana(e.data_saida)} {data(e.data_saida)}
          </>
        }
      >
        <Link to="/" className="botao">
          <ChevronLeft aria-hidden="true" />
          Voltar
        </Link>
      </TituloTela>

      <div className="grade-4 numeros-estadia">
        <div className="numero-grande tom-ocupado">
          <span className="valor">{emReais(d.total)}</span>
          <span className="rotulo">Total</span>
        </div>
        <div className="numero-grande tom-caixa">
          <span className="valor">{emReais(d.pago)}</span>
          <span className="rotulo">Pago</span>
        </div>
        <div className={`numero-grande ${d.saldo > 0 ? 'tom-perigo falta' : 'tom-caixa'}`}>
          <span className="valor">{emReais(Math.max(0, d.saldo))}</span>
          <span className="rotulo">
            {d.saldo > 0 ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            {d.saldo > 0 ? 'Falta pagar' : d.saldo < 0 ? `Pagou a mais ${emReais(-d.saldo)}` : 'Tudo pago'}
          </span>
        </div>
        <div className="numero-grande tom-config">
          <span className="valor">{emReais(e.valor_diaria)}</span>
          <span className="rotulo">Diária{e.motivo_valor ? ` (${e.motivo_valor})` : ''}</span>
        </div>
      </div>

      {!['cancelada', 'expirada'].includes(e.status) && (
        <div className="cartao acoes-estadia">
          <div className="botoes acoes-principais">
            {e.status === 'confirmada' && (
              <button className="botao principal grande" disabled={e.data_entrada > d.hoje} onClick={() => acoes.chegou(e.id, d.hospede.nome)}>
                <LogIn aria-hidden="true" />
                Chegou
              </button>
            )}
            {e.status === 'hospedado' && (
              <button className="botao principal grande" onClick={() => acoes.saiu({ id: e.id, nome: d.hospede.nome })}>
                <LogOut aria-hidden="true" />
                Saiu
              </button>
            )}
            {!['cancelada', 'expirada'].includes(e.status) && (
              <button
                className={`botao grande verde${d.saldo > 0 ? ' principal' : ''}`}
                onClick={() => acoes.receber(e.id, d.hospede.nome, d.saldo)}
              >
                <HandCoins aria-hidden="true" />
                Recebi
              </button>
            )}
          </div>
          {ativa && (
            <div className="botoes acoes-outras">
              <button className="botao" onClick={() => setJanela('estender')}>
                <CalendarPlus aria-hidden="true" />
                Mais noites
              </button>
              <button className="botao" onClick={() => setJanela('trocar')}>
                <ArrowLeftRight aria-hidden="true" />
                Trocar quarto
              </button>
              <button className="botao" onClick={() => setJanela('editar')}>
                <Pencil aria-hidden="true" />
                Mudar dados
              </button>
              <button className="botao perigo cancelar" onClick={() => setJanela('cancelar')}>
                <Ban aria-hidden="true" />
                {e.status === 'confirmada' ? 'Cancelar / não veio' : 'Cancelar'}
              </button>
            </div>
          )}
        </div>
      )}

      <section className="cartao">
        <div className="cartao-topo">
          <ChipIcone icone={Wallet} tom="tom-caixa" />
          <h2>Pagamentos</h2>
        </div>
        {d.pagamentos.length === 0 ? (
          <p className="vazio">Nenhum pagamento.</p>
        ) : (
          <div className="rolagem-x">
            <table className="tabela tabela-pagamentos">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Como pagou</th>
                  <th scope="col" className="numero">
                    Valor
                  </th>
                  <th scope="col">
                    <span className="oculto-leitor">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.pagamentos.map((p) => {
                  const IconeForma = ICONE_FORMA[p.forma];
                  return (
                    <tr key={p.id} className={p.cancelado_em ? 'desfeito' : ''}>
                      <td className="quando">
                        <span className="forte">{data(p.data)}</span>
                        <span className="suave">
                          {TIPOS[p.tipo] ?? p.tipo}
                          {p.obs ? ` · ${p.obs}` : ''}
                        </span>
                      </td>
                      <td className="como">
                        <span className="forma">
                          {IconeForma && <IconeForma aria-hidden="true" />}
                          {FORMAS[p.forma] ?? p.forma}
                          {p.conta ? ` · ${p.conta_nome}` : ''}
                        </span>
                      </td>
                      <td className="valor numero">
                        {p.tipo === 'devolucao' ? '−' : ''}
                        <Dinheiro valor={p.valor} />
                      </td>
                      <td className="acao">
                        {p.cancelado_em ? (
                          <Etiqueta estado="neutro">Desfeito</Etiqueta>
                        ) : (
                          <button className="botao pequeno" onClick={() => desfazerPagamento(p.id, p.valor)}>
                            <Undo2 aria-hidden="true" />
                            Desfazer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grade-2">
        <div>
          <section className="cartao">
            <div className="cartao-topo">
              <ChipIcone icone={UserRound} tom="tom-ocupado" />
              <h2>Hóspede</h2>
            </div>
            <p className="nome-hospede">
              <Link to={`/quartos/hospedes/${d.hospede.id}`}>{nome}</Link>
            </p>
            <ul className="lista-info">
              {telefone(d.hospede.telefone) && <Info icone={Phone}>{telefone(d.hospede.telefone)}</Info>}
              {documento(d.hospede.cpf_cnpj) && <Info icone={IdCard}>{documento(d.hospede.cpf_cnpj)}</Info>}
              {(d.hospede.cidade || d.hospede.uf) && (
                <Info icone={MapPin}>{[nomeProprio(d.hospede.cidade), d.hospede.uf].filter(Boolean).join('/')}</Info>
              )}
              <Info icone={Repeat}>
                Veio {d.visitas} {d.visitas === 1 ? 'vez' : 'vezes'}
              </Info>
            </ul>
            {wa && (
              <a className="botao verde" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" />
                Mandar WhatsApp
              </a>
            )}
          </section>

          <section className="cartao">
            <div className="cartao-topo">
              <ChipIcone icone={History} tom="tom-config" />
              <h2>Histórico</h2>
            </div>
            <ul className="lista-info">
              <Info icone={e.origem === 'whatsapp' ? MessageCircle : CalendarCheck} rotulo="Reservou:">
                {origem}
              </Info>
              {e.hora_chegada_prevista && (
                <Info icone={Clock} rotulo="Chegada prevista:">
                  {e.hora_chegada_prevista}
                </Info>
              )}
              {e.chegada_real_em && (
                <Info icone={LogIn} rotulo="Chegou:">
                  {dataHora(e.chegada_real_em)}
                </Info>
              )}
              {e.saida_real_em && (
                <Info icone={LogOut} rotulo="Saiu:">
                  {dataHora(e.saida_real_em)}
                </Info>
              )}
              {e.cancelada_em && (
                <Info icone={Ban} rotulo="Cancelada:">
                  {dataHora(e.cancelada_em)}
                </Info>
              )}
            </ul>
            {e.obs && (
              <div className="obs-estadia">
                <StickyNote aria-hidden="true" />
                <p>
                  <strong>Observação:</strong> {e.obs}
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="cartao">
          <div className="cartao-topo">
            <ChipIcone icone={CalendarDays} tom="tom-chega" />
            <h2>Datas</h2>
          </div>
          <div className="marcos">
            <div className="marco">
              <ChipIcone icone={LogIn} tom="tom-chega" />
              <div>
                <span className="rotulo-info">Entrada · {diaDaSemana(e.data_entrada)}</span>
                <span className="data-marco">{data(e.data_entrada)}</span>
              </div>
            </div>
            <div className="marco">
              <ChipIcone icone={LogOut} tom="tom-sai" />
              <div>
                <span className="rotulo-info">Saída · {diaDaSemana(e.data_saida)}</span>
                <span className="data-marco">{data(e.data_saida)}</span>
              </div>
            </div>
          </div>
          <p className="resumo-datas">
            <span>
              <BedDouble aria-hidden="true" />
              {noites(d.noites.length)} no quarto {d.quarto.codigo}
            </span>
            <span>
              <Users aria-hidden="true" />
              {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </p>
          <table className="tabela tabela-noites">
            <thead>
              <tr>
                <th scope="col">Noite</th>
                <th scope="col">Dia</th>
                <th scope="col" className="numero">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {d.noites.map((n) => (
                <tr key={n.data}>
                  <td className="forte">{dataCurta(n.data)}</td>
                  <td>{diaDaSemana(n.data)}</td>
                  <td className="numero">
                    <Dinheiro valor={n.valor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {acoes.janela}
      {janela === 'estender' && <JanelaEstender d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'trocar' && <JanelaTrocar d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'cancelar' && <JanelaCancelar d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'editar' && <JanelaEditar d={d} aoFechar={() => setJanela(null)} />}
    </div>
  );
}

function useAcao(aoFechar: () => void) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [erro, setErro] = useState<unknown>(null);
  async function executar(f: () => Promise<unknown>, msg: string) {
    setErro(null);
    try {
      await f();
      cliente.invalidateQueries();
      avisar(msg);
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return { erro, executar };
}

function JanelaEstender({ d, aoFechar }: { d: DetalheEstadia; aoFechar: () => void }) {
  const [mais, setMais] = useState(1);
  const { erro, executar } = useAcao(aoFechar);
  const novaSaida = somarDias(d.estadia.data_saida, mais);
  return (
    <Janela titulo="Mais noites" aoFechar={aoFechar} icone={CalendarPlus}>
      <Escolha
        rotulo="Quantas noites a mais"
        valor={mais}
        aoEscolher={setMais}
        opcoes={[1, 2, 3, 4, 5, 7].map((n) => ({ valor: n, texto: `+${n}` }))}
      />
      <p className="texto-janela">
        Nova saída: <strong>{diaDaSemana(novaSaida)}, {data(novaSaida)}</strong>. Fica <strong>{emReais(mais * d.estadia.valor_diaria)}</strong> a
        mais.
      </p>
      <MensagemErro erro={erro} />
      <div className="botoes direita rodape-janela">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button
          className="botao grande principal"
          onClick={() => executar(() => api.post(`/api/estadias/${d.estadia.id}/estender`, { novaSaida }), `Agora sai em ${data(novaSaida)}.`)}
        >
          <Check aria-hidden="true" />
          Confirmar
        </button>
      </div>
    </Janela>
  );
}

function JanelaTrocar({ d, aoFechar }: { d: DetalheEstadia; aoFechar: () => void }) {
  const e = d.estadia;
  const disp = useQuery({
    queryKey: ['disponibilidade', e.data_entrada, e.data_saida, e.id],
    queryFn: () =>
      api.get<{ quartos: { id: number; codigo: string; capacidade: number; livre: boolean }[] }>(
        `/api/disponibilidade?entrada=${e.data_entrada}&saida=${e.data_saida}&ignorar=${e.id}`,
      ),
  });
  const { erro, executar } = useAcao(aoFechar);
  const livres = (disp.data?.quartos ?? []).filter((q) => q.livre && q.id !== e.quarto_id && q.capacidade >= e.pessoas);
  return (
    <Janela titulo="Trocar de quarto" aoFechar={aoFechar} icone={ArrowLeftRight}>
      <p className="texto-janela">
        Quartos livres de {dataCurta(e.data_entrada)} a {dataCurta(e.data_saida)}:
      </p>
      <div className="botoes">
        {livres.map((q) => (
          <button
            key={q.id}
            className="botao grande"
            onClick={() => executar(() => api.post(`/api/estadias/${e.id}/trocar-quarto`, { quartoId: q.id }), `Trocado para o quarto ${q.codigo}.`)}
          >
            <BedDouble aria-hidden="true" />
            {q.codigo}
          </button>
        ))}
        {disp.data && livres.length === 0 && <p className="erro-form">Nenhum outro quarto livre nessas datas.</p>}
      </div>
      {e.status === 'hospedado' && <p className="suave pequeno nota-janela">O quarto atual fica marcado para limpar.</p>}
      <MensagemErro erro={erro} />
      <div className="botoes direita rodape-janela">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
      </div>
    </Janela>
  );
}

function JanelaCancelar({ d, aoFechar }: { d: DetalheEstadia; aoFechar: () => void }) {
  const e = d.estadia;
  const [tipo, setTipo] = useState<'cancelar' | 'nao_veio'>('cancelar');
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(false);
  const pref = preferenciaPagamento();
  const [dev, setDev] = useState<Pagamento>({ valor: d.pago, forma: pref.forma, contaRecebedoraId: pref.contaId });
  const contas = useContasRecebedoras();
  const { confirmar } = useInteracao();
  const { erro, executar } = useAcao(aoFechar);
  const podeNaoVeio = e.status === 'confirmada' && e.data_entrada <= d.hoje;
  async function enviar() {
    const msg =
      tipo === 'nao_veio'
        ? `Marcar que ${nomeProprio(d.hospede.nome)} não veio?${d.pago > 0 ? ` O que foi pago (${emReais(d.pago)}) fica como garantia.` : ''}`
        : `Cancelar a hospedagem de ${nomeProprio(d.hospede.nome)}?${devolver && dev.valor ? ` Devolver ${textoPagamento(dev, contas.data?.contas)}.` : ''}`;
    const ok = await confirmar({ titulo: 'Confirmar', mensagem: msg, confirmar: 'Sim', perigo: true, icone: Ban });
    if (!ok) return;
    executar(
      () =>
        api.post(`/api/estadias/${e.id}/cancelar`, {
          naoVeio: tipo === 'nao_veio',
          motivo,
          devolucao: tipo === 'cancelar' && devolver && dev.valor ? dev : null,
        }),
      tipo === 'nao_veio' ? 'Marcado: não veio.' : 'Hospedagem cancelada.',
    );
  }
  return (
    <Janela titulo="Cancelar" aoFechar={aoFechar} icone={Ban} tom="tom-perigo">
      {podeNaoVeio && (
        <Escolha
          rotulo="O que aconteceu"
          valor={tipo}
          aoEscolher={setTipo}
          opcoes={[
            { valor: 'cancelar', texto: 'Cancelou' },
            { valor: 'nao_veio', texto: 'Não veio' },
          ]}
        />
      )}
      <div className="campo" style={{ marginTop: 12 }}>
        <label htmlFor="motivo-cancelar">Motivo (opcional)</label>
        <input id="motivo-cancelar" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
      </div>
      {tipo === 'cancelar' && d.pago > 0 && (
        <>
          <p className="suave texto-janela">
            Foi pago <strong>{emReais(d.pago)}</strong>. Pela política, o sinal só é devolvido se a reserva foi feita pelo site e cancelada em até 7
            dias.
          </p>
          <label className="marcar">
            <input type="checkbox" checked={devolver} onChange={(ev) => setDevolver(ev.target.checked)} />
            Devolver dinheiro ao hóspede
          </label>
          {devolver && <CamposPagamento idBase="devolucao" valor={dev} aoMudar={setDev} />}
        </>
      )}
      <MensagemErro erro={erro} />
      <div className="botoes direita rodape-janela">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal perigo" onClick={enviar}>
          <Ban aria-hidden="true" />
          {tipo === 'nao_veio' ? 'Marcar não veio' : 'Cancelar hospedagem'}
        </button>
      </div>
    </Janela>
  );
}

function JanelaEditar({ d, aoFechar }: { d: DetalheEstadia; aoFechar: () => void }) {
  const e = d.estadia;
  const [pessoas, setPessoas] = useState(e.pessoas);
  const [diaria, setDiaria] = useState<number | null>(e.valor_diaria);
  const [motivo, setMotivo] = useState(e.motivo_valor);
  const [hora, setHora] = useState(e.hora_chegada_prevista ?? '');
  const [obs, setObs] = useState(e.obs);
  const { erro, executar } = useAcao(aoFechar);
  return (
    <Janela titulo="Mudar dados da hospedagem" aoFechar={aoFechar} icone={Pencil}>
      <div className="campo">
        <span className="rotulo">Pessoas</span>
        <Escolha
          rotulo="Pessoas"
          valor={pessoas}
          aoEscolher={setPessoas}
          opcoes={Array.from({ length: d.quarto.capacidade }, (_, i) => ({ valor: i + 1, texto: String(i + 1) }))}
        />
      </div>
      <CampoReais id="editar-diaria" rotulo="Diária (vale para todas as noites)" valor={diaria} aoMudar={setDiaria} />
      <div className="campo">
        <label htmlFor="editar-motivo">Motivo do valor</label>
        <input id="editar-motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="editar-hora">Hora prevista de chegada</label>
        <input id="editar-hora" type="time" value={hora} onChange={(ev) => setHora(ev.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="editar-obs">Observação</label>
        <textarea id="editar-obs" value={obs} onChange={(ev) => setObs(ev.target.value)} />
      </div>
      <MensagemErro erro={erro} />
      <div className="botoes direita rodape-janela">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button
          className="botao grande principal"
          onClick={() =>
            executar(
              () =>
                api.put(`/api/estadias/${e.id}`, {
                  pessoas,
                  valorDiaria: diaria ?? 0,
                  motivoValor: motivo,
                  horaChegadaPrevista: hora || null,
                  obs,
                }),
              'Hospedagem atualizada.',
            )
          }
        >
          <Check aria-hidden="true" />
          Salvar
        </button>
      </div>
    </Janela>
  );
}
