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

Testa **55 variações** de sinais técnicos de uma vez (RSI em 3 períodos × 4
limiares, 5 pares de médias, 2 MACDs, momentum de 1 a 4 candles, 9 Bollinger,
filtros de volume) — e é honesto sobre o que isso significa.

## O problema de "testar até achar algo"

Testando dezenas de sinais e ficando com o melhor, você **sempre** acha um
vencedor — mesmo em dados 100% aleatórios. Medido aqui, em 20 séries de ruído
puro: uma média de **3,1 falsos positivos** por série sem correção, chegando a
**12** na pior. Com a correção: **0 em 20**.

## As quatro travas

**1. Correção para testes múltiplos (Benjamini-Hochberg).** Desconta a
vantagem de ter testado muita coisa.

**2. Validação fora da amostra.** Descobre numa parte dos dados, confirma
noutra que o sinal nunca viu.

**3. Walk-forward (`--janelas N`).** Repete descoberta e validação em N
janelas sequenciais. Vantagem real reaparece em várias; ajuste a um regime
específico aparece em uma só e some nas outras. Sem isso, não dá para separar
"o sinal morreu porque era ruído" de "morreu porque o regime mudou".

**4. Relatório de potência.** Quando a amostra é pequena demais para separar
"sem vantagem" de "vantagem lucrativa", ele diz isso — em vez de concluir.

## Direção: o teste é bilateral, a aposta não

O teste estatístico é bilateral: um sinal que acerta 43% é um achado tão bom
quanto seu inverso a 57% — é a mesma informação. A **descoberta define a
direção** e a validação testa a aposta já orientada, marcada como
`[INVERTIDO]` no relatório.

Por isso o catálogo não traz inversos explícitos: "Reversão" é o complemento
exato de "Momentum", e "Bollinger rompe" o de "Bollinger toque". Incluir os
dois testa a mesma hipótese duas vezes, inflando o número de testes e deixando
o BH conservador à toa, sem acrescentar informação.

## Duas perguntas, duas respostas

| Marca | Significa |
|---|---|
| `REAL` | O sinal prevê algo — acima de 50% com folga estatística |
| `REAL+PAGA` | A vantagem também cobre o payout (54,6% com payout de 83%) |

Um sinal pode ser **real e mesmo assim perder dinheiro**: a vantagem existe,
mas é menor que a mordida da corretora. É o caso mais comum.

## Como rodar

```bash
python3 busca_de_sinais.py                                  # BTCUSDT, janela única
python3 busca_de_sinais.py --par ETHUSDT --janelas 4 --candles 20000
python3 busca_de_sinais.py --payout 0.90
```

Para uma conclusão que valha alguma coisa, use `--janelas 4` ou mais e o
máximo de candles que a Binance devolver. Janela única em poucos dias de dados
é subpotente — o próprio relatório vai avisar.

## Autoteste — a ferramenta é confiável?

Uma ferramenta que sempre responde "não achei nada" seria inútil e você não
teria como saber. Ela testa a si mesma em três braços:

```bash
python3 busca_de_sinais.py --autoteste
```

| Braço | O que faz | O certo é |
|---|---|---|
| A | Ruído puro em 15 sementes | O BH ter o que cortar, e cortar tudo |
| B | Série com vantagem real plantada | Achar |
| C | Ruído puro, janela única | Não achar nada |

O braço A existe porque uma semente só não prova nada sobre a correção: se
aquele sorteio não produzir falso positivo, o BH nunca é exercitado e o
autoteste passa sem ter testado a trava.

Sai com código 1 se qualquer braço falhar.

## Sem dados não há conclusão

Se todos os downloads falharem, os dois scripts imprimem `NADA FOI MEDIDO` e
saem com código 1. Erro de conexão nunca vira "medimos e não achamos nada".
