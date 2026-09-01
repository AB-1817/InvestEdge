import asyncio
from datetime import datetime
from typing import List, Dict
import yfinance as yf

WATCHLIST = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "WIPRO.NS", "BAJFINANCE.NS", "SBIN.NS", "LT.NS", "MARUTI.NS",
    "AXISBANK.NS", "TATAMOTORS.NS", "SUNPHARMA.NS", "ADANIENT.NS",
    "KOTAKBANK.NS", "NTPC.NS", "POWERGRID.NS", "ONGC.NS", "COALINDIA.NS",
    "TITAN.NS",
]


def _fetch_one(symbol: str) -> List[Dict]:
    results = []
    try:
        info = yf.Ticker(symbol).info
        eg = info.get("earningsGrowth")
        rg = info.get("revenueGrowth")
        pm = info.get("profitMargins")
        om = info.get("operatingMargins")
        sym = symbol.replace(".NS", "")

        if eg is not None and eg > 0.20:
            score = min(30, int(20 + eg * 30))
            results.append({
                "type": "quarterly_result",
                "symbol": sym,
                "title": f"Earnings Growth +{eg*100:.0f}% YoY",
                "description": (
                    f"Earnings growing at {eg*100:.1f}% YoY"
                    + (f", Revenue: {rg*100:.1f}%" if rg else "")
                    + (f", Net margin: {pm*100:.1f}%" if pm else "")
                    + ". Strong bottom-line momentum."
                ),
                "score": score,
                "signal": "STRONG BUY" if eg > 0.30 else "BUY",
                "confidence": min(92, int(68 + eg * 60)),
                "category": "Quarterly Results",
                "impact": "High",
                "source": "Yahoo Finance",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "earnings_growth": f"{eg*100:.1f}%",
                    "revenue_growth": f"{rg*100:.1f}%" if rg else "N/A",
                    "profit_margin": f"{pm*100:.1f}%" if pm else "N/A",
                    "operating_margin": f"{om*100:.1f}%" if om else "N/A",
                },
            })

        if rg is not None and rg > 0.15 and (eg is None or eg <= 0.20):
            results.append({
                "type": "quarterly_result",
                "symbol": sym,
                "title": f"Revenue Growth +{rg*100:.0f}% YoY",
                "description": (
                    f"Revenue growing {rg*100:.1f}% YoY"
                    + (f" with {om*100:.1f}% operating margin." if om else ".")
                ),
                "score": 15,
                "signal": "BUY",
                "confidence": min(80, int(60 + rg * 50)),
                "category": "Quarterly Results",
                "impact": "Medium",
                "source": "Yahoo Finance",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "revenue_growth": f"{rg*100:.1f}%",
                    "operating_margin": f"{om*100:.1f}%" if om else "N/A",
                },
            })
    except Exception:
        pass
    return results


async def fetch_quarterly_results() -> List[Dict]:
    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _fetch_one, sym) for sym in WATCHLIST]
    batches = await asyncio.gather(*tasks, return_exceptions=True)
    out = []
    for b in batches:
        if isinstance(b, list):
            out.extend(b)
    return out
