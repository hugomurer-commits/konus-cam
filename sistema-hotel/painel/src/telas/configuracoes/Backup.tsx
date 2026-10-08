import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando, Etiqueta, MensagemErro } from '../../componentes/Basicos';
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
    mutationFn: () => api.put('/api/backup/pasta', { pasta }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['backup'] });
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
      <div className="cartao" style={{ borderLeft: `8px solid ${d.atrasado ? 'var(--vermelho-alerta)' : 'var(--verde-escuro)'}` }}>
        <h2>
          Último backup:{' '}
          {d.ultimo ? (
            <Etiqueta estado={d.atrasado ? 'atrasado' : 'pago'}>{dataHora(d.ultimo)}</Etiqueta>
          ) : (
            <Etiqueta estado="atrasado">nunca</Etiqueta>
          )}
        </h2>
        <p>
          O sistema faz backup sozinho todo dia às 3h da manhã (ou assim que o computador ligar, se estava desligado). Guarda os
          últimos {d.manter.diarios} dias e {d.manter.mensais} meses.
        </p>
        <MensagemErro erro={agora.error} />
        <button className="botao principal grande" disabled={agora.isPending} onClick={() => agora.mutate()}>
          {agora.isPending ? 'Fazendo backup…' : 'Fazer backup agora'}
        </button>
      </div>
      <div className="cartao">
        <h2>Onde guardar</h2>
        <p>
          Escolha uma pasta do <strong>Google Drive para computador</strong> (no modo "espelhar arquivos"), assim cada backup vai
          para a nuvem sozinho. Exemplo: <code>C:\Users\Hotel\Meu Drive\Backup Hotel</code>
        </p>
        <div className="campo">
          <label htmlFor="pasta-backup">Pasta do backup</label>
          <input id="pasta-backup" value={pasta} placeholder={d.pastaPadrao} onChange={(e) => setPasta(e.target.value)} />
          <span className="ajuda">Vazio = guarda só neste computador ({d.pastaPadrao}). Não protege se o computador estragar.</span>
        </div>
        <MensagemErro erro={salvarPasta.error} />
        <button className="botao" onClick={() => salvarPasta.mutate()}>
          Salvar pasta
        </button>
      </div>
      <div className="cartao">
        <h2>Últimas tentativas</h2>
        <ul className="lista">
          {d.historico.map((h, i) => (
            <li key={i}>
              <span className="principal-item">{dataHora(h.feito_em)}</span>
              {h.ok ? (
                <Etiqueta estado="pago">Deu certo{h.tamanho ? ` · ${(h.tamanho / 1024 / 1024).toFixed(1)} MB` : ''}</Etiqueta>
              ) : (
                <Etiqueta estado="atrasado">Falhou: {h.erro}</Etiqueta>
              )}
            </li>
          ))}
          {d.historico.length === 0 && <li className="vazio">Nenhum backup ainda.</li>}
        </ul>
      </div>
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
  return (
    <div className="cartao">
      <h2>Primeiros passos</h2>
      <ul className="lista">
        {passos.map((p, i) => (
          <li key={p.titulo}>
            <div className="principal-item">
              <div className="nome">
                {i + 1}. {p.titulo}
              </div>
              <div className="suave">{p.texto}</div>
            </div>
            {p.feito ? <Etiqueta estado="pago">Feito</Etiqueta> : <Etiqueta estado="chega">Falta</Etiqueta>}
            <Link to={p.link} className="botao">
              {p.feito ? 'Ver' : 'Fazer'}
            </Link>
          </li>
        ))}
      </ul>
      <p className="suave" style={{ marginTop: 12 }}>
        Depois disso, é só usar a tela <Link to="/">Hoje</Link>.
      </p>
    </div>
  );
}
