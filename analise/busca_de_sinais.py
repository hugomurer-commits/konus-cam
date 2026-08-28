#!/usr/bin/env python3
"""
Busca ampla de sinais preditivos - com as travas que impedem falso positivo.

O PROBLEMA
----------
Testar 60 sinais e ficar com o melhor SEMPRE "encontra algo", mesmo em dados
aleatorios. Testar muito e guardar o vencedor nao e' pesquisa, e' loteria com
etapa extra.

AS TRAVAS
---------
1. CORRECAO PARA TESTES MULTIPLOS (Benjamini-Hochberg) sobre a descoberta.
2. VALIDACAO FORA DA AMOSTRA em dados que o sinal nunca viu.
3. WALK-FORWARD (--janelas N): repete descoberta+validacao em N janelas
   sequenciais. Vantagem real reaparece em varias janelas; ajuste a um
   regime especifico aparece em uma so.
4. RELATORIO DE POTENCIA: quando a amostra e' pequena demais para separar
   "sem vantagem" de "vantagem lucrativa", ele diz isso em vez de concluir.

Uso:
    pip install requests pandas numpy
    python3 busca_de_sinais.py
    python3 busca_de_sinais.py --par ETHUSDT --janelas 4 --candles 20000
    python3 busca_de_sinais.py --autoteste
"""

import argparse
import math
import sys

import numpy as np
import pandas as pd

from testar_previsao import baixar, rsi


# ------------------------------------------------------- catalogo de sinais

def gerar_sinais(df: pd.DataFrame) -> dict:
    """
    Variacoes dos sinais tecnicos classicos.

    Cada sinal e' um vetor com True (aposta que sobe), False (aposta que
    desce) ou NaN (sem opiniao).

    IMPORTANTE - sem inversos: "Reversao" e' o complemento exato de
    "Momentum", e "Bollinger rompe" o de "Bollinger toque". Incluir os dois
    testa a MESMA hipotese duas vezes: infla o numero de testes (deixando o
    BH conservador a toa) sem adicionar informacao. A direcao e' tratada na
    avaliacao, pelo teste bilateral - um sinal com 43% de acerto e' o mesmo
    achado que seu inverso com 57%.
    """
    s = {}
    fechamento = df["close"]
    verde = (df["close"] > df["open"]).astype(object)

    for periodo in (7, 14, 21):
        r = rsi(fechamento, periodo)
        for piso in (20, 25, 30, 35):
            teto = 100 - piso
            s[f"RSI{periodo} <{piso} sobe / >{teto} desce"] = np.where(
                r < piso, True, np.where(r > teto, False, np.nan))
            s[f"RSI{periodo} cruza {piso} pra cima"] = np.where(
                (r > piso) & (r.shift(1) <= piso), True,
                np.where((r < teto) & (r.shift(1) >= teto), False, np.nan))

    for rapida, lenta in ((5, 20), (9, 21), (10, 50), (20, 50), (50, 200)):
        er = fechamento.ewm(span=rapida, adjust=False).mean()
        el = fechamento.ewm(span=lenta, adjust=False).mean()
        s[f"EMA{rapida} acima da EMA{lenta}"] = np.where(er > el, True, False).astype(object)
        s[f"EMA{rapida} cruza EMA{lenta}"] = np.where(
            (er > el) & (er.shift(1) <= el.shift(1)), True,
            np.where((er < el) & (er.shift(1) >= el.shift(1)), False, np.nan))

    for rapida, lenta, sinal_n in ((12, 26, 9), (5, 35, 5)):
        linha = (fechamento.ewm(span=rapida, adjust=False).mean()
                 - fechamento.ewm(span=lenta, adjust=False).mean())
        sig = linha.ewm(span=sinal_n, adjust=False).mean()
        rot = f"MACD({rapida},{lenta},{sinal_n})"
        s[f"{rot} acima do sinal"] = np.where(linha > sig, True, False).astype(object)
        s[f"{rot} cruzamento"] = np.where(
            (linha > sig) & (linha.shift(1) <= sig.shift(1)), True,
            np.where((linha < sig) & (linha.shift(1) >= sig.shift(1)), False, np.nan))

    for k in (1, 2, 3, 4):
        alta = verde.shift(1).astype(bool)
        baixa = ~verde.shift(1).astype(bool)
        for i in range(2, k + 1):
            alta &= verde.shift(i).astype(bool)
            baixa &= ~verde.shift(i).astype(bool)
        s[f"Momentum: {k} candle(s) na mesma direcao"] = np.where(
            alta, True, np.where(baixa, False, np.nan))

    for periodo in (10, 20, 30):
        media = fechamento.rolling(periodo).mean()
        desvio = fechamento.rolling(periodo).std()
        for k in (1.5, 2.0, 2.5):
            sup, inf = media + k * desvio, media - k * desvio
            s[f"Bollinger({periodo},{k}) toque = reverte"] = np.where(
                fechamento < inf, True, np.where(fechamento > sup, False, np.nan))

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
    prev = pd.Series(previsao).reset_index(drop=True)
    alvo = pd.Series(real).reset_index(drop=True)
    valido = prev.notna() & alvo.notna()
    if valido.sum() == 0:
        return 0, 0
    prev, alvo = prev[valido].astype(bool), alvo[valido].astype(bool)
    return int((prev == alvo).sum()), int(len(prev))


def pvalor(acertos: int, n: int) -> float:
    """Teste BILATERAL contra 50%: um sinal anti-preditivo tambem e' achado."""
    if n < 100:
        return 1.0
    z = (acertos / n - 0.5) / math.sqrt(0.25 / n)
    return math.erfc(abs(z) / math.sqrt(2))


def benjamini_hochberg(pvalores: list, alpha: float = 0.05) -> list:
    m = len(pvalores)
    if m == 0:
        return []
    ordenados = sorted(range(m), key=lambda i: pvalores[i])
    corte = 0
    for posicao, indice in enumerate(ordenados, start=1):
        if pvalores[indice] <= (posicao / m) * alpha:
            corte = posicao
    return ordenados[:corte]


def margem(taxa: float, n: int) -> float:
    return 1.96 * math.sqrt(taxa * (1 - taxa) / n) if n else float("nan")


# ------------------------------------------------------------ uma janela

def uma_janela(sinais: dict, alvo, ini_t: int, fim_t: int, fim_v: int,
               empate: float, alpha: float) -> tuple:
    """
    Descobre em [ini_t, fim_t) e valida em [fim_t, fim_v).

    Devolve (aprovados_na_descoberta, resultados_da_validacao, n_testados).
    Cada resultado: (nome, taxa_dirigida, margem, n, invertido, real, paga).
    """
    nomes, pvals, taxas_desc = [], [], {}
    for nome, prev in sinais.items():
        a, n = avaliar(pd.Series(prev).iloc[ini_t:fim_t], alvo.iloc[ini_t:fim_t])
        if n < 100:
            continue
        nomes.append(nome)
        pvals.append(pvalor(a, n))
        taxas_desc[nome] = a / n

    aprovados = [nomes[i] for i in benjamini_hochberg(pvals, alpha)]
    brutos = sum(p < alpha for p in pvals)

    resultados = []
    for nome in aprovados:
        a, n = avaliar(pd.Series(sinais[nome]).iloc[fim_t:fim_v], alvo.iloc[fim_t:fim_v])
        if n < 100:
            continue
        # A descoberta define a DIRECAO da aposta. Sinal que acertou 43% na
        # descoberta e' uma aposta invertida - e' assim que o achado
        # bilateral vira previsao. Sem isso, sinais anti-preditivos entram
        # na lista e morrem na validacao por construcao, poluindo o relatorio.
        invertido = taxas_desc[nome] < 0.5
        taxa = (1 - a / n) if invertido else (a / n)
        m = margem(taxa, n)
        resultados.append((nome, taxa, m, n, invertido,
                           (taxa - m) > 0.5, (taxa - m) > empate))
    return brutos, len(aprovados), resultados, len(nomes)


def pesquisar(df: pd.DataFrame, rotulo: str, empate: float,
              janelas: int = 1, alpha: float = 0.05) -> dict:
    alvo = (df["close"].shift(-1) > df["open"].shift(-1)).astype(object)
    alvo.iloc[-1] = np.nan
    sinais = gerar_sinais(df)

    print(f"\n{'='*80}\n{rotulo}   |   {len(sinais)} sinais candidatos")

    # Walk-forward: metade inicial sempre treina; a outra metade vira N
    # blocos de teste, cada um precedido por todo o historico anterior.
    base = len(df) // 2
    bloco = (len(df) - base) // janelas
    if bloco < 200:
        janelas, bloco = 1, len(df) - base
        print("  (poucos candles para walk-forward; usando janela unica)")

    placar = {}
    for j in range(janelas):
        fim_t = base + j * bloco
        fim_v = fim_t + bloco
        brutos, n_aprov, resultados, n_test = uma_janela(
            sinais, alvo, 0, fim_t, fim_v, empate, alpha)
        print(f"\n  janela {j+1}/{janelas}: treino 0-{fim_t}, teste {fim_t}-{fim_v}")
        print(f"    {n_test} testados | {brutos} passariam sem correcao | "
              f"{n_aprov} passam com BH | {len(resultados)} chegaram na validacao")
        for nome, taxa, m, n, inv, real, paga in resultados:
            rot = nome + (" [INVERTIDO]" if inv else "")
            marca = "REAL+PAGA" if paga else ("REAL" if real else "-")
            print(f"      {rot:<46} {taxa:>6.1%} ±{m:.1%}  n={n:<5} {marca}")
            if real:
                placar.setdefault(nome, []).append((taxa, m, n, inv, paga))

    # bloco = candles por janela de validacao. E' o N MAXIMO possivel, de um
    # sinal que dispara em todo candle; quem dispara menos tem menos potencia.
    return {"placar": placar, "janelas": janelas, "bloco": bloco}


# ---------------------------------------------------------------- relatorio

def relatorio(achados: list, empate: float, args, escopo: list):
    print(f"\n{'='*80}")
    total_janelas = sum(a["janelas"] for a in achados)
    placar_geral = {}
    for a in achados:
        for nome, confirmacoes in a["placar"].items():
            placar_geral.setdefault(nome, []).extend(confirmacoes)

    if placar_geral:
        print("SINAIS QUE CONFIRMARAM FORA DA AMOSTRA:\n")
        for nome, cs in sorted(placar_geral.items(), key=lambda x: -len(x[1])):
            taxas = [c[0] for c in cs]
            paga = sum(c[4] for c in cs)
            print(f"  {nome}")
            print(f"    confirmou em {len(cs)} de {total_janelas} janelas | "
                  f"acerto {min(taxas):.1%}-{max(taxas):.1%} | "
                  f"cobriu o payout em {paga} delas")
        print("\n  Confirmar em 1 de varias janelas e' ajuste a um regime, nao")
        print("  vantagem. Exija a maioria antes de arriscar dinheiro.")
    else:
        print("NENHUM sinal confirmou fora da amostra.")

    # ---- potencia: o que esta amostra conseguiria ter detectado?
    print(f"\n{'-'*80}\nPOTENCIA E ESCOPO - o que este teste podia e nao podia enxergar\n")
    print("  A confirmacao e' POR JANELA, entao a potencia tambem e' por janela -")
    print("  somar o N das janelas superestimaria o que o teste enxerga.\n")
    for rot, bloco, janelas in escopo:
        print(f"  {rot}: {janelas} janela(s) de {bloco} candles de validacao")
        for descricao, fracao in (("dispara em todo candle", 1.0),
                                  ("dispara em 20% dos candles", 0.20),
                                  ("dispara em 5% dos candles", 0.05)):
            n = int(bloco * fracao)
            if n < 30:
                print(f"      {descricao:<28} n={n:<6} amostra pequena demais")
                continue
            detectavel = empate + margem(0.55, n)
            aviso = "  <- SUBPOTENTE" if detectavel > 0.60 else ""
            print(f"      {descricao:<28} n={n:<6} so detecta acima de "
                  f"{detectavel:.1%}{aviso}")
        print()

    por_prazo = achados[0]["janelas"] if achados else 0
    print(f"\n  Medido: {args.par}, {args.candles} candles por prazo, "
          f"alvo = corpo do candle seguinte,")
    print(f"  custo = apenas o payout de {args.payout:.0%} (sem spread nem "
          f"slippage),")
    print(f"  {por_prazo} janela(s) por prazo em {len(achados)} prazo(s).")
    perda = abs(0.5 * args.payout - 0.5) * 100
    print(f"\n  Com payout de {args.payout:.0%}, acertar 50% custa {perda:.1f}% "
          f"por aposta.")
    print("\n  'Nao confirmou' aqui significa 'nao confirmou NESTA amostra' -")
    print("  nao e' prova de que a vantagem nao existe. Amostra maior e mais")
    print("  pares e' o proximo passo, nao uma conclusao diferente.")
    print("=" * 80 + "\n")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--par", default="BTCUSDT")
    p.add_argument("--payout", type=float, default=0.83)
    p.add_argument("--candles", type=int, default=5000)
    p.add_argument("--janelas", type=int, default=1,
                   help="numero de janelas de walk-forward (1 = split unico)")
    p.add_argument("--autoteste", action="store_true")
    args = p.parse_args()

    empate = 1 / (1 + args.payout)

    if args.autoteste:
        return autoteste(empate)

    print(f"\nPar: {args.par}   |   Payout: {args.payout:.0%}   |   "
          f"empate em {empate:.1%}   |   {args.janelas} janela(s)")

    achados, escopo, analisados = [], [], 0
    for intervalo in ("1m", "5m", "15m"):
        try:
            df = baixar(args.par, intervalo, args.candles)
        except Exception as e:
            print(f"\n[{intervalo}] erro ao baixar: {e}")
            continue
        analisados += 1
        r = pesquisar(df, f"{args.par} {intervalo}", empate, args.janelas)
        achados.append(r)
        escopo.append((f"{args.par} {intervalo}", r["bloco"], r["janelas"]))

    if analisados == 0:
        print(f"\n{'='*80}\nNADA FOI MEDIDO - nenhum candle foi baixado.")
        print("\nOs erros acima sao de conexao, nao resultado de analise.")
        print("Causas comuns: sem internet, firewall/proxy, VPN, ou a Binance")
        print("bloqueada na sua rede. Resolva o acesso e rode de novo.")
        print("\nNAO conclua nada sobre os sinais a partir desta execucao.")
        print("=" * 80 + "\n")
        return 1

    relatorio(achados, empate, args, escopo)


def autoteste(empate: float):
    """
    Tres bracos, porque dois nao bastavam:
      A) ruido puro, VARIAS sementes -> mede quanto o BH realmente corta
      B) vantagem plantada           -> a busca precisa achar
      C) ruido puro, janela unica    -> nao pode achar nada
    """
    def serie(semente, plantar=False, n=6000):
        rng = np.random.default_rng(semente)
        preco, abre, fecha, alta, baixa, hist = 60000.0, [], [], [], [], []
        for _ in range(n):
            r = rng.normal(0, 0.0015)
            if plantar and len(hist) >= 3 and all(h < 0 for h in hist[-3:]):
                if rng.random() < 0.62:
                    r = abs(rng.normal(0, 0.0015))
            o = preco
            preco *= (1 + r)
            abre.append(o); fecha.append(preco)
            alta.append(max(o, preco) * 1.0004); baixa.append(min(o, preco) * 0.9996)
            hist.append(r)
        return pd.DataFrame({
            "open": abre, "close": fecha, "high": alta, "low": baixa,
            "volume": np.abs(rng.normal(100, 25, n))})

    print("\nAUTOTESTE - a ferramenta e' confiavel?\n")

    # --- A) o BH corta mesmo? Uma semente so nao responde isso.
    print("=" * 80)
    print("A) RUIDO PURO em 15 sementes - o BH esta fazendo trabalho?\n")
    brutos, corrigidos = [], []
    for semente in range(15):
        df = serie(semente)
        alvo = (df["close"].shift(-1) > df["open"].shift(-1)).astype(object)
        alvo.iloc[-1] = np.nan
        b, c, _, _ = uma_janela(gerar_sinais(df), alvo, 0, 4200, 6000, empate, 0.05)
        brutos.append(b); corrigidos.append(c)
    b, c = np.array(brutos), np.array(corrigidos)
    print(f"  falsos positivos SEM correcao: media {b.mean():.1f}  max {b.max()}")
    print(f"  falsos positivos COM correcao: media {c.mean():.1f}  max {c.max()}")
    print(f"  sementes com algo para o BH cortar: {(b > 0).sum()}/15")
    ok_bh = (b.max() > 0) and (c.max() == 0)
    print(f"  -> {'OK: o BH corta o que aparece' if ok_bh else 'FALHOU'}")

    # --- B) acha vantagem real?
    dfb = serie(99, plantar=True)
    rb = pesquisar(dfb, "B) COM VANTAGEM PLANTADA (o certo e' ACHAR)", empate, janelas=1)
    ok_b = bool(rb["placar"])

    # --- C) inventa vantagem em ruido?
    dfc = serie(7)
    rc = pesquisar(dfc, "C) RUIDO PURO (o certo e' NAO achar nada)", empate, janelas=1)
    ok_c = not rc["placar"]

    print(f"\n{'='*80}")
    print(f"  A) BH corta falso positivo      {'OK' if ok_bh else 'FALHOU'}")
    print(f"  B) acha vantagem real           "
          f"{'OK' if ok_b else 'FALHOU: nao viu o que existia'}")
    print(f"  C) nao inventa em ruido         "
          f"{'OK' if ok_c else 'FALHOU: falso positivo'}")
    print(f"\n  {'Ferramenta confiavel.' if (ok_bh and ok_b and ok_c) else 'PROBLEMA - nao confie na saida.'}")
    print("=" * 80 + "\n")
    return 0 if (ok_bh and ok_b and ok_c) else 1


if __name__ == "__main__":
    sys.exit(main())
