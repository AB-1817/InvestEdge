from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime

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


# ─── Agent 4: News RAG ────────────────────────────────────────────────────────

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
        # ── New format: n = {"content": {"title": ..., "pubDate": ..., ...}}
        content = n.get("content") or {}
        if content:
            title     = content.get("title", "")
            publisher = (content.get("provider") or {}).get("displayName", "")
            link      = (content.get("canonicalUrl") or {}).get("url", "") or \
                        (content.get("clickThroughUrl") or {}).get("url", "")
            pub_date  = content.get("pubDate", "")
            # pubDate is ISO format e.g. "2024-03-24T10:30:00Z"
            t_str = pub_date[:10] if pub_date else ""
        else:
            # ── Old flat format
            title     = n.get("title", "")
            publisher = n.get("publisher", "")
            link      = n.get("link", "")
            ts        = n.get("providerPublishTime")
            try:
                t_str = datetime.fromtimestamp(ts).strftime("%d %b %Y") if ts else ""
            except Exception:
                t_str = ""

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
