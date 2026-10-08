import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useSessao } from '../sessao';

const AREAS = [
  { para: '/', texto: 'Hoje', icone: '☀️', fim: true },
  { para: '/quartos', texto: 'Quartos', icone: '🛏️' },
  { para: '/caixa', texto: 'Caixa', icone: '💵' },
  { para: '/contas', texto: 'Contas', icone: '📅' },
];

export function Layout() {
  const { usuario, nomeHotel } = useSessao();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  // Contador de alertas no menu (seção 7)
  const alertas = useQuery({
    queryKey: ['alertas-contagem'],
    queryFn: () => api.get<{ total: number }>('/api/hoje/contagem-alertas'),
    refetchInterval: 60_000,
    retry: false,
  });

  async function sair() {
    await api.post('/api/auth/sair');
    cliente.clear();
    navegar('/entrar');
  }

  return (
    <div className="app">
      <header className="cabecalho">
        <img src="/logo.png" alt="" />
        <span className="nome-hotel">{nomeHotel}</span>
        <span className="usuario">
          <span className="nome-usuario">{usuario?.nome}</span>
          <button className="botao-claro" onClick={sair}>
            Sair
          </button>
        </span>
      </header>
      <div className="corpo">
        <nav className="menu" aria-label="Menu principal">
          {AREAS.map((a) => (
            <NavLink key={a.para} to={a.para} end={a.fim} className={({ isActive }) => (isActive ? 'ativo' : '')}>
              <span className="icone" aria-hidden="true">
                {a.icone}
              </span>
              <span>{a.texto}</span>
              {a.para === '/' && (alertas.data?.total ?? 0) > 0 && (
                <span className="contador" aria-label={`${alertas.data!.total} alertas`}>
                  {alertas.data!.total}
                </span>
              )}
            </NavLink>
          ))}
          <span className="separador" />
          <NavLink to="/configuracoes" className={({ isActive }) => `discreto${isActive ? ' ativo' : ''}`}>
            <span className="icone" aria-hidden="true">
              ⚙️
            </span>
            <span>Configurações</span>
          </NavLink>
        </nav>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div className="cartao">
      <h1>{titulo}</h1>
      <p className="suave">Esta tela ainda está sendo construída.</p>
    </div>
  );
}
