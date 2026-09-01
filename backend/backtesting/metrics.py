import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
from .models import Trade, PerformanceSummary


def calculate_cagr(start_value: float, end_value: float, num_days: float) -> Optional[float]:
    """Calculate Compound Annual Growth Rate (CAGR)."""
    if start_value <= 0 or end_value <= 0 or num_days < 30:
        return None
    years = num_days / 365.25
    cagr = ((end_value / start_value) ** (1.0 / years) - 1.0) * 100.0
    return round(cagr, 2)


def calculate_max_drawdown(equity_series: pd.Series) -> Tuple[float, int]:
    """
    Calculates Maximum Drawdown % and Maximum Drawdown Duration in days.
    """
    if equity_series.empty or len(equity_series) < 2:
        return 0.0, 0

    running_max = equity_series.cummax()
    drawdown = (equity_series - running_max) / running_max * 100.0
    max_dd = float(drawdown.min())

    # Calculate max duration
    in_drawdown = equity_series < running_max
    current_duration = 0
    max_duration = 0
    for is_dd in in_drawdown:
        if is_dd:
            current_duration += 1
            if current_duration > max_duration:
                max_duration = current_duration
        else:
            current_duration = 0

    return round(abs(max_dd), 2), max_duration


def calculate_sharpe_ratio(daily_returns: pd.Series, risk_free_rate_annual: float = 0.06) -> Optional[float]:
    """
    Calculates annualized Sharpe Ratio.
    Defaults to 6% annual risk-free rate (standard Indian 10-Yr G-Sec baseline).
    """
    if daily_returns.empty or len(daily_returns) < 10:
        return None

    rf_daily = (1 + risk_free_rate_annual) ** (1 / 252) - 1
    excess_returns = daily_returns - rf_daily
    std = excess_returns.std()
    if std == 0 or np.isnan(std):
        return None

    sharpe = (excess_returns.mean() / std) * np.sqrt(252)
    return round(float(sharpe), 2)


def calculate_sortino_ratio(daily_returns: pd.Series, risk_free_rate_annual: float = 0.06) -> Optional[float]:
    """
    Calculates annualized Sortino Ratio focusing on downside volatility.
    """
    if daily_returns.empty or len(daily_returns) < 10:
        return None

    rf_daily = (1 + risk_free_rate_annual) ** (1 / 252) - 1
    excess_returns = daily_returns - rf_daily
    downside_returns = excess_returns[excess_returns < 0]

    if downside_returns.empty:
        return 9.99  # Arbitrary high cap if no downside trades

    downside_std = downside_returns.std()
    if downside_std == 0 or np.isnan(downside_std):
        return None

    sortino = (excess_returns.mean() / downside_std) * np.sqrt(252)
    return round(float(sortino), 2)


def compute_performance_summary(
    trades: List[Trade],
    equity_series: pd.Series,
    benchmark_equity_series: pd.Series,
    num_days: float,
    risk_free_rate_annual: float = 0.06
) -> PerformanceSummary:
    """
    Computes complete, deterministic quantitative metrics for a backtest run.
    """
    total_trades = len(trades)
    start_equity = float(equity_series.iloc[0]) if not equity_series.empty else 100000.0
    end_equity = float(equity_series.iloc[-1]) if not equity_series.empty else start_equity

    start_bm = float(benchmark_equity_series.iloc[0]) if not benchmark_equity_series.empty else 100000.0
    end_bm = float(benchmark_equity_series.iloc[-1]) if not benchmark_equity_series.empty else start_bm

    total_return_pct = round(((end_equity - start_equity) / start_equity) * 100.0, 2)
    bm_return_pct = round(((end_bm - start_bm) / start_bm) * 100.0, 2)
    alpha_pct = round(total_return_pct - bm_return_pct, 2)
    cagr_pct = calculate_cagr(start_equity, end_equity, num_days)

    max_dd_pct, max_dd_days = calculate_max_drawdown(equity_series)

    # Daily returns for Sharpe / Sortino
    daily_returns = equity_series.pct_change().dropna()
    sharpe = calculate_sharpe_ratio(daily_returns, risk_free_rate_annual=risk_free_rate_annual)
    sortino = calculate_sortino_ratio(daily_returns, risk_free_rate_annual=risk_free_rate_annual)

    if total_trades == 0:
        return PerformanceSummary(
            total_return_pct=total_return_pct,
            benchmark_return_pct=bm_return_pct,
            alpha_pct=alpha_pct,
            cagr_pct=cagr_pct,
            win_rate_pct=0.0,
            profit_factor=0.0,
            max_drawdown_pct=max_dd_pct,
            max_drawdown_days=max_dd_days,
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            avg_trade_return_pct=0.0,
            median_trade_return_pct=0.0,
            best_trade_pct=0.0,
            worst_trade_pct=0.0,
            avg_win_pct=0.0,
            avg_loss_pct=0.0,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino
        )

    winning_trades = [t for t in trades if t.net_return_pct > 0]
    losing_trades = [t for t in trades if t.net_return_pct <= 0]

    num_wins = len(winning_trades)
    num_losses = len(losing_trades)
    win_rate = round((num_wins / total_trades) * 100.0, 1)

    gross_profit = sum(t.pnl_amount for t in winning_trades)
    gross_loss = abs(sum(t.pnl_amount for t in losing_trades))

    if gross_loss == 0:
        profit_factor = 99.99 if gross_profit > 0 else 0.0
    else:
        profit_factor = round(gross_profit / gross_loss, 2)

    net_returns = [t.net_return_pct for t in trades]
    avg_trade_ret = round(float(np.mean(net_returns)), 2)
    median_trade_ret = round(float(np.median(net_returns)), 2)
    best_trade = round(float(np.max(net_returns)), 2)
    worst_trade = round(float(np.min(net_returns)), 2)

    win_returns = [t.net_return_pct for t in winning_trades]
    loss_returns = [t.net_return_pct for t in losing_trades]

    avg_win = round(float(np.mean(win_returns)), 2) if win_returns else 0.0
    avg_loss = round(float(np.mean(loss_returns)), 2) if loss_returns else 0.0

    return PerformanceSummary(
        total_return_pct=total_return_pct,
        benchmark_return_pct=bm_return_pct,
        alpha_pct=alpha_pct,
        cagr_pct=cagr_pct,
        win_rate_pct=win_rate,
        profit_factor=profit_factor,
        max_drawdown_pct=max_dd_pct,
        max_drawdown_days=max_dd_days,
        total_trades=total_trades,
        winning_trades=num_wins,
        losing_trades=num_losses,
        avg_trade_return_pct=avg_trade_ret,
        median_trade_return_pct=median_trade_ret,
        best_trade_pct=best_trade,
        worst_trade_pct=worst_trade,
        avg_win_pct=avg_win,
        avg_loss_pct=avg_loss,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino
    )
