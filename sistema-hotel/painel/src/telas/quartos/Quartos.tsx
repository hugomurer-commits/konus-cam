import { NavLink, Route, Routes } from 'react-router-dom';
import { EmConstrucao } from '../../componentes/Layout';
import { EditarQuarto, ListaQuartos } from './EditarQuartos';

const ABAS = [
  { para: '/quartos', texto: 'Mapa', fim: true },
  { para: '/quartos/hospedes', texto: 'Hóspedes' },
  { para: '/quartos/editar', texto: 'Editar quartos' },
];

export function Quartos() {
  return (
    <>
      <nav className="abas" aria-label="Seções de quartos">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} end={a.fim} className={({ isActive }) => `botao${isActive ? ' selecionado' : ''}`}>
            {a.texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<EmConstrucao titulo="Mapa dos quartos" />} />
        <Route path="hospedes/*" element={<EmConstrucao titulo="Hóspedes" />} />
        <Route path="editar" element={<ListaQuartos />} />
        <Route path="editar/:id" element={<EditarQuarto />} />
      </Routes>
    </>
  );
}
