import httpx
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Dict

SECTOR_MAP = [
    (["repo rate", "rbi rate", "monetary policy", "interest rate", "liquidity"],
     ["HDFCBANK", "SBIN", "ICICIBANK", "AXISBANK", "KOTAKBANK", "BAJFINANCE"],
     "RBI Policy Impact", "Rate-sensitive banking & NBFC stocks affected.", 15),
    (["import duty", "customs duty", "tariff"],
     ["TATAMOTORS", "MARUTI", "TATASTEEL", "HINDALCO"],
     "Import Duty Change", "Duty revision impacts auto and metal sectors.", 12),
    (["sebi", "margin", "f&o", "derivatives", "circuit"],
     ["ANGELONE", "ICICIBANK"],
     "SEBI Regulation", "New SEBI circular may impact trading volumes.", 10),
    (["pli scheme", "production linked", "incentive"],
     ["RELIANCE", "TATAMOTORS", "SUNPHARMA", "DIXON"],
     "PLI Scheme Update", "PLI scheme update benefits manufacturing sector.", 15),
    (["infrastructure", "capex", "budget", "government spending"],
     ["LT", "NTPC", "POWERGRID", "BHEL"],
     "Infrastructure Boost", "Government capex push benefits infra stocks.", 12),
    (["pharma", "drug", "fda", "usfda", "approval"],
     ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB"],
     "Pharma Regulatory", "Regulatory development in pharma sector.", 10),
]

RSS_SOURCES = [
    ("https://rbi.org.in/Scripts/RSSFeed.aspx?Id=1", "RBI"),
    ("https://www.sebi.gov.in/sebi_data/rss/sebi_rss.xml", "SEBI"),
]


async def fetch_regulatory_changes() -> List[Dict]:
    opportunities = []
    headlines: List[tuple] = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for url, source in RSS_SOURCES:
            try:
                resp = await client.get(url)
                # Use html.parser — tolerates malformed XML/HTML entities
                soup = BeautifulSoup(resp.text, "html.parser")
                for item in soup.find_all("item"):
                    title_tag = item.find("title")
                    if title_tag and title_tag.get_text(strip=True):
                        headlines.append((title_tag.get_text(strip=True).lower(), source))
            except Exception as e:
                print(f"[regulation] {source}: {e}")

    seen_symbols = set()
    for headline_text, source in headlines[:40]:
        for keywords, symbols, title, desc, score in SECTOR_MAP:
            if any(kw in headline_text for kw in keywords):
                for sym in symbols[:2]:
                    key = f"{sym}_{title}"
                    if key in seen_symbols:
                        continue
                    seen_symbols.add(key)
                    opportunities.append({
                        "type": "regulatory_change",
                        "symbol": sym,
                        "title": title,
                        "description": (
                            f"{desc} Triggered by: \"{headline_text[:100]}\" "
                            f"Source: {source}."
                        ),
                        "score": score,
                        "signal": "WATCH",
                        "confidence": 60,
                        "category": "Regulatory Change",
                        "impact": "Medium",
                        "source": source,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "details": {
                            "headline": headline_text[:120],
                            "regulator": source,
                            "affected_sector": title,
                        },
                    })
                break

    return opportunities
