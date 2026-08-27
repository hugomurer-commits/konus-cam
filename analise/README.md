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
