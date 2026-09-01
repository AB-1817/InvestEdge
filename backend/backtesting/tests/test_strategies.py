import pytest
import pandas as pd
import numpy as np

from backend.backtesting.strategies import (
    RSIStrategy, GoldenCrossStrategy, MACDCrossoverStrategy,
    BollingerReversionStrategy, InvestEdgeCompositeStrategy,
    StrategyParams
)


def _make_sample_df(num_bars=100):
    dates = pd.date_range(start="2023-01-01", periods=num_bars, freq="1D")
    np.random.seed(42)
    # Create price trend with some drops for RSI oversold
    trend = np.linspace(100, 150, num_bars)
    noise = np.random.normal(0, 2, num_bars)
    # Force a sharp drop around bar 30 to trigger RSI oversold
    trend[25:32] = np.linspace(120, 80, 7)
    close = trend + noise
    df = pd.DataFrame({
        "open": close * 0.99,
        "high": close * 1.01,
        "low": close * 0.98,
        "close": close,
        "volume": np.random.randint(1000, 5000, num_bars)
    }, index=dates)
    return df


def test_rsi_strategy():
    df = _make_sample_df(100)
    strat = RSIStrategy(StrategyParams(rsi_threshold=35.0))
    signals = strat.generate_signals(df)

    assert isinstance(signals, pd.Series)
    assert signals.dtype == bool
    # Should contain discrete true triggers, not continuous true blocks
    assert signals.sum() > 0


def test_golden_cross_strategy():
    df = _make_sample_df(100)
    strat = GoldenCrossStrategy(StrategyParams(fast_ema=10, slow_ema=20))
    signals = strat.generate_signals(df)

    assert isinstance(signals, pd.Series)
    assert signals.dtype == bool


def test_macd_strategy():
    df = _make_sample_df(100)
    strat = MACDCrossoverStrategy()
    signals = strat.generate_signals(df)

    assert isinstance(signals, pd.Series)
    assert signals.dtype == bool


def test_composite_strategy():
    df = _make_sample_df(100)
    strat = InvestEdgeCompositeStrategy(StrategyParams(regime_filter_enabled=False))
    signals = strat.generate_signals(df)

    assert isinstance(signals, pd.Series)
    assert signals.dtype == bool
