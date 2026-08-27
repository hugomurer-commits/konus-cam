# Cola de comandos

Todos os comandos rodam de dentro da pasta `freqtrade-bot/`.
Prefixo Docker: `docker compose run --rm freqtrade` (troque por `freqtrade` se instalou direto com pip).

## Baixar dados historicos (faca isso antes do primeiro backtest)

```bash
docker compose run --rm freqtrade download-data \
  --config /freqtrade/config.json \
  --timerange 20230101- --timeframes 1h
```

## Backtest (simulacao com dados historicos reais)

```bash
docker compose run --rm freqtrade backtesting \
  --config /freqtrade/config.json \
  --strategy KonusTrend \
  --timerange 20230101-20250801 \
  --enable-protections
```

## Backtest so no ultimo ano (evita "colar" a estrategia no passado)

```bash
docker compose run --rm freqtrade backtesting \
  --config /freqtrade/config.json --strategy KonusTrend \
  --timerange 20250101- --enable-protections
```

## Rodar em simulacao ao vivo (dry-run - dinheiro ficticio, precos reais)

```bash
docker compose up -d
docker compose logs -f
```

## Ver relatorio do ultimo backtest

```bash
docker compose run --rm freqtrade backtesting-show --config /freqtrade/config.json
```

## Parar o bot

```bash
docker compose down
```

## Conferir se a estrategia carrega sem erro

```bash
docker compose run --rm freqtrade list-strategies --config /freqtrade/config.json
```
