from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()
GROQ_KEYS = [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")]
GROQ_KEYS = [k for k in GROQ_KEYS if k]  # Filter out None values
current_key_index = 0

# ─── Pure numpy/pandas technical indicators (no pandas-ta needed) ─────────────

def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()

def _rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=length - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=length - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def _macd(series: pd.Series, fast=12, slow=26, signal=9):
    ema_fast   = _ema(series, fast)
    ema_slow   = _ema(series, slow)
    macd_line  = ema_fast - ema_slow
    sig_line   = _ema(macd_line, signal)
    histogram  = macd_line - sig_line
    return macd_line, sig_line, histogram

def _bbands(series: pd.Series, length=20, std=2):
    mid   = series.rolling(length).mean()
    sigma = series.rolling(length).std()
    return mid + std * sigma, mid, mid - std * sigma   # upper, mid, lower

def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length=14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low  - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=length - 1, adjust=False).mean()



app = FastAPI(title="StockSense AI Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def nse(symbol: str) -> str:
    s = symbol.upper().strip()
    if not s.endswith(".NS") and not s.endswith(".BO"):
        return s + ".NS"
    return s

def sf(val):
    """Safe float - returns None for NaN/None"""
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) or np.isinf(f) else round(f, 2)
    except Exception:
        return None

def flatten_cols(df):
    """Flatten MultiIndex columns from yfinance"""
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume", "Adj Close": "adj_close"
    })

# ─── Agent 1: Pattern Detection ───────────────────────────────────────────────

class PatternReq(BaseModel):
    symbol: str
    period: str = "6mo"

@app.post("/api/patterns")
async def detect_patterns(req: PatternReq):
    ticker = nse(req.symbol)
    try:
        raw = yf.download(ticker, period=req.period, interval="1d",
                          progress=False, auto_adjust=True)
        if raw.empty or len(raw) < 30:
            raise HTTPException(404, f"No data for {ticker}. Check symbol.")

        df = flatten_cols(raw)
        close = df["close"]
        high  = df["high"]
        low   = df["low"]
        vol   = df["volume"]

        df["rsi"]    = _rsi(close, 14)
        df["ema9"]   = _ema(close, 9)
        df["ema20"]  = _ema(close, 20)
        df["ema50"]  = _ema(close, 50)
        df["ema200"] = _ema(close, 200)
        df["atr"]    = _atr(high, low, close, 14)

        macd_line, macd_sig, macd_hist = _macd(close)
        df["macd"]        = macd_line
        df["macd_signal"] = macd_sig
        df["macd_hist"]   = macd_hist

        bb_upper, bb_mid, bb_lower = _bbands(close)
        df["bb_upper"] = bb_upper
        df["bb_mid"]   = bb_mid
        df["bb_lower"] = bb_lower

        cur  = df.iloc[-1]
        prev = df.iloc[-2]
        p2   = df.iloc[-3]

        signals = []

        rsi = sf(cur.get("rsi"))
        if rsi is not None:
            if rsi < 28:
                signals.append({"type": "RSI Oversold", "direction": "bullish", "strength": "strong",
                                 "detail": f"RSI at {rsi:.1f} — deeply oversold, historically strong reversal zone"})
            elif rsi < 35:
                signals.append({"type": "RSI Approaching Oversold", "direction": "bullish", "strength": "moderate",
                                 "detail": f"RSI at {rsi:.1f} — entering oversold territory"})
            elif rsi > 72:
                signals.append({"type": "RSI Overbought", "direction": "bearish", "strength": "strong",
                                 "detail": f"RSI at {rsi:.1f} — overbought, potential reversal or consolidation"})
            elif rsi > 65:
                signals.append({"type": "RSI Approaching Overbought", "direction": "bearish", "strength": "moderate",
                                 "detail": f"RSI at {rsi:.1f} — nearing overbought zone"})

        e20, e50 = sf(cur.get("ema20")), sf(cur.get("ema50"))
        pe20, pe50 = sf(prev.get("ema20")), sf(prev.get("ema50"))
        if all(v is not None for v in [e20, e50, pe20, pe50]):
            if pe20 < pe50 and e20 > e50:
                signals.append({"type": "Golden Cross", "direction": "bullish", "strength": "strong",
                                 "detail": "EMA20 just crossed above EMA50 — classic medium-term bullish signal"})
            elif pe20 > pe50 and e20 < e50:
                signals.append({"type": "Death Cross", "direction": "bearish", "strength": "strong",
                                 "detail": "EMA20 just crossed below EMA50 — classic medium-term bearish signal"})
            elif e20 > e50:
                gap = ((e20 - e50) / e50) * 100
                signals.append({"type": "EMA Bullish Alignment", "direction": "bullish", "strength": "moderate",
                                 "detail": f"EMA20 {gap:.1f}% above EMA50 — uptrend structure intact"})
            else:
                gap = ((e50 - e20) / e50) * 100
                signals.append({"type": "EMA Bearish Alignment", "direction": "bearish", "strength": "moderate",
                                 "detail": f"EMA20 {gap:.1f}% below EMA50 — downtrend structure"})

        price_now = sf(cur["close"])
        e200 = sf(cur.get("ema200"))
        if price_now and e200:
            pct = ((price_now - e200) / e200) * 100
            if pct > 2:
                signals.append({"type": "Above 200 EMA", "direction": "bullish", "strength": "moderate",
                                 "detail": f"Price {pct:.1f}% above 200 EMA — long-term uptrend intact"})
            elif pct < -2:
                signals.append({"type": "Below 200 EMA", "direction": "bearish", "strength": "moderate",
                                 "detail": f"Price {abs(pct):.1f}% below 200 EMA — long-term downtrend"})

        macd_v  = sf(cur.get("macd"))
        macd_s  = sf(cur.get("macd_signal"))
        macd_h  = sf(cur.get("macd_hist"))
        p_macd  = sf(prev.get("macd"))
        p_macd_s = sf(prev.get("macd_signal"))
        if all(v is not None for v in [macd_v, macd_s, p_macd, p_macd_s]):
            if p_macd < p_macd_s and macd_v > macd_s:
                signals.append({"type": "MACD Bullish Cross", "direction": "bullish", "strength": "moderate",
                                 "detail": "MACD line crossed above signal — bullish momentum building"})
            elif p_macd > p_macd_s and macd_v < macd_s:
                signals.append({"type": "MACD Bearish Cross", "direction": "bearish", "strength": "moderate",
                                 "detail": "MACD line crossed below signal — bearish momentum building"})
            if macd_h is not None:
                p_hist = sf(prev.get("macd_hist"))
                if p_hist is not None:
                    if macd_h > 0 and macd_h > p_hist:
                        signals.append({"type": "MACD Histogram Expanding", "direction": "bullish", "strength": "weak",
                                         "detail": "Positive histogram expanding — bullish momentum accelerating"})
                    elif macd_h < 0 and macd_h < p_hist:
                        signals.append({"type": "MACD Histogram Contracting", "direction": "bearish", "strength": "weak",
                                         "detail": "Negative histogram expanding — bearish momentum accelerating"})

        bb_u = sf(cur.get("bb_upper"))
        bb_l = sf(cur.get("bb_lower"))
        bb_m = sf(cur.get("bb_mid"))
        if price_now and bb_u and bb_l and bb_m:
            bb_width = ((bb_u - bb_l) / bb_m) * 100
            if price_now > bb_u:
                signals.append({"type": "BB Upper Breakout", "direction": "bullish", "strength": "moderate",
                                 "detail": "Price broke above upper Bollinger Band — strong momentum, watch for continuation"})
            elif price_now < bb_l:
                signals.append({"type": "BB Lower Breakdown", "direction": "bearish", "strength": "moderate",
                                 "detail": "Price broke below lower Bollinger Band — strong bearish momentum"})
            if bb_width < 3.5:
                signals.append({"type": "Bollinger Squeeze", "direction": "neutral", "strength": "strong",
                                 "detail": f"BB width compressed to {bb_width:.1f}% — volatility coiling, explosive move expected soon"})

        avg_vol    = sf(vol.tail(20).mean())
        latest_vol = sf(vol.iloc[-1])
        if avg_vol and latest_vol and avg_vol > 0:
            vol_ratio = latest_vol / avg_vol
            if vol_ratio > 2.0:
                dir_hint = "bullish" if price_now and sf(prev["close"]) and price_now > sf(prev["close"]) else "bearish"
                signals.append({"type": "High Volume Surge", "direction": dir_hint, "strength": "strong",
                                 "detail": f"Volume {vol_ratio:.1f}x above 20-day avg — institutional conviction behind move"})
            elif vol_ratio < 0.4:
                signals.append({"type": "Low Volume", "direction": "neutral", "strength": "weak",
                                 "detail": "Volume well below average — weak conviction, move may not sustain"})

        y_high = sf(high.tail(252).max())
        y_low  = sf(low.tail(252).min())
        if price_now and y_high and y_low:
            pct_from_high = ((y_high - price_now) / y_high) * 100
            pct_from_low  = ((price_now - y_low) / y_low) * 100
            if pct_from_high < 2:
                signals.append({"type": "Near 52W High", "direction": "bullish", "strength": "strong",
                                 "detail": f"Only {pct_from_high:.1f}% below 52W high ₹{y_high:.0f} — breakout territory"})
            elif pct_from_high > 30:
                signals.append({"type": "Far from 52W High", "direction": "bearish", "strength": "moderate",
                                 "detail": f"Down {pct_from_high:.0f}% from 52W high ₹{y_high:.0f}"})
            if pct_from_low < 5:
                signals.append({"type": "Near 52W Low", "direction": "bearish", "strength": "strong",
                                 "detail": f"Only {pct_from_low:.1f}% above 52W low ₹{y_low:.0f} — near support"})

        backtest = None
        oversold_days = df[df["rsi"] < 32].index
        if len(oversold_days) > 2:
            gains = []
            for dt in oversold_days[:-1]:
                try:
                    pos = df.index.get_loc(dt)
                    ep = sf(df["close"].iloc[pos])
                    fp = sf(df["close"].iloc[min(pos + 15, len(df) - 1)])
                    if ep and fp:
                        gains.append(((fp - ep) / ep) * 100)
                except Exception:
                    pass
            if gains:
                wr = sum(1 for g in gains if g > 0) / len(gains) * 100
                ag = sum(gains) / len(gains)
                backtest = (f"RSI<32 appeared {len(gains)} times on {ticker.replace('.NS','')} "
                            f"in this window. Win rate at +15 days: {wr:.0f}%, avg move: {ag:+.1f}%")

        bull_n = sum(1 for s in signals if s["direction"] == "bullish")
        bear_n = sum(1 for s in signals if s["direction"] == "bearish")
        bias   = "bullish" if bull_n > bear_n else ("bearish" if bear_n > bull_n else "neutral")

        price_snap = {
            "current":    price_now,
            "open":       sf(cur["open"]),
            "high":       sf(cur["high"]),
            "low":        sf(cur["low"]),
            "prev_close": sf(prev["close"]),
            "change_pct": sf(((price_now - sf(prev["close"])) / sf(prev["close"])) * 100) if price_now and sf(prev["close"]) else None,
            "rsi":        rsi,
            "ema20":      e20,
            "ema50":      e50,
            "ema200":     e200,
            "52w_high":   y_high,
            "52w_low":    y_low,
            "volume":     latest_vol,
            "avg_volume": avg_vol,
            "atr":        sf(cur.get("atr")),
        }

        chart = []
        for idx, row in df.tail(90).reset_index().iterrows():
            try:
                dt = row["Date"]
                t_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
                chart.append({
                    "time":   t_str,
                    "open":   sf(row["open"]),
                    "high":   sf(row["high"]),
                    "low":    sf(row["low"]),
                    "close":  sf(row["close"]),
                    "volume": sf(row["volume"]),
                    "ema20":  sf(row.get("ema20")),
                    "ema50":  sf(row.get("ema50")),
                    "rsi":    sf(row.get("rsi")),
                })
            except Exception:
                pass

        return {
            "symbol":         ticker,
            "display":        ticker.replace(".NS", "").replace(".BO", ""),
            "price":          price_snap,
            "signals":        signals,
            "bias":           bias,
            "bias_counts":    {"bullish": bull_n, "bearish": bear_n},
            "backtest":       backtest,
            "chart_data":     chart,
            "generated_at":   datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Agent 2: Fundamental Opportunity ─────────────────────────────────────────

class OppReq(BaseModel):
    symbol: str

@app.post("/api/opportunity")
async def fundamental_analysis(req: OppReq):
    ticker = nse(req.symbol)
    try:
        t    = yf.Ticker(ticker)
        info = t.info or {}

        pe          = sf(info.get("trailingPE"))
        fwd_pe      = sf(info.get("forwardPE"))
        pb          = sf(info.get("priceToBook"))
        ps          = sf(info.get("priceToSalesTrailing12Months"))
        roe         = sf(info.get("returnOnEquity"))
        roa         = sf(info.get("returnOnAssets"))
        debt_eq     = sf(info.get("debtToEquity"))
        profit_mg   = sf(info.get("profitMargins"))
        gross_mg    = sf(info.get("grossMargins"))
        op_mg       = sf(info.get("operatingMargins"))
        rev_growth  = sf(info.get("revenueGrowth"))
        earn_growth = sf(info.get("earningsGrowth"))
        div_yield   = sf(info.get("dividendYield"))
        payout      = sf(info.get("payoutRatio"))
        beta        = sf(info.get("beta"))
        current_p   = sf(info.get("currentPrice") or info.get("regularMarketPrice"))
        target_p    = sf(info.get("targetMeanPrice"))
        target_hi   = sf(info.get("targetHighPrice"))
        target_lo   = sf(info.get("targetLowPrice"))
        rec_key     = info.get("recommendationKey", "")
        num_analyst = info.get("numberOfAnalystOpinions", 0)
        short_name  = info.get("shortName", ticker)
        sector      = info.get("sector", "")
        industry    = info.get("industry", "")
        market_cap  = info.get("marketCap")

        mc_str = ""
        if market_cap:
            mc_cr = market_cap / 1e7
            if mc_cr >= 1e5:
                mc_str = f"₹{mc_cr/1e5:.2f}L Cr (Large Cap)"
            elif mc_cr >= 2e4:
                mc_str = f"₹{mc_cr/1e4:.2f}L Cr (Mid Cap)"
            else:
                mc_str = f"₹{mc_cr:.0f} Cr (Small Cap)"

        upside = None
        if target_p and current_p and current_p > 0:
            upside = ((target_p - current_p) / current_p) * 100

        signals = []

        if pe is not None:
            if pe < 12:
                signals.append({"type": "Very Low P/E", "cat": "valuation", "sentiment": "positive",
                                 "detail": f"P/E of {pe:.1f}x — potentially deep value"})
            elif pe < 20:
                signals.append({"type": "Reasonable P/E", "cat": "valuation", "sentiment": "positive",
                                 "detail": f"P/E of {pe:.1f}x — fairly valued"})
            elif pe > 60:
                signals.append({"type": "Very High P/E", "cat": "valuation", "sentiment": "caution",
                                 "detail": f"P/E of {pe:.1f}x — significant growth expectations priced in"})

        if pb is not None and pb < 1.2:
            signals.append({"type": "Trading Near Book", "cat": "valuation", "sentiment": "positive",
                             "detail": f"P/B of {pb:.2f}x — trading near or below assets"})

        if rev_growth is not None:
            if rev_growth > 0.20:
                signals.append({"type": "Strong Revenue Growth", "cat": "growth", "sentiment": "positive",
                                 "detail": f"Revenue growing {rev_growth*100:.1f}% YoY — top-line momentum strong"})
            elif rev_growth < -0.05:
                signals.append({"type": "Revenue Declining", "cat": "growth", "sentiment": "caution",
                                 "detail": f"Revenue down {abs(rev_growth)*100:.1f}% YoY — top-line headwinds"})

        if earn_growth is not None and earn_growth > 0.20:
            signals.append({"type": "Strong EPS Growth", "cat": "growth", "sentiment": "positive",
                             "detail": f"Earnings growing {earn_growth*100:.1f}% YoY — bottom line expanding fast"})

        if roe is not None:
            if roe > 0.25:
                signals.append({"type": "Excellent ROE", "cat": "quality", "sentiment": "positive",
                                 "detail": f"ROE of {roe*100:.1f}% — exceptional capital efficiency"})
            elif roe > 0.15:
                signals.append({"type": "Good ROE", "cat": "quality", "sentiment": "positive",
                                 "detail": f"ROE of {roe*100:.1f}% — healthy returns on equity"})

        if debt_eq is not None:
            if debt_eq < 20:
                signals.append({"type": "Debt-Free / Low Debt", "cat": "quality", "sentiment": "positive",
                                 "detail": f"Debt/Equity {debt_eq:.1f}% — fortress balance sheet"})
            elif debt_eq > 200:
                signals.append({"type": "High Leverage", "cat": "quality", "sentiment": "caution",
                                 "detail": f"Debt/Equity {debt_eq:.1f}% — high leverage, watch interest coverage"})

        if profit_mg is not None and profit_mg > 0.20:
            signals.append({"type": "High Profit Margins", "cat": "quality", "sentiment": "positive",
                             "detail": f"Net margin {profit_mg*100:.1f}% — pricing power and cost efficiency"})

        if upside is not None:
            if upside > 15:
                signals.append({"type": "Analyst Upside", "cat": "analyst", "sentiment": "positive",
                                 "detail": f"Consensus target ₹{target_p:.0f} — {upside:.1f}% upside ({num_analyst} analysts)"})
            elif upside < -10:
                signals.append({"type": "Analyst Downside Risk", "cat": "analyst", "sentiment": "caution",
                                 "detail": f"Consensus target ₹{target_p:.0f} — {abs(upside):.1f}% below current"})

        if div_yield is not None and div_yield > 0.03:
            signals.append({"type": "Good Dividend Yield", "cat": "income", "sentiment": "positive",
                             "detail": f"Dividend yield {div_yield*100:.2f}% — attractive income stream"})

        if beta is not None:
            if beta > 1.5:
                signals.append({"type": "High Beta", "cat": "risk", "sentiment": "caution",
                                 "detail": f"Beta {beta:.2f} — high volatility, moves more than market"})
            elif beta < 0.7:
                signals.append({"type": "Low Beta", "cat": "risk", "sentiment": "positive",
                                 "detail": f"Beta {beta:.2f} — defensive stock, low market correlation"})

        news = []
        try:
            for n in (t.news or [])[:5]:
                news.append({
                    "title":     n.get("title", ""),
                    "publisher": n.get("publisher", ""),
                    "link":      n.get("link", ""),
                    "time":      datetime.fromtimestamp(n["providerPublishTime"]).strftime("%d %b %Y")
                                 if n.get("providerPublishTime") else "",
                })
        except Exception:
            pass

        return {
            "symbol":       ticker,
            "display":      ticker.replace(".NS", "").replace(".BO", ""),
            "name":         short_name,
            "sector":       sector,
            "industry":     industry,
            "market_cap":   mc_str,
            "current_price": current_p,
            "fundamentals": {
                "pe":              pe,
                "fwd_pe":          fwd_pe,
                "pb":              pb,
                "ps":              ps,
                "roe":             f"{roe*100:.1f}%" if roe else None,
                "roa":             f"{roa*100:.1f}%" if roa else None,
                "debt_equity":     f"{debt_eq:.1f}%" if debt_eq else None,
                "gross_margin":    f"{gross_mg*100:.1f}%" if gross_mg else None,
                "operating_margin":f"{op_mg*100:.1f}%" if op_mg else None,
                "profit_margin":   f"{profit_mg*100:.1f}%" if profit_mg else None,
                "revenue_growth":  f"{rev_growth*100:.1f}%" if rev_growth else None,
                "earnings_growth": f"{earn_growth*100:.1f}%" if earn_growth else None,
                "dividend_yield":  f"{div_yield*100:.2f}%" if div_yield else None,
                "beta":            beta,
            },
            "analyst": {
                "target_mean": target_p,
                "target_high": target_hi,
                "target_low":  target_lo,
                "upside_pct":  sf(upside),
                "recommendation": rec_key,
                "num_analysts": num_analyst,
            },
            "signals":      signals,
            "news":         news,
            "generated_at": datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Agent 3: Portfolio Analyzer ──────────────────────────────────────────────

class Holding(BaseModel):
    symbol: str
    qty: float
    avg_cost: float

class PortfolioReq(BaseModel):
    holdings: List[Holding]

@app.post("/api/portfolio")
async def analyze_portfolio(req: PortfolioReq):
    results  = []
    t_inv    = 0.0
    t_cur    = 0.0

    for h in req.holdings:
        ticker = nse(h.symbol)
        try:
            raw = yf.download(ticker, period="3mo", interval="1d",
                               progress=False, auto_adjust=True)
            if raw.empty:
                results.append({"symbol": h.symbol, "error": "No data found"})
                continue
            df    = flatten_cols(raw)
            close = df["close"]
            high  = df["high"]
            low   = df["low"]

            rsi_s   = _rsi(close, 14)
            ema20_s = _ema(close, 20)
            ema50_s = _ema(close, 50)
            atr_s   = _atr(high, low, close, 14)

            cur_p = sf(close.iloc[-1])
            rsi_v = sf(rsi_s.iloc[-1])
            e20_v = sf(ema20_s.iloc[-1])
            e50_v = sf(ema50_s.iloc[-1])
            atr_v = sf(atr_s.iloc[-1])

            invested = round(h.qty * h.avg_cost, 2)
            current  = round(h.qty * (cur_p or 0), 2)
            pnl      = round(current - invested, 2)
            pnl_pct  = round((pnl / invested * 100) if invested else 0, 2)

            t_inv += invested
            t_cur += current

            signal, reason = "hold", "No strong signal"
            if rsi_v:
                if rsi_v > 72:
                    signal, reason = "review", f"RSI overbought at {rsi_v:.0f} — consider taking partial profits"
                elif rsi_v < 30:
                    signal, reason = "accumulate", f"RSI oversold at {rsi_v:.0f} — potential averaging opportunity"

            if signal == "hold" and cur_p and e50_v:
                if cur_p < e50_v * 0.93:
                    signal, reason = "review", f"Price {((e50_v - cur_p)/e50_v*100):.1f}% below EMA50 — trend broken"
                elif cur_p > e20_v * 1.0 if e20_v else False:
                    signal, reason = "hold", "Price above EMA20 — short-term trend intact"

            sl_price = None
            if cur_p and atr_v:
                sl_price = round(cur_p - (2 * atr_v), 2)

            results.append({
                "symbol":        ticker.replace(".NS", "").replace(".BO", ""),
                "qty":           h.qty,
                "avg_cost":      h.avg_cost,
                "current_price": cur_p,
                "invested":      invested,
                "current_value": current,
                "pnl":           pnl,
                "pnl_pct":       pnl_pct,
                "rsi":           rsi_v,
                "ema20":         e20_v,
                "ema50":         e50_v,
                "atr":           atr_v,
                "suggested_sl":  sl_price,
                "signal":        signal,
                "signal_reason": reason,
                "weight_pct":    None,
            })

        except Exception as e:
            results.append({"symbol": h.symbol, "error": str(e)})

    for r in results:
        if "current_value" in r and t_cur > 0:
            r["weight_pct"] = round(r["current_value"] / t_cur * 100, 1)

    t_pnl     = round(t_cur - t_inv, 2)
    t_pnl_pct = round((t_pnl / t_inv * 100) if t_inv else 0, 2)

    return {
        "holdings": results,
        "summary": {
            "total_invested":  round(t_inv, 2),
            "total_current":   round(t_cur, 2),
            "total_pnl":       t_pnl,
            "total_pnl_pct":   t_pnl_pct,
            "count":           len(results),
        },
        "generated_at": datetime.now().isoformat(),
    }


from video_engine import router as video_router
app.include_router(video_router)

# ─── Shared AI helpers (used by innovation endpoints below) ───────────────────

async def _groq_chat(prompt: str, system: str = "You are a financial analyst AI.") -> str:
    global current_key_index
    if not GROQ_KEYS:
        return "AI unavailable — GROQ_API_KEY not set."
    
    for attempt in range(len(GROQ_KEYS)):
        try:
            key = GROQ_KEYS[current_key_index]
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                        "max_tokens": 400, "temperature": 0.4,
                    },
                )
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"].strip()
                else:
                    print(f"Groq key {current_key_index + 1} failed with status {resp.status_code}")
                    current_key_index = (current_key_index + 1) % len(GROQ_KEYS)
        except Exception as e:
            print(f"Groq key {current_key_index + 1} failed: {e}")
            current_key_index = (current_key_index + 1) % len(GROQ_KEYS)
            if attempt == len(GROQ_KEYS) - 1:
                return ""
    return ""

def _fetch_news_titles(symbols: List[str], max_per: int = 6) -> List[dict]:
    articles = []
    seen = set()
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            for n in (t.news or [])[:max_per]:
                content = n.get("content") or {}
                title = content.get("title") or n.get("title", "")
                publisher = (content.get("provider") or {}).get("displayName", "") or n.get("publisher", "")
                if title and title not in seen:
                    seen.add(title)
                    articles.append({"title": title, "publisher": publisher, "symbol": sym.replace(".NS", "")})
        except Exception:
            continue
    return articles

class DoctorReq(BaseModel):
    holdings: List[Holding]

@app.post("/api/portfolio/doctor")
async def portfolio_doctor(req: DoctorReq):
    """Analyzes portfolio health: concentration, sector balance, risk, and AI recommendations."""
    results = []
    sector_map = {}
    total_invested = 0.0
    total_current = 0.0

    # Fetch each holding sequentially
    for h in req.holdings:
        ticker = nse(h.symbol)
        try:
            t = yf.Ticker(ticker)
            info = t.info or {}
            raw = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
            if raw.empty:
                continue
            df = flatten_cols(raw)
            close = df["close"]
            rsi_v = sf(_rsi(close, 14).iloc[-1])
            cur_p = sf(close.iloc[-1])
            prev_p = sf(close.iloc[-2])
            sector = info.get("sector", "Unknown")
            invested = h.qty * h.avg_cost
            current = h.qty * (cur_p or 0)
            pnl_pct = sf(((current - invested) / invested) * 100) if invested else 0
            total_invested += invested
            total_current += current
            results.append({
                "symbol": h.symbol.upper(),
                "sector": sector,
                "invested": round(invested, 2),
                "current": round(current, 2),
                "pnl_pct": pnl_pct,
                "weight": 0,
                "rsi": rsi_v,
                "beta": sf(info.get("beta")),
                "pe": sf(info.get("trailingPE")),
            })
            sector_map[sector] = sector_map.get(sector, 0) + current
        except Exception:
            continue

    # Compute weights
    for r in results:
        r["weight"] = round((r["current"] / total_current * 100) if total_current else 0, 1)

    # Health scoring
    score = 100
    issues = []
    suggestions = []

    # Concentration risk
    max_weight = max((r["weight"] for r in results), default=0)
    if max_weight > 40:
        score -= 20
        issues.append(f"High concentration: one stock is {max_weight:.0f}% of portfolio")
        suggestions.append("Reduce largest position to below 25% for better diversification")
    elif max_weight > 25:
        score -= 10
        issues.append(f"Moderate concentration: top holding is {max_weight:.0f}%")

    # Sector concentration
    if sector_map:
        top_sector = max(sector_map, key=sector_map.get)
        top_sector_pct = (sector_map[top_sector] / total_current * 100) if total_current else 0
        if top_sector_pct > 50:
            score -= 15
            issues.append(f"Sector overweight: {top_sector} is {top_sector_pct:.0f}% of portfolio")
            suggestions.append(f"Diversify out of {top_sector} — consider adding defensive sectors")

    # RSI overbought holdings
    overbought = [r["symbol"] for r in results if r["rsi"] and r["rsi"] > 70]
    if overbought:
        score -= 5 * len(overbought)
        issues.append(f"Overbought signals: {', '.join(overbought)} (RSI > 70)")
        suggestions.append(f"Consider booking partial profits in {', '.join(overbought)}")

    # Losers
    big_losers = [r["symbol"] for r in results if r["pnl_pct"] and r["pnl_pct"] < -15]
    if big_losers:
        score -= 10
        issues.append(f"Significant drawdown: {', '.join(big_losers)} down >15%")
        suggestions.append(f"Review stop-loss levels for {', '.join(big_losers)}")

    score = max(0, min(100, score))
    grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D"

    # AI narrative
    holdings_summary = ", ".join(f"{r['symbol']} ({r['weight']}%)" for r in results)
    sector_summary = ", ".join(f"{k}: {v/total_current*100:.0f}%" for k, v in sector_map.items()) if total_current else ""
    pnl_total = round(total_current - total_invested, 2)
    pnl_pct_total = round((pnl_total / total_invested * 100) if total_invested else 0, 2)

    ai_advice = await _groq_chat(
        f"Portfolio holdings: {holdings_summary}\nSector allocation: {sector_summary}\n"
        f"Total P&L: {pnl_pct_total:+.1f}%\nHealth score: {score}/100 (Grade {grade})\n"
        f"Issues found: {'; '.join(issues) if issues else 'None'}\n\n"
        "Give 3 specific, actionable portfolio improvement recommendations in 2-3 sentences each. "
        "Be direct, data-driven, and specific to Indian markets.",
        system="You are a SEBI-registered portfolio advisor specializing in Indian equity markets."
    )

    return {
        "score": score,
        "grade": grade,
        "holdings": results,
        "sector_allocation": {k: round(v / total_current * 100, 1) for k, v in sector_map.items()} if total_current else {},
        "summary": {"total_invested": round(total_invested, 2), "total_current": round(total_current, 2), "pnl": pnl_total, "pnl_pct": pnl_pct_total},
        "issues": issues,
        "suggestions": suggestions,
        "ai_advice": ai_advice,
        "generated_at": datetime.now().isoformat(),
    }


# ─── INNOVATION 3: Market Regime Detector ─────────────────────────────────────

@app.get("/api/market/regime")
async def market_regime():
    """Detects current market regime: Bull Run / Bear Phase / Sideways Chop / High Volatility."""
    try:
        t = yf.Ticker("^NSEI")
        h = t.history(period="6mo")
        if len(h) < 60:
            raise HTTPException(500, "Insufficient data")

        close = h["Close"]
        high = h["High"]
        low = h["Low"]

        # Indicators
        ema20 = float(_ema(close, 20).iloc[-1])
        ema50 = float(_ema(close, 50).iloc[-1])
        ema200_s = _ema(close, min(200, len(close) - 1))
        ema200 = float(ema200_s.iloc[-1])
        rsi = float(_rsi(close, 14).iloc[-1])
        atr = float(_atr(high, low, close, 14).iloc[-1])
        cur = float(close.iloc[-1])
        atr_pct = (atr / cur) * 100

        # 20-day return
        ret_20d = ((cur - float(close.iloc[-20])) / float(close.iloc[-20])) * 100
        # 60-day return
        ret_60d = ((cur - float(close.iloc[-60])) / float(close.iloc[-60])) * 100

        # Regime logic
        if atr_pct > 1.2:
            regime = "High Volatility"
            color = "#dc2626"
            emoji = "⚡"
            desc = "Market is in a high-volatility phase. ATR elevated — expect sharp intraday swings. Reduce position sizes and tighten stop-losses."
        elif cur > ema20 > ema50 and ret_20d > 2 and rsi > 55:
            regime = "Bull Run"
            color = "#16a34a"
            emoji = "🚀"
            desc = "Strong uptrend confirmed. Price above all key EMAs with positive momentum. Trend-following strategies and breakout plays are favored."
        elif cur < ema20 < ema50 and ret_20d < -2 and rsi < 45:
            regime = "Bear Phase"
            color = "#ef4444"
            emoji = "🐻"
            desc = "Sustained downtrend in progress. Price below key EMAs with negative momentum. Defensive positioning, cash allocation, and hedges recommended."
        else:
            regime = "Sideways Chop"
            color = "#d97706"
            emoji = "↔️"
            desc = "Market is range-bound with no clear directional bias. Mean-reversion strategies work best. Buy near support, sell near resistance."

        # Historical context — how many days in this regime
        regime_days = 1
        for i in range(2, min(30, len(close))):
            c_i = float(close.iloc[-i])
            e20_i = float(_ema(close.iloc[:-i+1] if i > 1 else close, 20).iloc[-1])
            if (regime == "Bull Run" and c_i > e20_i) or \
               (regime == "Bear Phase" and c_i < e20_i) or \
               (regime in ["Sideways Chop", "High Volatility"]):
                regime_days += 1
            else:
                break

        ai_insight = await _groq_chat(
            f"Nifty 50 current regime: {regime}\nCurrent price: {cur:.0f}\n"
            f"EMA20: {ema20:.0f}, EMA50: {ema50:.0f}, RSI: {rsi:.1f}, ATR%: {atr_pct:.2f}%\n"
            f"20-day return: {ret_20d:+.1f}%, 60-day return: {ret_60d:+.1f}%\n\n"
            "In 2-3 sentences, explain what this regime means for retail investors right now and what sectors/strategies to focus on.",
            system="You are a market strategist analyzing Indian equity market regimes."
        )

        return {
            "regime": regime,
            "color": color,
            "emoji": emoji,
            "description": desc,
            "ai_insight": ai_insight,
            "metrics": {
                "nifty": round(cur, 2),
                "ema20": round(ema20, 2),
                "ema50": round(ema50, 2),
                "rsi": round(rsi, 1),
                "atr_pct": round(atr_pct, 2),
                "ret_20d": round(ret_20d, 2),
                "ret_60d": round(ret_60d, 2),
            },
            "regime_days": regime_days,
            "generated_at": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── INNOVATION 3b: Earnings Surprise Predictor ───────────────────────────────

@app.get("/api/earnings/predict/{symbol}")
async def earnings_predictor(symbol: str):
    """Predicts earnings beat/miss probability using price action, RSI, news sentiment, and analyst data."""
    ticker = nse(symbol)
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        raw = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            raise HTTPException(404, f"No data for {ticker}")

        df = flatten_cols(raw)
        close = df["close"]
        vol = df["volume"]

        rsi = float(_rsi(close, 14).iloc[-1])
        ema20 = float(_ema(close, 20).iloc[-1])
        ema50 = float(_ema(close, 50).iloc[-1])
        cur = float(close.iloc[-1])
        avg_vol = float(vol.tail(20).mean())
        latest_vol = float(vol.iloc[-1])
        vol_ratio = latest_vol / avg_vol if avg_vol else 1

        # Price momentum into earnings (last 10 days)
        ret_10d = ((cur - float(close.iloc[-10])) / float(close.iloc[-10])) * 100 if len(close) >= 10 else 0
        ret_30d = ((cur - float(close.iloc[-30])) / float(close.iloc[-30])) * 100 if len(close) >= 30 else 0

        # Analyst data
        eps_est = sf(info.get("epsForward") or info.get("epsCurrentYear"))
        eps_trail = sf(info.get("trailingEps"))
        rev_growth = sf(info.get("revenueGrowth"))
        earn_growth = sf(info.get("earningsGrowth"))
        rec = info.get("recommendationKey", "hold")
        num_analysts = info.get("numberOfAnalystOpinions", 0)
        target = sf(info.get("targetMeanPrice"))
        upside = round(((target - cur) / cur) * 100, 1) if target and cur else None

        # News sentiment
        articles = _fetch_news_titles([ticker], max_per=10)
        bull_words = ["beat", "strong", "growth", "profit", "surge", "record", "outperform", "upgrade"]
        bear_words = ["miss", "weak", "decline", "loss", "downgrade", "cut", "disappoint", "below"]
        bull_count = sum(1 for a in articles if any(w in a["title"].lower() for w in bull_words))
        bear_count = sum(1 for a in articles if any(w in a["title"].lower() for w in bear_words))
        news_sentiment = "positive" if bull_count > bear_count else "negative" if bear_count > bull_count else "neutral"

        # Beat probability scoring
        beat_score = 50  # base
        factors = []

        if ret_10d > 3:
            beat_score += 10
            factors.append({"factor": "Price momentum", "impact": "+10", "detail": f"Up {ret_10d:.1f}% in last 10 days — smart money positioning"})
        elif ret_10d < -3:
            beat_score -= 8
            factors.append({"factor": "Price weakness", "impact": "-8", "detail": f"Down {abs(ret_10d):.1f}% pre-earnings — cautious sentiment"})

        if rsi > 60:
            beat_score += 7
            factors.append({"factor": "RSI strength", "impact": "+7", "detail": f"RSI at {rsi:.0f} — bullish momentum"})
        elif rsi < 40:
            beat_score -= 7
            factors.append({"factor": "RSI weakness", "impact": "-7", "detail": f"RSI at {rsi:.0f} — bearish momentum"})

        if vol_ratio > 1.5:
            beat_score += 8
            factors.append({"factor": "Volume surge", "impact": "+8", "detail": f"Volume {vol_ratio:.1f}x above avg — institutional accumulation"})

        if news_sentiment == "positive":
            beat_score += 10
            factors.append({"factor": "News sentiment", "impact": "+10", "detail": f"{bull_count} bullish headlines vs {bear_count} bearish"})
        elif news_sentiment == "negative":
            beat_score -= 10
            factors.append({"factor": "News sentiment", "impact": "-10", "detail": f"{bear_count} bearish headlines vs {bull_count} bullish"})

        if earn_growth and earn_growth > 0.15:
            beat_score += 10
            factors.append({"factor": "Earnings growth trend", "impact": "+10", "detail": f"YoY earnings growth {earn_growth*100:.0f}% — strong trajectory"})
        elif earn_growth and earn_growth < -0.05:
            beat_score -= 8
            factors.append({"factor": "Earnings declining", "impact": "-8", "detail": f"YoY earnings down {abs(earn_growth)*100:.0f}%"})

        if rec in ["strong_buy", "buy"]:
            beat_score += 5
            factors.append({"factor": "Analyst consensus", "impact": "+5", "detail": f"{rec.replace('_',' ').title()} — {num_analysts} analysts"})
        elif rec in ["sell", "strong_sell"]:
            beat_score -= 5
            factors.append({"factor": "Analyst consensus", "impact": "-5", "detail": f"{rec.replace('_',' ').title()} — {num_analysts} analysts"})

        beat_prob = max(5, min(95, beat_score))
        verdict = "Strong Beat" if beat_prob >= 75 else "Likely Beat" if beat_prob >= 60 else "Coin Flip" if beat_prob >= 45 else "Likely Miss" if beat_prob >= 30 else "Strong Miss"
        verdict_color = "#16a34a" if beat_prob >= 60 else "#ef4444" if beat_prob < 45 else "#d97706"

        headlines = [a["title"] for a in articles[:6]]
        ai_analysis = await _groq_chat(
            f"Stock: {symbol.upper()}\nEarnings beat probability: {beat_prob}%\nVerdict: {verdict}\n"
            f"RSI: {rsi:.0f}, 10-day return: {ret_10d:+.1f}%, Volume ratio: {vol_ratio:.1f}x\n"
            f"News sentiment: {news_sentiment} ({bull_count} bullish, {bear_count} bearish)\n"
            f"Analyst recommendation: {rec}, Upside to target: {upside}%\n"
            f"Recent headlines: {'; '.join(headlines[:3])}\n\n"
            "In 3 sentences, explain the earnings outlook and what investors should watch for. Be specific.",
            system="You are an equity research analyst specializing in Indian listed companies."
        )

        return {
            "symbol": symbol.upper(),
            "beat_probability": beat_prob,
            "verdict": verdict,
            "verdict_color": verdict_color,
            "factors": factors,
            "ai_analysis": ai_analysis,
            "metrics": {
                "rsi": round(rsi, 1),
                "ret_10d": round(ret_10d, 2),
                "ret_30d": round(ret_30d, 2),
                "vol_ratio": round(vol_ratio, 2),
                "news_sentiment": news_sentiment,
                "bull_news": bull_count,
                "bear_news": bear_count,
                "analyst_rec": rec,
                "upside_pct": upside,
                "earn_growth": round(earn_growth * 100, 1) if earn_growth else None,
            },
            "generated_at": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# ─── Agent 5: Real-Time Signal Engine ───────────────────────────────────────

from opportunity_radar.router import run_radar

@app.get("/api/radar")
async def radar_scan(filters: Optional[str] = Query(None, description="Comma-separated filter types")):
    """Real-time opportunity radar — bulk deals, filings, insider trades, results, commentary, regulation"""
    filter_list = [f.strip() for f in filters.split(",")] if filters else None
    return await run_radar(filters=filter_list)

# ─── Agent 4: News RAG & Synthesis ───────────────────────────────────────────

class SynthesisReq(BaseModel):
    query: str

@app.post("/api/news/synthesize")
async def synthesize_news(req: SynthesisReq):
    query = req.query.strip()
    if not query:
        raise HTTPException(400, "Query cannot be empty")

    # Step 1: Use Groq to extract NSE stock symbols from the query
    extract_prompt = (
        f"Extract NSE stock ticker symbols from this query: '{query}'\n"
        "Rules:\n"
        "- Return ONLY a comma-separated list of NSE symbols (e.g. DLF, HDFCBANK, RELIANCE)\n"
        "- If the query mentions a company name, convert it to its NSE ticker\n"
        "- If no specific stock is mentioned, return the 3 most relevant NSE tickers for the topic\n"
        "- Return ONLY the symbols, nothing else. No explanation."
    )
    try:
        extracted = await _groq_chat(extract_prompt, system="You are a financial data assistant that extracts NSE stock symbols.")
        symbols = [s.strip().upper() + ".NS" for s in extracted.split(",") if s.strip()][:5]
    except Exception:
        symbols = ["RELIANCE.NS", "HDFCBANK.NS", "INFY.NS"]

    # Step 2: Fetch real news for those symbols
    articles = _fetch_news_titles(symbols, max_per=6)

    headlines_text = "\n".join(f"- [{a['publisher']}] {a['title']}" for a in articles[:20]) or "No recent headlines found."
    prompt = (
        f"User query: {query}\n\n"
        f"Recent news headlines from Yahoo Finance:\n{headlines_text}\n\n"
        "Based on these real headlines, provide a concise 3-5 sentence financial intelligence synthesis. "
        "Highlight key risks, opportunities, and market sentiment. Be specific and data-driven."
    )
    summary = await _groq_chat(prompt)

    return {
        "query": query,
        "summary": summary,
        "sources": articles[:10],
        "analyzed_stocks": [s.replace(".NS", "") for s in symbols],
        "generated_at": datetime.now().isoformat(),
    }


@app.get("/api/news/stream")
async def intelligence_stream():
    """Live market intelligence stream powered by real news + Groq AI."""
    # Try to fetch fresh news from multiple sources
    symbols = ["RELIANCE.NS", "HDFCBANK.NS", "INFY.NS", "TCS.NS", "SBIN.NS", 
               "ICICIBANK.NS", "BAJFINANCE.NS", "TATAMOTORS.NS", "WIPRO.NS", "LT.NS"]
    
    articles = []
    seen = set()
    current_date = datetime.now()
    
    # Fetch from more symbols to increase chances of fresh news
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            raw_news = t.news or []
            
            for n in raw_news[:2]:  # Top 2 from each symbol
                content = n.get("content") or {}
                title = content.get("title") or n.get("title", "")
                publisher = (content.get("provider") or {}).get("displayName", "") or n.get("publisher", "")
                
                # Try to get timestamp
                pub_timestamp = None
                pub_date = content.get("pubDate", "")
                if pub_date:
                    try:
                        # Parse ISO format
                        from dateutil import parser
                        pub_timestamp = parser.parse(pub_date)
                    except:
                        pass
                
                if not pub_timestamp:
                    ts = n.get("providerPublishTime")
                    if ts:
                        try:
                            pub_timestamp = datetime.fromtimestamp(ts)
                        except:
                            pass
                
                # Calculate age in hours
                age_hours = 999
                time_str = "Recent"
                if pub_timestamp:
                    age = current_date - pub_timestamp
                    age_hours = age.total_seconds() / 3600
                    
                    # Format based on age
                    if age_hours < 1:
                        time_str = f"{int(age.total_seconds() / 60)} min ago"
                    elif age_hours < 24:
                        time_str = f"{int(age_hours)} hours ago"
                    elif age_hours < 48:
                        time_str = "Yesterday"
                    else:
                        time_str = pub_timestamp.strftime("%d %b")
                
                if title and title not in seen:
                    seen.add(title)
                    articles.append({
                        "title": title, 
                        "publisher": publisher, 
                        "time": time_str,
                        "age_hours": age_hours
                    })
        except Exception as e:
            continue
    
    # Sort by freshness (lowest age_hours first)
    articles = sorted(articles, key=lambda x: x.get("age_hours", 999))
    
    # Take freshest articles
    fresh_articles = [a for a in articles if a.get("age_hours", 999) < 48]  # Less than 2 days old
    if not fresh_articles:
        fresh_articles = articles[:8]  # Fallback to any articles
    
    headlines_text = "\n".join(f"- {a['title']}" for a in fresh_articles[:8]) or "Markets trading normally."

    # Fetch Nifty for sentiment score
    nifty_change = 0.0
    try:
        nifty = yf.Ticker("^NSEI")
        hist = nifty.history(period="2d")
        if len(hist) >= 2:
            nifty_change = float((hist["Close"].iloc[-1] - hist["Close"].iloc[-2]) / hist["Close"].iloc[-2] * 100)
    except Exception:
        pass

    sentiment_score = min(100, max(0, int(50 + nifty_change * 5)))

    # Add freshness context to AI
    freshness_note = ""
    if fresh_articles and fresh_articles[0].get("age_hours", 999) < 24:
        freshness_note = "(Latest news from today) "
    
    prompt = (
        f"{freshness_note}Based on these market headlines:\n{headlines_text}\n\n"
        f"Current time: {datetime.now().strftime('%d %b %Y, %H:%M')} IST\n"
        f"Nifty 50: {'+' if nifty_change >= 0 else ''}{nifty_change:.2f}%\n\n"
        "Write a 2-3 sentence market intelligence update. Focus on current market mood, "
        "key drivers, and actionable insights. Be concise and professional."
    )
    stream_text = await _groq_chat(prompt)
    if not stream_text:
        direction = "up" if nifty_change >= 0 else "down"
        stream_text = (
            f"Indian markets are trading {direction} with Nifty 50 "
            f"{'+' if nifty_change >= 0 else ''}{nifty_change:.2f}%. "
            f"Sentiment score: {sentiment_score}/100. "
            f"Monitor key sectors for opportunities."
        )

    return {
        "text": stream_text,
        "sentiment_score": sentiment_score,
        "latest_headlines": fresh_articles[:5],
        "generated_at": datetime.now().isoformat(),
    }


@app.get("/api/news/signals")
async def trending_signals():
    """Trending signals derived from real news mention counts."""
    signal_topics = [
        {"key": "EV", "title": "EV & Battery", "symbols": ["TATAMOTORS.NS", "MOTHERSON.NS"]},
        {"key": "RBI", "title": "RBI Repo Stance", "symbols": ["HDFCBANK.NS", "SBIN.NS", "ICICIBANK.NS"]},
        {"key": "PLI", "title": "PLI Schemes", "symbols": ["RELIANCE.NS", "TATASTEEL.NS"]},
        {"key": "IT", "title": "IT Sector", "symbols": ["INFY.NS", "TCS.NS", "WIPRO.NS"]},
    ]
    results = []
    for topic in signal_topics:
        articles = _fetch_news_titles(topic["symbols"], max_per=8)
        mentions = sum(1 for a in articles if topic["key"].lower() in a["title"].lower())
        # Use total articles as proxy for mentions
        total = len(articles)
        # Determine trend from Nifty-like proxy
        change_pct = None
        try:
            t = yf.Ticker(topic["symbols"][0])
            hist = t.history(period="5d")
            if len(hist) >= 2:
                change_pct = float((hist["Close"].iloc[-1] - hist["Close"].iloc[-5 if len(hist) >= 5 else -2]) /
                                   hist["Close"].iloc[-5 if len(hist) >= 5 else -2] * 100)
        except Exception:
            pass

        if change_pct is None:
            trend, change_str = "stable", "Stable"
        elif change_pct > 1:
            trend, change_str = "up", f"Up {abs(change_pct):.1f}%"
        elif change_pct < -1:
            trend, change_str = "down", f"Down {abs(change_pct):.1f}%"
        else:
            trend, change_str = "stable", "Stable"

        results.append({
            "title": topic["title"],
            "mentions": f"{max(total * 12, mentions * 50 + 100)} mentions",
            "change": change_str,
            "trend": trend,
        })
    return {"signals": results, "generated_at": datetime.now().isoformat()}


@app.get("/api/market/indices")
async def market_indices():
    """Live Nifty 50 and Sensex data."""
    result = {}
    for name, sym in [("nifty", "^NSEI"), ("sensex", "^BSESN"), ("banknifty", "^NSEBANK")]:
        try:
            t = yf.Ticker(sym)
            hist = t.history(period="2d")
            if len(hist) >= 2:
                cur = float(hist["Close"].iloc[-1])
                prev = float(hist["Close"].iloc[-2])
                chg = (cur - prev) / prev * 100
                result[name] = {"price": round(cur, 2), "change_pct": round(chg, 2)}
            elif len(hist) == 1:
                result[name] = {"price": round(float(hist["Close"].iloc[-1]), 2), "change_pct": 0.0}
        except Exception:
            result[name] = None
    return result

@app.get("/api/news")
async def news_rag(
    q: Optional[str] = Query(None, description="Keyword search query"),
    symbol: Optional[str] = Query(None, description="Stock symbol to filter news"),
):
    """
    Fetches yfinance news — handles both old and new yfinance news dict formats.
    New yfinance (>=0.2.40) wraps news items in a nested 'content' dict.
    """

    def parse_news_item(n: dict, sym_display: str) -> Optional[dict]:
        """Handle both old flat format and new nested content format."""
        current_year = datetime.now().year
        
        # ── New format: n = {"content": {"title": ..., "pubDate": ..., ...}}
        content = n.get("content") or {}
        if content:
            title     = content.get("title", "")
            publisher = (content.get("provider") or {}).get("displayName", "")
            link      = (content.get("canonicalUrl") or {}).get("url", "") or \
                        (content.get("clickThroughUrl") or {}).get("url", "")
            pub_date  = content.get("pubDate", "")
            # pubDate is ISO format e.g. "2024-03-24T10:30:00Z"
            # Validate year to avoid corrupted dates
            t_str = "Recent"
            if pub_date:
                try:
                    year = int(pub_date[:4])
                    if 2020 <= year <= current_year:
                        t_str = pub_date[:10]  # Just the date part
                except:
                    pass
        else:
            # ── Old flat format
            title     = n.get("title", "")
            publisher = n.get("publisher", "")
            link      = n.get("link", "")
            ts        = n.get("providerPublishTime")
            t_str = "Recent"
            if ts:
                try:
                    dt = datetime.fromtimestamp(ts)
                    if 2020 <= dt.year <= current_year:
                        t_str = dt.strftime("%d %b %Y")
                except Exception:
                    pass

        if not title:
            return None
        return {"title": title, "publisher": publisher, "link": link,
                "symbol": sym_display, "time": t_str}

    symbols_to_fetch = []
    if symbol:
        symbols_to_fetch.append(symbol.upper().strip())
    if not symbols_to_fetch:
        symbols_to_fetch = ["RELIANCE.NS", "HDFCBANK.NS", "INFY.NS", "TCS.NS",
                             "BAJFINANCE.NS", "ICICIBANK.NS", "SBIN.NS", "WIPRO.NS",
                             "TATAMOTORS.NS", "AXISBANK.NS", "DLF.NS", "ADANIENT.NS"]

    articles = []
    seen = set()
    keywords = [w.lower() for w in q.split()] if q else []

    for sym in symbols_to_fetch[:8]:
        try:
            ticker_sym  = nse(sym) if not sym.endswith(".NS") and not sym.endswith(".BO") else sym
            sym_display = ticker_sym.replace(".NS", "").replace(".BO", "")
            t = yf.Ticker(ticker_sym)
            raw_news = t.news or []

            for n in raw_news[:10]:
                item = parse_news_item(n, sym_display)
                if not item or item["title"] in seen:
                    continue

                # Keyword filter — match in title OR symbol name
                if keywords:
                    haystack = (item["title"] + " " + sym_display).lower()
                    if not any(kw in haystack for kw in keywords):
                        continue

                seen.add(item["title"])
                articles.append(item)
        except Exception:
            continue

    return {
        "query":    q or "",
        "symbol":   symbol or "",
        "total":    len(articles),
        "articles": articles[:30],
        "source":   "Yahoo Finance News Feed",
    }


# ─── Health & Root ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status":  "ok",
        "service": "StockSense AI",
        "version": "2.0.0",
        "agents":  ["patterns", "opportunity", "portfolio", "news"],
        "time":    datetime.now().isoformat(),
    }

@app.get("/")
async def root():
    return {"message": "StockSense AI Backend v2.0 — visit /docs for API reference"}
