import type { Banco } from '../banco/conexao.js';
import { normalizarBusca, soDigitos } from './texto.js';

export interface HospedeResumo {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string;
  cidade: string;
  uf: string;
  obs: string;
  visitas: number;
  ultima: string | null;
  total_gasto: number;
}

const SELECT_RESUMO = `
  SELECT h.id, h.nome, h.cpf_cnpj, h.telefone, h.cidade, h.uf, h.obs,
    (SELECT COUNT(*) FROM estadias e WHERE e.hospede_id = h.id AND e.status NOT IN ('cancelada','expirada')) AS visitas,
    (SELECT MAX(e.data_entrada) FROM estadias e WHERE e.hospede_id = h.id AND e.status NOT IN ('cancelada','expirada')) AS ultima,
    (SELECT IFNULL(SUM(p.valor_liquido), 0) FROM pagamentos_validos p JOIN estadias e ON e.id = p.estadia_id WHERE e.hospede_id = h.id) AS total_gasto
  FROM hospedes h`;

/**
 * Busca tolerante a acento e maiúscula. Só números: CPF (começo) ou telefone (qualquer parte,
 * então funciona com ou sem DDD). Letras: nome.
 */
export function procurarHospedes(banco: Banco, termo: string, limite = 8): HospedeResumo[] {
  const t = termo.trim();
  const digitos = soDigitos(t);
  const soNumeros = /^[\d\s.\-/()]+$/.test(t);
  if (soNumeros) {
    if (digitos.length < 3) return [];
    return banco
      .prepare(
        `${SELECT_RESUMO} WHERE h.cpf_cnpj LIKE @inicio OR h.telefone LIKE @meio
         ORDER BY (h.cpf_cnpj = @exato OR h.telefone = @exato OR h.telefone LIKE @fim) DESC, ultima DESC LIMIT @limite`,
      )
      .all({ inicio: `${digitos}%`, meio: `%${digitos}%`, fim: `%${digitos}`, exato: digitos, limite }) as HospedeResumo[];
  }
  const nome = normalizarBusca(t);
  if (nome.length < 2) return [];
  // Cada palavra precisa aparecer no nome, em qualquer ordem ("silva jose" acha "JOSÉ DA SILVA")
  const palavras = nome.split(' ').slice(0, 5);
  const where = palavras.map((_, i) => `h.nome_busca LIKE @p${i}`).join(' AND ');
  const params: Record<string, unknown> = { limite, comeco: `${nome}%` };
  palavras.forEach((p, i) => (params[`p${i}`] = `%${p}%`));
  return banco
    .prepare(`${SELECT_RESUMO} WHERE ${where} ORDER BY (h.nome_busca LIKE @comeco) DESC, ultima DESC LIMIT @limite`)
    .all(params) as HospedeResumo[];
}

export function hospedePorId(banco: Banco, id: number): HospedeResumo | undefined {
  return banco.prepare(`${SELECT_RESUMO} WHERE h.id = ?`).get(id) as HospedeResumo | undefined;
}

export function maisFrequentes(banco: Banco, limite = 30): HospedeResumo[] {
  return banco
    .prepare(`SELECT * FROM (${SELECT_RESUMO}) WHERE visitas > 1 ORDER BY visitas DESC, ultima DESC LIMIT ?`)
    .all(limite) as HospedeResumo[];
}

export function historicoHospede(banco: Banco, id: number) {
  return banco
    .prepare(
      `SELECT e.id, e.data_entrada, e.data_saida, e.status, e.pessoas, q.codigo AS quarto, v.total, v.pago
       FROM estadias e JOIN quartos q ON q.id = e.quarto_id JOIN estadias_valores v ON v.estadia_id = e.id
       WHERE e.hospede_id = ? ORDER BY e.data_entrada DESC, e.id DESC`,
    )
    .all(id);
}
