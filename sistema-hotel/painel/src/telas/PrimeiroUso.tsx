import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { MensagemErro } from '../componentes/Basicos';

/** Primeiro passo do assistente: nome do hotel e senha de quem vai usar. */
export function PrimeiroUso() {
  const [f, setF] = useState({ nomeHotel: 'Hotel Tropical', nome: '', login: '', senha: '', senha2: '' });
  const [erro, setErro] = useState<unknown>(null);
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const mudar = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (f.senha !== f.senha2) return setErro(new Error('As duas senhas não são iguais.'));
    try {
      await api.post('/api/sistema/primeiro-uso', f);
      await cliente.invalidateQueries();
      navegar('/configuracoes/primeiros-passos', { replace: true });
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <div className="tela-entrada">
      <form className="caixa" onSubmit={enviar}>
        <img className="logo" src="/logo.png" alt="" />
        <h1>Bem-vindo!</h1>
        <p className="suave">Vamos preparar o sistema. Primeiro, o nome do hotel e a senha de acesso.</p>
        <div className="campo">
          <label htmlFor="nomeHotel">Nome do hotel</label>
          <input id="nomeHotel" value={f.nomeHotel} onChange={mudar('nomeHotel')} />
        </div>
        <div className="campo">
          <label htmlFor="nome">Seu nome</label>
          <input id="nome" value={f.nome} onChange={mudar('nome')} autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="login">Nome de acesso (para entrar)</label>
          <input id="login" autoComplete="username" value={f.login} onChange={mudar('login')} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="new-password" value={f.senha} onChange={mudar('senha')} />
          <span className="ajuda">Pelo menos 8 caracteres. Anote num lugar seguro.</span>
        </div>
        <div className="campo">
          <label htmlFor="senha2">Repita a senha</label>
          <input id="senha2" type="password" autoComplete="new-password" value={f.senha2} onChange={mudar('senha2')} />
        </div>
        <MensagemErro erro={erro} />
        <button className="botao principal enorme">Continuar</button>
      </form>
    </div>
  );
}
