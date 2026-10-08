import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BedDouble,
  CalendarClock,
  History,
  IdCard,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Repeat,
  Save,
  Search,
  SearchX,
  StickyNote,
  UserPen,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ChipIcone, Dinheiro, Etiqueta, MensagemErro, TituloTela } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, documento, nomeProprio, telefone } from '../../formato';
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

const inicial = (nome: string) => (nome.trim().charAt(0) || '?').toUpperCase();

function ListaHospedes({ hospedes }: { hospedes: Hospede[] }) {
  return (
    <ul className="lista lista-clientes">
      {hospedes.map((h) => {
        const cidade = [nomeProprio(h.cidade), h.uf].filter(Boolean).join('/');
        return (
          <li key={h.id}>
            <span className="avatar" aria-hidden="true">
              {inicial(nomeProprio(h.nome))}
            </span>
            <div className="principal-item">
              <Link to={`/quartos/hospedes/${h.id}`} className="nome">
                {nomeProprio(h.nome)}
              </Link>
              {(h.telefone || cidade) && (
                <div className="detalhe-icones">
                  {h.telefone && (
                    <span>
                      <Phone aria-hidden="true" />
                      {telefone(h.telefone)}
                    </span>
                  )}
                  {cidade && (
                    <span>
                      <MapPin aria-hidden="true" />
                      {cidade}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="historico">
              <div className="vezes">
                {h.visitas} {h.visitas === 1 ? 'vez' : 'vezes'}
                {h.ultima ? `, última ${dataCurta(h.ultima)}/${h.ultima.slice(2, 4)}` : ''}
              </div>
              <div className="suave">
                gastou <Dinheiro valor={h.total_gasto} />
              </div>
            </div>
          </li>
        );
      })}
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
      <TituloTela icone={Users} tom="tom-ocupado" titulo="Hóspedes" />
      <section className="cartao busca-hospede">
        <div className="campo">
          <label htmlFor="busca">Procurar hóspede (nome, CPF ou telefone)</label>
          <div className="campo-busca">
            <Search aria-hidden="true" />
            <input id="busca" className="entrada-grande" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        {termo.trim().length >= 2 && resultado.data && (
          <>
            {resultado.data.hospedes.length === 0 ? (
              <p className="vazio nada">
                <SearchX aria-hidden="true" />
                Ninguém encontrado.
              </p>
            ) : (
              <ListaHospedes hospedes={resultado.data.hospedes} />
            )}
          </>
        )}
      </section>
      {termo.trim().length < 2 && (
        <section className="cartao cartao-lista tom-ocupado">
          <header className="cartao-topo">
            <ChipIcone icone={Repeat} />
            <h2>Clientes que mais voltam</h2>
          </header>
          {frequentes.isLoading ? <Carregando /> : <ListaHospedes hospedes={frequentes.data?.hospedes ?? []} />}
        </section>
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
  const cidade = [nomeProprio(h.cidade), h.uf].filter(Boolean).join('/');
  const abrirEdicao = () => {
    setF({ nome: h.nome, telefone: h.telefone, cpfCnpj: h.cpf_cnpj ?? '', cidade: h.cidade, uf: h.uf, obs: h.obs });
    setEditando(true);
  };
  return (
    <>
      <TituloTela icone={UserRound} tom="tom-ocupado" titulo={nomeProprio(h.nome)}>
        <Link to={`/nova-hospedagem?hospede=${h.id}`} className="botao principal">
          <Plus aria-hidden="true" />
          Nova hospedagem
        </Link>
        <Link to="/quartos/hospedes" className="botao">
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Link>
      </TituloTela>
      <div className="grade-4 ficha-numeros">
        <div className="numero-grande tom-ocupado">
          <div className="valor">{h.visitas}</div>
          <div className="rotulo">
            <BedDouble aria-hidden="true" />
            {h.visitas === 1 ? 'Hospedagem' : 'Hospedagens'}
          </div>
        </div>
        <div className="numero-grande tom-caixa">
          <div className="valor">
            <Dinheiro valor={h.total_gasto} />
          </div>
          <div className="rotulo">
            <Wallet aria-hidden="true" />
            Total gasto
          </div>
        </div>
        <div className="numero-grande tom-hoje">
          <div className="valor">{h.ultima ? data(h.ultima) : '—'}</div>
          <div className="rotulo">
            <CalendarClock aria-hidden="true" />
            Última vez
          </div>
        </div>
      </div>
      <div className="grade-2">
        <section className="cartao">
          <header className="cartao-topo">
            <ChipIcone icone={Phone} tom="tom-ocupado" />
            <h2>Contato</h2>
          </header>
          {!editando ? (
            <>
              <ul className="dados-contato">
                <li>
                  <Phone aria-hidden="true" />
                  {telefone(h.telefone) || <span className="suave">sem telefone</span>}
                </li>
                <li>
                  <IdCard aria-hidden="true" />
                  {documento(h.cpf_cnpj) || <span className="suave">sem CPF</span>}
                </li>
                {cidade && (
                  <li>
                    <MapPin aria-hidden="true" />
                    {cidade}
                  </li>
                )}
              </ul>
              {h.obs && (
                <p className="obs-hospede">
                  <StickyNote aria-hidden="true" />
                  <span>{h.obs}</span>
                </p>
              )}
              <div className="botoes">
                {wa && (
                  <a className="botao verde" href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" />
                    Mandar WhatsApp
                  </a>
                )}
                <button className="botao" onClick={abrirEdicao}>
                  <UserPen aria-hidden="true" />
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
                  <ArrowLeft aria-hidden="true" />
                  Voltar
                </button>
                <button className="botao principal">
                  <Save aria-hidden="true" />
                  Salvar
                </button>
              </div>
            </form>
          )}
        </section>
        <section className="cartao cartao-lista tom-ocupado">
          <header className="cartao-topo">
            <ChipIcone icone={History} />
            <h2>Hospedagens</h2>
            <span className="contagem">{estadias.length}</span>
          </header>
          <ul className="lista lista-estadias">
            {estadias.map((e) => (
              <li key={e.id}>
                <span className="chaveiro" aria-hidden="true">
                  {e.quarto}
                </span>
                <div className="principal-item">
                  <Link to={`/estadia/${e.id}`} className="nome">
                    {data(e.data_entrada)}
                  </Link>
                  <div className="detalhe">
                    Quarto <strong>{e.quarto}</strong> · até {dataCurta(e.data_saida)} · {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  </div>
                </div>
                <div className="valor-estadia">
                  <Dinheiro valor={e.total} />
                  <Etiqueta estado={STATUS[e.status]?.estado ?? 'neutro'}>{STATUS[e.status]?.texto ?? e.status}</Etiqueta>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
