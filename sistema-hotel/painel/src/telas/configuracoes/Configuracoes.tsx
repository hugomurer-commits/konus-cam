import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Building2, FileSpreadsheet, HandCoins, HardDrive, KeyRound, ListChecks, Settings, Tag, Tags, type LucideIcon } from 'lucide-react';
import { TituloTela } from '../../componentes/Basicos';
import { TelaImportacao } from './Importacao';
import { ConfigBackup, PrimeirosPassos } from './Backup';
import { ConfigCategorias, ConfigHotel, ConfigPrecos, ConfigRecebedores, ConfigSenha } from './Formularios';
import '../../estilo/entrada-config.css';

const ABAS: { para: string; texto: string; Icone: LucideIcon }[] = [
  { para: 'primeiros-passos', texto: 'Primeiros passos', Icone: ListChecks },
  { para: 'hotel', texto: 'Hotel', Icone: Building2 },
  { para: 'precos', texto: 'Preços', Icone: Tag },
  { para: 'recebedores', texto: 'Quem recebe', Icone: HandCoins },
  { para: 'categorias', texto: 'Categorias', Icone: Tags },
  { para: 'backup', texto: 'Backup', Icone: HardDrive },
  { para: 'importacao', texto: 'Planilha antiga', Icone: FileSpreadsheet },
  { para: 'senha', texto: 'Senha', Icone: KeyRound },
];

export function Configuracoes() {
  return (
    <>
      <TituloTela icone={Settings} tom="tom-config" titulo="Configurações" subtitulo="Dados do hotel, preços, backup e senha." />
      <nav className="abas abas-config" aria-label="Seções das configurações">
        {ABAS.map((a) => (
          <NavLink key={a.para} to={a.para} className={({ isActive }) => `aba${isActive ? ' ativo' : ''}`}>
            <a.Icone aria-hidden="true" />
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
