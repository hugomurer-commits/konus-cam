import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, Dinheiro, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, documento, telefone } from '../../formato';
import { linkWhatsapp, STATUS } from '../Estadia';

interface Hospede {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string;
  cidade: string;
  uf: string;
  obs: string;
  visitas: number;
  ultima: string | null;
  total_gasto: number;
}

export function Hospedes() {
  return (
    <Routes>
      <Route index element={<BuscaHospedes />} />
      <Route path=":id" element={<FichaHospede />} />
    </Routes>
  );
}

function ListaHospedes({ hospedes }: { hospedes: Hospede[] }) {
  return (
    <ul className="lista">
      {hospedes.map((h) => (
        <li key={h.id}>
          <div className="principal-item">
            <Link to={`/quartos/hospedes/${h.id}`} className="nome">
              {h.nome}
            </Link>
            <div className="suave pequeno">
              {[telefone(h.telefone), [h.cidade, h.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>
              {h.visitas} {h.visitas === 1 ? 'vez' : 'vezes'}
              {h.ultima ? `, última ${dataCurta(h.ultima)}/${h.ultima.slice(2, 4)}` : ''}
            </div>
            <div className="suave pequeno">
              gastou <Dinheiro valor={h.total_gasto} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BuscaHospedes() {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);
  const resultado = useQuery({
    queryKey: ['hospedes', termo],
    queryFn: () => api.get<{ hospedes: Hospede[] }>(`/api/hospedes?busca=${encodeURIComponent(termo)}`),
    enabled: termo.trim().length >= 2,
  });
  const frequentes = useQuery({
    queryKey: ['hospedes-frequentes'],
    queryFn: () => api.get<{ hospedes: Hospede[] }>('/api/hospedes/frequentes'),
  });
  return (
    <>
      <div className="cartao">
        <div className="campo">
          <label htmlFor="busca">Procurar hóspede (nome, CPF ou telefone)</label>
          <input id="busca" className="entrada-grande" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {termo.trim().length >= 2 && resultado.data && (
          <>
            {resultado.data.hospedes.length === 0 ? <p className="vazio">Ninguém encontrado.</p> : <ListaHospedes hospedes={resultado.data.hospedes} />}
          </>
        )}
      </div>
      {termo.trim().length < 2 && (
        <div className="cartao">
          <h2>Clientes que mais voltam</h2>
          {frequentes.isLoading ? <Carregando /> : <ListaHospedes hospedes={frequentes.data?.hospedes ?? []} />}
        </div>
      )}
    </>
  );
}

function FichaHospede() {
  const { id } = useParams();
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const dados = useQuery({
    queryKey: ['hospede', id],
    queryFn: () =>
      api.get<{
        hospede: Hospede;
        estadias: { id: number; data_entrada: string; data_saida: string; status: string; pessoas: number; quarto: string; total: number; pago: number }[];
      }>(`/api/hospedes/${id}`),
  });
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: '', telefone: '', cpfCnpj: '', cidade: '', uf: '', obs: '' });
  const salvar = useMutation({
    mutationFn: () => api.put(`/api/hospedes/${id}`, f),
    onSuccess: () => {
      cliente.invalidateQueries();
      setEditando(false);
      avisar('Dados do hóspede salvos.');
    },
  });
  if (dados.isLoading) return <Carregando />;
  if (dados.error) return <MensagemErro erro={dados.error} />;
  const { hospede: h, estadias } = dados.data!;
  const wa = linkWhatsapp(h.telefone);
  const abrirEdicao = () => {
    setF({ nome: h.nome, telefone: h.telefone, cpfCnpj: h.cpf_cnpj ?? '', cidade: h.cidade, uf: h.uf, obs: h.obs });
    setEditando(true);
  };
  return (
    <>
      <div className="titulo-tela">
        <h1>{h.nome}</h1>
        <div className="botoes">
          <Link to={`/nova-hospedagem?hospede=${h.id}`} className="botao principal">
            + Nova hospedagem
          </Link>
          <Link to="/quartos/hospedes" className="botao">
            Voltar
          </Link>
        </div>
      </div>
      <div className="grade-4">
        <div className="numero-grande">
          <div className="valor">{h.visitas}</div>
          <div className="rotulo">{h.visitas === 1 ? 'Hospedagem' : 'Hospedagens'}</div>
        </div>
        <div className="numero-grande">
          <div className="valor">
            <Dinheiro valor={h.total_gasto} />
          </div>
          <div className="rotulo">Total gasto</div>
        </div>
        <div className="numero-grande">
          <div className="valor">{h.ultima ? data(h.ultima) : '—'}</div>
          <div className="rotulo">Última vez</div>
        </div>
      </div>
      <div className="grade-2">
        <div className="cartao">
          <h2>Contato</h2>
          {!editando ? (
            <>
              <p>
                {telefone(h.telefone) || <span className="suave">sem telefone</span>}
                <br />
                {documento(h.cpf_cnpj) || <span className="suave">sem CPF</span>}
                <br />
                {[h.cidade, h.uf].filter(Boolean).join('/')}
              </p>
              {h.obs && <p className="pequeno">{h.obs}</p>}
              <div className="botoes">
                {wa && (
                  <a className="botao verde" href={wa} target="_blank" rel="noreferrer">
                    Mandar WhatsApp
                  </a>
                )}
                <button className="botao" onClick={abrirEdicao}>
                  Mudar dados
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                salvar.mutate();
              }}
            >
              {(
                [
                  ['nome', 'Nome'],
                  ['telefone', 'Telefone'],
                  ['cpfCnpj', 'CPF/CNPJ'],
                  ['cidade', 'Cidade'],
                  ['uf', 'UF'],
                ] as const
              ).map(([k, r]) => (
                <div className="campo" key={k}>
                  <label htmlFor={`h-${k}`}>{r}</label>
                  <input id={`h-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                </div>
              ))}
              <div className="campo">
                <label htmlFor="h-obs">Observação</label>
                <textarea id="h-obs" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} />
              </div>
              <MensagemErro erro={salvar.error} />
              <div className="botoes">
                <button type="button" className="botao" onClick={() => setEditando(false)}>
                  Voltar
                </button>
                <button className="botao principal">Salvar</button>
              </div>
            </form>
          )}
        </div>
        <div className="cartao">
          <h2>Hospedagens</h2>
          <ul className="lista">
            {estadias.map((e) => (
              <li key={e.id}>
                <div className="principal-item">
                  <Link to={`/estadia/${e.id}`} className="nome">
                    {data(e.data_entrada)}
                  </Link>
                  <div className="suave pequeno">
                    Quarto {e.quarto} · até {dataCurta(e.data_saida)} · {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Dinheiro valor={e.total} />
                  <div>
                    <Etiqueta estado={STATUS[e.status]?.estado ?? 'neutro'}>{STATUS[e.status]?.texto ?? e.status}</Etiqueta>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
