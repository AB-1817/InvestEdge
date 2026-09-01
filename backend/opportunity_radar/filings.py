import httpx
from datetime import datetime
from typing import List, Dict

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive",
}

EVENT_MAP = [
    (["buyback", "buy back", "buy-back"],          "Buyback Announced",        35, "BUY",   "High"),
    (["bonus"],                                     "Bonus Issue",              30, "BUY",   "High"),
    (["split", "stock split", "sub-division"],      "Stock Split",              25, "BUY",   "High"),
    (["rights issue", "rights entitlement"],        "Rights Issue",             20, "WATCH", "Medium"),
    (["dividend"],                                  "Dividend Declared",        20, "BUY",   "Medium"),
    (["merger", "amalgamation", "acquisition"],     "M&A Activity",             25, "WATCH", "High"),
    (["fund raising", "fundraising", "qip", "ncd"], "Fund Raise",              15, "WATCH", "Medium"),
    (["board meeting", "board of directors"],       "Board Meeting",            10, "WATCH", "Low"),
    (["promoter", "promoter stake"],                "Promoter Stake Change",    20, "WATCH", "Medium"),
    (["management change", "ceo", "md appointed"],  "Management Change",        15, "WATCH", "Medium"),
]


async def fetch_corporate_filings() -> List[Dict]:
    opportunities = []
    try:
        async with httpx.AsyncClient(headers=NSE_HEADERS, timeout=20, follow_redirects=True) as client:
            await client.get("https://www.nseindia.com/")
            resp = await client.get(
                "https://www.nseindia.com/api/corporate-announcements",
                params={"index": "equities"},
            )
            resp.raise_for_status()
            raw = resp.json()
            # NSE returns either a list directly or {"data": [...]}
            announcements = raw if isinstance(raw, list) else raw.get("data", [])

        for ann in announcements[:30]:
            symbol = ann.get("symbol", "").replace("-EQ", "").strip()
            subject = (ann.get("subject") or ann.get("desc") or "").lower()
            desc = ann.get("desc") or ann.get("subject") or ""
            if not symbol or not subject:
                continue

            for keywords, title, score, signal, impact in EVENT_MAP:
                if any(kw in subject for kw in keywords):
                    opportunities.append({
                        "type": "filing",
                        "symbol": symbol,
                        "title": title,
                        "description": (
                            f"{desc[:180]}{'...' if len(desc) > 180 else ''} "
                            f"Corporate action detected via NSE filing."
                        ),
                        "score": score,
                        "signal": signal,
                        "confidence": min(88, 60 + score),
                        "category": "Corporate Filing",
                        "impact": impact,
                        "source": "NSE Filings",
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "details": {
                            "event": title,
                            "subject": subject[:120],
                            "source": "NSE Corporate Announcements",
                        },
                    })
                    break  # one event per announcement
    except Exception as e:
        print(f"[filings] {e}")
    return opportunities
