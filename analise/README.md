# Testador de previsão de curto prazo

Script que responde, **com preços reais da Binance e com os seus próprios
olhos**, a pergunta: dá para prever a direção do preço em 1, 5 ou 15 minutos?

## Por que isso existe

Todo curso de opções binárias promete taxa de acerto alta com sinais técnicos
em prazo curto. Este script pega exatamente esses sinais, roda em milhares de
candles reais e mede quantas vezes cada um acertou.

Ele compara com a **linha do empate** — a taxa de acerto mínima que a opção
binária exige só para você não perder dinheiro:

| Payout da corretora | Precisa acertar |
|---|---|
| 75% | 57,1% |
| 80% | 55,6% |
| 83% | 54,6% |
| 90% | 52,6% |

Acertar 50% (cara-ou-coroa) com payout de 83% significa perder **8,5% de cada
aposta**, em média, para sempre.

## Como rodar

```bash
pip install requests pandas numpy
python3 testar_previsao.py
```

Opções:

```bash
python3 testar_previsao.py --par ETHUSDT --payout 0.80 --candles 5000
```

## Como ler o resultado

Cada linha traz o sinal, o tamanho da amostra, a taxa de acerto com margem de
erro de 95%, e o veredito.

O veredito só diz **PASSOU** se até o *pior caso* do intervalo de confiança
ficar acima da linha do empate. Isso é proposital: uma taxa de 55% ± 5% não
serve como prova de nada — pode ser 50% com sorte na amostra.

## Cuidado com o "vencedor" de mentira

Se você testar sinais suficientes, algum vai passar por puro acaso — é o
mesmo motivo pelo qual alguém sempre ganha na loteria. Antes de acreditar em
qualquer sinal que passe:

1. teste no mesmo sinal em outros pares (ETH, SOL, BNB);
2. teste em outro período de tempo;
3. desconfie de amostra pequena (menos de 500 operações não vale).

Um sinal de verdade continua passando em todos. Um sinal de sorte some.

## Estado da validação

O pipeline foi testado de ponta a ponta com dados sintéticos aleatórios, e o
script corretamente acusou ~50% em todos os oito sinais — o instrumento está
calibrado. **Nenhuma medição com dados reais da Binance foi feita ainda**, por
falta de acesso à API no ambiente onde o script foi escrito. Essa parte é com
você.

---

# Busca ampla de sinais — `busca_de_sinais.py`

O `testar_previsao.py` testa 8 sinais fixos. Este aqui testa **68 variações**
de uma vez (RSI em 3 períodos × 4 limiares, 5 pares de médias, 2 MACDs,
momentum e reversão de 1 a 4 candles, 9 configurações de Bollinger, filtros de
volume) — e é honesto sobre o que isso significa.

## O problema de "testar até achar algo"

Se você testa 68 sinais e fica com o melhor, **sempre** vai achar um vencedor —
mesmo em dados 100% aleatórios. A 5% de significância, ~3 dos 68 vão passar por
puro acaso. Escolher o melhor de muitos não é pesquisa, é loteria com uma etapa
a mais.

## As duas travas

**1. Correção para testes múltiplos (Benjamini-Hochberg).** Desconta
matematicamente a vantagem de ter testado muita coisa. Um sinal que passaria
sozinho pode não passar quando estava entre 68.

**2. Validação fora da amostra.** Os dados são cortados em 70% / 30%. A busca
roda só nos primeiros 70%. Quem sobrevive é testado de novo nos 30% finais, que
nunca foram vistos. Sorte não se repete em dados novos; vantagem real, sim.

## Duas perguntas, duas respostas

O relatório separa o que quase todo curso mistura:

| Coluna | Pergunta |
|---|---|
| `real?` | O sinal prevê alguma coisa? (acima de 50% com folga estatística) |
| `paga?` | A vantagem cobre o payout da binária? (acima de 54,6% com 83%) |

Um sinal pode ser **real e mesmo assim perder dinheiro** — é o caso mais comum.
A vantagem existe, mas é menor que a mordida da corretora.

## Como rodar

```bash
python3 busca_de_sinais.py                          # BTCUSDT, payout 83%
python3 busca_de_sinais.py --par ETHUSDT
python3 busca_de_sinais.py --payout 0.90 --candles 8000
```

## Autoteste — a ferramenta é confiável?

Uma ferramenta que sempre responde "não achei nada" seria inútil e você não
teria como saber. Por isso ela testa a si mesma:

```bash
python3 busca_de_sinais.py --autoteste
```

Ela roda a busca completa em duas séries inventadas: uma de **ruído puro**
(onde o certo é não achar nada) e uma com uma **vantagem real plantada** (onde
o certo é achar). Só se comporta como confiável se acertar as duas.

Resultado da última execução:

```
A) ruído puro          -> achou 0 sinais   OK (correto)
B) vantagem plantada   -> achou 2 sinais   OK (correto)
Ferramenta confiável.
```

O teste B ainda revela o ponto central: mesmo com vantagem **real** plantada
nos dados, os sinais encontrados marcaram `real? SIM` e `paga? não`. Havia
previsão de verdade e ainda assim se perderia dinheiro na binária.
