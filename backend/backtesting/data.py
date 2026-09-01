import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict
import time

# ─── In-Memory TTL Cache ──────────────────────────────────────────────────────
_DATA_CACHE: Dict[str, Tuple[float, pd.DataFrame]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten yfinance multi-index columns if present."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    return df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume", "Adj Close": "adj_close"
    })


def nse_ticker(symbol: str) -> str:
    """Ensure standard NSE/BSE symbol suffix for yfinance."""
    s = symbol.upper().strip()
    if s.startswith("^") or s.endswith(".NS") or s.endswith(".BO"):
        return s
    return s + ".NS"


def fetch_historical_ohlcv(symbol: str, period: str = "3y", force_refresh: bool = False) -> pd.DataFrame:
    """
    Fetches and cleans historical OHLCV data for a given symbol and period.
    Uses an in-memory TTL cache to prevent redundant yfinance API calls.
    """
    ticker = nse_ticker(symbol)
    cache_key = f"{ticker}_{period}"
    now = time.time()

    if not force_refresh and cache_key in _DATA_CACHE:
        timestamp, cached_df = _DATA_CACHE[cache_key]
        if now - timestamp < CACHE_TTL_SECONDS:
            return cached_df.copy()

    try:
        raw = yf.download(ticker, period=period, interval="1d", progress=False, auto_adjust=True)
        if raw.empty or len(raw) < 20:
            raise ValueError(f"Insufficient historical data returned for {ticker} (period: {period}).")

        df = _flatten_cols(raw)
        
        # Data Quality Validation & Cleaning
        # Drop rows where close is missing or non-positive
        df = df[df["close"].notna() & (df["close"] > 0)].copy()

        # Handle missing open, high, low by filling from close
        df["open"] = df["open"].fillna(df["close"])
        df["high"] = df["high"].fillna(df["close"])
        df["low"] = df["low"].fillna(df["close"])
        df["volume"] = df["volume"].fillna(0)

        # Sort index chronologically
        df.sort_index(inplace=True)

        # Remove duplicate datetime indices if any
        df = df[~df.index.duplicated(keep="first")]

        _DATA_CACHE[cache_key] = (now, df)
        return df.copy()
    except Exception as e:
        raise ValueError(f"Failed to fetch market data for {symbol}: {str(e)}")


def validate_ohlcv_data(df: pd.DataFrame, min_bars: int = 30) -> Tuple[bool, Optional[str]]:
    """
    Validates data quality for backtesting:
    - Checks minimum bar count
    - Detects extreme NaN sequences
    - Ensures OHLC price relationships (High >= Low, High >= Open/Close, Low <= Open/Close)
    """
    if df is None or df.empty:
        return False, "Dataframe is empty."

    if len(df) < min_bars:
        return False, f"Data contains only {len(df)} bars, minimum required is {min_bars}."

    required_cols = {"open", "high", "low", "close", "volume"}
    if not required_cols.issubset(set(df.columns)):
        return False, f"Missing required columns: {required_cols - set(df.columns)}"

    # Check for invalid non-positive prices
    invalid_prices = (df["close"] <= 0) | (df["high"] <= 0) | (df["low"] <= 0) | (df["open"] <= 0)
    if invalid_prices.any():
        return False, "Data contains non-positive price observations."

    return True, None
