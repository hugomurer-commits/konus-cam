import { NavLink, Route, Routes } from 'react-router-dom';
import { EditarQuarto, ListaQuartos } from './EditarQuartos';
import { Mapa } from './Mapa';
import { Hospedes } from './Hospedes';

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
        <Route index element={<Mapa />} />
        <Route path="hospedes/*" element={<Hospedes />} />
        <Route path="editar" element={<ListaQuartos />} />
        <Route path="editar/:id" element={<EditarQuarto />} />
      </Routes>
    </>
  );
}
