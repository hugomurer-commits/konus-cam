#!/usr/bin/env python3
"""
Busca ampla de sinais preditivos - com as travas que impedem falso positivo.

O PROBLEMA QUE ESTE SCRIPT RESOLVE
----------------------------------
Se voce testar 60 sinais diferentes e ficar com o melhor, voce SEMPRE vai
"encontrar algo" - mesmo em dados completamente aleatorios. Testar muito e
guardar o vencedor nao e' pesquisa, e' loteria com etapa extra.

AS DUAS TRAVAS
--------------
1. CORRECAO PARA TESTES MULTIPLOS (Benjamini-Hochberg): desconta
   matematicamente a vantagem de ter testado muitos candidatos. Um sinal
   que passaria sozinho pode nao passar quando estava entre 60.

2. VALIDACAO FORA DA AMOSTRA: os dados sao cortados em dois. A busca roda
   so na primeira parte. Quem sobrevive e' testado de novo na segunda parte,
   que o sinal nunca viu. Sorte nao se repete em dados novos; vantagem real,
   sim.

Uso:
    pip install requests pandas numpy
    python3 busca_de_sinais.py
    python3 busca_de_sinais.py --par ETHUSDT --payout 0.83
    python3 busca_de_sinais.py --autoteste     # prova que a ferramenta funciona
"""

import argparse
import math
import sys

import numpy as np
import pandas as pd

from testar_previsao import baixar, rsi, macd


# ------------------------------------------------------- catalogo de sinais

def gerar_sinais(df: pd.DataFrame) -> dict:
    """
    Monta dezenas de variacoes dos sinais tecnicos classicos.

    Cada sinal e' um vetor com True (aposta que sobe), False (aposta que
    desce) ou NaN (sem opiniao naquele candle).
    """
    s = {}
    fechamento = df["close"]
    verde = (df["close"] > df["open"]).astype(object)

    # --- RSI: sobrevendido sobe, sobrecomprado desce
    for periodo in (7, 14, 21):
        r = rsi(fechamento, periodo)
        for piso in (20, 25, 30, 35):
            teto = 100 - piso
            s[f"RSI{periodo} <{piso} sobe / >{teto} desce"] = np.where(
                r < piso, True, np.where(r > teto, False, np.nan))
            s[f"RSI{periodo} cruza {piso} pra cima"] = np.where(
                (r > piso) & (r.shift(1) <= piso), True,
                np.where((r < teto) & (r.shift(1) >= teto), False, np.nan))

    # --- Cruzamento de medias moveis
    for rapida, lenta in ((5, 20), (9, 21), (10, 50), (20, 50), (50, 200)):
        er = fechamento.ewm(span=rapida, adjust=False).mean()
        el = fechamento.ewm(span=lenta, adjust=False).mean()
        s[f"EMA{rapida} acima da EMA{lenta}"] = np.where(er > el, True, False).astype(object)
        s[f"EMA{rapida} cruza EMA{lenta}"] = np.where(
            (er > el) & (er.shift(1) <= el.shift(1)), True,
            np.where((er < el) & (er.shift(1) >= el.shift(1)), False, np.nan))

    # --- MACD
    for rapida, lenta, sinal_n in ((12, 26, 9), (5, 35, 5)):
        linha = (fechamento.ewm(span=rapida, adjust=False).mean()
                 - fechamento.ewm(span=lenta, adjust=False).mean())
        sig = linha.ewm(span=sinal_n, adjust=False).mean()
        rot = f"MACD({rapida},{lenta},{sinal_n})"
        s[f"{rot} acima do sinal"] = np.where(linha > sig, True, False).astype(object)
        s[f"{rot} cruzamento"] = np.where(
            (linha > sig) & (linha.shift(1) <= sig.shift(1)), True,
            np.where((linha < sig) & (linha.shift(1) >= sig.shift(1)), False, np.nan))

    # --- Momentum e reversao (sequencia de candles)
    for k in (1, 2, 3, 4):
        seq_alta = verde.shift(1).astype(bool)
        seq_baixa = ~verde.shift(1).astype(bool)
        for i in range(2, k + 1):
            seq_alta &= verde.shift(i).astype(bool)
            seq_baixa &= ~verde.shift(i).astype(bool)
        s[f"Momentum: {k} candle(s) na mesma direcao"] = np.where(
            seq_alta, True, np.where(seq_baixa, False, np.nan))
        s[f"Reversao: apos {k} candle(s) inverte"] = np.where(
            seq_alta, False, np.where(seq_baixa, True, np.nan))

    # --- Bandas de Bollinger: toque (reversao) e rompimento (continuacao)
    for periodo in (10, 20, 30):
        media = fechamento.rolling(periodo).mean()
        desvio = fechamento.rolling(periodo).std()
        for k in (1.5, 2.0, 2.5):
            sup, inf = media + k * desvio, media - k * desvio
            s[f"Bollinger({periodo},{k}) toque = reverte"] = np.where(
                fechamento < inf, True, np.where(fechamento > sup, False, np.nan))
            s[f"Bollinger({periodo},{k}) rompe = segue"] = np.where(
                fechamento > sup, True, np.where(fechamento < inf, False, np.nan))

    # --- Volume acima da media confirmando a direcao do candle
    for periodo in (10, 20):
        vol_media = df["volume"].rolling(periodo).mean()
        for mult in (1.5, 2.0):
            forte = df["volume"] > vol_media * mult
            s[f"Volume {mult}x media({periodo}) segue candle"] = np.where(
                forte & verde.astype(bool), True,
                np.where(forte & ~verde.astype(bool), False, np.nan))

    return s


# ------------------------------------------------------------- estatistica

def avaliar(previsao, real) -> tuple:
    """Devolve (acertos, total) considerando so os candles com opiniao."""
    prev = pd.Series(previsao).reset_index(drop=True)
    alvo = pd.Series(real).reset_index(drop=True)
    valido = prev.notna() & alvo.notna()
    if valido.sum() == 0:
        return 0, 0
    prev, alvo = prev[valido].astype(bool), alvo[valido].astype(bool)
    return int((prev == alvo).sum()), int(len(prev))


def pvalor(acertos: int, n: int) -> float:
    """
    Probabilidade de obter um resultado tao extremo quanto este por puro
    acaso, se o sinal nao tivesse valor nenhum (taxa verdadeira = 50%).
    Teste bilateral por aproximacao normal.
    """
    if n < 100:
        return 1.0
    z = (acertos / n - 0.5) / math.sqrt(0.25 / n)
    return math.erfc(abs(z) / math.sqrt(2))


def benjamini_hochberg(pvalores: list, alpha: float = 0.05) -> list:
    """
    Corrige para testes multiplos. Devolve a lista de indices aprovados.

    Sem isso, testar 60 sinais a 5% produz ~3 "vencedores" so por acaso.
    """
    m = len(pvalores)
    ordenados = sorted(range(m), key=lambda i: pvalores[i])
    corte = -1
    for posicao, indice in enumerate(ordenados, start=1):
        if pvalores[indice] <= (posicao / m) * alpha:
            corte = posicao
    return ordenados[:corte] if corte > 0 else []


def margem(taxa: float, n: int) -> float:
    return 1.96 * math.sqrt(taxa * (1 - taxa) / n) if n else float("nan")


# -------------------------------------------------------------- a pesquisa

def pesquisar(df: pd.DataFrame, rotulo: str, empate: float, alpha: float = 0.05) -> list:
    """
    Roda a busca completa num conjunto de candles e devolve os sinais que
    sobreviveram as duas travas.
    """
    alvo = (df["close"].shift(-1) > df["open"].shift(-1)).astype(object)
    alvo.iloc[-1] = np.nan

    corte = int(len(df) * 0.70)
    print(f"\n{'='*78}\n{rotulo}")
    print(f"  descoberta: candles 0 a {corte}   |   "
          f"validacao: candles {corte} a {len(df)} (nunca vistos)")

    sinais = gerar_sinais(df)
    print(f"  {len(sinais)} sinais candidatos\n")

    # ---- etapa 1: descoberta
    nomes, pvals, resultados = [], [], {}
    for nome, prev in sinais.items():
        acertos, n = avaliar(pd.Series(prev).iloc[:corte], alvo.iloc[:corte])
        if n < 100:
            continue
        nomes.append(nome)
        pvals.append(pvalor(acertos, n))
        resultados[nome] = (acertos / n, n)

    if not nomes:
        print("  amostra insuficiente.")
        return []

    bruto = [n for n, p in zip(nomes, pvals) if p < alpha]
    aprovados_idx = benjamini_hochberg(pvals, alpha)
    aprovados = [nomes[i] for i in aprovados_idx]

    print(f"  passariam sem correcao (p < {alpha}):      {len(bruto)}"
          f"   <- destes, ~{len(nomes)*alpha:.0f} sao esperados por puro acaso")
    print(f"  passam COM correcao de testes multiplos:  {len(aprovados)}")

    if not aprovados:
        print("\n  Nenhum sinal sobreviveu a etapa de descoberta.")
        return []

    # ---- etapa 2: validacao fora da amostra
    print(f"\n  Testando os {len(aprovados)} sobreviventes em dados NOVOS:\n")
    print(f"  {'sinal':<40} {'descoberta':>11} {'validacao':>17} "
          f"{'real?':>7} {'paga?':>7}")
    confirmados = []
    for nome in aprovados:
        taxa_desc, _ = resultados[nome]
        acertos, n = avaliar(pd.Series(sinais[nome]).iloc[corte:], alvo.iloc[corte:])
        if n < 100:
            print(f"  {nome:<40} {taxa_desc:>10.1%} {'amostra pequena':>17}"
                  f"{'-':>8}{'-':>8}")
            continue
        taxa_val = acertos / n
        m = margem(taxa_val, n)
        # Duas perguntas DIFERENTES, respondidas separadamente:
        #   real  = o sinal preve algo? (piso do intervalo acima de 50%)
        #   paga  = a vantagem cobre o payout da binaria?
        real = (taxa_val - m) > 0.5
        paga = (taxa_val - m) > empate
        if real:
            confirmados.append((nome, taxa_val, m, n, paga))
        print(f"  {nome:<40} {taxa_desc:>10.1%} {taxa_val:>9.1%} ±{m:>5.1%} "
              f"{'SIM' if real else 'nao':>7} {'SIM' if paga else 'nao':>7}")

    return confirmados


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--par", default="BTCUSDT")
    p.add_argument("--payout", type=float, default=0.83)
    p.add_argument("--candles", type=int, default=5000)
    p.add_argument("--autoteste", action="store_true",
                   help="prova que a ferramenta acha sinal real e rejeita ruido")
    args = p.parse_args()

    empate = 1 / (1 + args.payout)

    if args.autoteste:
        return autoteste(empate)

    print(f"\nPar: {args.par}   |   Payout: {args.payout:.0%}   |   "
          f"linha do empate: {empate:.1%}")

    confirmados = []
    for intervalo in ("1m", "5m", "15m"):
        try:
            df = baixar(args.par, intervalo, args.candles)
        except Exception as e:
            print(f"\n[{intervalo}] erro ao baixar: {e}")
            continue
        confirmados += pesquisar(df, f"{args.par} {intervalo}", empate)

    print(f"\n{'='*78}")
    if confirmados:
        print("SINAIS QUE SOBREVIVERAM A TUDO:\n")
        for nome, taxa, m, n, paga in confirmados:
            veredito = ("cobre o payout" if paga
                        else "REAL, mas fraco demais para a binaria")
            print(f"  {nome}: {taxa:.1%} ±{m:.1%} em {n} operacoes  -> {veredito}")
        if not any(c[4] for c in confirmados):
            print("\n  Atencao: existe sinal, mas nenhum forte o bastante para")
            print("  vencer o payout. Em binaria, isso ainda perde dinheiro.")
        print("\nAntes de arriscar dinheiro: repita em outros pares (ETH, SOL)")
        print("e em outro periodo. Vantagem real sobrevive; sorte, nao.")
    else:
        print("NENHUM sinal sobreviveu as duas travas.")
        print("\nIsso nao e' falha da busca - foram dezenas de candidatos, em tres")
        print("prazos. E' o resultado: nesses dados, os sinais tecnicos classicos")
        print(f"nao preveem a direcao do proximo candle melhor que cara-ou-coroa.")
        print(f"Com payout de {args.payout:.0%}, apostar neles perde "
              f"{(0.5*args.payout - 0.5)*100:.1f}% por operacao, em media.")
    print("=" * 78 + "\n")


def autoteste(empate: float):
    """
    Prova que a ferramenta nao esta viciada em dizer "nao".

    Roda a mesma busca em duas series inventadas:
      A) ruido puro          -> ela DEVE nao achar nada
      B) com vantagem real plantada -> ela DEVE achar
    """
    rng = np.random.default_rng(2024)

    def serie(n=6000, plantar=False):
        preco, abre, fecha, alta, baixa = 60000.0, [], [], [], []
        hist = []
        for _ in range(n):
            r = rng.normal(0, 0.0015)
            if plantar and len(hist) >= 14:
                # vantagem plantada: apos 3 quedas seguidas, 60% de chance de subir
                if all(h < 0 for h in hist[-3:]):
                    r = abs(rng.normal(0, 0.0015)) if rng.random() < 0.60 else r
            o = preco
            preco = preco * (1 + r)
            abre.append(o); fecha.append(preco)
            alta.append(max(o, preco) * 1.0004); baixa.append(min(o, preco) * 0.9996)
            hist.append(r)
        return pd.DataFrame({
            "data": pd.date_range("2026-01-01", periods=n, freq="1min", tz="UTC"),
            "open": abre, "close": fecha, "high": alta, "low": baixa,
            "volume": np.abs(rng.normal(100, 25, n))})

    print("\nAUTOTESTE - a ferramenta e' confiavel?\n")

    achou_ruido = pesquisar(serie(plantar=False),
                            "A) RUIDO PURO (o certo e' NAO achar nada)", empate)
    achou_real = pesquisar(serie(plantar=True),
                           "B) COM VANTAGEM PLANTADA (o certo e' ACHAR)", empate)

    print(f"\n{'='*78}")
    ok_a, ok_b = not achou_ruido, bool(achou_real)
    print(f"  A) ruido puro          -> achou {len(achou_ruido)} sinais   "
          f"{'OK (correto)' if ok_a else 'FALHOU: falso positivo'}")
    print(f"  B) vantagem plantada   -> achou {len(achou_real)} sinais   "
          f"{'OK (correto)' if ok_b else 'FALHOU: nao viu o que existia'}")
    print(f"\n  {'Ferramenta confiavel.' if ok_a and ok_b else 'Ferramenta com problema.'}")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    sys.exit(main())
