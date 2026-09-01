import pytest
import pandas as pd
import numpy as np

from backend.backtesting.metrics import (
    calculate_cagr, calculate_max_drawdown,
    calculate_sharpe_ratio, calculate_sortino_ratio,
    compute_performance_summary
)
from backend.backtesting.models import Trade


def test_calculate_cagr():
    # 100,000 -> 200,000 in 365.25 days = 100% CAGR
    cagr = calculate_cagr(100000.0, 200000.0, 365.25)
    assert cagr == 100.0

    # Insufficient days -> None
    assert calculate_cagr(100.0, 150.0, 10.0) is None


def test_calculate_max_drawdown():
    # Peak at 100, drops to 50, recovers to 120
    s = pd.Series([100, 110, 120, 90, 60, 80, 130])
    max_dd, duration = calculate_max_drawdown(s)
    # Peak was 120, drop to 60 is 50% drawdown
    assert max_dd == 50.0
    assert duration >= 2


def test_calculate_sharpe_ratio():
    # Constant positive returns -> positive Sharpe
    returns = pd.Series([0.01, 0.012, 0.008, 0.011, 0.009] * 10)
    sharpe = calculate_sharpe_ratio(returns, risk_free_rate_annual=0.06)
    assert sharpe is not None
    assert sharpe > 0


def test_compute_performance_summary():
    trades = [
        Trade(
            trade_id=1, symbol="TEST", signal_date="2024-01-01",
            entry_date="2024-01-02", entry_price=100.0, exit_date="2024-01-17",
            exit_price=110.0, holding_days=15, gross_return_pct=10.0,
            net_return_pct=9.5, pnl_amount=9500.0, exit_reason="holding_period",
            regime_at_entry="Bull Run"
        ),
        Trade(
            trade_id=2, symbol="TEST", signal_date="2024-02-01",
            entry_date="2024-02-02", entry_price=100.0, exit_date="2024-02-17",
            exit_price=95.0, holding_days=15, gross_return_pct=-5.0,
            net_return_pct=-5.3, pnl_amount=-5300.0, exit_reason="stop_loss",
            regime_at_entry="Bull Run"
        )
    ]

    eq_series = pd.Series([100000.0, 109500.0, 104200.0])
    bm_series = pd.Series([100000.0, 101000.0, 102000.0])

    summary = compute_performance_summary(trades, eq_series, bm_series, num_days=60.0)

    assert summary.total_trades == 2
    assert summary.winning_trades == 1
    assert summary.losing_trades == 1
    assert summary.win_rate_pct == 50.0
    assert summary.profit_factor > 1.0
    assert summary.best_trade_pct == 9.5
    assert summary.worst_trade_pct == -5.3
