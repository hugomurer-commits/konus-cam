# Sistema do Hotel Tropical

Sistema web que substitui a planilha do hotel: hospedagens, mapa dos quartos, hóspedes, caixa, contas a
pagar, funcionárias e backup. Roda no PC do hotel e abre no navegador. Especificação completa em
[ESPECIFICACAO.md](ESPECIFICACAO.md); regras para quem mexe no código em [CLAUDE.md](CLAUDE.md).

**Fase 1** (esta): funciona no PC do hotel, sem acesso externo. Página pública, Pix, PWA e Cloudflare
ficam para a Fase 2.

## Desenvolvimento

Precisa de Node.js 22.

```bash
npm install
npm run dev          # servidor em :8787 e painel em :5173 (abra http://localhost:5173)
npm test             # testes do servidor (inclui a validação da seção 8.3 se a planilha estiver lá)
npm run typecheck
npm run build        # painel/dist + servidor/dist/servidor.mjs
npm start            # roda o que foi compilado em http://localhost:8787
```

Dados de desenvolvimento ficam em `dados/` (fora do git). Para importar a planilha pela linha de comando:

```bash
npm run importar -- "dados-originais/LANÇAMENTOS ATUAIS 24.09.2026.xlsx"
```

A planilha original (com dados pessoais de hóspedes) fica em `dados-originais/`, que **não vai para o
git**. Sem ela, o teste da seção 8.3 aparece como pulado.

Variáveis de ambiente do servidor: `HOTEL_DADOS` (pasta do banco/fotos), `HOTEL_PORTA` (8787),
`HOTEL_HOST` (127.0.0.1; use `0.0.0.0` para liberar na rede do hotel), `HOTEL_PAINEL` (painel compilado).

## Estrutura

```
servidor/   Fastify + SQLite (better-sqlite3). src/dominio = regras; src/rotas = API;
            src/importacao = planilha antiga; src/tarefas = backup diário
painel/     React + Vite. src/telas = telas; src/componentes; src/estilo/app.css = cores da marca
windows/    instalador (Inno Setup), serviço (NSSM) e guia de entrega: windows/LEIA-ME.md
assets/     logo original; scripts/gerar-icones.py gera logo e ícones do painel
```

## Instalação no hotel

Ver [windows/LEIA-ME.md](windows/LEIA-ME.md): gerar o instalador, testar numa máquina limpa, preparar o
PC (BIOS, energia, Google Drive) e os critérios de pronto da Fase 1.
