import httpx
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Dict, Optional

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://www.screener.in/",
}

WATCHLIST = [
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
    "WIPRO", "BAJFINANCE", "SBIN", "LT", "MARUTI",
    "AXISBANK", "TATAMOTORS", "SUNPHARMA", "ADANIENT",
    "KOTAKBANK", "NTPC", "TITAN", "DRREDDY", "DIVISLAB",
    "HINDUNILVR",
]


def _parse_num(s: str) -> Optional[float]:
    """Parse screener number strings like '1,23,456' or '18%' or '-12.3'"""
    try:
        return float(s.replace(",", "").replace("%", "").replace("+", "").strip())
    except Exception:
        return None


def _scrape(html: str, symbol: str) -> List[Dict]:
    signals = []
    soup = BeautifulSoup(html, "html.parser")
    today = datetime.now().strftime("%Y-%m-%d")

    # ── Top Ratios ──────────────────────────────────────────────────────────
    ratios = {}
    ratios_sec = soup.find(id="top-ratios")
    if ratios_sec:
        for li in ratios_sec.find_all("li"):
            name_el = li.find("span", class_="name")
            val_el  = li.find("span", class_="number")
            if name_el and val_el:
                ratios[name_el.get_text(strip=True).lower()] = val_el.get_text(strip=True)

    pe    = _parse_num(ratios.get("stock p/e", ""))
    roe   = _parse_num(ratios.get("roe", ""))
    roce  = _parse_num(ratios.get("roce", ""))
    div_y = _parse_num(ratios.get("dividend yield", ""))

    # ── Quarterly Table ─────────────────────────────────────────────────────
    q_sales, q_profit, q_opm = [], [], []
    quarters_sec = soup.find(id="quarters")
    if quarters_sec:
        tbl = quarters_sec.find("table")
        if tbl:
            for row in tbl.find_all("tr"):
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if not cells:
                    continue
                label = cells[0].lower().replace("+", "").strip()
                vals  = [_parse_num(c) for c in cells[1:] if _parse_num(c) is not None]
                if "sales" in label and "growth" not in label:
                    q_sales = vals
                elif "net profit" in label or "profit after" in label:
                    q_profit = vals
                elif "opm" in label:
                    q_opm = vals

    # ── Profit-Loss Table (annual) ───────────────────────────────────────────
    pl_sales, pl_profit = [], []
    pl_sec = soup.find(id="profit-loss")
    if pl_sec:
        tbl = pl_sec.find("table")
        if tbl:
            for row in tbl.find_all("tr"):
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if not cells:
                    continue
                label = cells[0].lower().replace("+", "").strip()
                vals  = [_parse_num(c) for c in cells[1:] if _parse_num(c) is not None]
                if "sales" in label and "growth" not in label:
                    pl_sales = vals
                elif "net profit" in label or "profit after" in label:
                    pl_profit = vals

    # ── Shareholding Table ───────────────────────────────────────────────────
    promoter_vals = []
    sh_sec = soup.find(id="shareholding")
    if sh_sec:
        tbl = sh_sec.find("table")
        if tbl:
            for row in tbl.find_all("tr"):
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if cells and "promoter" in cells[0].lower():
                    promoter_vals = [_parse_num(c) for c in cells[1:] if _parse_num(c) is not None]
                    break

    # ── Balance Sheet (for debt) ─────────────────────────────────────────────
    borrowings_vals = []
    bs_sec = soup.find(id="balance-sheet")
    if bs_sec:
        tbl = bs_sec.find("table")
        if tbl:
            for row in tbl.find_all("tr"):
                cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
                if cells and "borrowing" in cells[0].lower():
                    borrowings_vals = [_parse_num(c) for c in cells[1:] if _parse_num(c) is not None]
                    break

    # ════════════════════════════════════════════════════════════════════════
    # SIGNAL GENERATION
    # ════════════════════════════════════════════════════════════════════════

    # 1. Quarterly Sales Growth
    if len(q_sales) >= 5:
        latest = q_sales[-1]
        year_ago = q_sales[-5]
        if latest and year_ago and year_ago > 0:
            growth = ((latest - year_ago) / year_ago) * 100
            if growth > 15:
                signals.append({
                    "type": "quarterly_result", "symbol": symbol,
                    "title": f"Quarterly Sales Growth +{growth:.1f}% YoY",
                    "description": f"Sales grew from {year_ago:,.0f} to {latest:,.0f} Cr — strong top-line momentum over last 4 quarters.",
                    "score": min(20, int(10 + growth / 3)),
                    "signal": "BUY", "confidence": min(88, int(65 + growth / 2)),
                    "category": "Quarterly Results", "impact": "High",
                    "source": "Screener.in", "date": today,
                    "details": {"sales_growth_yoy": f"{growth:.1f}%", "latest_sales": f"{latest:,.0f} Cr", "source_url": f"https://www.screener.in/company/{symbol}/"},
                })

    # 2. Quarterly Profit Growth
    if len(q_profit) >= 5:
        latest = q_profit[-1]
        year_ago = q_profit[-5]
        if latest and year_ago and year_ago > 0:
            growth = ((latest - year_ago) / year_ago) * 100
            if growth > 20:
                signals.append({
                    "type": "quarterly_result", "symbol": symbol,
                    "title": f"Quarterly Profit Growth +{growth:.1f}% YoY",
                    "description": f"Net profit grew {growth:.1f}% YoY — strong bottom-line expansion with improving earnings quality.",
                    "score": min(25, int(15 + growth / 4)),
                    "signal": "STRONG BUY" if growth > 40 else "BUY",
                    "confidence": min(92, int(68 + growth / 3)),
                    "category": "Quarterly Results", "impact": "High",
                    "source": "Screener.in", "date": today,
                    "details": {"profit_growth_yoy": f"{growth:.1f}%", "latest_profit": f"{latest:,.0f} Cr", "source_url": f"https://www.screener.in/company/{symbol}/"},
                })

    # 3. OPM Expansion
    if len(q_opm) >= 5:
        latest_opm = q_opm[-1]
        prev_opm   = q_opm[-5]
        if latest_opm and prev_opm:
            expansion = latest_opm - prev_opm
            if expansion > 2:
                signals.append({
                    "type": "quarterly_result", "symbol": symbol,
                    "title": f"OPM Expansion +{expansion:.1f}pp YoY",
                    "description": f"Operating margin improved from {prev_opm:.1f}% to {latest_opm:.1f}% — cost efficiency improving.",
                    "score": 12,
                    "signal": "BUY", "confidence": 72,
                    "category": "Quarterly Results", "impact": "Medium",
                    "source": "Screener.in", "date": today,
                    "details": {"current_opm": f"{latest_opm:.1f}%", "prev_opm": f"{prev_opm:.1f}%", "expansion": f"+{expansion:.1f}pp"},
                })

    # 4. Promoter Holding Change
    if len(promoter_vals) >= 2:
        latest_p = promoter_vals[-1]
        prev_p   = promoter_vals[-2]
        if latest_p and prev_p:
            change = latest_p - prev_p
            if change > 0.5:
                signals.append({
                    "type": "screener_signal", "symbol": symbol,
                    "title": f"Promoter Holding Increased +{change:.2f}%",
                    "description": f"Promoters increased stake from {prev_p:.2f}% to {latest_p:.2f}% — strong insider confidence signal.",
                    "score": 20,
                    "signal": "BUY", "confidence": 80,
                    "category": "Promoter Activity", "impact": "High",
                    "source": "Screener.in", "date": today,
                    "details": {"current_holding": f"{latest_p:.2f}%", "prev_holding": f"{prev_p:.2f}%", "change": f"+{change:.2f}%"},
                })
            elif change < -1.0:
                signals.append({
                    "type": "screener_signal", "symbol": symbol,
                    "title": f"Promoter Holding Decreased {change:.2f}%",
                    "description": f"Promoters reduced stake from {prev_p:.2f}% to {latest_p:.2f}% — monitor for further selling.",
                    "score": 0,
                    "signal": "WATCH", "confidence": 65,
                    "category": "Promoter Activity", "impact": "Medium",
                    "source": "Screener.in", "date": today,
                    "details": {"current_holding": f"{latest_p:.2f}%", "prev_holding": f"{prev_p:.2f}%", "change": f"{change:.2f}%"},
                })

    # 5. ROE Signal
    if roe and roe > 15:
        score = 15 if roe > 25 else 10
        signals.append({
            "type": "screener_signal", "symbol": symbol,
            "title": f"Strong ROE: {roe:.1f}%",
            "description": f"Return on Equity of {roe:.1f}% — {'exceptional' if roe > 25 else 'healthy'} capital efficiency.",
            "score": score,
            "signal": "BUY", "confidence": min(85, int(60 + roe)),
            "category": "Screener Signal", "impact": "Medium",
            "source": "Screener.in", "date": today,
            "details": {"roe": f"{roe:.1f}%", "roce": f"{roce:.1f}%" if roce else "N/A"},
        })

    # 6. ROCE Signal
    if roce and roce > 15:
        signals.append({
            "type": "screener_signal", "symbol": symbol,
            "title": f"Strong ROCE: {roce:.1f}%",
            "description": f"Return on Capital Employed of {roce:.1f}% — efficient use of total capital, above 15% threshold.",
            "score": 10,
            "signal": "BUY", "confidence": min(82, int(58 + roce)),
            "category": "Screener Signal", "impact": "Medium",
            "source": "Screener.in", "date": today,
            "details": {"roce": f"{roce:.1f}%"},
        })

    # 7. Low P/E
    if pe and 0 < pe < 15:
        signals.append({
            "type": "screener_signal", "symbol": symbol,
            "title": f"Low P/E: {pe:.1f}x",
            "description": f"Stock trading at {pe:.1f}x earnings — potentially undervalued relative to sector peers.",
            "score": 12,
            "signal": "BUY", "confidence": 70,
            "category": "Screener Signal", "impact": "Medium",
            "source": "Screener.in", "date": today,
            "details": {"pe": f"{pe:.1f}x"},
        })

    # 8. Borrowings declining (debt reduction)
    if len(borrowings_vals) >= 2:
        latest_b = borrowings_vals[-1]
        prev_b   = borrowings_vals[-2]
        if latest_b and prev_b and prev_b > 0:
            change_pct = ((latest_b - prev_b) / prev_b) * 100
            if change_pct < -10:
                signals.append({
                    "type": "screener_signal", "symbol": symbol,
                    "title": f"Debt Reduction: {abs(change_pct):.1f}%",
                    "description": f"Borrowings reduced by {abs(change_pct):.1f}% — balance sheet deleveraging, improving financial health.",
                    "score": 10,
                    "signal": "BUY", "confidence": 72,
                    "category": "Screener Signal", "impact": "Medium",
                    "source": "Screener.in", "date": today,
                    "details": {"prev_borrowings": f"{prev_b:,.0f} Cr", "current_borrowings": f"{latest_b:,.0f} Cr", "reduction": f"{abs(change_pct):.1f}%"},
                })

    return signals


async def _fetch_one(client: httpx.AsyncClient, symbol: str) -> List[Dict]:
    try:
        r = await client.get(f"https://www.screener.in/company/{symbol}/consolidated/")
        if r.status_code == 404:
            r = await client.get(f"https://www.screener.in/company/{symbol}/")
        if r.status_code != 200:
            return []
        return _scrape(r.text, symbol)
    except Exception as e:
        print(f"[screener] {symbol}: {e}")
        return []


async def fetch_screener_signals() -> List[Dict]:
    async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
        tasks = [_fetch_one(client, sym) for sym in WATCHLIST]
        batches = await asyncio.gather(*tasks, return_exceptions=True)

    out = []
    for b in batches:
        if isinstance(b, list):
            out.extend(b)
    return out
