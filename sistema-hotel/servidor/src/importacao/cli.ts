// Importa a planilha pela linha de comando (desenvolvimento):
//   npm run importar -- "dados-originais/LANÇAMENTOS ATUAIS 24.09.2026.xlsx"
// No hotel, a importação é feita pela tela (assistente de primeiro uso).
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from '../banco/conexao.js';
import { formatarReais } from '../dominio/dinheiro.js';
import { importarArquivo } from './servico.js';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: npm run importar -- <planilha.xlsx>');
  process.exit(1);
}
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dirDados = resolve(process.env.HOTEL_DADOS ?? join(raiz, 'dados'));
mkdirSync(dirDados, { recursive: true });
const banco = abrirBanco(join(dirDados, 'hotel.db'));
const caminho = resolve(process.env.INIT_CWD ?? process.cwd(), arquivo);
const { resumo } = await importarArquivo(banco, readFileSync(caminho), basename(caminho), null, new Date());

console.log(`\nImportado em ${join(dirDados, 'hotel.db')}\n`);
for (const v of resumo.validacao) {
  const f = (n: number) => (v.dinheiro ? formatarReais(n) : String(n));
  console.log(`${v.planilha === v.sistema ? 'OK ' : 'DIF'}  ${v.item.padEnd(52)} planilha ${f(v.planilha).padStart(16)}  sistema ${f(v.sistema).padStart(16)}`);
}
console.log('\nEstadias:', resumo.estadias.total, resumo.estadias.porStatus, '| hóspedes:', resumo.estadias.hospedes);
console.log('Quartos ativos:', resumo.estadias.quartosAtivos.join(', '));
console.log('Para conferir:', resumo.pendencias);
banco.close();
