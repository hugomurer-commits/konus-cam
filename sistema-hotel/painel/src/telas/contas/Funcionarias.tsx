import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { CampoReais, Carregando, Dinheiro, Escolha, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, emReais, FORMAS, hojeLocal } from '../../formato';

interface Funcionaria {
  id: number;
  nome: string;
  salario: number;
  dia_pagamento: number;
  ativa: boolean;
  proximoPagamento: string;
  periodo: { de: string; ate: string };
  vales: { id: number; data: string; valor: number; forma: string; obs: string }[];
  totalVales: number;
  saldo: number;
}

type Forma = 'pix' | 'dinheiro' | 'cartao' | 'boleto';

export function Funcionarias() {
  const dados = useQuery({ queryKey: ['funcionarias'], queryFn: () => api.get<{ funcionarias: Funcionaria[] }>('/api/funcionarias') });
  const [vale, setVale] = useState<Funcionaria | null>(null);
  const [editando, setEditando] = useState<Funcionaria | 'nova' | null>(null);
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  if (dados.isLoading) return <Carregando />;
  const lista = dados.data!.funcionarias;

  async function desfazerVale(f: Funcionaria, v: Funcionaria['vales'][number]) {
    const ok = await confirmar({ titulo: 'Desfazer vale?', mensagem: `Vale de ${emReais(v.valor)} para ${f.nome} em ${dataCurta(v.data)}.`, confirmar: 'Desfazer', perigo: true });
    if (!ok) return;
    await api.post(`/api/vales/${v.id}/cancelar`);
    cliente.invalidateQueries();
    avisar('Vale desfeito.');
  }

  return (
    <>
      <div className="titulo-tela">
        <h1>Funcionárias e vales</h1>
        <button className="botao principal" onClick={() => setEditando('nova')}>
          + Funcionária
        </button>
      </div>
      <p className="suave">
        O vale entra no caixa na hora. No dia do pagamento, a conta do salário em Contas já vem com os vales descontados.
      </p>
      {lista.length === 0 && (
        <div className="cartao">
          <p className="vazio">Nenhuma funcionária cadastrada.</p>
        </div>
      )}
      <div className="grade-2">
        {lista.map((f) => (
          <div key={f.id} className="cartao" style={f.ativa ? {} : { opacity: 0.6 }}>
            <div className="titulo-tela" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{f.nome}</h2>
              {!f.ativa && <Etiqueta estado="neutro">Saiu</Etiqueta>}
            </div>
            <p>
              Salário <Dinheiro valor={f.salario} className="forte" /> · paga dia {f.dia_pagamento}
            </p>
            <p className="suave pequeno">
              Vales de {dataCurta(f.periodo.de)} a {dataCurta(f.periodo.ate)} (pagamento em {data(f.proximoPagamento)}):
            </p>
            {f.vales.length === 0 && <p className="vazio">Nenhum vale.</p>}
            <ul className="lista">
              {f.vales.map((v) => (
                <li key={v.id}>
                  <div className="principal-item">
                    {dataCurta(v.data)} · {FORMAS[v.forma]}
                    {v.obs ? ` · ${v.obs}` : ''}
                  </div>
                  <Dinheiro valor={v.valor} />
                  <button className="botao pequeno" onClick={() => desfazerVale(f, v)}>
                    Desfazer
                  </button>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: '1.15rem' }}>
              A pagar no dia {f.dia_pagamento}: <Dinheiro valor={f.saldo} className="forte" />
            </p>
            <div className="botoes">
              {f.ativa && (
                <button className="botao principal grande" onClick={() => setVale(f)}>
                  + Vale
                </button>
              )}
              <button className="botao" onClick={() => setEditando(f)}>
                Mudar
              </button>
            </div>
          </div>
        ))}
      </div>
      {vale && <JanelaVale f={vale} aoFechar={() => setVale(null)} />}
      {editando && <JanelaFuncionaria f={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function JanelaVale({ f, aoFechar }: { f: Funcionaria; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { confirmar, avisar } = useInteracao();
  const [valor, setValor] = useState<number | null>(null);
  const [forma, setForma] = useState<Forma>('dinheiro');
  const [dia, setDia] = useState(hojeLocal());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<unknown>(null);
  async function salvar() {
    if (!valor) return setErro(new Error('Informe o valor do vale.'));
    const ok = await confirmar({
      titulo: 'Confirmar vale',
      mensagem: (
        <>
          Vale de <strong>{emReais(valor)}</strong> em {FORMAS[forma]} para <strong>{f.nome}</strong>?
        </>
      ),
    });
    if (!ok) return;
    try {
      const r = await api.post<{ id: number }>('/api/vales', { funcionariaId: f.id, valor, forma, data: dia, obs });
      cliente.invalidateQueries();
      avisar(`Vale de ${emReais(valor)} para ${f.nome}.`, {
        desfazer: async () => {
          await api.post(`/api/vales/${r.id}/cancelar`);
          cliente.invalidateQueries();
        },
      });
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo={`Vale para ${f.nome}`} aoFechar={aoFechar}>
      <CampoReais id="valor-vale" rotulo="Valor" valor={valor} aoMudar={setValor} grande autoFocus />
      <div className="campo">
        <span className="rotulo">Como deu</span>
        <Escolha rotulo="Forma" valor={forma} aoEscolher={setForma} opcoes={(['dinheiro', 'pix'] as Forma[]).map((x) => ({ valor: x, texto: FORMAS[x] }))} />
      </div>
      <div className="campo">
        <label htmlFor="dia-vale">Dia</label>
        <input id="dia-vale" type="date" value={dia} max={hojeLocal()} onChange={(e) => e.target.value && setDia(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="obs-vale">Observação (opcional)</label>
        <input id="obs-vale" value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
          Dar vale
        </button>
      </div>
    </Janela>
  );
}

function JanelaFuncionaria({ f, aoFechar }: { f: Funcionaria | null; aoFechar: () => void }) {
  const cliente = useQueryClient();
  const { avisar } = useInteracao();
  const [form, setForm] = useState({ nome: f?.nome ?? '', salario: f?.salario ?? null, diaPagamento: f?.dia_pagamento ?? 5, ativa: f?.ativa ?? true });
  const [erro, setErro] = useState<unknown>(null);
  async function salvar() {
    try {
      const corpo = { ...form, salario: form.salario ?? 0 };
      if (f) await api.put(`/api/funcionarias/${f.id}`, corpo);
      else await api.post('/api/funcionarias', corpo);
      cliente.invalidateQueries();
      avisar('Salvo.');
      aoFechar();
    } catch (e) {
      setErro(e);
    }
  }
  return (
    <Janela titulo={f ? `Mudar: ${f.nome}` : 'Nova funcionária'} aoFechar={aoFechar}>
      <div className="campo">
        <label htmlFor="f-nome">Nome</label>
        <input id="f-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
      </div>
      <CampoReais id="f-salario" rotulo="Salário" valor={form.salario} aoMudar={(salario) => setForm({ ...form, salario })} />
      <div className="campo">
        <label htmlFor="f-dia">Dia do pagamento</label>
        <input id="f-dia" type="number" min={1} max={31} value={form.diaPagamento} onChange={(e) => setForm({ ...form, diaPagamento: Number(e.target.value) })} />
      </div>
      {f && (
        <label className="marcar">
          <input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
          Ainda trabalha no hotel
        </label>
      )}
      <MensagemErro erro={erro} />
      <div className="botoes direita">
        <button className="botao grande" onClick={aoFechar}>
          Voltar
        </button>
        <button className="botao grande principal" onClick={salvar}>
          Salvar
        </button>
      </div>
    </Janela>
  );
}
