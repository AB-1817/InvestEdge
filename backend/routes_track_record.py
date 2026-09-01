import numpy as np
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any

from models_ledger import TrackRecordSummary
from storage import SignalLedgerRepository
from outcome_evaluator import evaluate_pending_signals

router = APIRouter(prefix="/api/track-record", tags=["Live Signal Track Record"])


@router.get("/summary", response_model=TrackRecordSummary)
async def get_track_record_summary(horizon_days: int = Query(default=15, description="Horizon days: 1, 5, or 15")):
    """
    Computes aggregate track record statistics from RESOLVED live InvestEdge signals.
    Prominently displays sample size n to preserve statistical honesty.
    """
    signals = SignalLedgerRepository.list_signals(horizon_days=horizon_days, limit=1000)
    
    total = len(signals)
    resolved_list = [s for s in signals if s.get("status") == "RESOLVED" and s.get("return_pct") is not None]
    pending_list = [s for s in signals if s.get("status") == "PENDING"]
    
    n_resolved = len(resolved_list)
    n_pending = len(pending_list)

    if n_resolved == 0:
        return TrackRecordSummary(
            total_signals=total,
            resolved_signals=0,
            pending_signals=n_pending,
            win_rate_pct=0.0,
            avg_return_pct=0.0,
            median_return_pct=0.0,
            avg_alpha_pct=0.0,
            best_return_pct=0.0,
            worst_return_pct=0.0,
            sample_size=0,
            horizon_days=horizon_days,
            statistical_note="No resolved signals recorded yet for this horizon. Track record begins recording live signals from deployment."
        )

    returns = [float(s["return_pct"]) for s in resolved_list]
    alphas = [float(s["alpha_pct"]) for s in resolved_list if s.get("alpha_pct") is not None]
    successes = [s for s in resolved_list if s.get("result") == "SUCCESS"]

    win_rate = round((len(successes) / n_resolved) * 100.0, 1)
    avg_ret = round(float(np.mean(returns)), 2)
    med_ret = round(float(np.median(returns)), 2)
    avg_alpha = round(float(np.mean(alphas)), 2) if alphas else 0.0
    best_ret = round(float(np.max(returns)), 2)
    worst_ret = round(float(np.min(returns)), 2)

    stat_note = (
        f"Sample size n={n_resolved}. Evaluated on +{horizon_days} trading-session horizons. "
        + ("Warning: Small sample size (n < 30) — statistics are preliminary." if n_resolved < 30 else "Statistically robust sample size.")
    )

    return TrackRecordSummary(
        total_signals=total,
        resolved_signals=n_resolved,
        pending_signals=n_pending,
        win_rate_pct=win_rate,
        avg_return_pct=avg_ret,
        median_return_pct=med_ret,
        avg_alpha_pct=avg_alpha,
        best_return_pct=best_ret,
        worst_return_pct=worst_ret,
        sample_size=n_resolved,
        horizon_days=horizon_days,
        statistical_note=stat_note
    )


@router.get("/signals")
async def get_track_record_signals(
    symbol: Optional[str] = None,
    signal_type: Optional[str] = None,
    result: Optional[str] = None,
    horizon_days: int = Query(default=15, description="Horizon days: 1, 5, or 15"),
    limit: int = Query(default=100, le=500)
):
    """
    Returns list of live InvestEdge signals and their resolved/pending outcomes.
    """
    signals = SignalLedgerRepository.list_signals(
        symbol=symbol,
        signal_type=signal_type,
        result=result,
        horizon_days=horizon_days,
        limit=limit
    )
    return {"signals": signals, "count": len(signals), "horizon_days": horizon_days}


@router.get("/signal/{signal_id}")
async def get_signal_audit_detail(signal_id: str):
    """
    Returns full audit trail snapshot for a specific live signal.
    Exposes original price, indicators, market regime, confidence, and engine version at prediction time.
    """
    detail = SignalLedgerRepository.get_signal_detail(signal_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Signal '{signal_id}' not found in ledger.")
    return detail


@router.post("/evaluate")
async def trigger_outcome_evaluation():
    """
    Triggers evaluation of pending live signals against trading-day market sessions.
    Idempotent and safe to invoke manually or via scheduler.
    """
    return evaluate_pending_signals()
