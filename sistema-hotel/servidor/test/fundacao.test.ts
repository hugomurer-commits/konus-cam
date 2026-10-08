import { describe, expect, it } from 'vitest';
import { abrirBanco, versaoBanco } from '../src/banco/conexao.js';
import { dataLocal, horaLocal, noitesEntre, somarMeses, dataNoMes, inicioDaSemana } from '../src/dominio/datas.js';
import { reaisParaCentavos } from '../src/dominio/dinheiro.js';
import { linkWhatsapp, normalizarBusca } from '../src/dominio/texto.js';
import { criarAmbiente } from './ajuda.js';

describe('banco', () => {
  it('aplica migrações e dados iniciais', () => {
    const b = abrirBanco(':memory:');
    expect(versaoBanco(b)).toBe(2);
    const tarifas = b.prepare('SELECT pessoas, valor FROM tarifas ORDER BY pessoas').all();
    expect(tarifas).toEqual([
      { pessoas: 1, valor: 15000 },
      { pessoas: 2, valor: 20000 },
      { pessoas: 3, valor: 30000 },
      { pessoas: 4, valor: 40000 },
      { pessoas: 5, valor: 50000 },
    ]);
    const contas = b.prepare('SELECT sigla FROM contas_recebedoras ORDER BY ordem').pluck().all();
    expect(contas).toEqual(['H', 'V', 'N']);
    const rec = b.prepare('SELECT COUNT(*) FROM contas_recorrentes WHERE categoria_id IS NOT NULL').pluck().get();
    expect(rec).toBe(8);
  });

  it('atualiza atualizado_em sozinho', async () => {
    const b = abrirBanco(':memory:');
    b.prepare(`UPDATE config SET atualizado_em = '2000-01-01T00:00:00.000Z' WHERE chave = 'nome_hotel'`).run();
    b.prepare(`UPDATE config SET valor = 'X' WHERE chave = 'nome_hotel'`).run();
    const r = b.prepare(`SELECT atualizado_em FROM config WHERE chave = 'nome_hotel'`).pluck().get() as string;
    expect(r > '2020').toBe(true);
  });

  it('gatilho impede duas estadias ativas no mesmo quarto e noite', () => {
    const b = abrirBanco(':memory:');
    b.exec(`INSERT INTO quartos (codigo) VALUES ('1A'); INSERT INTO hospedes (nome, nome_busca) VALUES ('A','A'), ('B','B');`);
    const ins = b.prepare(
      `INSERT INTO estadias (quarto_id, hospede_id, data_entrada, data_saida, status) VALUES (1, ?, ?, ?, ?)`,
    );
    ins.run(1, '2026-10-08', '2026-10-10', 'hospedado');
    expect(() => ins.run(2, '2026-10-09', '2026-10-11', 'confirmada')).toThrow(/QUARTO_OCUPADO/);
    // Saída exclusiva: entrar no dia da saída do outro pode
    expect(() => ins.run(2, '2026-10-10', '2026-10-11', 'confirmada')).not.toThrow();
    // Estadia finalizada (saiu antes) não bloqueia: reaproveitamento na mesma noite
    b.prepare(`UPDATE estadias SET status = 'finalizada' WHERE id = 1`).run();
    expect(() => ins.run(2, '2026-10-08', '2026-10-09', 'hospedado')).not.toThrow();
    // Reativar a primeira agora conflita
    expect(() => b.prepare(`UPDATE estadias SET status = 'hospedado' WHERE id = 1`).run()).toThrow(/QUARTO_OCUPADO/);
  });
});

describe('datas e textos', () => {
  it('usa o fuso de Porto Velho (UTC-4)', () => {
    const i = new Date('2026-10-09T02:30:00Z'); // 22:30 do dia 08 em Cacoal
    expect(dataLocal(i)).toBe('2026-10-08');
    expect(horaLocal(i)).toBe('22:30');
  });
  it('conta noites com saída exclusiva', () => {
    expect(noitesEntre('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('meses e semanas', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(inicioDaSemana('2026-10-08')).toBe('2026-10-05');
    expect(inicioDaSemana('2026-10-11')).toBe('2026-10-05');
  });
  it('converte reais da planilha para centavos', () => {
    expect(reaisParaCentavos(194.24)).toBe(19424);
    expect(reaisParaCentavos(1.005)).toBe(101);
    expect(reaisParaCentavos(3 * 156.1)).toBe(46830);
  });
  it('busca sem acento', () => {
    expect(normalizarBusca('  José  da Conceição ')).toBe('JOSE DA CONCEICAO');
  });
  it('monta link do WhatsApp', () => {
    expect(linkWhatsapp('69 98128 4773')).toBe('https://wa.me/5569981284773');
    expect(linkWhatsapp('123')).toBeNull();
  });
});

describe('login', () => {
  it('bloqueia a API sem sessão e libera com sessão', async () => {
    const { app, api } = await criarAmbiente();
    const semLogin = await app.inject({ method: 'GET', url: '/api/auth/eu' });
    expect(semLogin.statusCode).toBe(401);
    const eu = await api('GET', '/api/auth/eu');
    expect(eu.json.usuario.login).toBe('teste');
  });

  it('primeiro uso só funciona uma vez', async () => {
    const { app } = await criarAmbiente();
    const r = await app.inject({
      method: 'POST',
      url: '/api/sistema/primeiro-uso',
      payload: { nomeHotel: 'X', nome: 'Invasor', login: 'x', senha: '12345678' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('entra com a senha certa e recusa a errada', async () => {
    const { app } = await criarAmbiente();
    const errada = await app.inject({
      method: 'POST',
      url: '/api/auth/entrar',
      payload: { login: 'teste', senha: 'errada' },
    });
    expect(errada.statusCode).toBe(401);
    const certa = await app.inject({
      method: 'POST',
      url: '/api/auth/entrar',
      payload: { login: 'TESTE', senha: 'senha-forte-1', lembrar: true },
    });
    expect(certa.statusCode).toBe(200);
    const c = certa.cookies.find((x) => x.name === 'hotel_sessao')!;
    expect(c.httpOnly).toBe(true);
    expect(c.maxAge).toBeGreaterThan(300 * 86400);
  });

  it('sessão normal expira em 12 horas', async () => {
    const amb = await criarAmbiente();
    const r = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/entrar',
      payload: { login: 'teste', senha: 'senha-forte-1', lembrar: false },
    });
    const token = r.cookies.find((x) => x.name === 'hotel_sessao')!.value;
    amb.relogio.agora = new Date(amb.relogio.agora.getTime() + 13 * 3600_000);
    const depois = await amb.app.inject({ method: 'GET', url: '/api/auth/eu', cookies: { hotel_sessao: token } });
    expect(depois.statusCode).toBe(401);
  });
});
