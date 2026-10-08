import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { BedDouble, CalendarCheck, LogOut, Settings, Sun, Wallet, type LucideIcon } from 'lucide-react';
import { useSessao } from '../sessao';

const AREAS: { para: string; area: string; texto: string; Icone: LucideIcon; fim?: boolean }[] = [
  { para: '/', area: 'hoje', texto: 'Hoje', Icone: Sun, fim: true },
  { para: '/quartos', area: 'quartos', texto: 'Quartos', Icone: BedDouble },
  { para: '/caixa', area: 'caixa', texto: 'Caixa', Icone: Wallet },
  { para: '/contas', area: 'contas', texto: 'Contas', Icone: CalendarCheck },
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
        <span className="medalhao">
          <img src="/logo.png" alt="" />
        </span>
        <span className="marca">
          <span className="nome-hotel">{nomeHotel}</span>
          <span className="lugar">Cacoal · Rondônia</span>
        </span>
        {/* No celular a barra de baixo só tem as 4 áreas: Configurações fica aqui em cima */}
        <Link to="/configuracoes" className="botao-claro so-celular">
          <Settings aria-hidden="true" />
          Configurações
        </Link>
        <span className="usuario">
          <span className="avatar" aria-hidden="true">
            {(usuario?.nome ?? '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="nome-usuario">{usuario?.nome}</span>
          <button className="botao-claro" onClick={sair}>
            <LogOut aria-hidden="true" />
            Sair
          </button>
        </span>
      </header>
      <div className="corpo">
        <nav className="menu" aria-label="Menu principal">
          {AREAS.map((a) => (
            <NavLink
              key={a.para}
              to={a.para}
              end={a.fim}
              data-area={a.area}
              className={({ isActive }) => (isActive ? 'ativo' : '')}
            >
              <span className="chip" aria-hidden="true">
                <a.Icone />
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
            <span className="chip" aria-hidden="true">
              <Settings />
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

export function PaginaNaoEncontrada() {
  return (
    <div className="cartao">
      <h1>Página não encontrada</h1>
      <Link to="/" className="botao principal">
        Ir para Hoje
      </Link>
    </div>
  );
}
