import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  LogOut,
  MousePointerClick,
  Plus,
  SprayCan,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { Carregando, ICONE_ESTADO, MensagemErro, TituloTela, type Estado } from '../../componentes/Basicos';
import { useAcoesRapidas } from '../../componentes/AcoesEstadia';
import { dataCurta, diaDaSemana, diasEntre, hojeLocal, nomeProprio, noites, somarDias } from '../../formato';

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

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** "8 a 21 de outubro" ou "28 de outubro a 10 de novembro" */
function periodoTexto(primeiro: string, ultimo: string): string {
  const dia = (d: string) => String(Number(d.slice(8, 10)));
  const mes = (d: string) => MESES[Number(d.slice(5, 7)) - 1];
  if (primeiro.slice(0, 7) === ultimo.slice(0, 7)) return `${dia(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
  return `${dia(primeiro)} de ${mes(primeiro)} a ${dia(ultimo)} de ${mes(ultimo)}`;
}

/** Nome que cabe na barra: 1 dia → "Maria A." (ou só "Adriano"), 2 dias → "Maria Aparecida", 3 ou mais → nome todo. */
function nomeNaBarra(nome: string, colunas: number): string {
  const completo = nomeProprio(nome.replace(/\s+-\s+.*/, '').trim());
  if (colunas >= 3) return completo;
  const partes = completo.split(/\s+/);
  const segundo = partes.slice(1).find((p) => !PARTICULAS.has(p.toLowerCase()));
  if (!segundo) return partes[0] ?? '';
  if (colunas === 2) return `${partes[0]} ${segundo}`;
  const curto = `${partes[0]} ${segundo.charAt(0).toUpperCase()}.`;
  return curto.length <= 9 ? curto : partes[0];
}

function fimDeSemana(dia: string): boolean {
  const s = diaDaSemana(dia, true);
  return s === 'sáb' || s === 'dom';
}

interface Situacao {
  estado: Estado;
  texto: string;
  Icone: LucideIcon | null;
}

/** Situação da estadia (cor + ícone + texto). */
function situacao(e: EstadiaMapa, hoje: string): Situacao {
  const de = (estado: Estado, texto: string, Icone: LucideIcon | null = ICONE_ESTADO[estado]): Situacao => ({ estado, texto, Icone });
  if (e.status === 'pre_reserva') return de('sai', 'Aguarda Pix', Hourglass);
  if (e.status === 'finalizada') return de('neutro', 'Saiu', LogOut);
  if (e.status === 'confirmada') {
    if (e.data_entrada < hoje) return de('atrasado', 'Não chegou');
    if (e.data_entrada === hoje) return de('chega', 'Chega hoje');
    return de('reservado', 'Reservado');
  }
  // hospedado
  if (e.data_saida < hoje) return de('atrasado', 'Saída atrasada');
  return de('ocupado', 'Ocupado');
}

/** Coisas desenhadas por cima da grade de um quarto. Colunas [ini, fim) contadas a partir do 1º dia visível. */
type Item =
  | { tipo: 'estadia'; e: EstadiaMapa; ini: number; fim: number; ordem: number }
  | { tipo: 'sai-hoje'; e: EstadiaMapa; ini: number; fim: number; ordem: number }
  | { tipo: 'limpar'; ini: number; fim: number; ordem: number };

/** Faixas (linhas da grade) de um quarto: estadias que se cruzam no mesmo dia vão uma embaixo da outra. */
function criarFaixas() {
  const faixas: [number, number][][] = [];
  return {
    faixas,
    ocupada: (i: number) => faixas.some((f) => f.some(([a, b]) => i >= a && i < b)),
    colocar(ini: number, fim: number): number {
      let f = faixas.findIndex((intervalos) => intervalos.every(([a, b]) => fim <= a || ini >= b));
      if (f < 0) {
        f = faixas.length;
        faixas.push([]);
      }
      faixas[f].push([ini, fim]);
      return f;
    },
  };
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
  const mes = dias >= 28;
  const unidade = mes ? 'Mês' : 'Semana';
  const n = d.dias.length;
  const primeiro = d.dias[0] ?? d.de;
  const coluna = (dia: string) => diasEntre(primeiro, dia);
  const iHoje = d.dias.indexOf(d.hoje);

  const porQuarto = new Map<number, EstadiaMapa[]>();
  for (const e of d.estadias) porQuarto.set(e.quarto_id, [...(porQuarto.get(e.quarto_id) ?? []), e]);

  function linhaDoQuarto(q: DadosMapa['quartos'][number]) {
    const es = porQuarto.get(q.id) ?? [];
    const limparHoje = iHoje >= 0 && q.estado_limpeza === 'limpar';

    const itens: Item[] = [];
    for (const e of es) {
      const ini = Math.max(0, coluna(e.data_entrada));
      const fim = Math.min(n, coluna(e.data_saida));
      if (fim > ini) itens.push({ tipo: 'estadia', e, ini, fim, ordem: e.status === 'finalizada' ? 1 : 2 });
    }
    if (iHoje >= 0) {
      // Quem ainda está no quarto e sai hoje aparece no dia de hoje
      for (const e of es.filter((x) => x.status === 'hospedado' && x.data_saida === d.hoje))
        itens.push({ tipo: 'sai-hoje', e, ini: iHoje, fim: iHoje + 1, ordem: 0 });
      if (limparHoje) itens.push({ tipo: 'limpar', ini: iHoje, fim: iHoje + 1, ordem: 3 });
    }
    itens.sort((a, b) => a.ini - b.ini || a.ordem - b.ordem);

    const grade = criarFaixas();
    const posicionados = itens.map((item) => ({ item, faixa: grade.colocar(item.ini, item.fim) }));

    // Dias livres (mesma regra de antes): botão "Livre" em toda a altura, ou numa faixa vazia se houver barra no dia
    const livres: { dia: string; i: number; faixa: number | null }[] = [];
    d.dias.forEach((dia, i) => {
      const naNoite = es.filter((e) => e.data_entrada <= dia && e.data_saida > dia);
      const livre = naNoite.filter((e) => e.status !== 'finalizada').length === 0;
      const limpar = dia === d.hoje && q.estado_limpeza === 'limpar';
      const podeReservar = livre && dia >= somarDias(d.hoje, -1) && !limpar;
      if (podeReservar) livres.push({ dia, i, faixa: grade.ocupada(i) ? grade.colocar(i, i + 1) : null });
    });
    const faixas = Math.max(1, grade.faixas.length);

    // Ordem do teclado acompanha a ordem dos dias
    const elementos: { i: number; faixa: number; no: ReactNode }[] = [];
    for (const { item, faixa } of posicionados) {
      const linha = { gridColumn: `${item.ini + 2} / ${item.fim + 2}`, gridRow: faixa + 1 };
      const colunas = item.fim - item.ini;
      const curta = colunas === 1 ? ' curta' : '';
      if (item.tipo === 'limpar') {
        elementos.push({
          i: item.ini,
          faixa,
          no: (
            <button
              key="limpar"
              type="button"
              className={`estadia-barra est-limpar${curta}`}
              style={linha}
              onClick={() => acoes.quartoLimpo(q.id, q.codigo)}
              aria-label={`Limpar quarto ${q.codigo}: tocar para marcar como limpo`}
              title="Marcar quarto limpo"
            >
              <span className="quem">Limpar</span>
              <span className="como">
                <SprayCan aria-hidden="true" />
                Tocar = limpo
              </span>
            </button>
          ),
        });
        continue;
      }
      const e = item.e;
      const s: Situacao = item.tipo === 'sai-hoje' ? { estado: 'sai', texto: 'Sai hoje', Icone: ICONE_ESTADO.sai } : situacao(e, d.hoje);
      const antes = item.tipo === 'estadia' && e.data_entrada < primeiro ? ' antes' : '';
      const depois = item.tipo === 'estadia' && coluna(e.data_saida) > n ? ' depois' : '';
      const total = diasEntre(e.data_entrada, e.data_saida);
      const nomeTodo = nomeProprio(e.nome);
      const quando = `${dataCurta(e.data_entrada)} a ${dataCurta(e.data_saida)}`;
      elementos.push({
        i: item.ini,
        faixa,
        no: (
          <Link
            key={`${item.tipo}-${e.id}`}
            to={`/estadia/${e.id}`}
            className={`estadia-barra est-${s.estado}${curta}${antes}${depois}`}
            style={linha}
            aria-label={`${nomeTodo}, quarto ${q.codigo}, ${s.texto}, de ${quando}`}
            title={`${nomeTodo} · ${s.texto} · ${quando}`}
          >
            <span className="quem">{nomeNaBarra(e.nome, colunas)}</span>
            <span className="como">
              {s.Icone && <s.Icone aria-hidden="true" />}
              {s.texto}
              {item.tipo === 'estadia' && colunas >= 3 && total > 1 ? ` · ${noites(total)}` : ''}
            </span>
          </Link>
        ),
      });
    }
    for (const l of livres) {
      elementos.push({
        i: l.i,
        faixa: l.faixa ?? 0,
        no: (
          <button
            key={`livre-${l.dia}`}
            type="button"
            className="mapa-livre"
            style={{ gridColumn: l.i + 2, gridRow: l.faixa === null ? '1 / -1' : l.faixa + 1 }}
            onClick={() => navegar(`/nova-hospedagem?quarto=${q.id}&data=${l.dia}`)}
            aria-label={`Quarto ${q.codigo} livre em ${dataCurta(l.dia)}: nova hospedagem`}
          >
            <Plus aria-hidden="true" />
            Livre
          </button>
        ),
      });
    }
    elementos.sort((a, b) => a.i - b.i || a.faixa - b.faixa);

    return (
      <div
        key={q.id}
        className="mapa-linha"
        role="group"
        aria-label={`Quarto ${q.codigo}`}
        style={{ '--dias': n, '--faixas': faixas } as CSSProperties}
      >
        <div className="mapa-quarto">
          {q.codigo}
          <span className="cap">até {q.capacidade}</span>
        </div>
        {d.dias.map((dia, i) => (
          <div
            key={dia}
            className={`mapa-fundo${fimDeSemana(dia) ? ' fds' : ''}${dia === d.hoje ? ' hoje' : ''}`}
            style={{ gridColumn: i + 2 }}
          />
        ))}
        {elementos.map((x) => x.no)}
      </div>
    );
  }

  return (
    <>
      <TituloTela
        icone={BedDouble}
        tom="tom-ocupado"
        titulo="Mapa dos quartos"
        subtitulo={
          <span className="periodo" aria-live="polite">
            {periodoTexto(primeiro, d.dias[n - 1] ?? primeiro)}
          </span>
        }
      >
        <div className="navegador" role="group" aria-label="Escolher o período">
          <button className="botao" onClick={() => setDe(somarDias(de, mes ? -30 : -7))} aria-label={mes ? 'Mês anterior' : 'Semana anterior'}>
            <ChevronLeft aria-hidden="true" />
            {unidade}
          </button>
          <button className={`botao${de === hoje ? ' selecionado' : ''}`} onClick={() => setDe(hoje)}>
            Hoje
          </button>
          <button className="botao" onClick={() => setDe(somarDias(de, mes ? 30 : 7))} aria-label={mes ? 'Próximo mês' : 'Próxima semana'}>
            {unidade}
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <button className="botao" onClick={() => setDias(mes ? 14 : 31)}>
          {mes ? <CalendarRange aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
          {mes ? 'Ver 2 semanas' : 'Ver o mês'}
        </button>
      </TituloTela>
      <div className="mapa-rolagem" role="region" aria-label="Mapa de ocupação" tabIndex={0}>
        <div className="mapa-linha cabecalho-mapa" style={{ '--dias': n } as CSSProperties} aria-hidden="true">
          <div className="mapa-cab mapa-canto">Quarto</div>
          {d.dias.map((dia) => {
            const ehHoje = dia === d.hoje;
            return (
              <div key={dia} className={`mapa-cab${fimDeSemana(dia) ? ' fds' : ''}${ehHoje ? ' hoje' : ''}`}>
                <span className="dsem">{ehHoje ? `Hoje · ${diaDaSemana(dia, true)}` : diaDaSemana(dia, true)}</span>
                <span className="dia">{dataCurta(dia)}</span>
              </div>
            );
          })}
        </div>
        {d.quartos.map(linhaDoQuarto)}
      </div>
      <p className="mapa-dica">
        <MousePointerClick aria-hidden="true" />
        Toque num quarto livre para fazer uma hospedagem já com quarto e data. Toque num nome para ver a hospedagem.
      </p>
      {acoes.janela}
    </>
  );
}
