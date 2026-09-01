from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class StrategyParams(BaseModel):
    rsi_threshold: float = Field(default=32.0, description="RSI oversold threshold")
    rsi_exit_threshold: float = Field(default=50.0, description="RSI exit threshold")
    fast_ema: int = Field(default=20, description="Fast EMA period")
    slow_ema: int = Field(default=50, description="Slow EMA period")
    bb_std: float = Field(default=2.0, description="Bollinger band standard deviations")
    volume_surge_mult: float = Field(default=1.5, description="Volume surge multiplier")
    regime_filter_enabled: bool = Field(default=True, description="Enable Nifty 50 market regime filter")


class BacktestRequest(BaseModel):
    symbol: str = Field(..., description="NSE/BSE stock ticker e.g. RELIANCE, HDFCBANK")
    period: str = Field(default="3y", description="Historical period: 1y, 3y, 5y, 10y")
    strategy_name: str = Field(
        default="rsi_reversion",
        description="Strategy: rsi_reversion, golden_cross, macd_crossover, bollinger_reversion, composite_investedge"
    )
    initial_capital: float = Field(default=100000.0, description="Starting capital in INR")
    position_size_pct: float = Field(default=100.0, description="Capital allocation % per trade")
    fee_pct: float = Field(default=0.10, description="Transaction fee % per side (brokerage, STT)")
    slippage_pct: float = Field(default=0.05, description="Estimated slippage % per side")
    benchmark_symbol: str = Field(default="^NSEI", description="Benchmark symbol (e.g. ^NSEI for Nifty 50)")
    execution_mode: str = Field(default="next_open", description="Execution model: next_open or same_close")
    holding_days: int = Field(default=15, description="Maximum holding period in trading days")
    stop_loss_pct: Optional[float] = Field(default=5.0, description="Optional stop-loss % (e.g. 5.0 for 5%)")
    take_profit_pct: Optional[float] = Field(default=10.0, description="Optional take-profit % (e.g. 10.0 for 10%)")
    risk_free_rate_pct: float = Field(default=6.0, description="Annual risk-free rate % for Sharpe/Sortino ratios (default 6.0%)")
    params: Optional[StrategyParams] = Field(default_factory=StrategyParams)


class Trade(BaseModel):
    trade_id: int
    symbol: str
    signal_date: str
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    holding_days: int
    gross_return_pct: float
    net_return_pct: float
    pnl_amount: float
    exit_reason: str  # holding_period, stop_loss, take_profit
    regime_at_entry: str


class EquityPoint(BaseModel):
    date: str
    strategy_equity: float
    benchmark_equity: float
    drawdown_pct: float


class PerformanceSummary(BaseModel):
    total_return_pct: float
    benchmark_return_pct: float
    alpha_pct: float
    cagr_pct: Optional[float] = None
    win_rate_pct: float
    profit_factor: float
    max_drawdown_pct: float
    max_drawdown_days: int
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_trade_return_pct: float
    median_trade_return_pct: float
    best_trade_pct: float
    worst_trade_pct: float
    avg_win_pct: float
    avg_loss_pct: float
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None


class BacktestResult(BaseModel):
    symbol: str
    display_name: str
    strategy_name: str
    period: str
    summary: PerformanceSummary
    trades: List[Trade]
    equity_curve: List[EquityPoint]
    parameters: Dict[str, Any]
    generated_at: str
    disclosure: str


class SignalEvidenceRequest(BaseModel):
    symbol: str
    signal_type: str = Field(default="RSI Oversold", description="Signal type to validate")
    period: str = Field(default="3y", description="History period")


class SignalEvidenceResponse(BaseModel):
    symbol: str
    signal_type: str
    total_signals: int
    win_rate_pct: float
    avg_15d_return_pct: float
    median_return_pct: float
    max_loss_pct: float
    sample_size_valid: bool
    description: str
    disclosure: str
