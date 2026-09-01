from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List

from .models import BacktestRequest, BacktestResult, SignalEvidenceRequest, SignalEvidenceResponse
from .engine import run_backtest, get_historical_signal_evidence
from .strategies import STRATEGY_MAP

router = APIRouter(prefix="/api/backtest", tags=["Backtesting Engine"])


@router.post("/run", response_model=BacktestResult)
async def api_run_backtest(req: BacktestRequest):
    """
    Executes a deterministic historical simulation for a stock and strategy.
    Returns executive summary metrics, daily equity curve, and trade-by-trade log.
    """
    try:
        return run_backtest(req)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest execution error: {str(e)}")


@router.get("/strategies")
async def list_strategies() -> Dict[str, Any]:
    """
    Returns available strategies and their metadata for UI dropdown selectors.
    """
    return {
        "strategies": [
            {
                "id": "rsi_reversion",
                "name": "RSI Mean Reversion",
                "description": "Buys when RSI drops below oversold threshold (e.g. 32) and holds for fixed horizon or until RSI recovers.",
                "default_params": {"rsi_threshold": 32.0, "rsi_exit_threshold": 50.0}
            },
            {
                "id": "golden_cross",
                "name": "Golden Cross Crossover",
                "description": "Buys on true crossover when EMA20 crosses above EMA50, following medium-term trend momentum.",
                "default_params": {"fast_ema": 20, "slow_ema": 50}
            },
            {
                "id": "macd_crossover",
                "name": "MACD Momentum Crossover",
                "description": "Buys when MACD line crosses above Signal line.",
                "default_params": {"fast": 12, "slow": 26, "signal": 9}
            },
            {
                "id": "bollinger_reversion",
                "name": "Bollinger Lower Band Breakout",
                "description": "Buys when price breaks below lower Bollinger Band with RSI < 40 confirmation.",
                "default_params": {"bb_std": 2.0}
            },
            {
                "id": "composite_investedge",
                "name": "InvestEdge Composite Signal",
                "description": "Combines Technical Trend (EMA20 > EMA50) + Volume Surge (>1.5x) + Nifty 50 Market Regime Filter.",
                "default_params": {"volume_surge_mult": 1.5, "regime_filter_enabled": True}
            }
        ]
    }


@router.post("/signal-evidence", response_model=SignalEvidenceResponse)
async def api_signal_evidence(req: SignalEvidenceRequest):
    """
    Computes quick statistical evidence for live signal views (e.g. Chart Intelligence).
    """
    try:
        return get_historical_signal_evidence(req.symbol, req.signal_type, req.period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
