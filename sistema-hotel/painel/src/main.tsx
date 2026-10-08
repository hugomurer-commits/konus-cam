import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './estilo/app.css';
import { ProvedorInteracao } from './componentes/Interacao';
import { EmConstrucao, Layout } from './componentes/Layout';
import { ExigirSessao } from './sessao';
import { Entrar } from './telas/Entrar';
import { PrimeiroUso } from './telas/PrimeiroUso';
import { Configuracoes } from './telas/configuracoes/Configuracoes';

const cliente = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <ProvedorInteracao>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/primeiro-uso" element={<PrimeiroUso />} />
            <Route
              element={
                <ExigirSessao>
                  <Layout />
                </ExigirSessao>
              }
            >
              <Route index element={<EmConstrucao titulo="Hoje" />} />
              <Route path="quartos/*" element={<EmConstrucao titulo="Quartos" />} />
              <Route path="caixa/*" element={<EmConstrucao titulo="Caixa" />} />
              <Route path="contas/*" element={<EmConstrucao titulo="Contas" />} />
              <Route path="configuracoes/*" element={<Configuracoes />} />
              <Route path="*" element={<EmConstrucao titulo="Página não encontrada" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProvedorInteracao>
    </QueryClientProvider>
  </StrictMode>,
);
