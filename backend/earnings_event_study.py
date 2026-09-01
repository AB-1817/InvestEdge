import pandas as pd
import numpy as np
import yfinance as yf
from typing import Dict, Any, List

from models_ledger import EarningsEventStudyItem, EarningsEventStudyResponse


def flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
    df_copy = df.copy()
    if isinstance(df_copy.columns, pd.MultiIndex):
        df_copy.columns = [c[0].lower() for c in df_copy.columns]
    else:
        df_copy.columns = [c.lower() for c in df_copy.columns]
    return df_copy


def get_earnings_event_study(symbol: str) -> EarningsEventStudyResponse:
    """
    Computes an Historical Earnings Event Study analyzing price action around past earnings release dates.
    Explicitly labeled as EVENT STUDY — DATA LIMITED to maintain quantitative honesty.
    """
    ticker = symbol if symbol.endswith(".NS") or symbol.endswith(".BO") else symbol + ".NS"
    disp_name = symbol.upper().replace(".NS", "").replace(".BO", "")

    try:
        t = yf.Ticker(ticker)
        raw = yf.download(ticker, period="3y", interval="1d", progress=False, auto_adjust=True)
        if raw.empty or len(raw) < 50:
            raise ValueError(f"Insufficient price history for {symbol}")

        df = flatten_cols(raw)
        df_close = df["close"]
        df_dates = [str(d)[:10] for d in raw.index]

        # Get historical earnings dates
        event_dates = []
        try:
            ed = t.earnings_dates
            if ed is not None and not ed.empty:
                event_dates = [str(d)[:10] for d in ed.index[:12]]
        except Exception:
            pass

        # Fallback to quarterly sampling if earnings_dates is unpopulated in yfinance
        if not event_dates:
            n_bars = len(df_dates)
            step = 63  # ~63 trading days per quarter
            event_dates = [df_dates[i] for i in range(step, n_bars - 15, step)]

        events: List[EarningsEventStudyItem] = []

        for ed_str in event_dates[:8]:
            matching = [i for i, d in enumerate(df_dates) if d >= ed_str]
            if not matching:
                continue
            e_idx = matching[0]

            if e_idx < 10 or e_idx + 15 >= len(df_dates):
                continue

            p_event = float(df_close.iloc[e_idx].item() if hasattr(df_close.iloc[e_idx], "item") else df_close.iloc[e_idx])
            p_pre10 = float(df_close.iloc[e_idx - 10].item() if hasattr(df_close.iloc[e_idx - 10], "item") else df_close.iloc[e_idx - 10])
            p_post1 = float(df_close.iloc[e_idx + 1].item() if hasattr(df_close.iloc[e_idx + 1], "item") else df_close.iloc[e_idx + 1])
            p_post5 = float(df_close.iloc[e_idx + 5].item() if hasattr(df_close.iloc[e_idx + 5], "item") else df_close.iloc[e_idx + 5])
            p_post15 = float(df_close.iloc[e_idx + 15].item() if hasattr(df_close.iloc[e_idx + 15], "item") else df_close.iloc[e_idx + 15])

            if p_event <= 0 or p_pre10 <= 0:
                continue

            pre_10d_ret = round(((p_event - p_pre10) / p_pre10) * 100.0, 2)
            post_1d_gap = round(((p_post1 - p_event) / p_event) * 100.0, 2)
            post_5d_ret = round(((p_post5 - p_event) / p_event) * 100.0, 2)
            post_15d_ret = round(((p_post15 - p_event) / p_event) * 100.0, 2)

            vol_series = df_close.iloc[e_idx - 5: e_idx + 6].pct_change()
            vol_val = float(vol_series.std() * 100.0)
            event_vol = round(vol_val, 2) if not np.isnan(vol_val) else 0.0

            q_label = f"Quarter {ed_str[:7]}"
            events.append(EarningsEventStudyItem(
                quarter=q_label,
                earnings_date=ed_str,
                pre_10d_return_pct=pre_10d_ret,
                post_1d_gap_pct=post_1d_gap,
                post_5d_return_pct=post_5d_ret,
                post_15d_return_pct=post_15d_ret,
                event_volatility_pct=event_vol
            ))

        if not events:
            raise ValueError(f"No completed earnings event windows found for {symbol}")

        total_ev = len(events)
        avg_gap = round(float(np.mean([e.post_1d_gap_pct for e in events])), 2)
        avg_5d = round(float(np.mean([e.post_5d_return_pct for e in events])), 2)
        avg_15d = round(float(np.mean([e.post_15d_return_pct for e in events])), 2)
        pos_cnt = sum(1 for e in events if e.post_15d_return_pct > 0)
        pos_pct = round((pos_cnt / total_ev) * 100.0, 1)

        disclosure = (
            "HISTORICAL EARNINGS EVENT STUDY: Analyzes price action and volatility around past quarterly earnings "
            "releases. Measures past market reaction to earnings events, NOT historical accuracy of the current AI predictor."
        )

        return EarningsEventStudyResponse(
            symbol=disp_name,
            display_name=disp_name,
            total_events=total_ev,
            avg_post_1d_gap_pct=avg_gap,
            avg_post_5d_return_pct=avg_5d,
            avg_post_15d_return_pct=avg_15d,
            positive_event_pct=pos_pct,
            event_history=events,
            disclosure=disclosure,
            classification="HISTORICAL EARNINGS EVENT STUDY — DATA LIMITED"
        )
    except Exception as e:
        return EarningsEventStudyResponse(
            symbol=disp_name,
            display_name=disp_name,
            total_events=0,
            avg_post_1d_gap_pct=0.0,
            avg_post_5d_return_pct=0.0,
            avg_post_15d_return_pct=0.0,
            positive_event_pct=0.0,
            event_history=[],
            disclosure=f"Event study data limited for {symbol}: {str(e)}",
            classification="DATA LIMITED / UNVERIFIED"
        )
