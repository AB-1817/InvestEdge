import pandas as pd
import numpy as np
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from .models import StrategyParams


# ─── Technical Helpers (pure pandas/numpy) ───────────────────────────────────

def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()


def _rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=length - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=length - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(series: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    sig_line = _ema(macd_line, signal)
    histogram = macd_line - sig_line
    return macd_line, sig_line, histogram


def _bbands(series: pd.Series, length=20, std=2):
    mid = series.rolling(length).mean()
    sigma = series.rolling(length).std()
    return mid + std * sigma, mid, mid - std * sigma


# ─── Base Strategy Class ──────────────────────────────────────────────────────

class AbstractStrategy(ABC):
    """
    Abstract Base Class for all InvestEdge Backtesting Strategies.
    """
    def __init__(self, params: Optional[StrategyParams] = None):
        self.params = params or StrategyParams()

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        """
        Takes a dataframe with OHLCV data and returns a boolean pd.Series
        where True represents a BUY signal event generated at time t (close).
        """
        pass


# ─── Strategy 1: RSI Mean Reversion ──────────────────────────────────────────

class RSIStrategy(AbstractStrategy):
    """
    Generates BUY signal on first day RSI drops below threshold (e.g. 32).
    Tracks discrete trigger events rather than redundant contiguous days.
    """
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        rsi = _rsi(df["close"], 14)
        is_oversold = rsi < self.params.rsi_threshold
        # Trigger on crossover into oversold territory
        signal_events = is_oversold & (~is_oversold.shift(1).fillna(False))
        return signal_events


# ─── Strategy 2: Golden Cross ─────────────────────────────────────────────────

class GoldenCrossStrategy(AbstractStrategy):
    """
    Generates BUY signal when fast EMA (EMA20) crosses strictly above slow EMA (EMA50).
    """
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        ema_fast = _ema(df["close"], self.params.fast_ema)
        ema_slow = _ema(df["close"], self.params.slow_ema)

        above = ema_fast > ema_slow
        crossover = above & (~above.shift(1).fillna(False))
        return crossover


# ─── Strategy 3: MACD Crossover ───────────────────────────────────────────────

class MACDCrossoverStrategy(AbstractStrategy):
    """
    Generates BUY signal when MACD line crosses above Signal line.
    """
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        macd_line, sig_line, _ = _macd(df["close"], 12, 26, 9)
        above = macd_line > sig_line
        crossover = above & (~above.shift(1).fillna(False))
        return crossover


# ─── Strategy 4: Bollinger Band Mean Reversion ───────────────────────────────

class BollingerReversionStrategy(AbstractStrategy):
    """
    Generates BUY signal when Close breaks below lower Bollinger Band and RSI < 40.
    """
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        _, _, bb_lower = _bbands(df["close"], 20, self.params.bb_std)
        rsi = _rsi(df["close"], 14)

        touch_lower = (df["close"] < bb_lower) & (rsi < 40)
        crossover = touch_lower & (~touch_lower.shift(1).fillna(False))
        return crossover


# ─── Strategy 5: InvestEdge Composite Signal ──────────────────────────────────

class InvestEdgeCompositeStrategy(AbstractStrategy):
    """
    Combines:
    1. Technical alignment (EMA20 > EMA50)
    2. Volume confirmation (Volume > 1.5x 20-day avg volume)
    3. RSI momentum (40 < RSI < 65)
    4. Nifty 50 Macro Regime Filter (Nifty 50 not in Bear Phase: Nifty > Nifty EMA50)
    """
    def generate_signals(self, df: pd.DataFrame, nifty_df: Optional[pd.DataFrame] = None) -> pd.Series:
        ema20 = _ema(df["close"], self.params.fast_ema)
        ema50 = _ema(df["close"], self.params.slow_ema)
        rsi = _rsi(df["close"], 14)
        avg_vol = df["volume"].rolling(20).mean()

        tech_bull = (ema20 > ema50) & (df["close"] > ema20)
        vol_surge = df["volume"] > (avg_vol * self.params.volume_surge_mult)
        rsi_valid = (rsi >= 40) & (rsi <= 65)

        base_condition = tech_bull & vol_surge & rsi_valid

        # Nifty 50 Regime Filter
        if self.params.regime_filter_enabled and nifty_df is not None and not nifty_df.empty:
            nifty_close = nifty_df["close"]
            nifty_ema50 = _ema(nifty_close, 50)
            nifty_bullish = nifty_close > nifty_ema50
            # Reindex nifty bullish state to stock dataframe dates
            regime_filter = nifty_bullish.reindex(df.index, method="ffill").fillna(True)
            base_condition = base_condition & regime_filter

        crossover = base_condition & (~base_condition.shift(1).fillna(False))
        return crossover


# ─── Strategy Factory ─────────────────────────────────────────────────────────

STRATEGY_MAP = {
    "rsi_reversion": RSIStrategy,
    "golden_cross": GoldenCrossStrategy,
    "macd_crossover": MACDCrossoverStrategy,
    "bollinger_reversion": BollingerReversionStrategy,
    "composite_investedge": InvestEdgeCompositeStrategy,
}


function_get_strategy = None  # Helper type annotation placeholder


def get_strategy(strategy_name: str, params: Optional[StrategyParams] = None) -> AbstractStrategy:
    """Factory function to instantiate a strategy by name."""
    cls = STRATEGY_MAP.get(strategy_name.lower())
    if not cls:
        raise ValueError(f"Unknown strategy '{strategy_name}'. Available: {list(STRATEGY_MAP.keys())}")
    return cls(params)
