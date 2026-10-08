import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { Carregando } from './componentes/Basicos';

interface Sessao {
  usuario: { id: number; nome: string; login: string } | null;
  nomeHotel: string;
}

const Ctx = createContext<Sessao>({ usuario: null, nomeHotel: 'Hotel' });

export const useSessao = () => useContext(Ctx);

/** Confere se é o primeiro uso e se há sessão; manda para a tela certa. */
export function ExigirSessao({ children }: { children: ReactNode }) {
  const local = useLocation();
  const estado = useQuery({
    queryKey: ['sistema-estado'],
    queryFn: () => api.get<{ precisaPrimeiroUso: boolean; nomeHotel: string }>('/api/sistema/estado'),
  });
  const eu = useQuery({
    queryKey: ['eu'],
    queryFn: () => api.get<{ usuario: Sessao['usuario'] }>('/api/auth/eu'),
    retry: false,
    enabled: estado.data?.precisaPrimeiroUso === false,
  });
  if (estado.isLoading) return <Carregando />;
  if (estado.data?.precisaPrimeiroUso) return <Navigate to="/primeiro-uso" replace />;
  if (eu.isLoading) return <Carregando />;
  if (!eu.data?.usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  return <Ctx.Provider value={{ usuario: eu.data.usuario, nomeHotel: estado.data?.nomeHotel ?? 'Hotel' }}>{children}</Ctx.Provider>;
}
