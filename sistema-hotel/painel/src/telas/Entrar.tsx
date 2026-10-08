import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { MensagemErro } from '../componentes/Basicos';

const ULTIMO_LOGIN = 'hotel-ultimo-login';

function lerUltimoLogin(): string {
  try {
    return localStorage.getItem(ULTIMO_LOGIN) ?? '';
  } catch {
    return '';
  }
}

export function Entrar() {
  const [login, setLogin] = useState(lerUltimoLogin);
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();
  const local = useLocation();
  const cliente = useQueryClient();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.post('/api/auth/entrar', { login, senha, lembrar });
      try {
        localStorage.setItem(ULTIMO_LOGIN, login);
      } catch {
        /* navegador sem armazenamento: só não lembra o nome */
      }
      await cliente.invalidateQueries();
      navegar((local.state as { de?: string } | null)?.de ?? '/', { replace: true });
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-entrada">
      <form className="caixa" onSubmit={enviar}>
        <img className="logo" src="/logo.png" alt="Hotel Tropical" />
        <div className="campo">
          <label htmlFor="login">Nome de acesso</label>
          <input id="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus={!login} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoFocus={!!login}
          />
        </div>
        <label className="marcar">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          Lembrar neste computador (não pedir senha todo dia)
        </label>
        <MensagemErro erro={erro} />
        <button className="botao principal enorme" disabled={enviando}>
          Entrar
        </button>
      </form>
    </div>
  );
}
