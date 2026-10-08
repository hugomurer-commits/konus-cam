import { describe, expect, it } from 'vitest';
import { criarAmbiente } from './ajuda.js';

describe('tela Hoje', () => {
  it('números, listas e alertas em ordem de urgência', async () => {
    const amb = await criarAmbiente(); // 08/10/2026 15:00
    const quarto = async (codigo: string) =>
      (await amb.api('POST', '/api/quartos', { codigo, capacidade: 3, ativo: true, mostrar_no_site: false })).json.quarto.id;
    const [a, b, c] = [await quarto('1A'), await quarto('2A'), await quarto('3A')];
    await quarto('4A');
    const nova = (q: number, nome: string, extra: Record<string, unknown>) =>
      amb.api('POST', '/api/estadias', {
        hospede: { nome }, quartoId: q, entrada: '2026-10-08', saida: '2026-10-09', pessoas: 1, valorDiaria: 15000, jaChegou: true, ...extra,
      });
    // Saindo hoje com saldo (entrou ontem)
    await nova(a, 'Ana', { entrada: '2026-10-07', saida: '2026-10-08' });
    // Reserva para hoje, ainda não chegou
    await nova(b, 'Bruno', { jaChegou: false, horaChegadaPrevista: '18:00' });
    // Chegou hoje, pagou sinal e tem saldo
    await nova(c, 'Carla', { saida: '2026-10-10', pagamento: { valor: 9000, forma: 'pix', contaRecebedoraId: 1 } });
    // Conta atrasada e conta que vence em breve
    amb.banco.exec(`
      INSERT INTO contas_a_pagar (descricao, categoria_id, competencia, vencimento, valor_previsto)
      VALUES ('Energisa', 1, '2026-10', '2026-10-05', 210000), ('Internet', 1, '2026-10', '2026-10-10', 13000);`);
    const h = (await amb.api('GET', '/api/hoje')).json;
    expect(h.numeros).toEqual({ ocupados: 2, livres: 2, chegadas: 1, saidas: 1 });
    expect(h.chegam.map((x: { nome: string }) => x.nome)).toEqual(['Bruno']);
    expect(h.saem[0]).toMatchObject({ nome: 'Ana', saldo: 15000, atrasada: true });
    expect(h.noHotel.map((x: { nome: string }) => x.nome)).toEqual(['Carla']);
    const tipos = h.alertas.map((x: { tipo: string }) => x.tipo);
    expect(tipos.slice(0, 3).sort()).toEqual(['backup_atrasado', 'conta_atrasada', 'saida_com_saldo']);
    expect(tipos).toContain('conta_breve');
    expect(tipos).toContain('saida_atrasada');
    expect(tipos).toContain('saldo_na_chegada');
    expect(h.alertas.findIndex((x: { cor: string }) => x.cor === 'amarelo')).toBeGreaterThan(
      h.alertas.findLastIndex((x: { cor: string }) => x.cor === 'vermelho'),
    );
    expect((await amb.api('GET', '/api/hoje/contagem-alertas')).json.total).toBe(h.alertas.length);
  });
});
