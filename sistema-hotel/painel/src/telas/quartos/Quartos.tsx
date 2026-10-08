import { NavLink, Route, Routes } from 'react-router-dom';
import { CalendarDays, Pencil, Users, type LucideIcon } from 'lucide-react';
import { EditarQuarto, ListaQuartos } from './EditarQuartos';
import { Mapa } from './Mapa';
import { Hospedes } from './Hospedes';
import '../../estilo/quartos.css';

const ABAS: { para: string; texto: string; Icone: LucideIcon; fim?: boolean }[] = [
  { para: '/quartos', texto: 'Mapa', Icone: CalendarDays, fim: true },
  { para: '/quartos/hospedes', texto: 'Hóspedes', Icone: Users },
  { para: '/quartos/editar', texto: 'Editar quartos', Icone: Pencil },
];

/** Área Quartos: as abas ficam no alto e cada seção traz o próprio título (com o ícone da área). */
export function Quartos() {
  return (
    <div className="area-quartos">
      <nav className="abas abas-quartos" aria-label="Seções de quartos">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} end={a.fim} className={({ isActive }) => `aba${isActive ? ' ativo' : ''}`}>
            <a.Icone aria-hidden="true" />
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
    </div>
  );
}
