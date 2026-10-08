import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  BedDouble,
  Building2,
  HandCoins,
  Hammer,
  House,
  Info,
  KeyRound,
  Landmark,
  Plus,
  QrCode,
  Save,
  Tag,
  Tags,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { CampoReais, Carregando, ChipIcone, MensagemErro } from '../../componentes/Basicos';
import { useInteracao } from '../../componentes/Interacao';
import { GRUPOS } from '../../formato';

// ───────────── Hotel ─────────────

const CAMPOS_HOTEL: { chave: string; rotulo: string; ajuda?: string; tipo?: string; area?: boolean }[] = [
  { chave: 'nome_hotel', rotulo: 'Nome do hotel' },
  { chave: 'cidade_hotel', rotulo: 'Cidade' },
  { chave: 'whatsapp_hotel', rotulo: 'WhatsApp do hotel', ajuda: 'Com DDD. Ex.: 69 99999-0000', tipo: 'tel' },
  { chave: 'hora_checkin', rotulo: 'Horário de entrada', tipo: 'time' },
  { chave: 'hora_checkout', rotulo: 'Horário de saída', tipo: 'time' },
];
const CAMPOS_PIX: typeof CAMPOS_HOTEL = [
  { chave: 'cnpj', rotulo: 'CNPJ do hotel' },
  { chave: 'pix_chave', rotulo: 'Chave Pix', ajuda: 'O CNPJ do hotel.' },
  { chave: 'pix_nome_recebedor', rotulo: 'Nome do recebedor do Pix', ajuda: 'Como aparece no banco. Até 25 letras.' },
  { chave: 'pix_cidade_recebedor', rotulo: 'Cidade do recebedor do Pix', ajuda: 'Até 15 letras.' },
  { chave: 'sinal_percentual', rotulo: 'Sinal da reserva (%)', tipo: 'number' },
  { chave: 'minutos_segura', rotulo: 'Minutos que o quarto fica segurado esperando o Pix', tipo: 'number' },
  { chave: 'politica_cancelamento', rotulo: 'Política de cancelamento', area: true },
];

export function ConfigHotel() {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const dados = useQuery({ queryKey: ['config'], queryFn: () => api.get<{ config: Record<string, string> }>('/api/config') });
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (dados.data) setF(dados.data.config);
  }, [dados.data]);
  const salvar = useMutation({
    mutationFn: () => api.put('/api/config', f),
    onSuccess: () => {
      cliente.invalidateQueries();
      avisar('Configurações salvas.');
    },
  });
  if (dados.isLoading) return <Carregando />;
  const campo = (c: (typeof CAMPOS_HOTEL)[number]) => (
    <div className="campo" key={c.chave}>
      <label htmlFor={c.chave}>{c.rotulo}</label>
      {c.area ? (
        <textarea id={c.chave} rows={5} value={f[c.chave] ?? ''} onChange={(e) => setF({ ...f, [c.chave]: e.target.value })} />
      ) : (
        <input id={c.chave} type={c.tipo ?? 'text'} value={f[c.chave] ?? ''} onChange={(e) => setF({ ...f, [c.chave]: e.target.value })} />
      )}
      {c.ajuda && <span className="ajuda">{c.ajuda}</span>}
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={Building2} tom="tom-ocupado" />
          <h2>Hotel</h2>
        </header>
        <p className="apoio">Nome, cidade, WhatsApp e horários de entrada e saída.</p>
        <div className="linha-campos campos-alinhados">{CAMPOS_HOTEL.map(campo)}</div>
      </section>
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={QrCode} tom="tom-livre" />
          <h2>Pix e reserva online</h2>
        </header>
        <p className="apoio">Usado na página de reservas (próxima fase). Pode preencher desde já.</p>
        <div className="linha-campos campos-alinhados">{CAMPOS_PIX.filter((c) => !c.area).map(campo)}</div>
        {CAMPOS_PIX.filter((c) => c.area).map(campo)}
      </section>
      <MensagemErro erro={salvar.error} />
      <button className="botao principal grande botao-salvar-tudo" disabled={salvar.isPending}>
        <Save aria-hidden="true" />
        Salvar
      </button>
    </form>
  );
}

// ───────────── Preços ─────────────

interface Tarifa {
  pessoas: number;
  valor: number;
}

export function ConfigPrecos() {
  const dados = useQuery({
    queryKey: ['tarifas'],
    queryFn: () =>
      api.get<{ geral: Tarifa[]; excecoes: { quarto_id: number; codigo: string; pessoas: number; valor: number }[] }>('/api/tarifas'),
  });
  const quartos = useQuery({
    queryKey: ['quartos', 'ativos'],
    queryFn: () => api.get<{ quartos: { id: number; codigo: string }[] }>('/api/quartos'),
  });
  const [quartoExcecao, setQuartoExcecao] = useState<number | ''>('');
  if (dados.isLoading) return <Carregando />;
  const excecoesPorQuarto = new Map<number, Tarifa[]>();
  for (const e of dados.data?.excecoes ?? []) {
    excecoesPorQuarto.set(e.quarto_id, [...(excecoesPorQuarto.get(e.quarto_id) ?? []), e]);
  }
  return (
    <>
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={Tag} tom="tom-caixa" />
          <h2>Tabela de preço</h2>
        </header>
        <p className="apoio">
          Diária por número de pessoas. Na hora da hospedagem dá para mudar o valor (desconto, cliente fixo). Acima da última
          linha, soma R$ 100 por pessoa.
        </p>
        <EditorTarifas quartoId={null} inicial={dados.data!.geral} />
      </section>
      <section className="cartao">
        <header className="cartao-topo">
          <ChipIcone icone={BedDouble} tom="tom-ocupado" />
          <h2>Preço diferente em algum quarto</h2>
        </header>
        <p className="apoio">Só preencha se um quarto tiver preço próprio. O que ficar sem valor usa a tabela de cima.</p>
        {[...excecoesPorQuarto.entries()].map(([qid, ts]) => {
          const codigo = dados.data!.excecoes.find((e) => e.quarto_id === qid)?.codigo;
          return (
            <div key={qid} className="preco-quarto">
              <div className="preco-quarto-topo">
                <span className="chaveiro" aria-hidden="true">
                  {codigo}
                </span>
                <span>Quarto {codigo}</span>
              </div>
              <EditorTarifas quartoId={qid} inicial={ts} />
            </div>
          );
        })}
        <div className="campo" style={{ maxWidth: 320 }}>
          <label htmlFor="quarto-excecao">Criar preço para o quarto</label>
          <select id="quarto-excecao" value={quartoExcecao} onChange={(e) => setQuartoExcecao(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Escolha…</option>
            {quartos.data?.quartos
              .filter((q) => !excecoesPorQuarto.has(q.id))
              .map((q) => (
                <option key={q.id} value={q.id}>
                  {q.codigo}
                </option>
              ))}
          </select>
        </div>
        {quartoExcecao !== '' && <EditorTarifas key={quartoExcecao} quartoId={quartoExcecao} inicial={[]} aoSalvar={() => setQuartoExcecao('')} />}
      </section>
    </>
  );
}

function EditorTarifas({ quartoId, inicial, aoSalvar }: { quartoId: number | null; inicial: Tarifa[]; aoSalvar?: () => void }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const linhas = Math.max(5, ...inicial.map((t) => t.pessoas));
  const [valores, setValores] = useState<(number | null)[]>(() =>
    Array.from({ length: linhas }, (_, i) => inicial.find((t) => t.pessoas === i + 1)?.valor ?? null),
  );
  const salvar = useMutation({
    mutationFn: () =>
      api.put('/api/tarifas', {
        quartoId,
        valores: valores.map((v, i) => ({ pessoas: i + 1, valor: v })).filter((x) => x.valor !== null),
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['tarifas'] });
      avisar('Preços salvos.');
      aoSalvar?.();
    },
  });
  return (
    <form
      className="editor-tarifas"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="linha-campos" style={{ maxWidth: 1000 }}>
        {valores.map((v, i) => (
          <CampoReais
            key={i}
            id={`tarifa-${quartoId ?? 'g'}-${i + 1}`}
            rotulo={i === 0 ? '1 pessoa' : `${i + 1} pessoas`}
            valor={v}
            aoMudar={(c) => setValores(valores.map((x, j) => (j === i ? c : x)))}
          />
        ))}
      </div>
      <MensagemErro erro={salvar.error} />
      <div className="botoes">
        <button type="button" className="botao" onClick={() => setValores([...valores, null])}>
          <Plus aria-hidden="true" />
          Mais uma linha
        </button>
        <button className="botao principal">
          <Save aria-hidden="true" />
          Salvar preços
        </button>
      </div>
    </form>
  );
}

// ───────────── Quem recebe ─────────────

interface Recebedora {
  id: number;
  sigla: string;
  nome: string;
  ativa: number;
}

export function ConfigRecebedores() {
  const dados = useQuery({ queryKey: ['contas-recebedoras'], queryFn: () => api.get<{ contas: Recebedora[] }>('/api/contas-recebedoras') });
  if (dados.isLoading) return <Carregando />;
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <ChipIcone icone={HandCoins} tom="tom-caixa" />
        <h2>Quem recebe o dinheiro</h2>
      </header>
      <p className="apoio">Na planilha era a coluna H V N: em qual conta ou com quem ficou o pagamento.</p>
      <ul className="linhas-editaveis">
        {dados.data!.contas.map((c) => (
          <LinhaRecebedora key={c.id} conta={c} />
        ))}
        <LinhaRecebedora conta={null} />
      </ul>
    </section>
  );
}

function LinhaRecebedora({ conta }: { conta: Recebedora | null }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [sigla, setSigla] = useState(conta?.sigla ?? '');
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [ativa, setAtiva] = useState(conta ? !!conta.ativa : true);
  const salvar = useMutation({
    mutationFn: () =>
      conta
        ? api.put(`/api/contas-recebedoras/${conta.id}`, { sigla, nome, ativa })
        : api.post('/api/contas-recebedoras', { sigla, nome, ativa }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['contas-recebedoras'] });
      avisar('Salvo.');
      if (!conta) {
        setSigla('');
        setNome('');
      }
    },
    onError: (e) => avisar((e as Error).message, { erro: true }),
  });
  return (
    <li className={`linha-recebedora${conta ? '' : ' linha-nova'}`}>
      <input className="entrada col-sigla" aria-label="Sigla" value={sigla} placeholder="Sigla" onChange={(e) => setSigla(e.target.value)} />
      <input className="entrada col-nome" aria-label="Nome" value={nome} placeholder={conta ? 'Nome' : 'Nova: nome'} onChange={(e) => setNome(e.target.value)} />
      {conta && (
        <label className="marcar">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Em uso
        </label>
      )}
      <button className={`botao${conta ? '' : ' verde'}`} disabled={!sigla || !nome} onClick={() => salvar.mutate()}>
        {conta ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {conta ? 'Salvar' : 'Adicionar'}
      </button>
    </li>
  );
}

// ───────────── Categorias ─────────────

interface Categoria {
  id: number;
  nome: string;
  grupo: string;
  ativa: number;
  aviso: string;
  usos: number;
}

/** Ícone e cor de cada grupo de despesa (só visual). */
const VISUAL_GRUPO: Record<string, { icone: LucideIcon; tom: string }> = {
  operacao: { icone: Wrench, tom: 'tom-ocupado' },
  obra: { icone: Hammer, tom: 'tom-sai' },
  financiamento: { icone: Landmark, tom: 'tom-chega' },
  investimento: { icone: Armchair, tom: 'tom-contas' },
  casa_pessoal: { icone: House, tom: 'tom-livre' },
  retirada: { icone: Wallet, tom: 'tom-perigo' },
};

export function ConfigCategorias() {
  const dados = useQuery({ queryKey: ['categorias'], queryFn: () => api.get<{ categorias: Categoria[] }>('/api/categorias') });
  if (dados.isLoading) return <Carregando />;
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <ChipIcone icone={Tags} tom="tom-contas" />
        <h2>Categorias de despesa</h2>
      </header>
      <p className="apoio">
        O grupo decide em qual resultado a despesa entra no Caixa. Ex.: obra e financiamento ficam fora do "Resultado do hotel".
      </p>
      {Object.entries(GRUPOS).map(([g, titulo]) => {
        const doGrupo = dados.data!.categorias.filter((c) => c.grupo === g);
        const visual = VISUAL_GRUPO[g] ?? { icone: Tags, tom: 'tom-config' };
        return (
          <div key={g} className={`grupo-categorias ${visual.tom}`}>
            <h3 className="sub-secao">
              <ChipIcone icone={visual.icone} tom={visual.tom} />
              {titulo}
              <span className="contagem" aria-label={`${doGrupo.length} categorias`}>
                {doGrupo.length}
              </span>
            </h3>
            <ul className="linhas-editaveis">
              {doGrupo.map((c) => (
                <LinhaCategoria key={c.id} cat={c} />
              ))}
            </ul>
          </div>
        );
      })}
      <h3 className="sub-secao">
        <ChipIcone icone={Plus} tom="tom-livre" />
        Nova categoria
      </h3>
      <ul className="linhas-editaveis">
        <LinhaCategoria cat={null} />
      </ul>
    </section>
  );
}

function LinhaCategoria({ cat }: { cat: Categoria | null }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [nome, setNome] = useState(cat?.nome ?? '');
  const [grupo, setGrupo] = useState(cat?.grupo ?? 'operacao');
  const [ativa, setAtiva] = useState(cat ? !!cat.ativa : true);
  const mudou = !cat || nome !== cat.nome || grupo !== cat.grupo || ativa !== !!cat.ativa;
  const salvar = useMutation({
    mutationFn: () =>
      cat
        ? api.put(`/api/categorias/${cat.id}`, { nome, grupo, ativa, aviso: cat.aviso })
        : api.post('/api/categorias', { nome, grupo, ativa }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['categorias'] });
      avisar('Categoria salva.');
      if (!cat) setNome('');
    },
    onError: (e) => avisar((e as Error).message, { erro: true }),
  });
  return (
    <li className={`linha-categoria${cat ? '' : ' linha-nova'}`}>
      <input className="entrada col-nome" aria-label="Nome da categoria" value={nome} placeholder="Nome" onChange={(e) => setNome(e.target.value)} />
      <select className="entrada col-grupo" aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
        {Object.entries(GRUPOS).map(([g, t]) => (
          <option key={g} value={g}>
            {t}
          </option>
        ))}
      </select>
      {cat && (
        <label className="marcar">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Em uso
        </label>
      )}
      {cat && (
        <span className="col-usos">
          <span className="suave pequeno">{cat.usos} lançamentos</span>
          {cat.aviso && (
            <span className="etiqueta est-chega" title={cat.aviso}>
              <Info aria-hidden="true" />
              Aviso
            </span>
          )}
        </span>
      )}
      <button className={`botao${cat ? '' : ' verde'}`} disabled={!nome || !mudou} onClick={() => salvar.mutate()}>
        {cat ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {cat ? 'Salvar' : 'Adicionar'}
      </button>
    </li>
  );
}

// ───────────── Senha e usuários ─────────────

export function ConfigSenha() {
  const { avisar } = useInteracao();
  const cliente = useQueryClient();
  const [f, setF] = useState({ senhaAtual: '', senhaNova: '', senhaNova2: '' });
  const [novo, setNovo] = useState({ nome: '', login: '', senha: '' });
  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<{ usuarios: { id: number; nome: string; login: string }[] }>('/api/usuarios'),
  });
  const trocar = useMutation({
    mutationFn: () => {
      if (f.senhaNova !== f.senhaNova2) throw new Error('As duas senhas novas não são iguais.');
      return api.post('/api/auth/trocar-senha', f);
    },
    onSuccess: () => {
      setF({ senhaAtual: '', senhaNova: '', senhaNova2: '' });
      avisar('Senha trocada.');
    },
  });
  const criar = useMutation({
    mutationFn: () => api.post('/api/usuarios', novo),
    onSuccess: () => {
      setNovo({ nome: '', login: '', senha: '' });
      cliente.invalidateQueries({ queryKey: ['usuarios'] });
      avisar('Usuário criado.');
    },
  });
  return (
    <div className="grade-2">
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          trocar.mutate();
        }}
      >
        <header className="cartao-topo">
          <ChipIcone icone={KeyRound} tom="tom-chega" />
          <h2>Trocar minha senha</h2>
        </header>
        {(['senhaAtual', 'senhaNova', 'senhaNova2'] as const).map((k) => (
          <div className="campo" key={k}>
            <label htmlFor={k}>{k === 'senhaAtual' ? 'Senha atual' : k === 'senhaNova' ? 'Senha nova' : 'Repita a senha nova'}</label>
            <input id={k} type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <MensagemErro erro={trocar.error} />
        <button className="botao principal">
          <KeyRound aria-hidden="true" />
          Trocar senha
        </button>
      </form>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <header className="cartao-topo">
          <ChipIcone icone={Users} tom="tom-livre" />
          <h2>Quem usa o sistema</h2>
        </header>
        <ul className="lista-usuarios">
          {usuarios.data?.usuarios.map((u) => (
            <li key={u.id}>
              <span className="avatar" aria-hidden="true">
                {u.nome.trim().charAt(0).toUpperCase()}
              </span>
              <span>
                <span className="nome">{u.nome}</span> <span className="suave">({u.login})</span>
              </span>
            </li>
          ))}
        </ul>
        <h3 className="sub-secao">
          <ChipIcone icone={UserPlus} tom="tom-ocupado" />
          Novo usuário
        </h3>
        <div className="campo">
          <label htmlFor="novo-nome">Nome</label>
          <input id="novo-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="novo-login">Nome de acesso</label>
          <input id="novo-login" value={novo.login} onChange={(e) => setNovo({ ...novo, login: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor="novo-senha">Senha</label>
          <input id="novo-senha" type="password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
        </div>
        <MensagemErro erro={criar.error} />
        <button className="botao">
          <UserPlus aria-hidden="true" />
          Criar usuário
        </button>
      </form>
    </div>
  );
}
