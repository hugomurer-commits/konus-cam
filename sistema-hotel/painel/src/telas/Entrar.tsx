import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { api } from '../api';
import { MensagemErro } from '../componentes/Basicos';
import '../estilo/entrada-config.css';

const ULTIMO_LOGIN = 'hotel-ultimo-login';

function lerUltimoLogin(): string {
  try {
    return localStorage.getItem(ULTIMO_LOGIN) ?? '';
  } catch {
    return '';
  }
}

/** "Bom dia!" / "Boa tarde!" / "Boa noite!" pela hora deste computador. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia!';
  if (h < 18) return 'Boa tarde!';
  return 'Boa noite!';
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
      <div className="entrada-coluna">
        <form className="caixa" onSubmit={enviar}>
          <img className="logo" src="/logo.png" alt="Hotel Tropical" />
          <h1>{saudacao()}</h1>
          <p className="boas-vindas">Entre para ver o dia do hotel.</p>
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
          <label className="marcar marcar-duplo">
            <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
            <span>
              Lembrar neste computador
              <span className="ajuda-marcar">Não pede a senha todo dia.</span>
            </span>
          </label>
          <MensagemErro erro={erro} />
          <button className="botao principal enorme botao-entrada" disabled={enviando}>
            <LogIn aria-hidden="true" />
            Entrar
          </button>
        </form>
        <p className="rodape">Hotel Tropical · Cacoal/RO</p>
      </div>
    </div>
  );
}
