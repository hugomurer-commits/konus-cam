import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { TelaImportacao } from './Importacao';
import { ConfigBackup, PrimeirosPassos } from './Backup';
import { ConfigCategorias, ConfigHotel, ConfigPrecos, ConfigRecebedores, ConfigSenha } from './Formularios';

const ABAS = [
  { para: 'primeiros-passos', texto: 'Primeiros passos' },
  { para: 'hotel', texto: 'Hotel' },
  { para: 'precos', texto: 'Preços' },
  { para: 'recebedores', texto: 'Quem recebe' },
  { para: 'categorias', texto: 'Categorias' },
  { para: 'backup', texto: 'Backup' },
  { para: 'importacao', texto: 'Planilha antiga' },
  { para: 'senha', texto: 'Senha' },
];

export function Configuracoes() {
  return (
    <>
      <div className="titulo-tela">
        <h1>Configurações</h1>
      </div>
      <nav className="abas" aria-label="Seções das configurações">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} className={({ isActive }) => `botao pequeno${isActive ? ' selecionado' : ''}`}>
            {a.texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="hotel" replace />} />
        <Route path="primeiros-passos" element={<PrimeirosPassos />} />
        <Route path="hotel" element={<ConfigHotel />} />
        <Route path="backup" element={<ConfigBackup />} />
        <Route path="precos" element={<ConfigPrecos />} />
        <Route path="recebedores" element={<ConfigRecebedores />} />
        <Route path="categorias" element={<ConfigCategorias />} />
        <Route path="importacao" element={<TelaImportacao />} />
        <Route path="senha" element={<ConfigSenha />} />
        <Route path="*" element={<Navigate to="hotel" replace />} />
      </Routes>
    </>
  );
}
