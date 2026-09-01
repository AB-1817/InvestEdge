import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

from .models import (
    BacktestRequest, BacktestResult, Trade, EquityPoint,
    PerformanceSummary, SignalEvidenceResponse
)
from .data import fetch_historical_ohlcv, validate_ohlcv_data
from .strategies import get_strategy, _ema
from .metrics import compute_performance_summary


def run_backtest(req: BacktestRequest) -> BacktestResult:
    """
    Executes a deterministic, reproducible backtest simulation.
    Strictly protects against look-ahead bias by executing signals on the next session Open.
    """
    # 1. Fetch & Validate Data
    df = fetch_historical_ohlcv(req.symbol, period=req.period)
    valid, err_msg = validate_ohlcv_data(df)
    if not valid:
        raise ValueError(f"Data validation error for {req.symbol}: {err_msg}")

    # Fetch Benchmark Data
    nifty_df = None
    if req.params and req.params.regime_filter_enabled or req.benchmark_symbol == "^NSEI":
        try:
            nifty_df = fetch_historical_ohlcv(req.benchmark_symbol, period=req.period)
        except Exception:
            nifty_df = None

    benchmark_df = nifty_df if (nifty_df is not None and not nifty_df.empty) else df

    # 2. Instantiate Strategy & Generate Signals
    strategy = get_strategy(req.strategy_name, req.params)
    signal_series = strategy.generate_signals(df, nifty_df=nifty_df)

    # 3. Simulate Trade Execution Engine
    trades: List[Trade] = []
    capital = req.initial_capital
    fee_mult = req.fee_pct / 100.0
    slip_mult = req.slippage_pct / 100.0

    dates = df.index
    n_bars = len(df)
    in_trade = False
    active_trade_exit_bar = -1

    # Track Nifty regime for metadata tagging
    regime_series = None
    if nifty_df is not None and not nifty_df.empty:
        n_close = nifty_df["close"]
        n_ema50 = _ema(n_close, 50)
        n_regime = np.where(n_close > n_ema50, "Bull Run", "Bear Phase")
        regime_series = pd.Series(n_regime, index=nifty_df.index).reindex(df.index, method="ffill").fillna("Sideways")

    trade_count = 0

    for i in range(n_bars - 1):
        # Skip if currently holding position to prevent overlapping trades
        if i <= active_trade_exit_bar:
            continue

        # Check for Signal Event at bar i (Close)
        if signal_series.iloc[i]:
            # Execution Day: Next session bar i + 1
            entry_bar = i + 1 if req.execution_mode == "next_open" else i
            if entry_bar >= n_bars:
                break  # Incomplete signal at very end of dataset

            entry_date_str = str(dates[entry_bar])[:10]
            sig_date_str = str(dates[i])[:10]

            # Raw prices
            raw_entry_price = float(df["open"].iloc[entry_bar] if req.execution_mode == "next_open" else df["close"].iloc[entry_bar])
            if raw_entry_price <= 0:
                continue

            # Effective Entry Price with Slippage & Fee
            effective_entry = raw_entry_price * (1.0 + slip_mult)
            entry_cost_per_share = effective_entry * (1.0 + fee_mult)

            # Target exit horizon
            planned_exit_bar = min(entry_bar + req.holding_days, n_bars - 1)

            # Check if dataset terminates before holding period completes
            if entry_bar + req.holding_days >= n_bars:
                # Incomplete forward horizon -> Exclude from finalized trade stats to prevent truncation bias
                break

            actual_exit_bar = planned_exit_bar
            exit_reason = "holding_period"
            raw_exit_price = float(df["close"].iloc[planned_exit_bar])

            # Check for Stop-Loss or Take-Profit Triggers during holding period
            sl_price = raw_entry_price * (1.0 - (req.stop_loss_pct / 100.0)) if req.stop_loss_pct else None
            tp_price = raw_entry_price * (1.0 + (req.take_profit_pct / 100.0)) if req.take_profit_pct else None

            for h_idx in range(entry_bar, planned_exit_bar + 1):
                bar_low = float(df["low"].iloc[h_idx])
                bar_high = float(df["high"].iloc[h_idx])

                if sl_price and bar_low <= sl_price:
                    actual_exit_bar = h_idx
                    raw_exit_price = sl_price
                    exit_reason = "stop_loss"
                    break
                elif tp_price and bar_high >= tp_price:
                    actual_exit_bar = h_idx
                    raw_exit_price = tp_price
                    exit_reason = "take_profit"
                    break

            exit_date_str = str(dates[actual_exit_bar])[:10]
            holding_len = max(1, actual_exit_bar - entry_bar)

            # Effective Exit Price with Slippage & Fee
            effective_exit = raw_exit_price * (1.0 - slip_mult)
            exit_proceeds_per_share = effective_exit * (1.0 - fee_mult)

            # Return Calculations
            gross_return_pct = round(((raw_exit_price - raw_entry_price) / raw_entry_price) * 100.0, 2)
            net_return_pct = round(((exit_proceeds_per_share - entry_cost_per_share) / entry_cost_per_share) * 100.0, 2)

            alloc_capital = capital * (req.position_size_pct / 100.0)
            pnl_amount = round(alloc_capital * (net_return_pct / 100.0), 2)

            regime_val = str(regime_series.iloc[i]) if regime_series is not None else "N/A"

            trade_count += 1
            trade = Trade(
                trade_id=trade_count,
                symbol=req.symbol.upper(),
                signal_date=sig_date_str,
                entry_date=entry_date_str,
                entry_price=round(raw_entry_price, 2),
                exit_date=exit_date_str,
                exit_price=round(raw_exit_price, 2),
                holding_days=holding_len,
                gross_return_pct=gross_return_pct,
                net_return_pct=net_return_pct,
                pnl_amount=pnl_amount,
                exit_reason=exit_reason,
                regime_at_entry=regime_val
            )
            trades.append(trade)
            active_trade_exit_bar = actual_exit_bar

    # 4. Generate Daily Equity Curve & Benchmark Series
    equity_points: List[EquityPoint] = []
    strat_equity = req.initial_capital

    # Benchmark initial price
    bm_start_price = float(benchmark_df["close"].iloc[0]) if not benchmark_df.empty else 1.0
    stock_start_price = float(df["close"].iloc[0]) if not df.empty else 1.0

    trade_map = {t.entry_date: t for t in trades}
    active_t: Optional[Trade] = None
    active_t_end_idx = -1

    equity_values = []

    for i in range(n_bars):
        d_str = str(dates[i])[:10]
        cur_stock_p = float(df["close"].iloc[i])

        # Check if trade starts today
        if d_str in trade_map:
            active_t = trade_map[d_str]

        if active_t:
            # Current PnL of active trade
            ret_ratio = (cur_stock_p - active_t.entry_price) / active_t.entry_price
            alloc_cap = strat_equity * (req.position_size_pct / 100.0)
            cur_equity = strat_equity + (alloc_cap * ret_ratio)

            if d_str == active_t.exit_date:
                # Realize trade PnL
                strat_equity += active_t.pnl_amount
                cur_equity = strat_equity
                active_t = None
        else:
            cur_equity = strat_equity

        equity_values.append(cur_equity)

        # Benchmark Equity (Nifty 50 or Stock Buy-Hold)
        bm_cur_price = float(benchmark_df["close"].reindex(df.index, method="ffill").iloc[i]) if not benchmark_df.empty else cur_stock_p
        bm_equity = req.initial_capital * (bm_cur_price / bm_start_price)

        equity_points.append(EquityPoint(
            date=d_str,
            strategy_equity=round(cur_equity, 2),
            benchmark_equity=round(bm_equity, 2),
            drawdown_pct=0.0  # Will update below
        ))

    # Compute Drawdown Series
    eq_series = pd.Series([ep.strategy_equity for ep in equity_points])
    bm_series = pd.Series([ep.benchmark_equity for ep in equity_points])
    peak = eq_series.cummax()
    dd_series = (eq_series - peak) / peak * 100.0

    for idx, ep in enumerate(equity_points):
        ep.drawdown_pct = round(abs(float(dd_series.iloc[idx])), 2)

    # 5. Compute Quantitative Metrics
    num_days = (dates[-1] - dates[0]).days if len(dates) > 1 else 1.0
    summary = compute_performance_summary(
        trades, eq_series, bm_series, num_days,
        risk_free_rate_annual=req.risk_free_rate_pct / 100.0
    )

    disp_name = req.symbol.upper().replace(".NS", "").replace(".BO", "")

    params_metadata = req.model_dump()
    params_metadata["price_basis"] = "auto_adjusted_split_and_dividend"
    params_metadata["engine_version"] = "v1.0.0-investedge"

    disclosure = (
        f"Historical simulation executed at Next-Session Open with configured assumptions: "
        f"{req.fee_pct}% fee per side, {req.slippage_pct}% slippage per side, {req.risk_free_rate_pct}% annual risk-free rate. "
        "Historical prices use the configured adjusted-price basis (splits & dividends auto-adjusted). "
        "Strategy and benchmark are evaluated consistently on the same basis."
    )

    return BacktestResult(
        symbol=req.symbol.upper(),
        display_name=disp_name,
        strategy_name=req.strategy_name,
        period=req.period,
        summary=summary,
        trades=trades,
        equity_curve=equity_points,
        parameters=params_metadata,
        generated_at=datetime.now().isoformat(),
        disclosure=disclosure
    )


def get_historical_signal_evidence(symbol: str, signal_type: str = "RSI Oversold", period: str = "3y") -> SignalEvidenceResponse:
    """
    Computes rigorous statistical signal evidence for live UI components (e.g. Chart Intelligence).
    Replaces naive inline backtest snippets with validated historical evidence.
    """
    strat_map = {
        "rsi oversold": "rsi_reversion",
        "golden cross": "golden_cross",
        "macd bullish cross": "macd_crossover",
        "bb lower breakdown": "bollinger_reversion",
    }
    strat_name = strat_map.get(signal_type.lower(), "rsi_reversion")

    req = BacktestRequest(
        symbol=symbol,
        period=period,
        strategy_name=strat_name,
        holding_days=15,
        execution_mode="next_open",
        fee_pct=0.10,
        slippage_pct=0.05
    )

    try:
        res = run_backtest(req)
        s = res.summary
        return SignalEvidenceResponse(
            symbol=symbol.upper(),
            signal_type=signal_type,
            total_signals=s.total_trades,
            win_rate_pct=s.win_rate_pct,
            avg_15d_return_pct=s.avg_trade_return_pct,
            median_return_pct=s.median_trade_return_pct,
            max_loss_pct=s.worst_trade_pct,
            sample_size_valid=s.total_trades >= 5,
            description=(
                f"Historical '{signal_type}' signals appeared {s.total_trades} times on {res.display_name} "
                f"over {period}. Win rate at +15 days: {s.win_rate_pct:.0f}%, avg net return: {s.avg_trade_return_pct:+.1f}%."
            ),
            disclosure="Deterministic simulation executed at next-session Open with 0.1% fee + 0.05% slippage."
        )
    except Exception as e:
        return SignalEvidenceResponse(
            symbol=symbol.upper(),
            signal_type=signal_type,
            total_signals=0,
            win_rate_pct=0.0,
            avg_15d_return_pct=0.0,
            median_return_pct=0.0,
            max_loss_pct=0.0,
            sample_size_valid=False,
            description=f"Insufficient historical data to backtest '{signal_type}' on {symbol}.",
            disclosure="Data verification limit."
        )
