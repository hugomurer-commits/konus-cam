import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  CircleDashed,
  Cloud,
  CloudUpload,
  DatabaseBackup,
  Eye,
  FolderOpen,
  History,
  ListChecks,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ChipIcone, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { dataHora } from '../../formato';

interface EstadoBackup {
  pasta: string;
  pastaPadrao: string;
  configurada: boolean;
  ultimo: string | null;
  atrasado: boolean;
  historico: { feito_em: string; ok: number; erro: string | null; tamanho: number | null }[];
  manter: { diarios: number; mensais: number };
  sugestoes: string[];
}

export function useEstadoBackup() {
  return useQuery({ queryKey: ['backup'], queryFn: () => api.get<EstadoBackup>('/api/backup') });
}

export function ConfigBackup() {
  const dados = useEstadoBackup();
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [pasta, setPasta] = useState('');
  useEffect(() => {
    if (dados.data) setPasta(dados.data.configurada ? dados.data.pasta : '');
  }, [dados.data]);
  const salvarPasta = useMutation({
    mutationFn: async (p?: string) => {
      await api.put('/api/backup/pasta', { pasta: p ?? pasta, criar: p !== undefined });
      // Escolheu a pasta sugerida: já faz o primeiro backup
      if (p !== undefined) await api.post('/api/backup/agora');
    },
    onSuccess: () => {
      cliente.invalidateQueries();
      avisar('Pasta do backup salva.');
    },
  });
  const agora = useMutation({
    mutationFn: () => api.post('/api/backup/agora'),
    onSuccess: () => {
      cliente.invalidateQueries();
      avisar('Backup feito.');
    },
    onError: () => cliente.invalidateQueries({ queryKey: ['backup'] }),
  });
  if (dados.isLoading) return <Carregando />;
  const d = dados.data!;
  return (
    <>
      <section className={`cartao cartao-lista estado-backup ${d.atrasado || !d.ultimo ? 'tom-perigo' : 'tom-livre'}`}>
        <header className="cartao-topo">
          <ChipIcone icone={d.atrasado || !d.ultimo ? ShieldAlert : ShieldCheck} tom={d.atrasado || !d.ultimo ? 'tom-perigo' : 'tom-livre'} />
          <h2>Último backup:</h2>
          {d.ultimo ? (
            <Etiqueta estado={d.atrasado ? 'atrasado' : 'pago'}>{dataHora(d.ultimo)}</Etiqueta>
          ) : (
            <Etiqueta estado="atrasado">nunca</Etiqueta>
          )}
        </header>
        <p>
          O sistema faz backup sozinho todo dia às 3h da manhã (ou assim que o computador ligar, se estava desligado). Guarda os
          últimos {d.manter.diarios} dias e {d.manter.mensais} meses.
        </p>
        <MensagemErro erro={agora.error} />
        <button className="botao principal grande" disabled={agora.isPending} onClick={() => agora.mutate()}>
          <DatabaseBackup aria-hidden="true" />
          {agora.isPending ? 'Fazendo backup…' : 'Fazer backup agora'}
        </button>
      </section>
      {d.sugestoes.length > 0 && d.sugestoes[0] !== d.pasta && (
        <section className="cartao">
          <header className="cartao-topo">
            <ChipIcone icone={Cloud} tom="tom-ocupado" />
            <h2>Achei o Google Drive neste computador</h2>
          </header>
          <p className="apoio">Guardando o backup numa pasta do Drive, ele vai para a nuvem sozinho.</p>
          <div className="sugestoes-pasta">
            {d.sugestoes.map((s) => (
              <div key={s} className="sugestao-pasta">
                <ChipIcone icone={Cloud} tom="tom-ocupado" />
                <div className="onde">
                  <span className="rotulo">Pasta do Google Drive</span>
                  <code className="caminho">{s}</code>
                </div>
                <button className="botao principal grande" disabled={salvarPasta.isPending} onClick={() => salvarPasta.mutate(s)}>
                  <CloudUpload aria-hidden="true" />
                  Guardar o backup aqui
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={FolderOpen} tom="tom-chega" />
          <h2>Onde guardar</h2>
        </header>
        <p>
          Escolha uma pasta do <strong>Google Drive para computador</strong> (no modo "espelhar arquivos"), assim cada backup vai
          para a nuvem sozinho. Exemplo: <code className="caminho">C:\Users\Hotel\Meu Drive\Backup Hotel</code>
        </p>
        <div className="campo">
          <label htmlFor="pasta-backup">Pasta do backup</label>
          <input id="pasta-backup" value={pasta} placeholder={d.pastaPadrao} onChange={(e) => setPasta(e.target.value)} />
          <span className="ajuda ajuda-quebra">Vazio = guarda só neste computador ({d.pastaPadrao}). Não protege se o computador estragar.</span>
        </div>
        <MensagemErro erro={salvarPasta.error} />
        <button className="botao" onClick={() => salvarPasta.mutate(undefined)}>
          <Save aria-hidden="true" />
          Salvar pasta
        </button>
      </section>
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={History} tom="tom-config" />
          <h2>Últimas tentativas</h2>
        </header>
        <ul className="lista-historico">
          {d.historico.map((h, i) => (
            <li key={i}>
              <span className="quando">
                <CalendarClock aria-hidden="true" />
                {dataHora(h.feito_em)}
              </span>
              {h.ok ? (
                <Etiqueta estado="pago">Deu certo{h.tamanho ? ` · ${(h.tamanho / 1024 / 1024).toFixed(1)} MB` : ''}</Etiqueta>
              ) : (
                <Etiqueta estado="atrasado">Falhou</Etiqueta>
              )}
              {!h.ok && h.erro && <p className="motivo">{h.erro}</p>}
            </li>
          ))}
          {d.historico.length === 0 && <li className="vazio">Nenhum backup ainda.</li>}
        </ul>
      </section>
    </>
  );
}

/** Assistente de primeiro uso (seção 12): o que falta para deixar o sistema pronto. */
export function PrimeirosPassos() {
  const config = useQuery({ queryKey: ['config'], queryFn: () => api.get<{ config: Record<string, string> }>('/api/config') });
  const imp = useQuery({ queryKey: ['importacao'], queryFn: () => api.get<{ importacao: unknown; podeImportar: boolean }>('/api/importacao') });
  const backup = useEstadoBackup();
  const quartos = useQuery({ queryKey: ['quartos', 'ativos'], queryFn: () => api.get<{ quartos: unknown[] }>('/api/quartos') });
  const passos = [
    {
      titulo: 'Dados do hotel e do Pix',
      feito: !!config.data?.config.cnpj && !!config.data?.config.whatsapp_hotel,
      texto: 'CNPJ, chave Pix e WhatsApp do hotel.',
      link: '/configuracoes/hotel',
    },
    {
      titulo: 'Importar a planilha antiga',
      feito: !!imp.data?.importacao,
      texto: 'Traz hóspedes, diárias, pagamentos e despesas, e confere os totais.',
      link: '/configuracoes/importacao',
    },
    {
      titulo: 'Pasta do backup no Google Drive',
      feito: !!backup.data?.configurada && !backup.data?.atrasado,
      texto: 'Escolha a pasta e faça o primeiro backup.',
      link: '/configuracoes/backup',
    },
    {
      titulo: 'Conferir quartos e preços',
      feito: (quartos.data?.quartos.length ?? 0) > 0,
      texto: 'Quais quartos estão em uso, quantas pessoas cabem, fotos e tabela de preço.',
      link: '/quartos/editar',
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <ChipIcone icone={ListChecks} tom="tom-hoje" />
        <h2>Primeiros passos</h2>
      </header>
      <div className="progresso-passos">
        <span className="texto">
          {feitos} de {passos.length} passos feitos
        </span>
        <span className="barra-valor" aria-hidden="true">
          <span style={{ '--pct': `${(feitos / passos.length) * 100}%` } as CSSProperties} />
        </span>
      </div>
      <ol className="lista-passos">
        {passos.map((p, i) => (
          <li key={p.titulo} className={p.feito ? 'feito' : 'pendente'}>
            <span className="passo-circulo" aria-hidden="true">
              {i + 1}
            </span>
            <div className="passo-texto">
              <div className="passo-titulo">
                {p.titulo}
                {p.feito ? (
                  <Etiqueta estado="pago">Feito</Etiqueta>
                ) : (
                  <span className="etiqueta est-chega">
                    <CircleDashed aria-hidden="true" />
                    Falta
                  </span>
                )}
              </div>
              <p className="suave">{p.texto}</p>
            </div>
            <Link to={p.link} className={`botao${p.feito ? '' : ' principal'}`}>
              {p.feito ? <Eye aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {p.feito ? 'Ver' : 'Fazer'}
            </Link>
          </li>
        ))}
      </ol>
      <p className="passos-fim">
        <span className="sol-logo" aria-hidden="true" />
        <span>
          Depois disso, é só usar a tela <Link to="/">Hoje</Link>.
        </span>
      </p>
    </section>
  );
}
