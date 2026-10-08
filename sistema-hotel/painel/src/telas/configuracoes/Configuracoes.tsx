import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { EmConstrucao } from '../../componentes/Layout';
import { TelaImportacao } from './Importacao';

const ABAS = [
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
        <Route path="importacao" element={<TelaImportacao />} />
        <Route path="*" element={<EmConstrucao titulo="Em construção" />} />
      </Routes>
    </>
  );
}
