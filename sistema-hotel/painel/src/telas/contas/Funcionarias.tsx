import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, HandCoins, Info, Pencil, Plus, Undo2, UserPlus, UserRound } from 'lucide-react';
import { api } from '../../api';
import { CampoReais, Carregando, ChipIcone, Dinheiro, Escolha, Etiqueta, MensagemErro } from '../../componentes/Basicos';
import { Janela, useInteracao } from '../../componentes/Interacao';
import { data, dataCurta, emReais, FORMAS, hojeLocal } from '../../formato';
import { FormaComIcone, Folhinha, ICONE_FORMA } from '../caixa/LancarDespesa';
import '../../estilo/dinheiro.css';

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
      <h2 className="oculto-leitor">Funcionárias e vales</h2>
      <div className="barra-acoes">
        <p className="dica">
          <Info aria-hidden="true" />
          <span>O vale entra no caixa na hora. No dia do pagamento, a conta do salário em Contas já vem com os vales descontados.</span>
        </p>
        <button className="botao principal" onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" />
          Funcionária
        </button>
      </div>
      {lista.length === 0 && (
        <div className="cartao">
          <p className="vazio">
            <CircleCheck aria-hidden="true" />
            Nenhuma funcionária cadastrada.
          </p>
        </div>
      )}
      <div className="grade-2">
        {lista.map((f) => (
          <section key={f.id} className={`cartao cartao-lista tom-contas funcionaria${f.ativa ? '' : ' parada'}`}>
            <header className="cartao-topo">
              <ChipIcone icone={UserRound} />
              <h3>{f.nome}</h3>
              {!f.ativa && <Etiqueta estado="neutro">Saiu</Etiqueta>}
            </header>
            <p className="detalhe">Salário pago todo dia {f.dia_pagamento}.</p>
            <table className="tabela contracheque">
              <tbody>
                <tr>
                  <th scope="row">Salário</th>
                  <td className="numero">
                    <Dinheiro valor={f.salario} />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    Vales ({f.vales.length})
                  </th>
                  <td className="numero">
                    {f.totalVales > 0 ? '− ' : ''}
                    <Dinheiro valor={f.totalVales} />
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">A pagar no dia {f.dia_pagamento}</th>
                  <td className="numero">
                    <Dinheiro valor={f.saldo} />
                  </td>
                </tr>
              </tfoot>
            </table>
            <h4 className="subtitulo-cartao">
              Vales de {dataCurta(f.periodo.de)} a {dataCurta(f.periodo.ate)} (pagamento em {data(f.proximoPagamento)}):
            </h4>
            {f.vales.length === 0 && (
              <p className="vazio">
                <CircleCheck aria-hidden="true" />
                Nenhum vale.
              </p>
            )}
            <ul className="lista lista-contas lista-vales">
              {f.vales.map((v) => (
                <li key={v.id}>
                  <Folhinha data={v.data} />
                  <div className="principal-item">
                    <div className="nome com-icone">
                      <span className="oculto-leitor">{data(v.data)} · </span>
                      <FormaComIcone forma={v.forma} />
                    </div>
                    {v.obs && <div className="detalhe">{v.obs}</div>}
                  </div>
                  <div className="valor">
                    <Dinheiro valor={v.valor} />
                  </div>
                  <div className="acoes">
                    <button className="botao pequeno" onClick={() => desfazerVale(f, v)}>
                      <Undo2 aria-hidden="true" />
                      Desfazer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="botoes acoes-funcionaria">
              {f.ativa && (
                <button className="botao principal grande" onClick={() => setVale(f)}>
                  <Plus aria-hidden="true" />
                  Vale
                </button>
              )}
              <button className="botao" onClick={() => setEditando(f)}>
                <Pencil aria-hidden="true" />
                Mudar
              </button>
            </div>
          </section>
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
      icone: HandCoins,
      tom: 'tom-caixa',
      mensagem: (
        <>
          Vale para <strong>{f.nome}</strong>, dia {dataCurta(dia)}?
        </>
      ),
      recibo: { valor: emReais(valor), detalhe: <FormaComIcone forma={forma} prefixo="em " /> },
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
    <Janela titulo={`Vale para ${f.nome}`} aoFechar={aoFechar} icone={HandCoins} tom="tom-caixa">
      <CampoReais id="valor-vale" rotulo="Valor" valor={valor} aoMudar={setValor} grande autoFocus />
      <div className="campo">
        <span className="rotulo">Como deu</span>
        <Escolha rotulo="Forma" valor={forma} aoEscolher={setForma} opcoes={(['dinheiro', 'pix'] as Forma[]).map((x) => ({ valor: x, texto: FORMAS[x], icone: ICONE_FORMA[x] }))} />
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
          <HandCoins aria-hidden="true" />
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
    <Janela titulo={f ? `Mudar: ${f.nome}` : 'Nova funcionária'} aoFechar={aoFechar} icone={f ? Pencil : UserPlus} tom="tom-contas">
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
          <Check aria-hidden="true" />
          Salvar
        </button>
      </div>
    </Janela>
  );
}
