import asyncio
from datetime import datetime
from typing import List, Dict
import yfinance as yf

WATCHLIST = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "WIPRO.NS", "BAJFINANCE.NS", "SBIN.NS", "MARUTI.NS", "TATAMOTORS.NS",
    "SUNPHARMA.NS", "LT.NS", "AXISBANK.NS", "ADANIENT.NS", "TITAN.NS",
]

POSITIVE_KW = [
    "growth", "expansion", "strong demand", "record", "robust", "optimistic",
    "capacity", "upgrade", "outperform", "beat", "profit", "surge", "rally",
    "positive", "bullish", "momentum", "milestone", "breakthrough",
]
NEGATIVE_KW = [
    "slowdown", "weak", "caution", "decline", "downgrade", "risk", "bearish",
    "fall", "loss", "warning", "concern", "miss", "disappoint", "cut", "layoff",
]


def _fetch_commentary(symbol: str) -> List[Dict]:
    results = []
    try:
        ticker = yf.Ticker(symbol)
        news = ticker.news or []
        sym = symbol.replace(".NS", "")

        pos, neg = 0, 0
        pos_titles, neg_titles = [], []

        for article in news[:12]:
            content = article.get("content") or {}
            title = (content.get("title") or article.get("title") or "").lower()
            if not title:
                continue
            p = sum(1 for kw in POSITIVE_KW if kw in title)
            n = sum(1 for kw in NEGATIVE_KW if kw in title)
            pos += p
            neg += n
            if p > n:
                pos_titles.append(title[:80])
            elif n > p:
                neg_titles.append(title[:80])

        net = pos - neg
        if net >= 3:
            results.append({
                "type": "management_commentary",
                "symbol": sym,
                "title": "Positive News Sentiment",
                "description": (
                    f"Recent coverage shows {pos} positive vs {neg} negative signals. "
                    f"Market narrative turning favorable. "
                    + (f'Key headline: "{pos_titles[0]}"' if pos_titles else "")
                ),
                "score": min(15, 8 + net),
                "signal": "BUY",
                "confidence": min(78, 55 + net * 4),
                "category": "Management Commentary",
                "impact": "Medium",
                "source": "News NLP",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "positive_signals": str(pos),
                    "negative_signals": str(neg),
                    "net_sentiment": f"+{net}",
                    "sentiment": "Positive",
                },
            })
        elif net <= -3:
            results.append({
                "type": "management_commentary",
                "symbol": sym,
                "title": "Negative News Sentiment",
                "description": (
                    f"Recent coverage shows {neg} negative vs {pos} positive signals. "
                    + (f'Key headline: "{neg_titles[0]}"' if neg_titles else "")
                ),
                "score": 0,
                "signal": "AVOID",
                "confidence": min(75, 50 + abs(net) * 3),
                "category": "Management Commentary",
                "impact": "Medium",
                "source": "News NLP",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "positive_signals": str(pos),
                    "negative_signals": str(neg),
                    "net_sentiment": str(net),
                    "sentiment": "Negative",
                },
            })
    except Exception:
        pass
    return results


async def fetch_management_commentary() -> List[Dict]:
    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _fetch_commentary, sym) for sym in WATCHLIST]
    batches = await asyncio.gather(*tasks, return_exceptions=True)
    out = []
    for b in batches:
        if isinstance(b, list):
            out.extend(b)
    return out
