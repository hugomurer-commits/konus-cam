import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AirVent,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bath,
  BedDouble,
  BedSingle,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  Eye,
  EyeOff,
  Globe,
  ImageOff,
  ImagePlus,
  Images,
  Minus,
  Pencil,
  Plus,
  Refrigerator,
  Save,
  ShowerHead,
  Star,
  Trash2,
  Tv,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ChipIcone, MensagemErro, TituloTela } from '../../componentes/Basicos';
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

const ICONE_COMODIDADE: Record<string, LucideIcon> = {
  'Ar-condicionado': AirVent,
  TV: Tv,
  'Wi-Fi': Wifi,
  Frigobar: Refrigerator,
  'Banheiro privativo': Bath,
  'Água quente': ShowerHead,
  'Cama de casal': BedDouble,
  'Camas de solteiro': BedSingle,
  Garagem: Car,
  'Café da manhã': Coffee,
};

const pessoas = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
const fotos = (n: number) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

/** "No site" / "Fora do site": cor + ícone + texto. */
function NoSite({ sim }: { sim: boolean }) {
  return sim ? (
    <span className="etiqueta est-livre">
      <Globe aria-hidden="true" />
      No site
    </span>
  ) : (
    <span className="etiqueta est-neutro">
      <EyeOff aria-hidden="true" />
      Fora do site
    </span>
  );
}

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
      <TituloTela icone={Pencil} tom="tom-ocupado" titulo="Editar quartos" subtitulo="Fotos, nome e o que tem em cada quarto.">
        <Link to="/quartos/editar/novo" className="botao principal grande">
          <Plus aria-hidden="true" />
          Novo quarto
        </Link>
      </TituloTela>
      <section className="cartao cartao-lista tom-ocupado">
        <header className="cartao-topo">
          <ChipIcone icone={BedDouble} />
          <h2>Quartos em uso</h2>
          <span className="contagem">{ativos.length}</span>
        </header>
        <ul className="lista lista-quartos">
          {ativos.map((q, i) => (
            <LinhaQuarto key={q.id} q={q}>
              <button className="botao pequeno" aria-label={`Subir ${q.codigo}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                <ArrowUp aria-hidden="true" />
                Subir
              </button>
              <button className="botao pequeno" aria-label={`Descer ${q.codigo}`} disabled={i === ativos.length - 1} onClick={() => mover(i, 1)}>
                <ArrowDown aria-hidden="true" />
                Descer
              </button>
            </LinhaQuarto>
          ))}
        </ul>
      </section>
      {inativos.length > 0 && (
        <section className="cartao cartao-lista tom-config">
          <header className="cartao-topo">
            <ChipIcone icone={Archive} />
            <h2>Fora de uso</h2>
            <span className="contagem">{inativos.length}</span>
          </header>
          <p className="suave">Quartos que não aparecem no mapa nem na hospedagem. O histórico deles continua guardado.</p>
          <ul className="lista lista-quartos">
            {inativos.map((q) => (
              <LinhaQuarto key={q.id} q={q} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function LinhaQuarto({ q, children }: { q: Quarto; children?: ReactNode }) {
  const capa = q.fotos.find((f) => f.capa);
  return (
    <li>
      {capa ? (
        <img className="miniatura" src={capa.miniaturaUrl} alt="" />
      ) : (
        <div className="miniatura sem-foto">
          <ImageOff aria-hidden="true" />
          sem foto
        </div>
      )}
      <div className="principal-item">
        <div className="nome">
          {q.codigo} {q.nome && q.nome !== `Quarto ${q.codigo}` ? `· ${q.nome}` : ''}
        </div>
        <div className="detalhe-icones">
          <span>
            <Users aria-hidden="true" />
            Até {pessoas(q.capacidade)}
          </span>
          <span>
            <Images aria-hidden="true" />
            {fotos(q.fotos.length)}
          </span>
        </div>
      </div>
      <NoSite sim={q.mostrar_no_site} />
      <div className="acoes-quarto">
        {children}
        <Link to={`/quartos/editar/${q.id}`} className="botao">
          <Pencil aria-hidden="true" />
          Editar
        </Link>
      </div>
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
      <TituloTela icone={BedDouble} tom="tom-ocupado" titulo={novo ? 'Novo quarto' : `Quarto ${f.codigo}`}>
        {!novo && (
          <button className="botao" onClick={() => setPrevia(true)}>
            <Eye aria-hidden="true" />
            Ver como o hóspede vê
          </button>
        )}
        <Link to="/quartos/editar" className="botao">
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Link>
      </TituloTela>
      <form
        className="cartao form-quarto"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <header className="cartao-topo">
          <ChipIcone icone={ClipboardList} tom="tom-ocupado" />
          <h2>Dados do quarto</h2>
        </header>
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
            <div className="contador-pessoas">
              <button type="button" className="botao" aria-label="Menos uma pessoa" onClick={() => setF({ ...f, capacidade: Math.max(1, f.capacidade - 1) })}>
                <Minus aria-hidden="true" />
                Menos
              </button>
              <span className="valor" aria-live="polite">
                {pessoas(f.capacidade)}
              </span>
              <button type="button" className="botao" aria-label="Mais uma pessoa" onClick={() => setF({ ...f, capacidade: f.capacidade + 1 })}>
                <Plus aria-hidden="true" />
                Mais
              </button>
            </div>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="descricao">Descrição (aparece no site)</label>
          <textarea id="descricao" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="campo">
          <span className="rotulo" id="rotulo-comodidades">
            O que tem no quarto
          </span>
          <div className="escolha comodidades" role="group" aria-labelledby="rotulo-comodidades">
            {[...COMODIDADES, ...extras].map((c) => {
              const Icone = ICONE_COMODIDADE[c];
              return (
                <button type="button" key={c} role="checkbox" aria-checked={f.comodidades.includes(c)} className="opcao" onClick={() => alternar(c)}>
                  <span className="marca" aria-hidden="true">
                    <Check />
                  </span>
                  {Icone && <Icone className="icone-opcao" aria-hidden="true" />}
                  {c}
                </button>
              );
            })}
          </div>
          <div className="outra-comodidade">
            <input className="entrada" aria-label="Outra comodidade" placeholder="Outra (ex.: Varanda)" value={outra} onChange={(e) => setOutra(e.target.value)} />
            <button
              type="button"
              className="botao"
              disabled={!outra.trim()}
              onClick={() => {
                if (!f.comodidades.includes(outra.trim())) setF({ ...f, comodidades: [...f.comodidades, outra.trim()] });
                setOutra('');
              }}
            >
              <Plus aria-hidden="true" />
              Adicionar
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
        <div className="rodape-form">
          <MensagemErro erro={salvar.error} />
          <button className="botao principal grande" disabled={salvar.isPending}>
            <Save aria-hidden="true" />
            Salvar
          </button>
        </div>
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
    <section className="cartao">
      <header className="cartao-topo">
        <ChipIcone icone={Images} tom="tom-ocupado" />
        <h2>Fotos</h2>
        <span className="contagem tom-ocupado">{quarto.fotos.length}</span>
      </header>
      <div
        className={`zona-fotos${arrastando ? ' arrastando' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <ImagePlus aria-hidden="true" />
        <p>Arraste as fotos do computador para cá, ou:</p>
        <button className="botao principal grande" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
          <Camera aria-hidden="true" />
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
      {quarto.fotos.length === 0 && (
        <p className="vazio sem-fotos">
          <ImageOff aria-hidden="true" />
          Nenhuma foto ainda.
        </p>
      )}
      <div className="grade-fotos">
        {quarto.fotos.map((f, i) => (
          <figure key={f.id} className="foto-quarto">
            <img src={f.miniaturaUrl} alt={`Foto ${i + 1} do quarto ${quarto.codigo}`} />
            <figcaption>
              {f.capa ? (
                <span className="etiqueta est-livre">
                  <Star aria-hidden="true" />
                  Capa
                </span>
              ) : (
                <button className="botao pequeno" onClick={async () => atualizar(await api.put(`/api/quartos/${quarto.id}/fotos/${f.id}/capa`))}>
                  <Star aria-hidden="true" />
                  Usar de capa
                </button>
              )}
              <button
                className="botao pequeno perigo"
                onClick={async () => {
                  if (await confirmar({ titulo: 'Tirar esta foto?', mensagem: 'Ela some do site e do painel.', confirmar: 'Tirar foto', perigo: true }))
                    atualizar(await api.del(`/api/quartos/${quarto.id}/fotos/${f.id}`));
                }}
              >
                <Trash2 aria-hidden="true" />
                Tirar
              </button>
              <button className="botao pequeno mover" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => mover(i, -1)}>
                <ArrowLeft aria-hidden="true" />
                Esquerda
              </button>
              <button className="botao pequeno mover" aria-label="Mover para a direita" disabled={i === quarto.fotos.length - 1} onClick={() => mover(i, 1)}>
                Direita
                <ArrowRight aria-hidden="true" />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Como o quarto vai aparecer na página pública de reservas (Fase 2). */
function PreviaHospede({ quarto, aoFechar }: { quarto: Quarto; aoFechar: () => void }) {
  const [atual, setAtual] = useState(0);
  const fotosQuarto = quarto.fotos;
  return (
    <Janela titulo="Como o hóspede vê" aoFechar={aoFechar} icone={Eye} tom="tom-ocupado">
      {!quarto.mostrar_no_site && (
        <p className="erro-form">
          <EyeOff aria-hidden="true" />
          Este quarto está marcado para NÃO aparecer no site.
        </p>
      )}
      <div className="previa">
        <div className="previa-foto">
          {fotosQuarto.length > 0 ? (
            <>
              <img src={fotosQuarto[atual].url} alt="" />
              {fotosQuarto.length > 1 && (
                <div className="botoes">
                  <button className="botao pequeno" onClick={() => setAtual((atual - 1 + fotosQuarto.length) % fotosQuarto.length)} aria-label="Foto anterior">
                    <ChevronLeft aria-hidden="true" />
                    Anterior
                  </button>
                  <button className="botao pequeno" onClick={() => setAtual((atual + 1) % fotosQuarto.length)} aria-label="Próxima foto">
                    Próxima
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="sem-foto">
              <span>
                <ImageOff aria-hidden="true" />
                Sem fotos
              </span>
            </div>
          )}
        </div>
        <div className="previa-texto">
          <h3>{quarto.nome || `Quarto ${quarto.codigo}`}</h3>
          <p className="suave detalhe-icones">
            <span>
              <Users aria-hidden="true" />
              Até {quarto.capacidade} pessoas
            </span>
          </p>
          {quarto.descricao && <p>{quarto.descricao}</p>}
          {quarto.comodidades.length > 0 && (
            <ul className="chips" aria-label="O que tem no quarto">
              {quarto.comodidades.map((c) => {
                const Icone = ICONE_COMODIDADE[c] ?? Check;
                return (
                  <li key={c}>
                    <Icone aria-hidden="true" />
                    {c}
                  </li>
                );
              })}
            </ul>
          )}
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
