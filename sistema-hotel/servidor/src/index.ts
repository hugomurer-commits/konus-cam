import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './banco/conexao.js';
import { criarApp } from './app.js';
import { iniciarTarefas } from './tarefas/agendador.js';

// Em produção (Windows) o instalador define HOTEL_DADOS=C:\SistemaHotel\dados.
// Em desenvolvimento, usa sistema-hotel/dados.
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const dirDados = resolve(process.env.HOTEL_DADOS ?? join(raiz, 'dados'));
const dirPainel = resolve(process.env.HOTEL_PAINEL ?? join(raiz, 'painel', 'dist'));
const porta = Number(process.env.HOTEL_PORTA ?? 8787);
// Só o próprio PC acessa por padrão. Para liberar na rede do hotel: HOTEL_HOST=0.0.0.0
const host = process.env.HOTEL_HOST ?? '127.0.0.1';

mkdirSync(dirDados, { recursive: true });
const banco = abrirBanco(join(dirDados, 'hotel.db'));
const ctx = { banco, agora: () => new Date(), dirDados, dirPainel };
const app = await criarApp(ctx, { log: true });
iniciarTarefas(ctx, app.log);

const encerrar = async () => {
  await app.close();
  banco.close();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await app.listen({ port: porta, host });
app.log.info(`Sistema do hotel no ar: http://localhost:${porta} (dados em ${dirDados})`);
