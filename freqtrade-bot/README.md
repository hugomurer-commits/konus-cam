# Konus Bot — robô de trading na Binance (Freqtrade)

Robô que compra e vende cripto sozinho na Binance, usando o
[Freqtrade](https://www.freqtrade.io) (projeto open-source, gratuito, usado por
milhares de pessoas há anos).

---

## ⚠️ Leia isto antes de qualquer coisa

**Este robô não garante lucro. Nenhum robô garante.**

O que ele faz de verdade:

- opera 24h por dia sem emoção, sem medo e sem euforia;
- respeita stop-loss sempre, sem "deixar mais um pouquinho pra ver se volta";
- para sozinho quando entra em maré de azar (as proteções da seção "Freios").

O que ele **não** faz:

- não prevê o futuro;
- não transforma R$ 1.000 em R$ 10.000;
- não impede que você perca dinheiro. Em mercado de queda longa ou de lado, a
  estratégia perde. Isso é normal e está previsto.

**Regra número um:** só coloque dinheiro que você aceita perder **por
completo**. Não é dinheiro de fornecedor, não é capital de giro da pizzaria,
não é reserva de emergência.

**Regra número dois:** rode em simulação por **no mínimo 30 dias** antes de
pensar em dinheiro real. Sem exceção.

---

## O que a estratégia faz (em português)

A estratégia se chama `KonusTrend` e a lógica é:

1. **Só compra moeda que já está subindo.** Preço acima da média de 200 horas e
   média de 50 acima da de 200. Nunca "compra na baixa tentando pegar o fundo".
2. **Espera o preço dar uma respirada.** Em vez de comprar no topo do impulso,
   espera uma queda curta e entra quando o RSI cruza 35 de baixo para cima.
3. **Confere se a tendência tem força** (ADX acima de 20), para não operar em
   mercado parado, onde só se paga taxa.
4. **Filtra volatilidade e volume**, evitando moeda em pânico e moeda morta.
5. **Sai** por alvo de lucro (6% no começo, afrouxando com o tempo), por
   trailing stop (protege o lucro já feito) ou quando a tendência quebra.
6. **Stop-loss de 8%** em toda operação. Depois de 2 dias parada, o stop aperta
   para 4%; depois de 4 dias, para 2%.

**Só compra (spot). Sem alavancagem.** Isso é proposital: sem alavancagem você
não pode ser liquidado. O pior cenário é a moeda cair — não é ficar devendo.

### Freios automáticos

| Freio | O que faz |
|---|---|
| `MaxDrawdown` | Se perder mais de 10% na semana, para tudo por 48h |
| `StoplossGuard` | 3 stops batidos em 72h → para de abrir posição por 24h |
| `CooldownPeriod` | Espera 3h antes de reentrar no mesmo par |
| `LowProfitPairs` | Par que só dá prejuízo fica de castigo |

---

## Onde rodar

O robô precisa ficar ligado 24h por dia. Duas opções:

- **Seu PC** — funciona, mas se desligar ou cair a internet, o robô para no meio
  de uma operação (a posição fica aberta na Binance sem ninguém cuidando).
- **VPS (recomendado)** — servidor na nuvem por ~R$ 30/mês (Contabo, Hetzner,
  DigitalOcean). Fica ligado sempre.

Comece pelo seu PC durante a fase de simulação. Só migre para VPS se for para
dinheiro real.

---

## Passo a passo

### 1. Instale o Docker

- Windows/Mac: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Linux: `curl -fsSL https://get.docker.com | sh`

Confira: `docker --version`

### 2. Baixe esta pasta

```bash
git clone https://github.com/hugomurer-commits/konus-cam.git
cd konus-cam/freqtrade-bot
```

### 3. Crie o arquivo de segredos

```bash
cp config.secrets.example.json config.secrets.json
```

Abra `config.secrets.json` e preencha. **Na fase de simulação você pode deixar
`key` e `secret` vazios** — não precisa de conta na Binance para simular.

O arquivo `config.secrets.json` está no `.gitignore` e **nunca** vai para o
GitHub. Nunca cole chave de API em conversa, em print ou em commit.

### 4. Baixe o histórico de preços

```bash
docker compose run --rm freqtrade download-data \
  --config /freqtrade/config.json --timerange 20230101- --timeframes 1h
```

Demora alguns minutos.

### 5. Rode o backtest

```bash
docker compose run --rm freqtrade backtesting \
  --config /freqtrade/config.json --strategy KonusTrend \
  --timerange 20230101-20250801 --enable-protections
```

**Como ler o resultado** (a tabela final):

| Campo | O que significa | O que é aceitável |
|---|---|---|
| `Total profit %` | Lucro no período todo | Positivo já é bom |
| `Max Drawdown` | Maior tombo do capital | Acima de 25% é perigoso |
| `Win%` | % de operações vencedoras | 40% já serve se os ganhos forem maiores que as perdas |
| `Avg. Duration` | Tempo médio na operação | — |
| `Total trades` | Número de operações | Menos de 30 = amostra pequena, não confie |

**Se o backtest der prejuízo, não force.** Não fique mexendo em número até o
resultado ficar bonito — isso se chama *overfitting* e é a forma mais comum de
perder dinheiro: a estratégia fica perfeita no passado e quebra no futuro.

### 6. Rode em simulação (dry-run) por 30 dias

```bash
docker compose up -d
docker compose logs -f      # acompanhar; Ctrl+C sai do log sem parar o bot
```

O robô opera com dinheiro fictício (1.000 USDT) e preços reais, ao vivo. É aqui
que você descobre se ele funciona **de verdade**, não só no passado.

### 7. Só então, dinheiro real

Depois de 30 dias de simulação com resultado consistente:

1. Crie uma API key na Binance: Perfil → API Management → Create API.
2. **Permissões: marque apenas "Enable Spot Trading". NUNCA marque "Enable
   Withdrawals".** Sem permissão de saque, mesmo que a chave vaze, ninguém tira
   seu dinheiro.
3. Restrinja a chave ao IP do seu servidor ("Restrict access to trusted IPs").
4. Cole a chave em `config.secrets.json`.
5. Em `config.json`, mude `"dry_run": true` para `"dry_run": false`.
6. **Comece com o mínimo.** Ajuste `stake_amount` para 15 e `max_open_trades`
   para 2 — isso expõe ~30 USDT no total. Rode assim por mais 2 semanas.
7. Só aumente depois, e devagar.

---

## Ajustando o tamanho das operações

Em `config.json`:

| Campo | O que é |
|---|---|
| `stake_amount` | Quanto entra em cada operação, em USDT |
| `max_open_trades` | Quantas operações abertas ao mesmo tempo |
| `dry_run_wallet` | Saldo fictício da simulação |

Exposição máxima = `stake_amount × max_open_trades`.

Com R$ 5.000 (~900 USDT), um começo sensato é `stake_amount: 50` e
`max_open_trades: 4` → no máximo 200 USDT no mercado por vez, 78% do capital
parado como colchão. Parece pouco. É proposital.

**Ordem mínima na Binance: 10 USDT.** Abaixo disso a corretora recusa.

---

## Custos que comem o lucro

- **Taxa Binance:** 0,1% por ordem → 0,2% ida e volta. Uma operação que fecha em
  +0,5% te dá +0,3% no bolso.
- **Imposto no Brasil:** ganho em cripto é tributado. Acima de R$ 35.000 de
  venda no mês, 15% sobre o ganho. Guarde o relatório de operações e fale com
  seu contador — o mesmo que cuida da pizzaria.

---

## Perguntas que você vai ter

**Posso deixar rodando e esquecer?** Não. Olhe pelo menos uma vez por semana.

**Quanto rende por mês?** Ninguém sabe. Quem te der um número está chutando ou
mentindo. Só o backtest e a simulação dão uma faixa realista — e o futuro não é
obrigado a repetir o passado.

**Posso aumentar para ganhar mais rápido?** Aumentar posição multiplica ganho e
perda igualmente. A conta que quebra é sempre a que aumentou depois de uma
sequência boa.

**E se eu quiser alavancagem?** Não. Com alavancagem você pode perder mais do
que colocou. Este robô é spot de propósito.

**Achei um robô no YouTube prometendo 5% ao dia.** 5% ao dia composto vira mais
de 100.000% ao ano. Se existisse, o dono não estaria vendendo curso.

---

## Arquivos

```
freqtrade-bot/
├── README.md                     ← este arquivo
├── COMANDOS.md                   ← cola de comandos
├── docker-compose.yml            ← como o robô sobe
├── config.json                   ← configuração (versionada, sem segredo)
├── config.secrets.example.json   ← modelo do arquivo de segredos
└── user_data/
    └── strategies/
        └── KonusTrend.py         ← a estratégia, comentada linha a linha
```

## Documentação oficial

- Freqtrade: https://www.freqtrade.io/en/stable/
- Estratégias: https://www.freqtrade.io/en/stable/strategy-customization/
- Backtest: https://www.freqtrade.io/en/stable/backtesting/
