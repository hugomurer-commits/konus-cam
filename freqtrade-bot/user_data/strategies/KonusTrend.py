"""
KonusTrend - estrategia de seguimento de tendencia com entrada em pullback.

IDEIA EM UMA FRASE
------------------
So compra moeda que ja esta em tendencia de alta (preco acima da media de 200
periodos), e espera o preco dar uma "respirada" (queda curta) para entrar mais
barato. Sai por alvo de lucro, por trailing stop ou quando a tendencia quebra.

POR QUE ASSIM
-------------
- Operar a favor da tendencia e' o vies com maior evidencia historica em cripto.
- Entrar no pullback melhora o preco medio e reduz o tamanho do stop.
- Apenas COMPRA (spot). Nao usa alavancagem, nao vende a descoberto.
  Sem alavancagem voce nao pode ser liquidado - o pior caso e' a moeda cair.

O QUE ESTA ESTRATEGIA NAO E'
---------------------------
Nao e' garantia de lucro. Ela tem periodos de perda (drawdown), especialmente
em mercado lateral ou em queda longa. As protecoes abaixo existem justamente
para limitar o estrago nesses periodos.
"""

from datetime import datetime

import talib.abstract as ta
from pandas import DataFrame

from freqtrade.strategy import IStrategy
from freqtrade.persistence import Trade
from technical import qtpylib


class KonusTrend(IStrategy):

    INTERFACE_VERSION = 3

    # Spot apenas: sem alavancagem, sem venda a descoberto, sem liquidacao.
    can_short = False

    # Grafico de 1 hora. Menos ruido e menos taxa do que 5m/15m.
    timeframe = "1h"

    # Precisa de 200 candles de historico antes de gerar o primeiro sinal
    # (a media de 200 periodos nao existe antes disso).
    startup_candle_count = 200

    # ---------------------------------------------------------------- saidas

    # Alvo de lucro que afrouxa com o tempo (chave = minutos na operacao).
    # Ex.: nos primeiros 60 min exige 6%; depois de 8h aceita 1,2%.
    minimal_roi = {
        "0": 0.06,
        "60": 0.04,
        "180": 0.025,
        "480": 0.012,
        "1440": 0.0,
    }

    # Stop fixo de seguranca: -8%. E' o teto de perda por operacao.
    stoploss = -0.08

    # Trailing stop: depois que a operacao passa de +3,5% de lucro, o stop
    # sobe junto com o preco mantendo 2% de folga. Protege o lucro ja feito.
    trailing_stop = True
    trailing_stop_positive = 0.02
    trailing_stop_positive_offset = 0.035
    trailing_only_offset_is_reached = True

    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # Nao aumenta posicao no meio da operacao (sem "martingale", sem media
    # para baixo - as duas formas classicas de estourar a conta).
    position_adjustment_enable = False

    # Ordens a mercado: mais simples e sempre executam. Limit economiza taxa,
    # mas pode nao preencher e deixar a estrategia dessincronizada.
    order_types = {
        "entry": "market",
        "exit": "market",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }

    # ------------------------------------------------------------- protecoes
    # Freios automaticos. Se a estrategia entra em maré ruim, ela para sozinha
    # em vez de continuar perdendo. Esta e' a parte que mais protege capital.

    @property
    def protections(self):
        return [
            {
                # Depois de fechar uma operacao, espera 3 candles (3h) antes de
                # reentrar no mesmo par. Evita revenge trading automatico.
                "method": "CooldownPeriod",
                "stop_duration_candles": 3,
            },
            {
                # Se o drawdown passar de 10% na ultima semana, para tudo por 48h.
                "method": "MaxDrawdown",
                "lookback_period_candles": 168,
                "trade_limit": 10,
                "stop_duration_candles": 48,
                "max_allowed_drawdown": 0.10,
            },
            {
                # 3 stops batidos em 72h -> para de abrir posicoes por 24h.
                "method": "StoplossGuard",
                "lookback_period_candles": 72,
                "trade_limit": 3,
                "stop_duration_candles": 24,
                "only_per_pair": False,
            },
            {
                # Par que so da prejuizo fica de castigo.
                "method": "LowProfitPairs",
                "lookback_period_candles": 360,
                "trade_limit": 4,
                "stop_duration_candles": 60,
                "required_profit": -0.02,
            },
        ]

    # ----------------------------------------------------------- indicadores

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Medias moveis: definem a direcao da tendencia.
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)

        # RSI: mede se o preco esta esticado para cima (>70) ou para baixo (<30).
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)

        # ADX: forca da tendencia. Perto de 0 = mercado sem direcao (de lado).
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)

        # ATR: tamanho medio do candle. Usado para medir volatilidade.
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        dataframe["atr_pct"] = dataframe["atr"] / dataframe["close"]

        # Volume medio: filtra candles sem liquidez.
        dataframe["volume_media"] = dataframe["volume"].rolling(20).mean()

        return dataframe

    # --------------------------------------------------------------- entrada

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                # 1. Tendencia de alta confirmada nas duas medias.
                (dataframe["close"] > dataframe["ema200"])
                & (dataframe["ema50"] > dataframe["ema200"])

                # 2. A tendencia tem forca de verdade (nao e' mercado de lado).
                & (dataframe["adx"] > 20)

                # 3. Houve um pullback e o preco esta reagindo: o RSI cruzou
                #    35 para cima. Esse cruzamento e' o gatilho.
                & (qtpylib.crossed_above(dataframe["rsi"], 35))

                # 4. Volatilidade sob controle: evita entrar em par em panico
                #    (candles gigantes) ou em par morto (candles minusculos).
                & (dataframe["atr_pct"] > 0.004)
                & (dataframe["atr_pct"] < 0.06)

                # 5. Liquidez presente no candle do sinal.
                & (dataframe["volume"] > dataframe["volume_media"] * 0.7)
                & (dataframe["volume"] > 0)
            ),
            ["enter_long", "enter_tag"],
        ] = (1, "pullback_em_tendencia")

        return dataframe

    # ----------------------------------------------------------------- saida

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                # A) Preco esticado demais: realiza antes de virar.
                (qtpylib.crossed_above(dataframe["rsi"], 78))
                & (dataframe["volume"] > 0)
            ),
            ["exit_long", "exit_tag"],
        ] = (1, "rsi_esticado")

        dataframe.loc[
            (
                # B) Tendencia quebrou: preco perdeu a media de 200.
                (dataframe["close"] < dataframe["ema200"])
                & (dataframe["close"].shift(1) < dataframe["ema200"].shift(1))
                & (dataframe["volume"] > 0)
            ),
            ["exit_long", "exit_tag"],
        ] = (1, "tendencia_quebrou")

        return dataframe

    # -------------------------------------------------------- stop dinamico

    def custom_stoploss(
        self,
        pair: str,
        trade: Trade,
        current_time: datetime,
        current_rate: float,
        current_profit: float,
        after_fill: bool,
        **kwargs,
    ) -> float:
        """
        Aperta o stop conforme a operacao envelhece sem andar.

        Operacao que fica dias parada no zero a zero esta ocupando capital de
        graca e correndo risco de graca. Depois de 2 dias o stop vira -4%;
        depois de 4 dias, -2%.
        """
        horas = (current_time - trade.open_date_utc).total_seconds() / 3600

        if horas > 96:
            return -0.02
        if horas > 48:
            return -0.04

        # Antes disso, mantem o stop padrao (-8%).
        return self.stoploss
