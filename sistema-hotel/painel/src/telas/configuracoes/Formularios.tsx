import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { CampoReais, Carregando, Etiqueta, MensagemErro } from '../../componentes/Basicos';
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
      <div className="cartao">
        <h2>Hotel</h2>
        <div className="linha-campos">{CAMPOS_HOTEL.map(campo)}</div>
      </div>
      <div className="cartao">
        <h2>Pix e reserva online</h2>
        <p className="suave">Usado na página de reservas (próxima fase). Pode preencher desde já.</p>
        <div className="linha-campos">{CAMPOS_PIX.filter((c) => !c.area).map(campo)}</div>
        {CAMPOS_PIX.filter((c) => c.area).map(campo)}
      </div>
      <MensagemErro erro={salvar.error} />
      <button className="botao principal grande" disabled={salvar.isPending}>
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
      <div className="cartao">
        <h2>Tabela de preço</h2>
        <p className="suave">
          Diária por número de pessoas. Na hora da hospedagem dá para mudar o valor (desconto, cliente fixo). Acima da última
          linha, soma R$ 100 por pessoa.
        </p>
        <EditorTarifas quartoId={null} inicial={dados.data!.geral} />
      </div>
      <div className="cartao">
        <h2>Preço diferente em algum quarto</h2>
        <p className="suave">Só preencha se um quarto tiver preço próprio. O que ficar sem valor usa a tabela de cima.</p>
        {[...excecoesPorQuarto.entries()].map(([qid, ts]) => (
          <div key={qid} className="passo">
            <span className="rotulo">Quarto {dados.data!.excecoes.find((e) => e.quarto_id === qid)?.codigo}</span>
            <EditorTarifas quartoId={qid} inicial={ts} />
          </div>
        ))}
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
      </div>
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
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="linha-campos" style={{ maxWidth: 900 }}>
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
        <button type="button" className="botao pequeno" onClick={() => setValores([...valores, null])}>
          + Mais uma linha
        </button>
        <button className="botao principal">Salvar preços</button>
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
    <div className="cartao">
      <h2>Quem recebe o dinheiro</h2>
      <p className="suave">Na planilha era a coluna H V N: em qual conta ou com quem ficou o pagamento.</p>
      <ul className="lista">
        {dados.data!.contas.map((c) => (
          <LinhaRecebedora key={c.id} conta={c} />
        ))}
        <LinhaRecebedora conta={null} />
      </ul>
    </div>
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
    <li>
      <input className="entrada" style={{ width: 80 }} aria-label="Sigla" value={sigla} placeholder="Sigla" onChange={(e) => setSigla(e.target.value)} />
      <input className="entrada" style={{ flex: 1, minWidth: 160 }} aria-label="Nome" value={nome} placeholder={conta ? 'Nome' : 'Nova: nome'} onChange={(e) => setNome(e.target.value)} />
      {conta && (
        <label className="marcar">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Em uso
        </label>
      )}
      <button className="botao pequeno" disabled={!sigla || !nome} onClick={() => salvar.mutate()}>
        {conta ? 'Salvar' : '+ Adicionar'}
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

export function ConfigCategorias() {
  const dados = useQuery({ queryKey: ['categorias'], queryFn: () => api.get<{ categorias: Categoria[] }>('/api/categorias') });
  if (dados.isLoading) return <Carregando />;
  return (
    <div className="cartao">
      <h2>Categorias de despesa</h2>
      <p className="suave">
        O grupo decide em qual resultado a despesa entra no Caixa. Ex.: obra e financiamento ficam fora do "Resultado do hotel".
      </p>
      {Object.entries(GRUPOS).map(([g, titulo]) => (
        <div key={g} className="passo">
          <span className="rotulo">{titulo}</span>
          <ul className="lista">
            {dados.data!.categorias
              .filter((c) => c.grupo === g)
              .map((c) => (
                <LinhaCategoria key={c.id} cat={c} />
              ))}
          </ul>
        </div>
      ))}
      <h3>Nova categoria</h3>
      <ul className="lista">
        <LinhaCategoria cat={null} />
      </ul>
    </div>
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
    <li>
      <input className="entrada" style={{ flex: 1, minWidth: 180 }} aria-label="Nome da categoria" value={nome} placeholder="Nome" onChange={(e) => setNome(e.target.value)} />
      <select className="entrada" style={{ width: 200 }} aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
        {Object.entries(GRUPOS).map(([g, t]) => (
          <option key={g} value={g}>
            {t}
          </option>
        ))}
      </select>
      {cat && (
        <>
          <label className="marcar">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Em uso
          </label>
          <span className="suave pequeno">{cat.usos} lançamentos</span>
        </>
      )}
      {cat?.aviso && <Etiqueta estado="chega">Aviso</Etiqueta>}
      <button className="botao pequeno" disabled={!nome || !mudou} onClick={() => salvar.mutate()}>
        {cat ? 'Salvar' : '+ Adicionar'}
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
        <h2>Trocar minha senha</h2>
        {(['senhaAtual', 'senhaNova', 'senhaNova2'] as const).map((k) => (
          <div className="campo" key={k}>
            <label htmlFor={k}>{k === 'senhaAtual' ? 'Senha atual' : k === 'senhaNova' ? 'Senha nova' : 'Repita a senha nova'}</label>
            <input id={k} type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <MensagemErro erro={trocar.error} />
        <button className="botao principal">Trocar senha</button>
      </form>
      <form
        className="cartao"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate();
        }}
      >
        <h2>Quem usa o sistema</h2>
        <ul className="lista">
          {usuarios.data?.usuarios.map((u) => (
            <li key={u.id}>
              <span className="nome">{u.nome}</span> <span className="suave">({u.login})</span>
            </li>
          ))}
        </ul>
        <h3 style={{ marginTop: 12 }}>Novo usuário</h3>
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
        <button className="botao">Criar usuário</button>
      </form>
    </div>
  );
}
