import pandas as pd
import yfinance as yf
from datetime import datetime
from typing import Dict, Any, List

from storage import SignalLedgerRepository


def evaluate_pending_signals() -> Dict[str, Any]:
    """
    Evaluates PENDING signal outcomes against market data.
    Enforces trading-day horizons (1D, 5D, 15D future sessions).
    Idempotent: Only updates pending records; resolved outcomes remain immutable.
    """
    pending_list = SignalLedgerRepository.get_pending_outcomes()
    if not pending_list:
        return {"evaluated": 0, "resolved": 0, "message": "No pending signal outcomes found."}

    # Group pending outcomes by symbol to batch data fetches
    symbol_map: Dict[str, List[Dict[str, Any]]] = {}
    for item in pending_list:
        sym = item["symbol"]
        symbol_map.setdefault(sym, []).append(item)

    resolved_count = 0

    # Fetch Nifty 50 Benchmark Data
    try:
        bm_raw = yf.download("^NSEI", period="1y", interval="1d", progress=False, auto_adjust=True)
        bm_close = bm_raw["Close"] if not bm_raw.empty else None
    except Exception:
        bm_close = None

    for sym, items in symbol_map.items():
        ticker = sym if sym.endswith(".NS") or sym.endswith(".BO") else sym + ".NS"
        try:
            raw = yf.download(ticker, period="1y", interval="1d", progress=False, auto_adjust=True)
            if raw.empty or len(raw) < 10:
                continue

            df_close = raw["Close"]
            df_dates = [str(d)[:10] for d in raw.index]

            for item in items:
                sig_date = str(item["signal_timestamp"])[:10]
                horizon = item["horizon_days"]
                sig_price = item["signal_price"]
                direction = item["signal_direction"]
                outcome_id = item["outcome_id"]

                # Find signal bar index in historical dataset
                if sig_date not in df_dates:
                    # Find closest date on or after sig_date
                    matching_indices = [idx for idx, d in enumerate(df_dates) if d >= sig_date]
                    if not matching_indices:
                        continue
                    sig_idx = matching_indices[0]
                else:
                    sig_idx = df_dates.index(sig_date)

                target_idx = sig_idx + horizon
                if target_idx >= len(df_dates):
                    # Horizon trading session has not yet elapsed -> Remain PENDING
                    continue

                eval_date = df_dates[target_idx]
                outcome_price = float(df_close.iloc[target_idx])

                if sig_price <= 0 or outcome_price <= 0:
                    continue

                # Return calculation based on direction
                if direction == "BUY":
                    ret_pct = round(((outcome_price - sig_price) / sig_price) * 100.0, 2)
                else:
                    ret_pct = round(((sig_price - outcome_price) / sig_price) * 100.0, 2)

                # Benchmark Return calculation over matching trading sessions
                bm_ret_pct = 0.0
                if bm_close is not None and not bm_close.empty:
                    bm_dates = [str(d)[:10] for d in bm_close.index]
                    bm_start_idx = next((idx for idx, d in enumerate(bm_dates) if d >= sig_date), None)
                    bm_end_idx = next((idx for idx, d in enumerate(bm_dates) if d >= eval_date), None)

                    if bm_start_idx is not None and bm_end_idx is not None and bm_end_idx > bm_start_idx:
                        bm_start_p = float(bm_close.iloc[bm_start_idx])
                        bm_end_p = float(bm_close.iloc[bm_end_idx])
                        if bm_start_p > 0:
                            bm_ret_pct = round(((bm_end_p - bm_start_p) / bm_start_p) * 100.0, 2)

                alpha_pct = round(ret_pct - bm_ret_pct, 2)

                # Result Classification
                if ret_pct >= 1.0 or alpha_pct >= 0.5:
                    res_str = "SUCCESS"
                elif ret_pct <= -1.0 or alpha_pct <= -0.5:
                    res_str = "FAILURE"
                else:
                    res_str = "NEUTRAL"

                updated = SignalLedgerRepository.update_outcome(
                    outcome_id=outcome_id,
                    evaluation_date=eval_date,
                    outcome_price=round(outcome_price, 2),
                    return_pct=ret_pct,
                    benchmark_return_pct=bm_ret_pct,
                    alpha_pct=alpha_pct,
                    result=res_str
                )
                if updated:
                    resolved_count += 1

        except Exception:
            continue

    return {
        "evaluated": len(pending_list),
        "resolved": resolved_count,
        "timestamp": datetime.now().isoformat()
    }
