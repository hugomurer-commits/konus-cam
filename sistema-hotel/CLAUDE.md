# Sistema do Hotel Tropical

Especificação completa: `ESPECIFICACAO.md` (ler antes de mudar regra de negócio). Estamos na **Fase 1**
(roda só no PC do hotel; página pública, Pix e Cloudflare são Fase 2).

## Para quem é
Usuário principal: o dono, pessoa mais velha e pouco acostumada com tecnologia. Toda tela segue a seção 5:
fonte 18px, botões ≥ 48px com texto, linguagem simples ("Chegou", "Saiu", "Recebi", "Paguei"),
o importante na primeira tela, estados com cor **e** texto, confirmação clara + "Desfazer" em ação de dinheiro.

## Estrutura
- `servidor/` Fastify + better-sqlite3 (TypeScript). Regras puras em `src/dominio/`, HTTP em `src/rotas/`,
  importação da planilha em `src/importacao/`, tarefas de fundo (backup) em `src/tarefas/`.
- `painel/` React + Vite. Telas em `src/telas/`, componentes em `src/componentes/`, cores em `src/estilo/app.css`.
- `windows/` serviço (NSSM) e instalador (Inno Setup).
- `dados-originais/` planilha real do hotel (**fora do git**: dados pessoais de hóspedes).

## Regras que não podem quebrar
- Dinheiro sempre em **centavos inteiros**. Datas de negócio `AAAA-MM-DD` no fuso `America/Porto_Velho`.
- `data_saida` é exclusiva (1 noite em 08/10 → saída 09/10). Cada noite vendida é uma linha em `estadia_noites`.
- **Receita nunca é lançada à mão**: o caixa soma `pagamentos`.
- **Anti-overbooking**: confere no serviço dentro de transação e o gatilho do SQLite barra de novo.
- **Nada que envolve dinheiro é apagado**: usar `cancelado_em`/status + `auditoria`.
- Migrações novas sempre no fim de `servidor/src/banco/conexao.ts`; nunca editar uma que já foi para o hotel.
- Nunca colocar dado real de hóspede em teste, fixture ou commit.

## Comandos
- `npm install` · `npm run dev` (servidor :8787 + painel :5173) · `npm test` · `npm run typecheck` · `npm run build`
- `npm run importar -- "dados-originais/LANÇAMENTOS ATUAIS 24.09.2026.xlsx"` importa a planilha no banco de `dados/`.
- O teste da seção 8.3 (`servidor/test/importacao-real.test.ts`) só roda se a planilha estiver em `dados-originais/`.
