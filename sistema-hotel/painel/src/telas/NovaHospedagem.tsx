import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { CampoReais, Dinheiro, Escolha, MensagemErro } from '../componentes/Basicos';
import {
  CamposPagamento,
  lembrarPagamento,
  preferenciaPagamento,
  textoPagamento,
  useContasRecebedoras,
  type Pagamento,
} from '../componentes/AcoesEstadia';
import { useInteracao } from '../componentes/Interacao';
import { data, dataCurta, diaDaSemana, diasEntre, documento, emReais, hojeLocal, noites, somarDias, telefone } from '../formato';

// Tela mais importante (seção 5.2). Meta: hóspede que volta em menos de 30 segundos.

interface HospedeBusca {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string;
  cidade: string;
  uf: string;
  visitas: number;
  ultima: string | null;
}

interface QuartoDisp {
  id: number;
  codigo: string;
  nome: string;
  capacidade: number;
  livre: boolean;
  precisaLimpar: boolean;
  ocupadoPor: string | null;
}

function useDebounce<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function NovaHospedagem() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const contas = useContasRecebedoras();
  const hoje = hojeLocal();

  // ── 1. Hóspede
  const [busca, setBusca] = useState('');
  const termo = useDebounce(busca, 200);
  const [hospede, setHospede] = useState<HospedeBusca | null>(null);
  const [novo, setNovo] = useState<{ nome: string; telefone: string; cpfCnpj: string; cidade: string; uf: string } | null>(null);
  const resultados = useQuery({
    queryKey: ['procurar', termo],
    queryFn: () => api.get<{ hospedes: HospedeBusca[] }>(`/api/hospedes/procurar?q=${encodeURIComponent(termo)}`),
    enabled: termo.trim().length >= 3 && !hospede && !novo,
  });

  function comecarNovo() {
    const t = busca.trim();
    const soNumeros = /^[\d\s.\-()/]+$/.test(t);
    const d = t.replace(/\D/g, '');
    setNovo({
      nome: soNumeros ? '' : t,
      telefone: soNumeros && d.length >= 10 && d.length <= 11 && !(d.length === 11 && t.includes('.')) ? d : '',
      cpfCnpj: soNumeros && (t.includes('.') || d.length === 14) ? d : '',
      cidade: '',
      uf: 'RO',
    });
  }

  // ── 2. Datas (entrada = hoje; de madrugada, ainda é a noite de ontem)
  const madrugada = new Date().getHours() < 6;
  const entradaPadrao = params.get('data') ?? (madrugada ? somarDias(hoje, -1) : hoje);
  const [entrada, setEntrada] = useState(entradaPadrao);
  const [qtdNoites, setQtdNoites] = useState(1);
  const [outraQtd, setOutraQtd] = useState(false);
  const saida = somarDias(entrada, Math.max(1, qtdNoites));

  // ── 3. Quarto
  const [quartoId, setQuartoId] = useState<number | null>(params.get('quarto') ? Number(params.get('quarto')) : null);
  const disp = useQuery({
    queryKey: ['disponibilidade', entrada, saida],
    queryFn: () => api.get<{ quartos: QuartoDisp[] }>(`/api/disponibilidade?entrada=${entrada}&saida=${saida}`),
  });
  const quarto = disp.data?.quartos.find((q) => q.id === quartoId) ?? null;
  const quartoIndisponivel = quarto && (!quarto.livre || quarto.precisaLimpar);

  // ── 4. Pessoas e diária
  const [pessoas, setPessoas] = useState(2);
  const [valorEditado, setValorEditado] = useState<number | null>(null);
  const [editandoValor, setEditandoValor] = useState(false);
  const [motivo, setMotivo] = useState('');
  const sugerida = useQuery({
    queryKey: ['diaria', quartoId, pessoas],
    queryFn: () => api.get<{ valor: number }>(`/api/diaria-sugerida?pessoas=${pessoas}${quartoId ? `&quartoId=${quartoId}` : ''}`),
  });
  const diaria = valorEditado ?? sugerida.data?.valor ?? 0;
  const total = diaria * qtdNoites;

  // ── 5. Pagamento
  const pref = useMemo(preferenciaPagamento, []);
  const [pagarAgora, setPagarAgora] = useState(true);
  const [pag, setPag] = useState<Pagamento>({ valor: null, forma: pref.forma, contaRecebedoraId: pref.contaId });
  const [valorPagoMexido, setValorPagoMexido] = useState(false);
  useEffect(() => {
    if (!valorPagoMexido) setPag((p) => ({ ...p, valor: total }));
  }, [total, valorPagoMexido]);

  // ── Mais opções
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const futura = entrada > hoje;
  const [jaChegou, setJaChegou] = useState(true);
  const [origem, setOrigem] = useState<'balcao' | 'whatsapp'>('balcao');
  const [horaPrevista, setHoraPrevista] = useState('');
  const [obs, setObs] = useState('');

  const [erro, setErro] = useState<unknown>(null);
  const [salvando, setSalvando] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);

  async function escolherHospede(h: HospedeBusca) {
    setHospede(h);
    // Sugere o nº de pessoas da última vez
    try {
      const hist = await api.get<{ estadias: { pessoas: number }[] }>(`/api/hospedes/${h.id}`);
      if (hist.estadias[0]?.pessoas) setPessoas(hist.estadias[0].pessoas);
    } catch {
      /* sem histórico: fica o padrão */
    }
  }

  // Vindo da ficha do hóspede (?hospede=ID): já começa com ele escolhido
  useEffect(() => {
    const id = params.get('hospede');
    if (!id) return;
    api
      .get<{ hospede: HospedeBusca }>(`/api/hospedes/${id}`)
      .then((r) => escolherHospede(r.hospede))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function marcarLimpo(q: QuartoDisp) {
    await api.post(`/api/quartos/${q.id}/limpo`);
    await disp.refetch();
    avisar(`Quarto ${q.codigo} limpo e liberado.`);
  }

  async function salvar() {
    setErro(null);
    if (!hospede && !novo) return setErro(new Error('Escolha o hóspede ou cadastre um novo.'));
    if (novo && !novo.nome.trim()) return setErro(new Error('Informe o nome do hóspede.'));
    if (!quarto) return setErro(new Error('Escolha o quarto.'));
    if (quartoIndisponivel) return setErro(new Error(`O quarto ${quarto.codigo} não está livre nessas datas.`));
    if (pagarAgora && (!pag.valor || !pag.contaRecebedoraId))
      return setErro(new Error(!pag.valor ? 'Informe o valor recebido.' : 'Escolha quem recebeu o pagamento.'));
    const nome = hospede?.nome ?? novo!.nome;
    const ok = await confirmar({
      titulo: 'Confirmar hospedagem',
      mensagem: (
        <>
          <strong>{nome}</strong> no quarto <strong>{quarto.codigo}</strong>, {noites(qtdNoites)} ({dataCurta(entrada)} a {dataCurta(saida)}),{' '}
          {pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'}, total <strong>{emReais(total)}</strong>.
          <br />
          {pagarAgora ? (
            <>
              Recebido agora: <strong>{textoPagamento(pag, contas.data?.contas)}</strong>.
            </>
          ) : (
            'Sem pagamento agora.'
          )}
        </>
      ),
      confirmar: 'Confirmar',
    });
    if (!ok) return;
    setSalvando(true);
    try {
      const r = await api.post<{ id: number }>('/api/estadias', {
        hospede: hospede ? { id: hospede.id } : novo,
        quartoId: quarto.id,
        entrada,
        saida,
        pessoas,
        valorDiaria: diaria,
        motivoValor: valorEditado !== null ? motivo : '',
        origem,
        horaChegadaPrevista: horaPrevista || null,
        jaChegou: !futura && jaChegou,
        obs,
        pagamento: pagarAgora ? pag : null,
      });
      if (pagarAgora) lembrarPagamento(pag.forma, pag.contaRecebedoraId);
      cliente.invalidateQueries();
      avisar(`Hospedagem de ${nome} salva no ${quarto.codigo}.`, {
        desfazer: async () => {
          await api.post(`/api/estadias/${r.id}/desfazer`);
          cliente.invalidateQueries();
        },
      });
      navegar('/');
    } catch (e) {
      setErro(e);
    } finally {
      setSalvando(false);
    }
  }

  const quartosMostrados = (disp.data?.quartos ?? []).filter((q) => q.livre);
  const ocupados = (disp.data?.quartos ?? []).filter((q) => !q.livre);

  return (
    <>
      <div className="titulo-tela">
        <h1>
          Nova hospedagem <span className="subtitulo">(check-in)</span>
        </h1>
        <Link to="/" className="botao">
          Voltar
        </Link>
      </div>

      <div className="cartao passo">
        <span className="rotulo">1. Hóspede</span>
        {hospede ? (
          <div className="botoes" style={{ alignItems: 'flex-start' }}>
            <div className="principal-item" style={{ flex: 1 }}>
              <div className="nome" style={{ fontSize: '1.3rem' }}>
                {hospede.nome}
              </div>
              <div className="suave">
                {[telefone(hospede.telefone), documento(hospede.cpf_cnpj), [hospede.cidade, hospede.uf].filter(Boolean).join('/')]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {hospede.visitas > 0 && (
                <div className="forte" style={{ color: 'var(--verde-escuro)', marginTop: 4 }}>
                  Já veio {hospede.visitas} {hospede.visitas === 1 ? 'vez' : 'vezes'}
                  {hospede.ultima ? `, última em ${data(hospede.ultima)}` : ''}
                </div>
              )}
            </div>
            <button
              className="botao"
              onClick={() => {
                setHospede(null);
                setTimeout(() => campoBusca.current?.focus(), 0);
              }}
            >
              Trocar
            </button>
          </div>
        ) : novo ? (
          <>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="h-nome">Nome</label>
                <input id="h-nome" autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="h-tel">Telefone (WhatsApp)</label>
                <input id="h-tel" inputMode="tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="h-cpf">CPF</label>
                <input id="h-cpf" inputMode="numeric" value={novo.cpfCnpj} onChange={(e) => setNovo({ ...novo, cpfCnpj: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor="h-cidade">Cidade</label>
                <input id="h-cidade" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
              </div>
              <div className="campo" style={{ maxWidth: 120 }}>
                <label htmlFor="h-uf">UF</label>
                <input id="h-uf" maxLength={2} value={novo.uf} onChange={(e) => setNovo({ ...novo, uf: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <button className="botao pequeno" onClick={() => setNovo(null)}>
              Voltar para a busca
            </button>
          </>
        ) : (
          <>
            <div className="campo">
              <label htmlFor="busca-hospede">CPF, telefone ou nome</label>
              <input
                id="busca-hospede"
                ref={campoBusca}
                className="entrada-grande"
                autoFocus
                autoComplete="off"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && resultados.data?.hospedes.length === 1) escolherHospede(resultados.data.hospedes[0]);
                }}
                placeholder="Comece a digitar…"
              />
            </div>
            {termo.trim().length >= 3 && resultados.data && (
              <ul className="lista">
                {resultados.data.hospedes.map((h) => (
                  <li key={h.id}>
                    <div className="principal-item">
                      <div className="nome">{h.nome}</div>
                      <div className="suave pequeno">
                        {[telefone(h.telefone), [h.cidade, h.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                        {h.visitas > 0 && ` · já veio ${h.visitas} ${h.visitas === 1 ? 'vez' : 'vezes'}${h.ultima ? `, última em ${dataCurta(h.ultima)}` : ''}`}
                      </div>
                    </div>
                    <button className="botao principal" onClick={() => escolherHospede(h)}>
                      É este
                    </button>
                  </li>
                ))}
                {resultados.data.hospedes.length === 0 && <li className="vazio">Ninguém encontrado com "{termo}".</li>}
              </ul>
            )}
            <button className="botao" onClick={comecarNovo} style={{ marginTop: 8 }}>
              + Hóspede novo
            </button>
          </>
        )}
      </div>

      <div className="cartao passo">
        <span className="rotulo">2. Quando</span>
        <div className="campo">
          <span className="rotulo">Entrada</span>
          <div className="botoes">
            <Escolha
              rotulo="Data de entrada"
              valor={entrada === hoje ? 'hoje' : entrada === somarDias(hoje, 1) ? 'amanha' : entrada === somarDias(hoje, -1) ? 'ontem' : 'outra'}
              aoEscolher={(v) => v !== 'outra' && setEntrada(v === 'hoje' ? hoje : v === 'amanha' ? somarDias(hoje, 1) : somarDias(hoje, -1))}
              opcoes={[
                ...(madrugada || entrada === somarDias(hoje, -1) ? [{ valor: 'ontem', texto: `Noite de ontem (${dataCurta(somarDias(hoje, -1))})` }] : []),
                { valor: 'hoje', texto: `Hoje (${dataCurta(hoje)})` },
                { valor: 'amanha', texto: 'Amanhã' },
              ]}
            />
            <input
              type="date"
              className="entrada"
              style={{ width: 200 }}
              aria-label="Outra data de entrada"
              value={entrada}
              min={somarDias(hoje, -1)}
              onChange={(e) => e.target.value && setEntrada(e.target.value)}
            />
          </div>
        </div>
        <div className="campo">
          <span className="rotulo">Quantas noites</span>
          <div className="botoes">
            <Escolha
              rotulo="Quantas noites"
              valor={outraQtd ? 0 : qtdNoites}
              aoEscolher={(n) => {
                setOutraQtd(n === 0);
                if (n) setQtdNoites(n);
              }}
              opcoes={[
                { valor: 1, texto: '1 noite' },
                { valor: 2, texto: '2' },
                { valor: 3, texto: '3' },
                { valor: 0, texto: 'Outra' },
              ]}
            />
            {outraQtd && (
              <input
                type="number"
                className="entrada"
                style={{ width: 110 }}
                min={1}
                max={60}
                aria-label="Número de noites"
                value={qtdNoites}
                onChange={(e) => setQtdNoites(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
            )}
          </div>
        </div>
        <p className="forte">
          Sai {diaDaSemana(saida)}, {data(saida)} ao meio-dia · {noites(diasEntre(entrada, saida))}
        </p>
      </div>

      <div className="cartao passo">
        <span className="rotulo">3. Quarto (livres nessas datas)</span>
        {disp.isLoading && <p className="suave">Vendo os quartos…</p>}
        <div className="botoes">
          {quartosMostrados.map((q) =>
            q.precisaLimpar ? (
              <span key={q.id} className="botoes" style={{ border: '2px dashed var(--limpar-borda)', borderRadius: 12, padding: 4 }}>
                <span className="etiqueta est-limpar">{q.codigo}: limpar</span>
                <button className="botao pequeno" onClick={() => marcarLimpo(q)}>
                  Já está limpo
                </button>
              </span>
            ) : (
              <button
                key={q.id}
                className={`botao grande${quartoId === q.id ? ' selecionado' : ''}`}
                aria-pressed={quartoId === q.id}
                onClick={() => {
                  setQuartoId(q.id);
                  if (pessoas > q.capacidade) setPessoas(q.capacidade);
                }}
              >
                {q.codigo}
                <span className="pequeno" style={{ fontWeight: 400 }}>
                  &nbsp;até {q.capacidade}
                </span>
              </button>
            ),
          )}
        </div>
        {disp.data && quartosMostrados.length === 0 && <p className="erro-form">Nenhum quarto livre nessas datas.</p>}
        {quarto && !quarto.livre && <p className="erro-form">O quarto {quarto.codigo} está ocupado nessas datas ({quarto.ocupadoPor}).</p>}
        {ocupados.length > 0 && <p className="suave pequeno">Ocupados: {ocupados.map((q) => q.codigo).join(', ')}</p>}
      </div>

      <div className="cartao passo">
        <span className="rotulo">4. Pessoas e diária</span>
        <Escolha
          rotulo="Número de pessoas"
          valor={pessoas}
          aoEscolher={(n) => {
            setPessoas(n);
            setValorEditado(null);
          }}
          opcoes={Array.from({ length: Math.max(quarto?.capacidade ?? 5, 1) }, (_, i) => ({
            valor: i + 1,
            texto: i === 0 ? '1 pessoa' : `${i + 1}`,
          }))}
        />
        <div className="botoes" style={{ marginTop: 12 }}>
          <span style={{ fontSize: '1.2rem' }}>
            Diária: <Dinheiro valor={diaria} className="forte" />
            {valorEditado === null && <span className="suave pequeno"> (tabela)</span>}
          </span>
          {!editandoValor && (
            <button className="botao pequeno" onClick={() => setEditandoValor(true)}>
              Mudar valor
            </button>
          )}
        </div>
        {editandoValor && (
          <div className="linha-campos" style={{ marginTop: 8 }}>
            <CampoReais id="diaria" rotulo="Diária combinada" valor={diaria} aoMudar={(v) => setValorEditado(v ?? 0)} />
            <div className="campo">
              <label htmlFor="motivo">Motivo (opcional)</label>
              <input id="motivo" value={motivo} placeholder="Ex.: cliente fixo" onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
        )}
        <p style={{ fontSize: '1.25rem', marginTop: 8 }}>
          Total: {noites(qtdNoites)} × {emReais(diaria)} = <Dinheiro valor={total} className="forte" />
        </p>
      </div>

      <div className="cartao passo">
        <span className="rotulo">5. Pagamento</span>
        <Escolha
          rotulo="Pagamento agora?"
          valor={pagarAgora ? 'sim' : 'nao'}
          aoEscolher={(v) => setPagarAgora(v === 'sim')}
          opcoes={[
            { valor: 'sim', texto: 'Recebi agora' },
            { valor: 'nao', texto: 'Paga depois' },
          ]}
        />
        {pagarAgora && (
          <div style={{ marginTop: 12 }}>
            <CamposPagamento
              idBase="nova"
              valor={pag}
              aoMudar={(p) => {
                if (p.valor !== pag.valor) setValorPagoMexido(true);
                setPag(p);
              }}
            />
          </div>
        )}
      </div>

      <div className="cartao">
        <button className="botao pequeno" onClick={() => setMaisOpcoes(!maisOpcoes)} aria-expanded={maisOpcoes}>
          {maisOpcoes ? 'Menos opções' : 'Mais opções (reserva, WhatsApp, observação)'}
        </button>
        {maisOpcoes && (
          <div style={{ marginTop: 12 }}>
            {!futura && (
              <label className="marcar">
                <input type="checkbox" checked={jaChegou} onChange={(e) => setJaChegou(e.target.checked)} />
                O hóspede já está aqui (se não, fica como reserva para hoje)
              </label>
            )}
            <div className="campo">
              <span className="rotulo">Como reservou</span>
              <Escolha
                rotulo="Como reservou"
                grande={false}
                valor={origem}
                aoEscolher={setOrigem}
                opcoes={[
                  { valor: 'balcao', texto: 'No balcão' },
                  { valor: 'whatsapp', texto: 'WhatsApp' },
                ]}
              />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="hora">Hora prevista de chegada</label>
                <input id="hora" type="time" value={horaPrevista} onChange={(e) => setHoraPrevista(e.target.value)} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="obs">Observação</label>
              <textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <MensagemErro erro={erro} />
      <button className="botao principal enorme" disabled={salvando} onClick={salvar}>
        {futura || (maisOpcoes && !jaChegou) ? 'Salvar reserva' : 'Salvar hospedagem'}
        {pagarAgora && pag.valor ? ` e receber ${emReais(pag.valor)}` : ''}
      </button>
    </>
  );
}
