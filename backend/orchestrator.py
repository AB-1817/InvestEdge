import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
import yfinance as yf
import pandas as pd
import numpy as np

# ── Helper technical indicators & utilities ───────────────────────────────────

def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False).mean()

def _rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=length - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=length - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length=14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=length - 1, adjust=False).mean()

def _macd(series: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    sig_line = _ema(macd_line, signal)
    histogram = macd_line - sig_line
    return macd_line, sig_line, histogram

def _bbands(series: pd.Series, length=20, std=2):
    mid = series.rolling(length).mean()
    sigma = series.rolling(length).std()
    return mid + std * sigma, mid, mid - std * sigma

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


def _fetch_single_holding_diag(h) -> Optional[dict]:
    sym = h.symbol if hasattr(h, "symbol") else h.get("symbol")
    qty = h.qty if hasattr(h, "qty") else h.get("qty", 0)
    avg_cost = h.avg_cost if hasattr(h, "avg_cost") else h.get("avg_cost", 0)
    ticker = nse(sym)

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        raw = yf.download(ticker, period="3mo", interval="1d", progress=False, auto_adjust=True)
        if raw.empty:
            return None
        df = flatten_cols(raw)
        close = df["close"]
        rsi_v = sf(_rsi(close, 14).iloc[-1])
        cur_p = sf(close.iloc[-1])
        sector = info.get("sector", "Diversified / Other")
        invested = qty * avg_cost
        current = qty * (cur_p or 0)
        pnl = round(current - invested, 2)
        pnl_pct = sf(((current - invested) / invested) * 100) if invested else 0

        return {
            "symbol": sym.upper(),
            "sector": sector,
            "qty": qty,
            "avg_cost": avg_cost,
            "current_price": cur_p,
            "invested": round(invested, 2),
            "current": round(current, 2),
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "weight": 0,
            "rsi": rsi_v,
            "beta": sf(info.get("beta")),
            "pe": sf(info.get("trailingPE")),
        }
    except Exception:
        return None


# ─── Multi-Agent Portfolio Orchestration ──────────────────────────────────────

async def get_contextual_advice(portfolio_holdings: list) -> Dict[str, Any]:
    """
    Orchestrates:
    1. Market Regime Agent (macro trend, Nifty 50, volatility)
    2. Portfolio & Risk Diagnostics (P&L, sector weights, concentration, drawdowns)
    3. News RAG Agent (company-specific headlines)
    4. Synthesizes cross-referenced advice attributed to each agent.
    """
    from main import market_regime, _fetch_news_titles, _groq_chat

    # 1. Fetch Market Regime concurrently with news & holding fundamentals
    regime_task = asyncio.create_task(market_regime())

    symbols = [h.symbol if hasattr(h, "symbol") else h.get("symbol") for h in portfolio_holdings]
    symbols = [s.upper().strip() for s in symbols if s]
    news_task = asyncio.create_task(asyncio.to_thread(_fetch_news_titles, [nse(s) for s in symbols], 5))

    # 2. Portfolio calculations & Health diagnostics concurrently with Semaphore(5)
    sem = asyncio.Semaphore(5)
    async def _fetch_holding_with_sem(h):
        async with sem:
            return await asyncio.to_thread(_fetch_single_holding_diag, h)

    diag_results = await asyncio.gather(*[_fetch_holding_with_sem(h) for h in portfolio_holdings])
    results = [r for r in diag_results if r is not None]

    sector_map = {}
    total_invested = 0.0
    total_current = 0.0

    for r in results:
        total_invested += r["invested"]
        total_current += r["current"]
        sec = r["sector"]
        sector_map[sec] = sector_map.get(sec, 0) + r["current"]

    # Compute weights
    for r in results:
        r["weight"] = round((r["current"] / total_current * 100) if total_current else 0, 1)

    # Health Scoring & Risk flags
    score = 100
    issues = []
    suggestions = []
    risk_flags = []

    max_weight = max((r["weight"] for r in results), default=0)
    top_holding = next((r["symbol"] for r in results if r["weight"] == max_weight), "")
    if max_weight > 40:
        score -= 20
        issues.append(f"High concentration: {top_holding} is {max_weight:.0f}% of portfolio")
        suggestions.append(f"Reduce {top_holding} to below 25% for balanced diversification")
        risk_flags.append({
            "flag": "Single-Stock Concentration",
            "agent": "Risk Agent",
            "severity": "high",
            "detail": f"{top_holding} accounts for {max_weight:.0f}% of portfolio capital.",
        })
    elif max_weight > 25:
        score -= 10
        issues.append(f"Moderate concentration: top holding {top_holding} is {max_weight:.0f}%")
        risk_flags.append({
            "flag": "Moderate Concentration",
            "agent": "Risk Agent",
            "severity": "medium",
            "detail": f"{top_holding} represents {max_weight:.0f}% of portfolio.",
        })

    top_sector = ""
    top_sector_pct = 0
    if sector_map and total_current > 0:
        top_sector = max(sector_map, key=sector_map.get)
        top_sector_pct = round((sector_map[top_sector] / total_current * 100), 1)
        if top_sector_pct > 50:
            score -= 15
            issues.append(f"Sector overweight: {top_sector} is {top_sector_pct:.0f}% of portfolio")
            suggestions.append(f"Trim {top_sector} and reallocate into non-correlated defensive sectors")
            risk_flags.append({
                "flag": "Sector Overweight",
                "agent": "Risk Agent",
                "severity": "high",
                "detail": f"{top_sector} sector comprises {top_sector_pct:.0f}% of total portfolio value.",
            })

    overbought = [r["symbol"] for r in results if r["rsi"] and r["rsi"] > 70]
    if overbought:
        score -= 5 * len(overbought)
        issues.append(f"Overbought signals: {', '.join(overbought)} (RSI > 70)")
        suggestions.append(f"Consider booking partial profits in {', '.join(overbought)}")
        risk_flags.append({
            "flag": "Overbought Holdings",
            "agent": "Chart Pattern Agent",
            "severity": "medium",
            "detail": f"{', '.join(overbought)} currently exhibiting technical overbought RSI > 70.",
        })

    big_losers = [r["symbol"] for r in results if r["pnl_pct"] and r["pnl_pct"] < -15]
    if big_losers:
        score -= 10
        issues.append(f"Significant drawdown: {', '.join(big_losers)} down >15%")
        suggestions.append(f"Review stop-loss levels and thesis for {', '.join(big_losers)}")
        risk_flags.append({
            "flag": "Deep Drawdown",
            "agent": "Portfolio Doctor",
            "severity": "high",
            "detail": f"{', '.join(big_losers)} experiencing >15% unrealized drawdown.",
        })

    score = max(0, min(100, score))
    grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D"

    pnl_total = round(total_current - total_invested, 2)
    pnl_pct_total = round((pnl_total / total_invested * 100) if total_invested else 0, 2)

    # Await regime & news tasks
    try:
        regime_data = await regime_task
    except Exception:
        regime_data = {
            "regime": "Sideways Chop",
            "color": "#d97706",
            "description": "Market is range-bound with moderate volatility.",
            "metrics": {"rsi": 50.0, "atr_pct": 0.9}
        }

    try:
        raw_news = await news_task
    except Exception:
        raw_news = []

    # Map relevant news to symbols
    relevant_news = []
    for art in raw_news:
        relevant_news.append({
            "symbol": art.get("symbol", ""),
            "title": art.get("title", ""),
            "publisher": art.get("publisher", ""),
        })

    # Regime risk correlation
    current_regime = regime_data.get("regime", "Sideways Chop")
    if current_regime in ["Bear Phase", "High Volatility"] and top_sector_pct > 40:
        risk_flags.append({
            "flag": "Regime vs Allocation Conflict",
            "agent": "Market Regime Agent",
            "severity": "high",
            "detail": f"Market is in '{current_regime}' while portfolio is {top_sector_pct}% concentrated in {top_sector}.",
        })

    # 3. Groq Multi-Agent Synthesized Prompt
    holdings_summary = ", ".join(f"{r['symbol']} ({r['weight']}%, P&L {r['pnl_pct']:+.1f}%)" for r in results)
    sector_summary = ", ".join(f"{k}: {v/total_current*100:.0f}%" for k, v in sector_map.items()) if total_current else ""
    news_summary = "\n".join(f"- [{n['symbol']}] {n['title']}" for n in relevant_news[:6]) or "No high-impact headlines."

    groq_prompt = (
        f"You are the InvestEdge Orchestration Agent synthesizing insights from 4 specialized agents:\n\n"
        f"1. MARKET REGIME AGENT:\n"
        f"- Current Regime: {current_regime}\n"
        f"- Description: {regime_data.get('description', '')}\n\n"
        f"2. PORTFOLIO DOCTOR & RISK AGENT:\n"
        f"- Total P&L: {pnl_pct_total:+.1f}%\n"
        f"- Health Score: {score}/100 (Grade {grade})\n"
        f"- Holdings: {holdings_summary}\n"
        f"- Sector Allocation: {sector_summary}\n"
        f"- Identified Issues: {'; '.join(issues) if issues else 'None'}\n\n"
        f"3. NEWS RAG AGENT (Recent Headlines for Holdings):\n"
        f"{news_summary}\n\n"
        f"TASK:\n"
        f"Synthesize these inputs into a cross-referenced financial intelligence report.\n"
        f"Address how the current market regime affects the portfolio's top sector concentration and company news.\n"
        f"Provide 3 concise, highly actionable recommendations specific to Indian retail investors.\n"
        f"Format clearly with direct data citations."
    )

    ai_advice = await _groq_chat(
        groq_prompt,
        system="You are the Lead Investment Strategist coordinating multi-agent portfolio intelligence on Indian markets."
    )

    if not ai_advice:
        ai_advice = (
            f"Portfolio shows a health score of {score}/100 (Grade {grade}) with {pnl_pct_total:+.1f}% P&L. "
            f"In the current {current_regime} regime, maintain disciplined stop-losses and diversify "
            f"heavy exposure in {top_sector or 'top holdings'}."
        )

    # Structured Agent Insights
    agent_insights = {
        "regime_agent": {
            "agent": "Market Regime Agent",
            "regime": current_regime,
            "badge": f"from Regime Agent ({current_regime})",
            "insight": f"Market is in '{current_regime}'. {regime_data.get('description', '')}",
        },
        "news_agent": {
            "agent": "News RAG Agent",
            "badge": "from News Agent",
            "insight": f"Monitored {len(relevant_news)} recent headlines across your portfolio symbols.",
            "top_headline": relevant_news[0]["title"] if relevant_news else "No urgent news catalysts detected.",
        },
        "risk_agent": {
            "agent": "Risk Diagnostics Agent",
            "badge": "from Risk Agent",
            "insight": f"Top sector {top_sector or 'N/A'} holds {top_sector_pct}% of total capital; largest position is {max_weight:.0f}%.",
        },
        "portfolio_doctor": {
            "agent": "Portfolio Doctor",
            "badge": "from Portfolio Doctor",
            "insight": f"Assigned Health Grade {grade} ({score}/100) across {len(results)} holdings.",
        },
    }

    return {
        "score": score,
        "grade": grade,
        "holdings": results,
        "sector_allocation": {k: round(v / total_current * 100, 1) for k, v in sector_map.items()} if total_current else {},
        "summary": {
            "total_invested": round(total_invested, 2),
            "total_current": round(total_current, 2),
            "total_pnl": pnl_total,
            "total_pnl_pct": pnl_pct_total,
            "count": len(results),
        },
        "issues": issues,
        "suggestions": suggestions,
        "regime": regime_data,
        "allocation_summary": f"{top_sector}: {top_sector_pct}% | Top Stock: {top_holding} ({max_weight:.0f}%)" if top_sector else "Balanced",
        "relevant_news": relevant_news[:8],
        "risk_flags": risk_flags,
        "agent_insights": agent_insights,
        "synthesized_advice": ai_advice,
        "ai_advice": ai_advice,  # backwards compatibility
        "generated_at": datetime.now().isoformat(),
    }


# ─── Single Stock Multi-Agent Orchestration & Explanation ─────────────────────

async def get_stock_explanation(symbol: str) -> Dict[str, Any]:
    """
    Cross-references 4 specialized agents for a single stock:
    1. Chart Pattern Agent (Technicals, RSI, EMAs, MACD, BB, ATR, Backtest)
    2. Fundamental Agent (Valuation, ROE, Growth, Debt, Analyst Target)
    3. News Agent (Sentiment & Headline Catalysts)
    4. Market Regime Agent (Macro Nifty 50 alignment)

    Computes deterministic consensus & confidence in Python,
    then uses Groq purely to explain and narrate the cross-referenced rationale.
    """
    from main import (
        detect_patterns, PatternReq,
        fundamental_analysis, OppReq,
        market_regime, _fetch_news_titles, _groq_chat
    )

    clean_sym = symbol.upper().replace(".NS", "").replace(".BO", "").strip()
    ticker = nse(clean_sym)

    # Run all 4 agents concurrently
    patterns_task = asyncio.create_task(detect_patterns(PatternReq(symbol=clean_sym, period="6mo")))
    opp_task = asyncio.create_task(fundamental_analysis(OppReq(symbol=clean_sym)))
    regime_task = asyncio.create_task(market_regime())
    news_task = asyncio.create_task(_fetch_news_titles([ticker], 8))

    chart_res, opp_res, regime_res, news_res = await asyncio.gather(
        patterns_task, opp_task, regime_task, news_task, return_exceptions=True
    )

    # 1. Parse Chart Pattern Agent Data
    chart_bias = "neutral"
    chart_signals = []
    chart_backtest = None
    rsi_val = None
    ema200_val = None
    cur_price = None

    if not isinstance(chart_res, Exception) and isinstance(chart_res, dict):
        chart_bias = chart_res.get("bias", "neutral")
        chart_signals = chart_res.get("signals", [])
        chart_backtest = chart_res.get("backtest")
        price_data = chart_res.get("price", {})
        rsi_val = price_data.get("rsi")
        ema200_val = price_data.get("ema200")
        cur_price = price_data.get("current")

    # 2. Parse Fundamental Agent Data
    fund_bias = "neutral"
    fund_signals = []
    pe_val = None
    roe_val = None
    upside_pct = None
    target_price = None
    rec_key = "neutral"

    if not isinstance(opp_res, Exception) and isinstance(opp_res, dict):
        fund_signals = opp_res.get("signals", [])
        pos_fund = sum(1 for s in fund_signals if s.get("sentiment") == "positive")
        caut_fund = sum(1 for s in fund_signals if s.get("sentiment") == "caution")
        fund_bias = "bullish" if pos_fund > caut_fund else ("bearish" if caut_fund > pos_fund else "neutral")
        
        funds = opp_res.get("fundamentals", {})
        pe_val = funds.get("pe")
        roe_val = funds.get("roe")
        
        analyst = opp_res.get("analyst", {})
        upside_pct = analyst.get("upside_pct")
        target_price = analyst.get("target_mean")
        rec_key = analyst.get("recommendation", "hold")
        if cur_price is None:
            cur_price = opp_res.get("current_price")

    # 3. Parse News Agent Data
    news_sentiment = "neutral"
    news_articles = []
    bull_count = 0
    bear_count = 0

    if not isinstance(news_res, Exception) and isinstance(news_res, list):
        news_articles = news_res
        bull_words = ["beat", "growth", "profit", "surge", "record", "outperform", "upgrade", "deal", "order", "rally"]
        bear_words = ["miss", "weak", "decline", "loss", "downgrade", "cut", "disappoint", "fall", "drop", "penalty"]
        for a in news_articles:
            t = a.get("title", "").lower()
            if any(w in t for w in bull_words):
                bull_count += 1
            if any(w in t for w in bear_words):
                bear_count += 1
        news_sentiment = "bullish" if bull_count > bear_count else ("bearish" if bear_count > bull_count else "neutral")

    # 4. Parse Market Regime Agent Data
    regime_name = "Sideways Chop"
    regime_bias = "neutral"
    regime_desc = "Market is in range-bound chop."
    regime_color = "#d97706"

    if not isinstance(regime_res, Exception) and isinstance(regime_res, dict):
        regime_name = regime_res.get("regime", "Sideways Chop")
        regime_desc = regime_res.get("description", "")
        regime_color = regime_res.get("color", "#d97706")
        if regime_name == "Bull Run":
            regime_bias = "bullish"
        elif regime_name == "Bear Phase":
            regime_bias = "bearish"
        else:
            regime_bias = "neutral"

    # ── DETERMINISTIC CONSENSUS & CONFIDENCE ENGINE (Pure Python) ───────────────
    # Directional scores: Bullish = +1, Bearish = -1, Neutral = 0
    scores = {
        "chart": 1.0 if chart_bias == "bullish" else (-1.0 if chart_bias == "bearish" else 0.0),
        "fundamental": 1.0 if fund_bias == "bullish" else (-1.0 if fund_bias == "bearish" else 0.0),
        "news": 1.0 if news_sentiment == "bullish" else (-1.0 if news_sentiment == "bearish" else 0.0),
        "regime": 1.0 if regime_bias == "bullish" else (-1.0 if regime_bias == "bearish" else 0.0),
    }

    # Weighting adjustments based on quantified data
    # 1. Chart strong indicators bonus
    if rsi_val and (rsi_val < 30 or rsi_val > 70):
        scores["chart"] *= 1.2
    # 2. Fundamental upside magnitude bonus
    if upside_pct is not None:
        if upside_pct > 20:
            scores["fundamental"] += 0.5
        elif upside_pct < -10:
            scores["fundamental"] -= 0.5
    # 3. News consensus strength bonus
    if (bull_count >= 3 and bear_count == 0) or (bear_count >= 3 and bull_count == 0):
        scores["news"] *= 1.25

    total_score = sum(scores.values())

    # Count unanimous agreement across the 4 agents
    directional_votes = [
        1 if scores["chart"] > 0 else (-1 if scores["chart"] < 0 else 0),
        1 if scores["fundamental"] > 0 else (-1 if scores["fundamental"] < 0 else 0),
        1 if scores["news"] > 0 else (-1 if scores["news"] < 0 else 0),
        1 if scores["regime"] > 0 else (-1 if scores["regime"] < 0 else 0),
    ]
    bull_votes = sum(1 for v in directional_votes if v > 0)
    bear_votes = sum(1 for v in directional_votes if v < 0)
    neutral_votes = sum(1 for v in directional_votes if v == 0)
    dominant_votes = max(bull_votes, bear_votes)

    # Base confidence: 4/4 unanimous = 92%, 3/4 = 78%, 2/4 (with neutrals) = 64%, conflicted = 50%
    if dominant_votes == 4:
        base_confidence = 92
    elif dominant_votes == 3:
        base_confidence = 78
    elif dominant_votes == 2 and neutral_votes >= 1:
        base_confidence = 64
    else:
        base_confidence = 50

    # Fine-tuning adjustments to confidence
    conf_adj = 0
    # Backtest win rate boost: e.g. "Win rate: 75%"
    if chart_backtest and "Win rate" in chart_backtest:
        try:
            wr_str = chart_backtest.split("Win rate at +15 days: ")[1].split("%")[0]
            wr = float(wr_str)
            if wr >= 70:
                conf_adj += 5
            elif wr <= 35:
                conf_adj -= 5
        except Exception:
            pass

    # High volatility regime penalty
    if regime_name == "High Volatility":
        conf_adj -= 8

    final_confidence = int(max(15, min(96, base_confidence + conf_adj)))

    # Net Signal Determination
    if total_score >= 2.5 and final_confidence >= 70:
        net_signal = "Strong Buy"
        signal_color = "#16a34a"
    elif total_score >= 1.2:
        net_signal = "Buy"
        signal_color = "#047857"
    elif total_score >= 0.4:
        net_signal = "Moderate Buy"
        signal_color = "#0284c7"
    elif total_score <= -2.5 and final_confidence >= 70:
        net_signal = "Strong Sell"
        signal_color = "#dc2626"
    elif total_score <= -1.2:
        net_signal = "Cautious / Reduce"
        signal_color = "#ea580c"
    elif total_score <= -0.4:
        net_signal = "Moderate Caution"
        signal_color = "#d97706"
    else:
        net_signal = "Neutral / Hold"
        signal_color = "#6b7280"

    # Agent contribution summaries
    agent_contributions = {
        "chart_agent": {
            "agent": "Chart Pattern Agent",
            "bias": chart_bias,
            "badge": f"from Chart Agent ({chart_bias.upper()})",
            "highlight": (
                f"RSI {rsi_val or 'N/A'}, Price {'above' if cur_price and ema200_val and cur_price > ema200_val else 'near'} 200 EMA"
                if rsi_val else "Technicals analyzed"
            ),
            "signals_count": len(chart_signals),
            "top_signals": [s["type"] for s in chart_signals[:3]],
            "backtest": chart_backtest,
            "metrics": {"rsi": rsi_val, "ema200": ema200_val, "current": cur_price},
        },
        "fundamental_agent": {
            "agent": "Fundamental Agent",
            "bias": fund_bias,
            "badge": f"from Fundamental Agent ({fund_bias.upper()})",
            "highlight": (
                f"P/E {pe_val or 'N/A'}x, ROE {roe_val or 'N/A'}, Analyst Target ₹{target_price or 'N/A'} ({f'{upside_pct:+.1f}%' if upside_pct is not None else 'N/A'})"
            ),
            "recommendation": rec_key,
            "signals_count": len(fund_signals),
            "metrics": {"pe": pe_val, "roe": roe_val, "upside_pct": upside_pct, "target_price": target_price},
        },
        "news_agent": {
            "agent": "News RAG Agent",
            "sentiment": news_sentiment,
            "badge": f"from News Agent ({news_sentiment.upper()})",
            "highlight": f"{bull_count} bullish vs {bear_count} bearish headlines across {len(news_articles)} articles",
            "headlines": [a["title"] for a in news_articles[:4]],
        },
        "regime_agent": {
            "agent": "Market Regime Agent",
            "regime": regime_name,
            "badge": f"from Regime Agent ({regime_name})",
            "color": regime_color,
            "highlight": f"Nifty 50 in '{regime_name}' — {regime_desc}",
        },
    }

    # Deterministic Risk Factors
    risk_factors = []
    if rsi_val and rsi_val > 70:
        risk_factors.append(f"Chart Agent flags overbought RSI ({rsi_val:.1f}), signaling short-term pullback risk.")
    elif rsi_val and rsi_val < 30:
        risk_factors.append(f"Chart Agent notes deep oversold RSI ({rsi_val:.1f}) — confirm volume before entry.")
    if pe_val and pe_val > 50:
        risk_factors.append(f"Fundamental Agent warns of rich valuation at {pe_val:.1f}x trailing P/E.")
    if bear_count > bull_count:
        risk_factors.append(f"News Agent reports {bear_count} negative headlines creating near-term sentiment friction.")
    if regime_name in ["Bear Phase", "High Volatility"]:
        risk_factors.append(f"Market Regime is '{regime_name}', recommending tighter stop-losses.")
    if not risk_factors:
        risk_factors.append("No immediate high-severity risk factors flagged across active agents.")

    # ── Groq Multi-Agent Narrative Explanation ─────────────────────────────────
    groq_prompt = (
        f"Explain the multi-agent analysis for Indian stock '{clean_sym}' on NSE.\n\n"
        f"DETERMINISTIC CONSENSUS COMPUTED:\n"
        f"- Net Signal: {net_signal}\n"
        f"- Confidence Score: {final_confidence}% ({dominant_votes}/4 agents in agreement)\n"
        f"- Total Score: {total_score:+.2f}\n\n"
        f"AGENT CONTRIBUTIONS:\n"
        f"1. Chart Pattern Agent: Bias '{chart_bias}', RSI={rsi_val}, Signals={', '.join([s['type'] for s in chart_signals[:3]]) or 'None'}\n"
        f"2. Fundamental Agent: Bias '{fund_bias}', P/E={pe_val}x, ROE={roe_val}, Target Upside={upside_pct}%, Consensus='{rec_key}'\n"
        f"3. News Agent: Sentiment '{news_sentiment}', {bull_count} positive headlines vs {bear_count} negative\n"
        f"4. Market Regime Agent: Regime '{regime_name}', Nifty macro context\n\n"
        f"TASK:\n"
        f"Write a sharp 3-4 sentence cross-referenced synthesis explaining why the Net Signal is '{net_signal}' at {final_confidence}% confidence.\n"
        f"Explicitly cite each agent's contribution (e.g. 'Chart Agent flags...', 'Fundamental Agent confirms...', 'News Agent observes...', 'Regime Agent provides context...').\n"
        f"Do not invent any numbers; use the exact metrics provided above."
    )

    ai_synthesis = await _groq_chat(
        groq_prompt,
        system="You are the InvestEdge Multi-Agent Orchestrator explaining cross-referenced financial signals on Indian stocks."
    )

    if not ai_synthesis:
        ai_synthesis = (
            f"Chart Agent flags {chart_bias} bias with RSI at {rsi_val or 'neutral'}. "
            f"Fundamental Agent evaluates {fund_bias} outlook with {f'{upside_pct:+.1f}% target upside' if upside_pct is not None else 'fair valuation'}. "
            f"News Agent reports {news_sentiment} sentiment across recent headlines, while Market Regime Agent notes Nifty in '{regime_name}'. "
            f"Net orchestrated signal: {net_signal} ({final_confidence}% confidence)."
        )

    actionable_takeaway = (
        f"In the current {regime_name} regime, {clean_sym} displays {net_signal.lower()} consensus. "
        f"{'Consider scaled entry with stop-loss below key support.' if 'Buy' in net_signal else 'Exercise caution and protect capital.'}"
    )

    return {
        "symbol": ticker,
        "display": clean_sym,
        "net_signal": net_signal,
        "signal_color": signal_color,
        "confidence": final_confidence,
        "confidence_breakdown": {
            "agreement_votes": f"{dominant_votes}/4 Agents",
            "base_confidence": base_confidence,
            "adjustments": conf_adj,
            "total_weighted_score": round(total_score, 2),
            "dominant_direction": "Bullish" if bull_votes > bear_votes else ("Bearish" if bear_votes > bull_votes else "Neutral"),
        },
        "synthesis": ai_synthesis,
        "agent_contributions": agent_contributions,
        "risk_factors": risk_factors,
        "actionable_takeaway": actionable_takeaway,
        "generated_at": datetime.now().isoformat(),
    }
