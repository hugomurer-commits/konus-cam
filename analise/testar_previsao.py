#!/usr/bin/env python3
"""
Testa, com precos REAIS da Binance, se e' possivel prever a direcao do preco
em 1, 5 ou 15 minutos.

O que ele faz: pega os sinais tecnicos classicos que todo curso de opcoes
binarias ensina (RSI, MACD, cruzamento de medias, momentum, Bollinger) e
mede quantas vezes cada um acertou a direcao do proximo candle.

Depois compara com a linha do "empate" - a taxa de acerto minima que uma
opcao binaria exige so para voce nao perder dinheiro.

Uso:
    pip install requests pandas numpy
    python3 testar_previsao.py
    python3 testar_previsao.py --par ETHUSDT --payout 0.83
"""

import argparse
import sys

import numpy as np
import pandas as pd
import requests

BINANCE = "https://api.binance.com/api/v3/klines"


# ----------------------------------------------------------------- dados

def baixar(par: str, intervalo: str, candles: int = 5000) -> pd.DataFrame:
    """Baixa candles da Binance (API publica, nao precisa de conta)."""
    linhas = []
    fim = None
    while len(linhas) < candles:
        params = {"symbol": par, "interval": intervalo, "limit": 1000}
        if fim:
            params["endTime"] = fim
        r = requests.get(BINANCE, params=params, timeout=30)
        r.raise_for_status()
        lote = r.json()
        if not lote:
            break
        linhas = lote + linhas
        fim = lote[0][0] - 1

    df = pd.DataFrame(linhas[:candles], columns=[
        "abertura_ms", "open", "high", "low", "close", "volume",
        "_1", "_2", "_3", "_4", "_5", "_6",
    ])
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = df[c].astype(float)
    df["data"] = pd.to_datetime(df["abertura_ms"], unit="ms", utc=True)
    return df[["data", "open", "high", "low", "close", "volume"]].reset_index(drop=True)


# ------------------------------------------------------------ indicadores
# Implementados em pandas puro para nao depender de biblioteca externa.

def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    ganho = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    perda = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + ganho / perda.replace(0, np.nan))


def macd(s: pd.Series):
    linha = s.ewm(span=12, adjust=False).mean() - s.ewm(span=26, adjust=False).mean()
    return linha, linha.ewm(span=9, adjust=False).mean()


def indicadores(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["rsi"] = rsi(df["close"])
    df["macd"], df["macd_sinal"] = macd(df["close"])
    df["ema9"] = df["close"].ewm(span=9, adjust=False).mean()
    df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
    media20 = df["close"].rolling(20).mean()
    desvio20 = df["close"].rolling(20).std()
    df["banda_sup"] = media20 + 2 * desvio20
    df["banda_inf"] = media20 - 2 * desvio20
    df["candle_verde"] = df["close"] > df["open"]
    return df


# ---------------------------------------------------------------- sinais
# Cada sinal devolve: True = aposta que SOBE, False = aposta que DESCE,
# None (NaN) = sem opiniao neste candle.

def sinais(df: pd.DataFrame) -> dict:
    s = {}
    s["RSI < 30 sobe / > 70 desce"] = np.where(
        df["rsi"] < 30, True, np.where(df["rsi"] > 70, False, np.nan))
    s["MACD acima do sinal = sobe"] = np.where(
        df["macd"] > df["macd_sinal"], True, False).astype(object)
    s["Cruzamento MACD (no candle)"] = np.where(
        (df["macd"] > df["macd_sinal"]) & (df["macd"].shift(1) <= df["macd_sinal"].shift(1)), True,
        np.where((df["macd"] < df["macd_sinal"]) & (df["macd"].shift(1) >= df["macd_sinal"].shift(1)), False, np.nan))
    s["EMA9 acima da EMA21 = sobe"] = np.where(
        df["ema9"] > df["ema21"], True, False).astype(object)
    s["Momentum (repete candle anterior)"] = df["candle_verde"].shift(1).astype(object)
    s["Reversao (inverte candle anterior)"] = (~df["candle_verde"].shift(1).astype(bool)).astype(object)
    s["Toque banda inferior = sobe"] = np.where(
        df["close"] < df["banda_inf"], True,
        np.where(df["close"] > df["banda_sup"], False, np.nan))
    s["3 candles verdes = sobe"] = np.where(
        df["candle_verde"].shift(1) & df["candle_verde"].shift(2) & df["candle_verde"].shift(3), True,
        np.where(~df["candle_verde"].shift(1).astype(bool) & ~df["candle_verde"].shift(2).astype(bool)
                 & ~df["candle_verde"].shift(3).astype(bool), False, np.nan))
    return s


# ------------------------------------------------------------- avaliacao

def avaliar(previsao, subiu) -> tuple:
    """Devolve (acertos, total, taxa, margem_de_erro_95%)."""
    prev = pd.Series(previsao)
    valido = prev.notna() & subiu.notna()
    prev, real = prev[valido].astype(bool), subiu[valido].astype(bool)
    n = len(prev)
    if n < 30:
        return 0, n, float("nan"), float("nan")
    acertos = int((prev == real).sum())
    taxa = acertos / n
    margem = 1.96 * np.sqrt(taxa * (1 - taxa) / n)   # intervalo de confianca 95%
    return acertos, n, taxa, margem


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--par", default="BTCUSDT")
    p.add_argument("--payout", type=float, default=0.83,
                   help="payout da corretora (0.83 = 83%%)")
    p.add_argument("--candles", type=int, default=5000)
    args = p.parse_args()

    empate = 1 / (1 + args.payout)

    print(f"\nPar: {args.par}   |   Payout: {args.payout:.0%}")
    print(f"Para NAO perder dinheiro, um sinal precisa acertar mais de "
          f"{empate:.1%} das vezes.\n")

    algum_passou = False
    analisados = 0

    for intervalo in ["1m", "5m", "15m"]:
        try:
            df = indicadores(baixar(args.par, intervalo, args.candles))
        except Exception as e:
            print(f"[{intervalo}] erro ao baixar: {e}")
            continue
        analisados += 1

        # O que queremos prever: o proximo candle fecha acima da abertura?
        subiu = (df["close"].shift(-1) > df["open"].shift(-1)).astype(object)
        subiu.iloc[-1] = np.nan   # o ultimo candle nao tem "proximo" para comparar

        print(f"--- {intervalo} ({len(df)} candles) "
              + "-" * 34)
        print(f"{'sinal':<38} {'amostra':>8} {'acerto':>18} {'veredito':>10}")

        for nome, prev in sinais(df).items():
            _, n, taxa, margem = avaliar(prev, subiu)
            if np.isnan(taxa):
                print(f"{nome:<38} {n:>8} {'amostra pequena':>18} {'-':>10}")
                continue
            # so "passa" se ate o piso do intervalo de confianca supera o empate
            passou = (taxa - margem) > empate
            algum_passou |= passou
            print(f"{nome:<38} {n:>8} {taxa:>10.1%} ±{margem:>5.1%} "
                  f"{'PASSOU' if passou else 'nao':>10}")
        print()

    print("=" * 74)

    # Sem dado nenhum nao existe conclusao. Nao confunda "baixou e nao achou"
    # com "nao conseguiu baixar" - a segunda nao mede nada.
    if analisados == 0:
        print("NADA FOI MEDIDO - nenhum candle foi baixado.")
        print("Os erros acima sao de conexao, nao resultado de analise.")
        print("Resolva o acesso a internet/Binance e rode de novo.")
        print("NAO conclua nada sobre os sinais a partir desta execucao.")
        print("=" * 74 + "\n")
        return 1

    if algum_passou:
        print("Algum sinal superou a linha do empate com folga estatistica.")
        print("Confira em outros pares e outros periodos antes de acreditar -")
        print("testar muitas combinacoes faz surgir 'vencedor' por puro acaso.")
    else:
        print("NENHUM sinal superou a linha do empate.")
        print(f"Todos ficaram perto de 50% - cara-ou-coroa. Com payout de "
              f"{args.payout:.0%},")
        print(f"acertar 50% significa perder "
              f"{abs(0.5*args.payout - 0.5)*100:.1f}% de cada aposta, em media.")
    print("=" * 74 + "\n")


if __name__ == "__main__":
    sys.exit(main())
