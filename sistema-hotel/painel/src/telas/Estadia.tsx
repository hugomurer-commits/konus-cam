import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { CampoReais, Carregando, Dinheiro, Escolha, Etiqueta, MensagemErro, type Estado } from '../componentes/Basicos';
import { CamposPagamento, preferenciaPagamento, textoPagamento, useAcoesRapidas, useContasRecebedoras, type Pagamento } from '../componentes/AcoesEstadia';
import { Janela, useInteracao } from '../componentes/Interacao';
import { data, dataCurta, dataHora, diaDaSemana, documento, emReais, FORMAS, noites, somarDias, telefone } from '../formato';

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
  const st = STATUS[e.status];
  const ativa = e.status === 'confirmada' || e.status === 'hospedado';
  const wa = linkWhatsapp(d.hospede.telefone);
  const atrasoSaida = e.status === 'hospedado' && e.data_saida <= d.hoje;

  async function desfazerPagamento(pid: number, valor: number) {
    const ok = await confirmar({
      titulo: 'Desfazer pagamento?',
      mensagem: `O pagamento de ${emReais(valor)} deixa de contar no caixa. Fica registrado que foi desfeito.`,
      confirmar: 'Desfazer pagamento',
      perigo: true,
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
    <>
      <div className="titulo-tela">
        <div>
          <h1>
            {d.hospede.nome} <Etiqueta estado={atrasoSaida ? 'atrasado' : st.estado}>{atrasoSaida ? 'Saída atrasada' : st.texto}</Etiqueta>
          </h1>
          <div className="suave">
            Quarto <strong>{d.quarto.codigo}</strong> · {noites(d.noites.length)} · {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'} · entra{' '}
            {diaDaSemana(e.data_entrada)} {data(e.data_entrada)}, sai {diaDaSemana(e.data_saida)} {data(e.data_saida)}
          </div>
        </div>
        <Link to="/" className="botao">
          Voltar
        </Link>
      </div>

      <div className="grade-4">
        <div className="numero-grande">
          <div className="valor">{emReais(d.total)}</div>
          <div className="rotulo">Total</div>
        </div>
        <div className="numero-grande">
          <div className="valor" style={{ color: 'var(--verde-escuro)' }}>
            {emReais(d.pago)}
          </div>
          <div className="rotulo">Pago</div>
        </div>
        <div className="numero-grande" style={d.saldo > 0 ? { borderColor: 'var(--vermelho-alerta)', borderWidth: 2 } : {}}>
          <div className="valor" style={{ color: d.saldo > 0 ? 'var(--vermelho-alerta)' : 'var(--verde-escuro)' }}>
            {emReais(Math.max(0, d.saldo))}
          </div>
          <div className="rotulo">{d.saldo > 0 ? 'Falta pagar' : d.saldo < 0 ? `Pagou a mais ${emReais(-d.saldo)}` : 'Tudo pago'}</div>
        </div>
        <div className="numero-grande">
          <div className="valor">{emReais(e.valor_diaria)}</div>
          <div className="rotulo">Diária{e.motivo_valor ? ` (${e.motivo_valor})` : ''}</div>
        </div>
      </div>

      <div className="cartao">
        <div className="botoes">
          {e.status === 'confirmada' && (
            <button className="botao principal grande" disabled={e.data_entrada > d.hoje} onClick={() => acoes.chegou(e.id, d.hospede.nome)}>
              Chegou
            </button>
          )}
          {e.status === 'hospedado' && (
            <button className="botao principal grande" onClick={() => acoes.saiu({ id: e.id, nome: d.hospede.nome })}>
              Saiu
            </button>
          )}
          {!['cancelada', 'expirada'].includes(e.status) && (
            <button className={`botao grande${d.saldo > 0 ? ' verde principal' : ''}`} onClick={() => acoes.receber(e.id, d.hospede.nome, d.saldo)}>
              Recebi
            </button>
          )}
          {ativa && (
            <>
              <button className="botao grande" onClick={() => setJanela('estender')}>
                Mais noites
              </button>
              <button className="botao grande" onClick={() => setJanela('trocar')}>
                Trocar quarto
              </button>
              <button className="botao grande" onClick={() => setJanela('editar')}>
                Mudar dados
              </button>
              <button className="botao grande perigo" onClick={() => setJanela('cancelar')}>
                {e.status === 'confirmada' ? 'Cancelar / não veio' : 'Cancelar'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grade-2">
        <div className="cartao">
          <h2>Pagamentos</h2>
          {d.pagamentos.length === 0 && <p className="vazio">Nenhum pagamento.</p>}
          <ul className="lista">
            {d.pagamentos.map((p) => (
              <li key={p.id} style={p.cancelado_em ? { opacity: 0.6 } : {}}>
                <div className="principal-item">
                  <div className="nome" style={p.cancelado_em ? { textDecoration: 'line-through' } : {}}>
                    {p.tipo === 'devolucao' ? '−' : ''}
                    <Dinheiro valor={p.valor} /> · {FORMAS[p.forma]}
                    {p.conta ? ` · ${p.conta_nome}` : ''}
                  </div>
                  <div className="suave pequeno">
                    {TIPOS[p.tipo]} em {data(p.data)}
                    {p.obs ? ` · ${p.obs}` : ''}
                  </div>
                </div>
                {p.cancelado_em ? (
                  <Etiqueta estado="neutro">Desfeito</Etiqueta>
                ) : (
                  <button className="botao pequeno" onClick={() => desfazerPagamento(p.id, p.valor)}>
                    Desfazer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="cartao">
          <h2>Hóspede</h2>
          <p className="nome">
            <Link to={`/quartos/hospedes/${d.hospede.id}`}>{d.hospede.nome}</Link>
          </p>
          <p className="suave">
            {[telefone(d.hospede.telefone), documento(d.hospede.cpf_cnpj), [d.hospede.cidade, d.hospede.uf].filter(Boolean).join('/')]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p>
            Veio {d.visitas} {d.visitas === 1 ? 'vez' : 'vezes'}
          </p>
          {wa && (
            <a className="botao verde" href={wa} target="_blank" rel="noreferrer">
              Mandar WhatsApp
            </a>
          )}
          <h3 style={{ marginTop: 16 }}>Detalhes</h3>
          <ul className="pequeno" style={{ paddingLeft: 18 }}>
            <li>Reservou: {e.origem === 'whatsapp' ? 'WhatsApp' : e.origem === 'link' ? 'site' : e.origem === 'planilha' ? 'planilha antiga' : 'balcão'}</li>
            {e.hora_chegada_prevista && <li>Chegada prevista: {e.hora_chegada_prevista}</li>}
            {e.chegada_real_em && <li>Chegou: {dataHora(e.chegada_real_em)}</li>}
            {e.saida_real_em && <li>Saiu: {dataHora(e.saida_real_em)}</li>}
            {e.cancelada_em && <li>Cancelada: {dataHora(e.cancelada_em)}</li>}
            <li>
              Noites: {d.noites.map((n) => `${dataCurta(n.data)} (${emReais(n.valor)})`).join(', ')}
            </li>
          </ul>
          {e.obs && (
            <p style={{ whiteSpace: 'pre-line' }} className="pequeno">
              <strong>Observação:</strong> {e.obs}
            </p>
          )}
        </div>
      </div>

      {acoes.janela}
      {janela === 'estender' && <JanelaEstender d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'trocar' && <JanelaTrocar d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'cancelar' && <JanelaCancelar d={d} aoFechar={() => setJanela(null)} />}
      {janela === 'editar' && <JanelaEditar d={d} aoFechar={() => setJanela(null)} />}
    </>
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
    <Janela titulo="Mais noites" aoFechar={aoFechar}>
      <Escolha
        rotulo="Quantas noites a mais"
        valor={mais}
        aoEscolher={setMais}
        opcoes={[1, 2, 3, 4, 5, 7].map((n) => ({ valor: n, texto: `+${n}` }))}
      />
      <p className="mensagem" style={{ marginTop: 12 }}>
        Nova saída: <strong>{diaDaSemana(novaSaida)}, {data(novaSaida)}</strong>. Fica {emReais(mais * d.estadia.valor_diaria)} a mais.
      </p>
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button
          className="botao grande principal"
          onClick={() => executar(() => api.post(`/api/estadias/${d.estadia.id}/estender`, { novaSaida }), `Agora sai em ${data(novaSaida)}.`)}
        >
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
    <Janela titulo="Trocar de quarto" aoFechar={aoFechar}>
      <p>Quartos livres de {dataCurta(e.data_entrada)} a {dataCurta(e.data_saida)}:</p>
      <div className="botoes">
        {livres.map((q) => (
          <button
            key={q.id}
            className="botao grande"
            onClick={() => executar(() => api.post(`/api/estadias/${e.id}/trocar-quarto`, { quartoId: q.id }), `Trocado para o quarto ${q.codigo}.`)}
          >
            {q.codigo}
          </button>
        ))}
        {disp.data && livres.length === 0 && <p className="erro-form">Nenhum outro quarto livre nessas datas.</p>}
      </div>
      {e.status === 'hospedado' && <p className="suave pequeno">O quarto atual fica marcado para limpar.</p>}
      <MensagemErro erro={erro} />
      <div className="botoes direita">
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
        ? `Marcar que ${d.hospede.nome} não veio?${d.pago > 0 ? ` O que foi pago (${emReais(d.pago)}) fica como garantia.` : ''}`
        : `Cancelar a hospedagem de ${d.hospede.nome}?${devolver && dev.valor ? ` Devolver ${textoPagamento(dev, contas.data?.contas)}.` : ''}`;
    const ok = await confirmar({ titulo: 'Confirmar', mensagem: msg, confirmar: 'Sim', perigo: true });
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
    <Janela titulo="Cancelar" aoFechar={aoFechar}>
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
          <p className="suave">
            Foi pago {emReais(d.pago)}. Pela política, o sinal só é devolvido se a reserva foi feita pelo site e cancelada em até 7 dias.
          </p>
          <label className="marcar">
            <input type="checkbox" checked={devolver} onChange={(ev) => setDevolver(ev.target.checked)} />
            Devolver dinheiro ao hóspede
          </label>
          {devolver && <CamposPagamento idBase="devolucao" valor={dev} aoMudar={setDev} />}
        </>
      )}
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal perigo" onClick={enviar}>
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
    <Janela titulo="Mudar dados da hospedagem" aoFechar={aoFechar}>
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
      <div className="botoes direita">
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
          Salvar
        </button>
      </div>
    </Janela>
  );
}
