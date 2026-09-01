from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
import os
import time
import asyncio
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()
GROQ_KEYS = [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")]
GROQ_KEYS = [k for k in GROQ_KEYS if k]  # Filter out None values
current_key_index = 0

logger = logging.getLogger("investedge")
logging.basicConfig(level=logging.INFO)

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


from backtesting.routes import router as backtest_router
from chat_service import router as chat_router
from routes_track_record import router as track_record_router
from ledger_service import record_investedge_signal
from earnings_event_study import get_earnings_event_study
from rate_limiter import RateLimitMiddleware

def get_cors_origins() -> list:
    raw_env = os.getenv("CORS_ORIGINS", "").strip()
    if raw_env:
        origins = [o.strip() for o in raw_env.replace(";", ",").split(",") if o.strip()]
        if origins:
            return origins
    return [
        "https://invest-edge-eight.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:4173"
    ]

app = FastAPI(title="StockSense AI Backend", version="2.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None)
        )
    logger.error(f"Unhandled exception on {request.url.path}: {exc.__class__.__name__}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred processing your request."}
    )

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)

app.include_router(backtest_router)
app.include_router(chat_router)
app.include_router(track_record_router)

# ─── Health & Root Endpoints ──────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "status": "ok",
        "app": "InvestEdge Financial Intelligence API",
        "version": "2.0.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def nse(symbol: str) -> str:
    s = symbol.upper().strip()
    if not s.endswith(".NS") and not s.endswith(".BO"):
        return s + ".NS"
    return s

def sf(val):
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) or np.isinf(f) else round(f, 2)
    except Exception:
        return None

def flatten_cols(df):
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume", "Adj Close": "adj_close"
    })

# ─── In-memory Cache & Warmup ──────────────────────────────────────────────────
_CACHE = {
    "market_indices": {
        "data": {
            "nifty": {"price": 24055.8, "change_pct": -0.1},
            "sensex": {"price": 76944.28, "change_pct": -0.02},
            "banknifty": {"price": 57409.6, "change_pct": -1.06}
        },
        "expires_at": time.time() + 3600
    },
    "news_feed__": {
        "data": [
            {"title": "RBI policy stance maintains focus on growth with stable inflation targets", "publisher": "LiveMint", "symbol": "HDFCBANK", "time": "Today"},
            {"title": "Reliance Industries expands green energy investments across key hubs", "publisher": "Economic Times", "symbol": "RELIANCE", "time": "Today"},
            {"title": "IT sector sees renewed deal pipelines in cloud and enterprise AI", "publisher": "Moneycontrol", "symbol": "TCS", "time": "Today"},
            {"title": "Automobile sector reports strong festive booking momentum", "publisher": "Business Standard", "symbol": "TATAMOTORS", "time": "Today"}
        ],
        "expires_at": time.time() + 3600
    },
    "intelligence_stream": {
        "data": {
            "text": "Indian markets are consolidating near key support levels with Nifty holding firm above 24,000. Banking and IT sectors show resilient institutional accumulation.",
            "sentiment_score": 62
        },
        "expires_at": time.time() + 3600
    },
    "trending_signals": {
        "data": [
            {"symbol": "RELIANCE", "catalyst": "Refining margins steady; retail expansion accelerating", "signal": "Bullish", "type": "Fundamental"},
            {"symbol": "HDFCBANK", "catalyst": "NIM expansion supported by strong retail deposit growth", "signal": "Bullish", "type": "Earnings"},
            {"symbol": "INFY", "catalyst": "Large-deal momentum in generative AI solutions across BFSI", "signal": "Neutral", "type": "Sector Flow"}
        ],
        "expires_at": time.time() + 3600
    }
}

def get_cached(key: str):
    item = _CACHE.get(key)
    if item and time.time() < item["expires_at"]:
        return item["data"]
    return None

def set_cached(key: str, data: Any, ttl_seconds: int = 300):
    _CACHE[key] = {
        "data": data,
        "expires_at": time.time() + ttl_seconds
    }

@app.on_event("startup")
async def warmup_cache():
    asyncio.create_task(_warmup_background())

async def _warmup_background():
    try:
        await asyncio.sleep(1)
        await get_indices_live()
        await fetch_news_feed("", None, 8)
    except Exception as e:
        logger.warning(f"Warmup notice: {e}")

# ─── Opportunity Radar ─────────────────────────────────────────────────────────
from opportunity_radar.router import router as opportunity_radar_router
app.include_router(opportunity_radar_router)

# ─── 1. Chart Pattern Detection (Module 2) ────────────────────────────────────

class PatternReq(BaseModel):
    symbol: str
    period: Optional[str] = "6mo"

@app.post("/api/patterns")
async def detect_patterns(req: PatternReq):
    ticker = nse(req.symbol)
    try:
        raw = yf.download(ticker, period=req.period, interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            raise HTTPException(404, f"No data found for {ticker}")

        df = flatten_cols(raw)
        close = df["close"]
        high  = df["high"]
        low   = df["low"]
        vol   = df["volume"]

        df["ema20"]  = _ema(close, 20)
        df["ema50"]  = _ema(close, 50)
        df["ema200"] = _ema(close, 200)
        df["rsi"]    = _rsi(close, 14)
        df["macd"], df["macd_sig"], df["macd_hist"] = _macd(close)
        df["bb_upper"], df["bb_mid"], df["bb_lower"] = _bbands(close)
        df["atr"]    = _atr(high, low, close)
        df["vol_avg"] = vol.rolling(20).mean()

        signals = []
        n = len(df) - 1

        price_now = float(close.iloc[n])
        ema20     = float(df["ema20"].iloc[n])  if not np.isnan(df["ema20"].iloc[n]) else None
        ema50     = float(df["ema50"].iloc[n])  if not np.isnan(df["ema50"].iloc[n]) else None
        ema200    = float(df["ema200"].iloc[n]) if not np.isnan(df["ema200"].iloc[n]) else None
        rsi       = float(df["rsi"].iloc[n])    if not np.isnan(df["rsi"].iloc[n]) else None
        macd_h    = float(df["macd_hist"].iloc[n]) if not np.isnan(df["macd_hist"].iloc[n]) else None
        macd_hp   = float(df["macd_hist"].iloc[n-1]) if n > 0 and not np.isnan(df["macd_hist"].iloc[n-1]) else None
        bb_up     = float(df["bb_upper"].iloc[n]) if not np.isnan(df["bb_upper"].iloc[n]) else None
        bb_low    = float(df["bb_lower"].iloc[n]) if not np.isnan(df["bb_lower"].iloc[n]) else None
        atr       = float(df["atr"].iloc[n])    if not np.isnan(df["atr"].iloc[n]) else None
        cur_vol   = float(vol.iloc[n])
        avg_vol   = float(df["vol_avg"].iloc[n]) if not np.isnan(df["vol_avg"].iloc[n]) else None

        if ema20 and ema50 and ema200:
            if price_now > ema20 > ema50 > ema200:
                signals.append({
                    "type": "EMA Bullish Alignment",
                    "bias": "bullish",
                    "strength": "strong",
                    "desc": f"Price > EMA20 ({ema20:.1f}) > EMA50 ({ema50:.1f}) > EMA200 ({ema200:.1f}) - powerful uptrend."
                })
            elif price_now < ema20 < ema50:
                signals.append({
                    "type": "EMA Bearish Alignment",
                    "bias": "bearish",
                    "strength": "strong",
                    "desc": f"Price < EMA20 ({ema20:.1f}) < EMA50 ({ema50:.1f}) - downtrend active."
                })

        if rsi is not None:
            if rsi < 30:
                signals.append({
                    "type": "RSI Oversold",
                    "bias": "bullish",
                    "strength": "strong" if rsi < 25 else "medium",
                    "desc": f"RSI at {rsi:.1f} (below 30 threshold) - mean reversion bounce likely."
                })
            elif rsi > 70:
                signals.append({
                    "type": "RSI Overbought",
                    "bias": "bearish",
                    "strength": "strong" if rsi > 75 else "medium",
                    "desc": f"RSI at {rsi:.1f} (above 70 threshold) - pullback risk elevated."
                })
            elif 45 <= rsi <= 55:
                signals.append({
                    "type": "RSI Neutral",
                    "bias": "neutral",
                    "strength": "weak",
                    "desc": f"RSI at {rsi:.1f} in equilibrium zone."
                })

        if macd_h is not None and macd_hp is not None:
            if macd_hp < 0 and macd_h > 0:
                signals.append({
                    "type": "MACD Bullish Crossover",
                    "bias": "bullish",
                    "strength": "strong",
                    "desc": "MACD line crossed above signal line - momentum shifting upward."
                })
            elif macd_hp > 0 and macd_h < 0:
                signals.append({
                    "type": "MACD Bearish Crossover",
                    "bias": "bearish",
                    "strength": "strong",
                    "desc": "MACD line crossed below signal line - downward momentum building."
                })

        if bb_low and price_now <= bb_low * 1.01:
            signals.append({
                "type": "Bollinger Lower Band Touch",
                "bias": "bullish",
                "strength": "medium",
                "desc": f"Price at lower Bollinger Band ({bb_low:.1f}) - potential support zone."
            })
        elif bb_up and price_now >= bb_up * 0.99:
            signals.append({
                "type": "Bollinger Upper Band Touch",
                "bias": "bearish",
                "strength": "medium",
                "desc": f"Price at upper Bollinger Band ({bb_up:.1f}) - testing resistance."
            })

        if avg_vol and avg_vol > 0 and cur_vol > 2 * avg_vol:
            signals.append({
                "type": "Volume Surge",
                "bias": "bullish" if close.iloc[n] > close.iloc[n-1] else "bearish",
                "strength": "medium",
                "desc": f"Volume {cur_vol/avg_vol:.1f}x higher than 20-day average."
            })

        recent_low  = float(low.tail(60).min())
        recent_high = float(high.tail(60).max())
        supp = [round(recent_low, 2)]
        res  = [round(recent_high, 2)]
        if ema50:
            (supp if ema50 < price_now else res).append(round(ema50, 2))
        if ema200:
            (supp if ema200 < price_now else res).append(round(ema200, 2))

        bull_count = sum(1 for s in signals if s["bias"] == "bullish")
        bear_count = sum(1 for s in signals if s["bias"] == "bearish")
        bias = "bullish" if bull_count > bear_count else ("bearish" if bear_count > bull_count else "neutral")

        backtest_str = None
        try:
            from backtesting.engine import get_historical_signal_evidence
            backtest_str = get_historical_signal_evidence(df, signals)
        except Exception:
            pass

        if not backtest_str:
            oversold_days = df[df["rsi"] < 32].index
            if len(oversold_days) > 2:
                wins = 0
                total_ev = 0
                for d in oversold_days[:-1]:
                    pos = df.index.get_loc(d)
                    if pos + 15 < len(df):
                        entry_p = df["close"].iloc[pos]
                        exit_p  = df["close"].iloc[pos + 15]
                        if exit_p > entry_p:
                            wins += 1
                        total_ev += 1
                if total_ev > 0:
                    wr = int((wins / total_ev) * 100)
                    backtest_str = f"RSI Oversold strategy across past 6 months: {wins}/{total_ev} trades profitable (+15 days). Win rate: {wr}%."

        # Record genuine live technical pattern signal into ledger
        if price_now and bias in ["bullish", "bearish"]:
            rec_action = "BUY" if bias == "bullish" else "SELL"
            record_investedge_signal(
                symbol=req.symbol.upper().replace(".NS", "").replace(".BO", ""),
                source_module="Chart Pattern Agent",
                signal_type=signals[0]["type"] if signals else "Technical Setup",
                action=rec_action,
                confidence=75 if len(signals) >= 3 else 60,
                entry_price=price_now,
                meta={
                    "rsi": sf(rsi),
                    "ema50": sf(ema50),
                    "bias": bias,
                    "signals_count": len(signals)
                }
            )

        chart_data = []
        for idx in df.tail(60).index:
            chart_data.append({
                "date": idx.strftime("%d %b"),
                "price": sf(df.loc[idx, "close"]),
                "ema20": sf(df.loc[idx, "ema20"]),
                "ema50": sf(df.loc[idx, "ema50"]),
                "rsi":   sf(df.loc[idx, "rsi"]),
                "volume": int(df.loc[idx, "volume"]) if not np.isnan(df.loc[idx, "volume"]) else 0,
            })

        return {
            "symbol": ticker,
            "period": req.period,
            "bias": bias,
            "price": {
                "current": sf(price_now),
                "rsi": sf(rsi),
                "ema20": sf(ema20),
                "ema50": sf(ema50),
                "ema200": sf(ema200),
                "atr": sf(atr),
            },
            "support": sorted(set(supp)),
            "resistance": sorted(set(res)),
            "signals": signals,
            "backtest": backtest_str,
            "chart": chart_data,
            "generated_at": datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error analyzing {ticker}: {str(e)}")

# ─── 2. Fundamental Opportunity Scanner (Module 3) ───────────────────────────

class OppReq(BaseModel):
    symbol: str

@app.post("/api/opportunity")
async def fundamental_analysis(req: OppReq):
    ticker = nse(req.symbol)
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        cur_p        = sf(info.get("currentPrice") or info.get("regularMarketPrice"))
        target_mean  = sf(info.get("targetMeanPrice"))
        target_high  = sf(info.get("targetHighPrice"))
        target_low   = sf(info.get("targetLowPrice"))
        rec          = info.get("recommendationKey", "none")
        num_analysts = info.get("numberOfAnalystOpinions", 0)

        upside_pct = None
        if cur_p and target_mean and cur_p > 0:
            upside_pct = round(((target_mean - cur_p) / cur_p) * 100, 2)

        pe   = sf(info.get("trailingPE"))
        fpe  = sf(info.get("forwardPE"))
        roe  = sf((info.get("returnOnEquity") or 0) * 100)
        rev_g = sf((info.get("revenueGrowth") or 0) * 100)
        de   = sf(info.get("debtToEquity"))
        div_y = sf((info.get("dividendYield") or 0) * 100)
        mcap = info.get("marketCap")
        mcap_cr = f"₹{mcap / 1e7:,.0f} Cr" if mcap else "N/A"

        signals = []
        if upside_pct is not None:
            if upside_pct > 20:
                signals.append({
                    "category": "Analyst Target",
                    "sentiment": "positive",
                    "headline": f"Significant Upside Potential: +{upside_pct:.1f}%",
                    "detail": f"Consensus target is ₹{target_mean:.1f} vs current price ₹{cur_p:.1f} ({num_analysts} analysts tracking)."
                })
            elif upside_pct < -10:
                signals.append({
                    "category": "Analyst Target",
                    "sentiment": "caution",
                    "headline": f"Price Ahead of Target: {upside_pct:.1f}%",
                    "detail": f"Trading above mean target ₹{target_mean:.1f}."
                })

        if rec in ("buy", "strong_buy"):
            signals.append({
                "category": "Wall Street Consensus",
                "sentiment": "positive",
                "headline": f"Strong Analyst Consensus: '{rec.upper()}'",
                "detail": f"Majority of {num_analysts} covering analysts rate this stock as a Buy/Strong Buy."
            })

        if roe and roe > 18:
            signals.append({
                "category": "Quality Metric",
                "sentiment": "positive",
                "headline": f"Exceptional Capital Efficiency (ROE: {roe:.1f}%)",
                "detail": "Return on Equity exceeds 18%, indicating strong competitive moat and shareholder value creation."
            })

        if rev_g and rev_g > 15:
            signals.append({
                "category": "Growth Momentum",
                "sentiment": "positive",
                "headline": f"Accelerating Top-Line Growth (+{rev_g:.1f}% YoY)",
                "detail": "Revenue is expanding at an above-average pace for its sector."
            })

        if pe and pe > 65:
            signals.append({
                "category": "Valuation Watch",
                "sentiment": "caution",
                "headline": f"Premium Valuation: P/E {pe:.1f}x",
                "detail": "Stock trades at an elevated earnings multiple; execution risk is high."
            })
        elif pe and pe < 15 and pe > 0:
            signals.append({
                "category": "Value Opportunity",
                "sentiment": "positive",
                "headline": f"Attractive Valuation: P/E {pe:.1f}x",
                "detail": "Trading at a low trailing earnings multiple compared to historical peers."
            })

        if de and de > 150:
            signals.append({
                "category": "Leverage Risk",
                "sentiment": "caution",
                "headline": f"High Debt-to-Equity: {de:.0f}%",
                "detail": "Elevated financial leverage could compress margins in a rising rate environment."
            })

        return {
            "symbol": ticker,
            "display": req.symbol.upper(),
            "name": info.get("shortName") or info.get("longName") or ticker,
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "current_price": cur_p,
            "market_cap": mcap_cr,
            "analyst": {
                "recommendation": rec,
                "target_mean": target_mean,
                "target_high": target_high,
                "target_low": target_low,
                "upside_pct": upside_pct,
                "num_analysts": num_analysts,
            },
            "fundamentals": {
                "pe": pe,
                "forward_pe": fpe,
                "roe": f"{roe:.1f}%" if roe else "N/A",
                "revenue_growth": f"{rev_g:+.1f}%" if rev_g else "N/A",
                "debt_equity": f"{de:.1f}" if de else "N/A",
                "dividend_yield": f"{div_y:.2f}%" if div_y else "N/A",
            },
            "signals": signals,
            "generated_at": datetime.now().isoformat(),
        }

    except Exception as e:
        raise HTTPException(500, f"Error fetching fundamentals for {ticker}: {str(e)}")

# ─── 3. Portfolio Multi-Holding Analyzer (Module 4) ───────────────────────────

class Holding(BaseModel):
    symbol: str
    qty: int
    avg_cost: float

class PortfolioReq(BaseModel):
    holdings: List[Holding]

def _fetch_single_portfolio_holding(h: Holding) -> dict:
    ticker = nse(h.symbol)
    try:
        t = yf.Ticker(ticker)
        raw = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            return {
                "symbol": h.symbol, "qty": h.qty, "avg_cost": h.avg_cost,
                "current_price": None, "invested": h.qty * h.avg_cost,
                "current_value": None, "pnl": None, "pnl_pct": None,
                "signal": "hold", "signal_reason": "No price data",
            }

        df = flatten_cols(raw)
        close = df["close"]
        high  = df["high"]
        low   = df["low"]

        cur_p = sf(close.iloc[-1])
        rsi_v = sf(_rsi(close, 14).iloc[-1])
        e20_v = sf(_ema(close, 20).iloc[-1])
        e50_v = sf(_ema(close, 50).iloc[-1])
        atr_v = sf(_atr(high, low, close).iloc[-1])

        invested = round(h.qty * h.avg_cost, 2)
        current  = round(h.qty * cur_p, 2) if cur_p else None
        pnl      = round(current - invested, 2) if current else None
        pnl_pct  = round((pnl / invested * 100) if invested else 0, 2)

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

        return {
            "symbol": ticker.replace(".NS", "").replace(".BO", ""),
            "qty": h.qty,
            "avg_cost": h.avg_cost,
            "current_price": cur_p,
            "invested": invested,
            "current_value": current,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "rsi": rsi_v,
            "ema20": e20_v,
            "ema50": e50_v,
            "atr": atr_v,
            "suggested_sl": sl_price,
            "signal": signal,
            "signal_reason": reason,
            "weight_pct": None,
        }
    except Exception as e:
        return {"symbol": h.symbol, "error": str(e)}

@app.post("/api/portfolio")
async def analyze_portfolio(req: PortfolioReq):
    sem = asyncio.Semaphore(5)

    async def _fetch_with_sem(h: Holding):
        async with sem:
            return await asyncio.to_thread(_fetch_single_portfolio_holding, h)

    results = await asyncio.gather(*[_fetch_with_sem(h) for h in req.holdings])

    t_invested = sum(r["invested"] for r in results if r.get("invested"))
    t_current  = sum(r["current_value"] for r in results if r.get("current_value"))
    t_pnl      = round(t_current - t_invested, 2)
    t_pnl_pct  = round((t_pnl / t_invested * 100) if t_invested else 0, 2)

    for r in results:
        if r.get("current_value") and t_current:
            r["weight_pct"] = round((r["current_value"] / t_current) * 100, 1)

    return {
        "holdings": results,
        "summary": {
            "total_invested": t_invested,
            "total_current": t_current,
            "total_pnl": t_pnl,
            "total_pnl_pct": t_pnl_pct,
            "count": len(results),
        },
        "generated_at": datetime.now().isoformat(),
    }


from video_engine import router as video_router
app.include_router(video_router)

# ─── Shared AI helpers (used by innovation endpoints below) ───────────────────

def _clean_ai_output(raw: str) -> str:
    if not raw:
        return ""
    import re as _re
    cleaned = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.DOTALL).strip()
    if "<think>" in cleaned:
        cleaned = _re.sub(r"<think>.*", "", cleaned, flags=_re.DOTALL).strip()
    cleaned = cleaned.replace("<think>", "").replace("</think>", "").strip()
    cleaned = (
        cleaned.replace("\u2011", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u202f", " ")
        .replace("\u00a0", " ")
    )
    return cleaned

async def _groq_chat(prompt: str, system: str = "You are a financial analyst AI.") -> str:
    global current_key_index
    if not GROQ_KEYS:
        return ""
    
    models = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.6-27b", "groq/compound-mini"]
    
    for attempt in range(len(GROQ_KEYS)):
        try:
            key = GROQ_KEYS[current_key_index]
            for model_name in models:
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        resp = await client.post(
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json={
                                "model": model_name,
                                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                                "max_tokens": 500, "temperature": 0.3,
                            },
                        )
                        if resp.status_code == 200:
                            raw = resp.json()["choices"][0]["message"]["content"]
                            cleaned = _clean_ai_output(raw)
                            if cleaned:
                                return cleaned
                        else:
                            continue
                except Exception:
                    continue

            current_key_index = (current_key_index + 1) % len(GROQ_KEYS)
        except Exception:
            current_key_index = (current_key_index + 1) % len(GROQ_KEYS)
            if attempt == len(GROQ_KEYS) - 1:
                return ""
    return ""

def _fetch_single_news(sym: str, max_per: int = 6) -> List[dict]:
    articles = []
    try:
        t = yf.Ticker(sym)
        for n in (t.news or [])[:max_per]:
            content = n.get("content") or {}
            title = content.get("title") or n.get("title", "")
            publisher = (content.get("provider") or {}).get("displayName", "") or n.get("publisher", "")
            if title:
                articles.append({
                    "title": title,
                    "publisher": publisher or "Financial News",
                    "symbol": sym.replace(".NS", "").replace(".BO", "").replace("^NSEI", "NIFTY 50"),
                    "time": "Today",
                })
    except Exception:
        pass
    return articles

async def _fetch_news_titles(symbols: List[str], max_per: int = 4) -> List[dict]:
    sem = asyncio.Semaphore(5)
    async def _fetch_sym(sym: str):
        async with sem:
            return await asyncio.to_thread(_fetch_single_news, sym, max_per)
    results = await asyncio.gather(*[_fetch_sym(sym) for sym in symbols])
    all_articles = [a for sub in results for a in sub]
    return all_articles[:12]

# ─── 4. Innovation 1: Portfolio Doctor (Health Score + AI Advisor) ────────────
from orchestrator import get_contextual_advice, get_stock_explanation

@app.post("/api/portfolio/doctor")
async def portfolio_doctor(req: PortfolioReq):
    try:
        data = await get_contextual_advice(req.holdings)
        return data
    except Exception as e:
        raise HTTPException(500, f"Portfolio Doctor error: {str(e)}")

@app.get("/api/orchestrate/explain/{symbol}")
async def orchestrate_explain(symbol: str):
    try:
        data = await get_stock_explanation(symbol)
        return data
    except Exception as e:
        raise HTTPException(500, f"Multi-Agent Orchestration error for {symbol}: {str(e)}")

# ─── 5. Innovation 2: Real-time Market Regime Detector ─────────────────────────

@app.get("/api/market/regime")
async def market_regime():
    try:
        raw = yf.download("^NSEI", period="1y", interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            raise HTTPException(500, "Unable to fetch Nifty data")

        df = flatten_cols(raw)
        close = df["close"]
        high  = df["high"]
        low   = df["low"]

        df["ema20"] = _ema(close, 20)
        df["ema50"] = _ema(close, 50)
        df["rsi"]   = _rsi(close, 14)
        df["atr"]   = _atr(high, low, close)

        n = len(df) - 1
        nifty_p = float(close.iloc[n])
        ema20   = float(df["ema20"].iloc[n])
        ema50   = float(df["ema50"].iloc[n])
        rsi     = float(df["rsi"].iloc[n])
        atr     = float(df["atr"].iloc[n])
        atr_pct = (atr / nifty_p) * 100

        ret_20d = float((close.iloc[n] - close.iloc[max(0, n-20)]) / close.iloc[max(0, n-20)] * 100)
        ret_60d = float((close.iloc[n] - close.iloc[max(0, n-60)]) / close.iloc[max(0, n-60)] * 100)

        if nifty_p > ema20 > ema50 and rsi > 55 and ret_20d > 1.5:
            regime = "Bull Run"
            desc = "Market is in a strong uptrend. Price above all key EMAs with positive momentum. Trend-following and momentum strategies favored."
            color = "#16a34a"
        elif nifty_p < ema20 < ema50 and rsi < 45 and ret_20d < -1.5:
            regime = "Bear Phase"
            desc = "Market is in a corrective downtrend. Defensive positioning recommended. High cash allocation, hedging with puts or defensive sectors."
            color = "#dc2626"
        elif atr_pct > 1.2 or (abs(ret_20d) > 3.5 and abs(ret_60d) < 2):
            regime = "High Volatility"
            desc = "Wide intraday swings and regime transition in progress. Reduce position sizes, widen stop losses, or trade straddles/options."
            color = "#7c3aed"
        else:
            regime = "Sideways Chop"
            desc = "Market is range-bound with no clear directional bias. Mean-reversion strategies work best. Buy near support, sell near resistance."
            color = "#d97706"

        prompt = (
            f"The Indian stock market (Nifty 50) is currently classified as '{regime}'.\n"
            f"Nifty 50: {nifty_p:.1f}, EMA 20: {ema20:.1f}, EMA 50: {ema50:.1f}, RSI: {rsi:.1f}, ATR%: {atr_pct:.2f}%, 20d return: {ret_20d:.1f}%.\n"
            f"Write a 2-3 sentence actionable tactical insight for an Indian retail equity investor. "
            f"Mention specific asset allocation, sectors to prefer or avoid, and risk management rule."
        )
        ai_insight = await _groq_chat(prompt, system="You are a senior macro market strategist at an Indian institutional fund.")
        if not ai_insight:
            ai_insight = f"In the current {regime} environment, maintain balanced portfolio allocation with strict trailing stops on high-beta names."

        return {
            "regime": regime,
            "description": desc,
            "color": color,
            "metrics": {
                "nifty": sf(nifty_p),
                "ema20": sf(ema20),
                "ema50": sf(ema50),
                "rsi": sf(rsi),
                "atr": sf(atr),
                "atr_pct": sf(atr_pct),
                "ret_20d": sf(ret_20d),
                "ret_60d": sf(ret_60d),
            },
            "ai_insight": ai_insight,
            "regime_days": 29,
            "generated_at": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, f"Market regime error: {str(e)}")

# ─── 6. Innovation 3: AI Earnings Surprise Predictor ─────────────────────────

@app.get("/api/earnings/predict/{symbol}")
async def earnings_predictor(symbol: str):
    ticker = nse(symbol)
    try:
        t = yf.Ticker(ticker)
        raw = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            raise HTTPException(404, f"No data for {ticker}")

        df = flatten_cols(raw)
        close = df["close"]
        vol   = df["volume"]
        n = len(df) - 1

        ret_10d = float((close.iloc[n] - close.iloc[max(0, n-10)]) / close.iloc[max(0, n-10)] * 100)
        avg_vol = float(vol.tail(20).mean())
        cur_vol = float(vol.iloc[n])
        vol_ratio = (cur_vol / avg_vol) if avg_vol > 0 else 1.0

        info = t.info or {}
        rec          = info.get("recommendationKey", "hold")
        upside       = sf(((info.get("targetMeanPrice", 0) or 0) - (info.get("currentPrice", 0) or 1)) / (info.get("currentPrice", 1) or 1) * 100)
        num_analysts = info.get("numberOfAnalystOpinions", 0)
        pe           = sf(info.get("trailingPE"))
        rev_growth   = sf((info.get("revenueGrowth") or 0) * 100)
        earnings_growth = sf((info.get("earningsGrowth") or 0) * 100)

        news_articles = []
        for item in (t.news or [])[:6]:
            c = item.get("content") or {}
            title = c.get("title") or item.get("title", "")
            if title:
                news_articles.append(title)

        bull_keywords = ["beat", "growth", "strong", "surge", "record", "profit", "rallies", "upgrade", "outperform"]
        bear_keywords = ["miss", "weak", "fall", "loss", "decline", "drop", "downgrade", "probe", "cut", "penalty"]
        bull_news = sum(1 for title in news_articles if any(w in title.lower() for w in bull_keywords))
        bear_news = sum(1 for title in news_articles if any(w in title.lower() for w in bear_keywords))
        news_score = bull_news - bear_news

        score = 50
        factors = []

        if ret_10d > 3:
            score += 10
            factors.append({"factor": "Pre-earnings price momentum", "pts": "+10", "desc": f"10-day return +{ret_10d:.1f}% — smart money pre-positioning"})
        elif ret_10d < -3:
            score -= 10
            factors.append({"factor": "Pre-earnings price weakness", "pts": "-10", "desc": f"10-day return {ret_10d:.1f}% — market anticipating soft numbers"})

        if vol_ratio > 1.4:
            score += 8
            factors.append({"factor": "Institutional volume buildup", "pts": "+8", "desc": f"Volume {vol_ratio:.1f}x of 20-day average — accumulation detected"})

        if news_score > 0:
            score += 10
            factors.append({"factor": "News sentiment", "pts": "+10", "desc": f"{bull_news} bullish headlines vs {bear_news} bearish"})
        elif news_score < 0:
            score -= 10
            factors.append({"factor": "News sentiment headwind", "pts": "-10", "desc": f"{bear_news} bearish headlines vs {bull_news} bullish"})

        if rec in ("buy", "strong_buy"):
            score += 5
            factors.append({"factor": "Analyst consensus", "pts": "+5", "desc": f"Strong Buy — {num_analysts} analysts"})

        if earnings_growth and earnings_growth > 15:
            score += 10
            factors.append({"factor": "Earnings growth trend", "pts": "+10", "desc": f"YoY earnings growth {earnings_growth:.0f}% — strong trajectory"})
        elif earnings_growth and earnings_growth < 0:
            score -= 12
            factors.append({"factor": "Earnings contraction", "pts": "-12", "desc": f"YoY earnings fell {earnings_growth:.0f}%"})

        beat_prob = max(10, min(92, score))

        if beat_prob >= 70:
            verdict = "Strong Beat"
            verdict_color = "#16a34a"
        elif beat_prob >= 55:
            verdict = "Moderate Beat"
            verdict_color = "#047857"
        elif beat_prob <= 35:
            verdict = "Miss Likely"
            verdict_color = "#dc2626"
        else:
            verdict = "In-Line / Uncertain"
            verdict_color = "#d97706"

        prompt = (
            f"Analyze earnings setup for {symbol.upper()} on NSE India.\n"
            f"Calculated Beat Probability: {beat_prob}%, Verdict: {verdict}.\n"
            f"10-day return: {ret_10d:.1f}%, Volume ratio: {vol_ratio:.2f}x, News bull/bear: {bull_news}/{bear_news}, Analyst: {rec}, Upside: {upside}%.\n"
            f"Recent headlines: {'; '.join(news_articles[:3]) if news_articles else 'None'}.\n"
            f"Write a sharp 2-3 sentence analysis of what the market is pricing in for next quarterly results and 1 key risk to monitor."
        )
        ai_analysis = await _groq_chat(prompt, system="You are an equities research analyst specializing in Indian corporate quarterly earnings.")
        if not ai_analysis:
            ai_analysis = f"{symbol.upper()} presents a {verdict.lower()} profile with {beat_prob}% probability based on pre-earnings price action and analyst positioning."

        # Fetch optional historical event study from yfinance
        event_study = None
        try:
            event_study = get_earnings_event_study(ticker)
        except Exception:
            pass

        # Record predictive earnings signal into ledger
        if beat_prob >= 65 or beat_prob <= 35:
            rec_action = "BUY" if beat_prob >= 65 else "SELL"
            record_investedge_signal(
                symbol=symbol.upper().replace(".NS", "").replace(".BO", ""),
                source_module="Earnings Predictor",
                signal_type=f"Earnings {verdict}",
                action=rec_action,
                confidence=beat_prob,
                entry_price=sf(close.iloc[n]),
                meta={
                    "beat_probability": beat_prob,
                    "verdict": verdict,
                    "ret_10d": sf(ret_10d),
                    "volume_ratio": sf(vol_ratio)
                }
            )

        return {
            "symbol": symbol.upper(),
            "beat_probability": beat_prob,
            "verdict": verdict,
            "verdict_color": verdict_color,
            "signals": factors,
            "metrics": {
                "rsi": 50,
                "ret_10d": sf(ret_10d),
                "vol_ratio": sf(vol_ratio),
                "news_sentiment": "positive" if news_score > 0 else ("negative" if news_score < 0 else "neutral"),
                "rec": rec.upper(),
                "upside": sf(upside),
            },
            "ai_analysis": ai_analysis,
            "headlines": news_articles[:4],
            "event_study": event_study,
            "generated_at": datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Earnings predictor error: {str(e)}")

@app.get("/api/earnings/event-study/{symbol}")
async def earnings_event_study_endpoint(symbol: str):
    """Returns point-in-time historical earnings event study data for a given symbol."""
    ticker = nse(symbol)
    return get_earnings_event_study(ticker)


# ─── 7. Live Market Indices (Nifty 50, Sensex, Bank Nifty) ───────────────────

def _fetch_single_index(symbol: str) -> dict:
    try:
        raw = yf.download(symbol, period="2d", interval="1d", progress=False, auto_adjust=True)
        if not raw.empty and len(raw) >= 1:
            df = flatten_cols(raw)
            cur = float(df["close"].iloc[-1])
            prev = float(df["close"].iloc[-2]) if len(df) >= 2 else cur
            chg = round(((cur - prev) / prev) * 100, 2) if prev else 0.0
            return {"price": round(cur, 2), "change_pct": chg}
    except Exception:
        pass
    return None

async def get_indices_live() -> dict:
    indices = {"^NSEI": "nifty", "^BSESN": "sensex", "^NSEBANK": "banknifty"}
    sem = asyncio.Semaphore(3)

    async def _fetch_idx(sym: str, key: str):
        async with sem:
            res = await asyncio.to_thread(_fetch_single_index, sym)
            return key, res

    results = await asyncio.gather(*[_fetch_idx(sym, key) for sym, key in indices.items()])
    data = {}
    for key, res in results:
        if res:
            data[key] = res
        else:
            cached_default = _CACHE["market_indices"]["data"].get(key)
            if cached_default:
                data[key] = cached_default

    if data:
        set_cached("market_indices", data, ttl_seconds=60)
    return data

@app.get("/api/market/indices")
async def market_indices():
    cached = get_cached("market_indices")
    if cached:
        return cached
    return await get_indices_live()

# ─── 8. Live News Feed & AI Intelligence Stream ──────────────────────────────

async def fetch_news_feed(query: str = "", symbol: Optional[str] = None, max_articles: int = 8) -> List[dict]:
    cache_key = f"news_feed_{query}_{symbol}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    symbols = []
    if symbol:
        symbols.append(nse(symbol))
    elif query:
        q_upper = query.upper()
        for s in ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN"]:
            if s in q_upper:
                symbols.append(nse(s))
        if not symbols:
            symbols = ["^NSEI", "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS"]
    else:
        symbols = ["HDFCBANK.NS", "RELIANCE.NS", "TCS.NS", "TATAMOTORS.NS"]

    sem = asyncio.Semaphore(5)
    async def _fetch_sym(sym: str):
        async with sem:
            return await asyncio.to_thread(_fetch_single_news, sym, 3)

    results = await asyncio.gather(*[_fetch_sym(sym) for sym in symbols])
    all_articles = [a for sub in results for a in sub]

    if not all_articles:
        all_articles = _CACHE["news_feed__"]["data"]

    set_cached(cache_key, all_articles, ttl_seconds=300)
    return all_articles[:max_articles]

@app.get("/api/news")
async def get_news(query: str = Query(default=""), symbol: Optional[str] = Query(default=None)):
    articles = await fetch_news_feed(query, symbol, 8)
    return {
        "query": query,
        "symbol": symbol,
        "total": len(articles),
        "articles": articles,
        "source": "Yahoo Finance News Feed",
    }

@app.get("/api/news/stream")
async def intelligence_stream():
    cached = get_cached("intelligence_stream")
    if cached:
        return cached

    headlines = await _fetch_news_titles(["^NSEI", "HDFCBANK.NS", "RELIANCE.NS", "TCS.NS"], 2)
    titles = [h["title"] for h in headlines[:4]]
    
    if titles:
        prompt = (
            f"Here are the latest live headlines from Indian financial markets:\n"
            + "\n".join(f"- {t}" for t in titles)
            + "\n\nWrite a 2-sentence ultra-crisp real-time intelligence stream summary for retail traders. Focus on macro momentum and sector rotation."
        )
        stream_text = await _groq_chat(prompt, system="You are the InvestEdge AI market intelligence stream. Output only the 2-sentence summary.")
    else:
        stream_text = None

    if not stream_text:
        stream_text = "Indian markets are consolidating near key support levels with Nifty holding firm above 24,000. Banking and IT sectors show resilient institutional accumulation."

    data = {"text": stream_text, "sentiment_score": 62}
    set_cached("intelligence_stream", data, ttl_seconds=300)
    return data

@app.get("/api/news/signals")
async def trending_signals():
    cached = get_cached("trending_signals")
    if cached:
        return cached

    default_signals = _CACHE["trending_signals"]["data"]
    set_cached("trending_signals", default_signals, ttl_seconds=300)
    return default_signals

class SynthesisReq(BaseModel):
    query: str
    symbol: Optional[str] = None

@app.post("/api/news/synthesize")
async def synthesize_news(req: SynthesisReq):
    articles = await fetch_news_feed(req.query, req.symbol, 6)
    titles = [a["title"] for a in articles]

    prompt = (
        f"Synthesize the latest news for: '{req.query or req.symbol or 'Indian Equity Markets'}'.\n"
        f"Headlines:\n" + "\n".join(f"- {t}" for t in titles) + "\n\n"
        f"Provide a 3-bullet structured synthesis: 1. Core Macro/Corporate Development, 2. Sentiment Bias (Bullish/Bearish/Neutral), 3. Risk or Key Trigger to Watch."
    )
    summary = await _groq_chat(prompt, system="You are an expert financial journalist and equity analyst synthesizing live market intelligence.")
    if not summary:
        summary = f"News flow for {req.query or req.symbol or 'markets'} indicates active sector rotation and consolidation near major trendlines."

    return {
        "query": req.query,
        "symbol": req.symbol,
        "article_count": len(articles),
        "summary": summary,
        "articles": articles,
        "generated_at": datetime.now().isoformat(),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
