import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { prepararFoto } from '../../fotos';

export interface Foto {
  id: number;
  url: string;
  miniaturaUrl: string;
  capa: boolean;
}

export interface Quarto {
  id: number;
  codigo: string;
  nome: string;
  capacidade: number;
  descricao: string;
  comodidades: string[];
  ativo: boolean;
  mostrar_no_site: boolean;
  ordem: number;
  estado_limpeza: 'limpo' | 'limpar';
  fotos: Foto[];
}

const COMODIDADES = [
  'Ar-condicionado',
  'TV',
  'Wi-Fi',
  'Frigobar',
  'Banheiro privativo',
  'Água quente',
  'Cama de casal',
  'Camas de solteiro',
  'Garagem',
  'Café da manhã',
];

export function ListaQuartos() {
  const cliente = useQueryClient();
  const dados = useQuery({ queryKey: ['quartos', 'todos'], queryFn: () => api.get<{ quartos: Quarto[] }>('/api/quartos?todos=1') });
  const ordenar = useMutation({
    mutationFn: (ids: number[]) => api.put('/api/quartos-ordem', { ids }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['quartos'] }),
  });
  if (dados.isLoading) return <Carregando />;
  const quartos = dados.data!.quartos;
  const ativos = quartos.filter((q) => q.ativo);
  const inativos = quartos.filter((q) => !q.ativo);
  const mover = (i: number, d: number) => {
    const ids = ativos.map((q) => q.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    ordenar.mutate([...ids, ...inativos.map((q) => q.id)]);
  };
  return (
    <>
      <div className="botoes" style={{ marginBottom: 16 }}>
        <Link to="/quartos/editar/novo" className="botao principal grande">
          + Novo quarto
        </Link>
      </div>
      <div className="cartao">
        <h2>Quartos em uso ({ativos.length})</h2>
        <ul className="lista">
          {ativos.map((q, i) => (
            <LinhaQuarto key={q.id} q={q}>
              <button className="botao pequeno" aria-label={`Subir ${q.codigo}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                ↑
              </button>
              <button className="botao pequeno" aria-label={`Descer ${q.codigo}`} disabled={i === ativos.length - 1} onClick={() => mover(i, 1)}>
                ↓
              </button>
            </LinhaQuarto>
          ))}
        </ul>
      </div>
      {inativos.length > 0 && (
        <div className="cartao">
          <h2>Fora de uso ({inativos.length})</h2>
          <p className="suave">Quartos que não aparecem no mapa nem na hospedagem. O histórico deles continua guardado.</p>
          <ul className="lista">
            {inativos.map((q) => (
              <LinhaQuarto key={q.id} q={q} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LinhaQuarto({ q, children }: { q: Quarto; children?: React.ReactNode }) {
  const capa = q.fotos.find((f) => f.capa);
  return (
    <li>
      {capa ? (
        <img src={capa.miniaturaUrl} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8 }} />
      ) : (
        <div style={{ width: 96, height: 72, borderRadius: 8, background: 'var(--neutro-fundo)', display: 'grid', placeItems: 'center' }} className="suave pequeno">
          sem foto
        </div>
      )}
      <div className="principal-item">
        <div className="nome">
          {q.codigo} {q.nome && q.nome !== `Quarto ${q.codigo}` ? `· ${q.nome}` : ''}
        </div>
        <div className="suave pequeno">
          Até {q.capacidade} {q.capacidade === 1 ? 'pessoa' : 'pessoas'} · {q.fotos.length} {q.fotos.length === 1 ? 'foto' : 'fotos'}
        </div>
      </div>
      {q.mostrar_no_site ? <Etiqueta estado="livre">No site</Etiqueta> : <Etiqueta estado="neutro">Fora do site</Etiqueta>}
      {children}
      <Link to={`/quartos/editar/${q.id}`} className="botao">
        Editar
      </Link>
    </li>
  );
}

export function EditarQuarto() {
  const { id } = useParams();
  const novo = id === 'novo';
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const dados = useQuery({
    queryKey: ['quarto', id],
    queryFn: () => api.get<{ quarto: Quarto }>(`/api/quartos/${id}`),
    enabled: !novo,
  });
  const [f, setF] = useState({
    codigo: '',
    nome: '',
    capacidade: 2,
    descricao: '',
    comodidades: [] as string[],
    ativo: true,
    mostrar_no_site: true,
  });
  const [outra, setOutra] = useState('');
  const [previa, setPrevia] = useState(false);
  useEffect(() => {
    if (dados.data) {
      const q = dados.data.quarto;
      setF({
        codigo: q.codigo,
        nome: q.nome,
        capacidade: q.capacidade,
        descricao: q.descricao,
        comodidades: q.comodidades,
        ativo: q.ativo,
        mostrar_no_site: q.mostrar_no_site,
      });
    }
  }, [dados.data]);
  const salvar = useMutation({
    mutationFn: () => (novo ? api.post<{ quarto: Quarto }>('/api/quartos', f) : api.put<{ quarto: Quarto }>(`/api/quartos/${id}`, f)),
    onSuccess: (r) => {
      cliente.invalidateQueries({ queryKey: ['quartos'] });
      cliente.setQueryData(['quarto', String(r.quarto.id)], r);
      avisar(novo ? 'Quarto criado. Agora coloque as fotos.' : 'Quarto salvo.');
      if (novo) navegar(`/quartos/editar/${r.quarto.id}`, { replace: true });
    },
  });
  if (!novo && dados.isLoading) return <Carregando />;
  const alternar = (c: string) =>
    setF({ ...f, comodidades: f.comodidades.includes(c) ? f.comodidades.filter((x) => x !== c) : [...f.comodidades, c] });
  const extras = f.comodidades.filter((c) => !COMODIDADES.includes(c));
  return (
    <>
      <div className="titulo-tela">
        <h1>{novo ? 'Novo quarto' : `Quarto ${f.codigo}`}</h1>
        <div className="botoes">
          {!novo && (
            <button className="botao" onClick={() => setPrevia(true)}>
              Ver como o hóspede vê
            </button>
          )}
          <Link to="/quartos/editar" className="botao">
            Voltar
          </Link>
        </div>
      </div>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="codigo">Código</label>
            <input id="codigo" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ex.: 1A" />
          </div>
          <div className="campo">
            <label htmlFor="nome">Nome para mostrar</label>
            <input id="nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Suíte casal" />
          </div>
          <div className="campo">
            <span className="rotulo">Cabem até</span>
            <div className="botoes">
              <button type="button" className="botao" aria-label="Menos uma pessoa" onClick={() => setF({ ...f, capacidade: Math.max(1, f.capacidade - 1) })}>
                −
              </button>
              <span className="forte" style={{ fontSize: '1.3rem', minWidth: 110, textAlign: 'center' }}>
                {f.capacidade} {f.capacidade === 1 ? 'pessoa' : 'pessoas'}
              </span>
              <button type="button" className="botao" aria-label="Mais uma pessoa" onClick={() => setF({ ...f, capacidade: f.capacidade + 1 })}>
                +
              </button>
            </div>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="descricao">Descrição (aparece no site)</label>
          <textarea id="descricao" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="campo">
          <span className="rotulo">O que tem no quarto</span>
          <div className="botoes">
            {[...COMODIDADES, ...extras].map((c) => (
              <button
                type="button"
                key={c}
                role="checkbox"
                aria-checked={f.comodidades.includes(c)}
                className={`botao pequeno${f.comodidades.includes(c) ? ' selecionado' : ''}`}
                onClick={() => alternar(c)}
              >
                {f.comodidades.includes(c) ? '✓ ' : ''}
                {c}
              </button>
            ))}
          </div>
          <div className="botoes" style={{ marginTop: 8 }}>
            <input className="entrada" style={{ maxWidth: 260 }} aria-label="Outra comodidade" placeholder="Outra (ex.: Varanda)" value={outra} onChange={(e) => setOutra(e.target.value)} />
            <button
              type="button"
              className="botao pequeno"
              disabled={!outra.trim()}
              onClick={() => {
                if (!f.comodidades.includes(outra.trim())) setF({ ...f, comodidades: [...f.comodidades, outra.trim()] });
                setOutra('');
              }}
            >
              + Adicionar
            </button>
          </div>
        </div>
        <label className="marcar">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Quarto em uso (aparece no mapa e na hospedagem)
        </label>
        <label className="marcar">
          <input type="checkbox" checked={f.mostrar_no_site} onChange={(e) => setF({ ...f, mostrar_no_site: e.target.checked })} />
          Mostrar no site de reservas
        </label>
        <MensagemErro erro={salvar.error} />
        <button className="botao principal grande" disabled={salvar.isPending}>
          Salvar
        </button>
      </form>
      {!novo && dados.data && <FotosDoQuarto quarto={dados.data.quarto} />}
      {previa && dados.data && <PreviaHospede quarto={{ ...dados.data.quarto, ...f }} aoFechar={() => setPrevia(false)} />}
    </>
  );
}

function FotosDoQuarto({ quarto }: { quarto: Quarto }) {
  const cliente = useQueryClient();
  const { avisar, confirmar } = useInteracao();
  const [enviando, setEnviando] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const atualizar = (r: { quarto: Quarto }) => {
    cliente.setQueryData(['quarto', String(quarto.id)], r);
    cliente.invalidateQueries({ queryKey: ['quartos'] });
  };

  async function enviar(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    setEnviando(lista.length);
    for (const a of lista) {
      try {
        const { foto, miniatura } = await prepararFoto(a);
        const fd = new FormData();
        fd.append('foto', foto, 'foto');
        fd.append('miniatura', miniatura, 'miniatura');
        atualizar(await api.post<{ quarto: Quarto }>(`/api/quartos/${quarto.id}/fotos`, fd));
      } catch (e) {
        avisar((e as Error).message, { erro: true });
      }
      setEnviando((n) => n - 1);
    }
    avisar(lista.length === 1 ? 'Foto adicionada.' : `${lista.length} fotos adicionadas.`);
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) enviar(e.dataTransfer.files);
  };

  const mover = async (i: number, d: number) => {
    const ids = quarto.fotos.map((f) => f.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    atualizar(await api.put(`/api/quartos/${quarto.id}/fotos-ordem`, { ids }));
  };

  return (
    <div className="cartao">
      <h2>Fotos</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        style={{
          border: `3px dashed ${arrastando ? 'var(--azul-tropical)' : 'var(--linha)'}`,
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          background: arrastando ? 'var(--ocupado-fundo)' : 'transparent',
          marginBottom: 16,
        }}
      >
        <p>Arraste as fotos do computador para cá, ou:</p>
        <button className="botao principal grande" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
          {enviando > 0 ? `Enviando… (${enviando})` : 'Escolher fotos / tirar foto'}
        </button>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) enviar(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {quarto.fotos.length === 0 && <p className="vazio">Nenhuma foto ainda.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {quarto.fotos.map((f, i) => (
          <figure key={f.id} style={{ margin: 0, border: '1px solid var(--linha)', borderRadius: 12, padding: 8, background: 'var(--branco)' }}>
            <img src={f.miniaturaUrl} alt={`Foto ${i + 1} do quarto ${quarto.codigo}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
            <figcaption className="botoes" style={{ marginTop: 8 }}>
              {f.capa ? (
                <Etiqueta estado="livre">Capa</Etiqueta>
              ) : (
                <button
                  className="botao pequeno"
                  onClick={async () => atualizar(await api.put(`/api/quartos/${quarto.id}/fotos/${f.id}/capa`))}
                >
                  Usar de capa
                </button>
              )}
              <button className="botao pequeno" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => mover(i, -1)}>
                ←
              </button>
              <button className="botao pequeno" aria-label="Mover para a direita" disabled={i === quarto.fotos.length - 1} onClick={() => mover(i, 1)}>
                →
              </button>
              <button
                className="botao pequeno perigo"
                onClick={async () => {
                  if (await confirmar({ titulo: 'Tirar esta foto?', mensagem: 'Ela some do site e do painel.', confirmar: 'Tirar foto', perigo: true }))
                    atualizar(await api.del(`/api/quartos/${quarto.id}/fotos/${f.id}`));
                }}
              >
                Tirar
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** Como o quarto vai aparecer na página pública de reservas (Fase 2). */
function PreviaHospede({ quarto, aoFechar }: { quarto: Quarto; aoFechar: () => void }) {
  const [atual, setAtual] = useState(0);
  const fotos = quarto.fotos;
  return (
    <Janela titulo="Como o hóspede vê" aoFechar={aoFechar}>
      {!quarto.mostrar_no_site && (
        <p className="erro-form">Este quarto está marcado para NÃO aparecer no site.</p>
      )}
      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--linha)' }}>
        {fotos.length > 0 ? (
          <div style={{ position: 'relative' }}>
            <img src={fotos[atual].url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
            {fotos.length > 1 && (
              <div className="botoes" style={{ position: 'absolute', bottom: 8, right: 8 }}>
                <button className="botao pequeno" onClick={() => setAtual((atual - 1 + fotos.length) % fotos.length)} aria-label="Foto anterior">
                  ‹
                </button>
                <button className="botao pequeno" onClick={() => setAtual((atual + 1) % fotos.length)} aria-label="Próxima foto">
                  ›
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--neutro-fundo)' }}>Sem fotos</div>
        )}
        <div style={{ padding: 16, borderTop: '4px solid var(--laranja-sol)' }}>
          <h3>{quarto.nome || `Quarto ${quarto.codigo}`}</h3>
          <p className="suave">Até {quarto.capacidade} pessoas</p>
          {quarto.descricao && <p>{quarto.descricao}</p>}
          {quarto.comodidades.length > 0 && <p className="pequeno">{quarto.comodidades.join(' · ')}</p>}
        </div>
      </div>
      <div className="botoes direita" style={{ marginTop: 16 }}>
        <button className="botao principal" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Janela>
  );
}
