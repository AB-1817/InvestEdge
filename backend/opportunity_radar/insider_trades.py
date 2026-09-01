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


async def fetch_insider_trades() -> List[Dict]:
    opportunities = []
    try:
        async with httpx.AsyncClient(headers=NSE_HEADERS, timeout=20, follow_redirects=True) as client:
            await client.get("https://www.nseindia.com/")
            resp = await client.get(
                "https://www.nseindia.com/api/corporates-pit",
                params={"index": "equities", "from_date": "", "to_date": ""},
            )
            resp.raise_for_status()
            trades = resp.json().get("data", [])

        for trade in trades[:25]:
            symbol = trade.get("symbol", "").replace("-EQ", "").strip()
            person = trade.get("personName") or trade.get("acqName") or "Insider"
            mode = str(trade.get("tdpTransactionType") or trade.get("acqMode") or "").upper()
            quantity = int(float(trade.get("secAcq") or trade.get("noOfShareAcq") or 0) or 0)
            raw_price = trade.get("befAcqSharesNo") or trade.get("acqPrice") or 0
            try:
                price = float(raw_price)
            except (ValueError, TypeError):
                price = 0.0
            raw_val = trade.get("val") or 0
            try:
                value_cr = float(raw_val) / 1e7
            except (ValueError, TypeError):
                value_cr = quantity * price / 1e7 if price > 0 else 0.0

            if not symbol or quantity <= 0:
                continue

            is_buy = any(k in mode for k in ["BUY", "PURCHASE", "MARKET PURCHASE", "ACQ"])
            if value_cr < 0.5:
                continue

            score = 25 if is_buy else 0
            opportunities.append({
                "type": "insider_trade",
                "symbol": symbol,
                "title": f"Insider {'Buy' if is_buy else 'Sell'}: {person[:35]}",
                "description": (
                    f"{person} {'purchased' if is_buy else 'sold'} {quantity:,} shares"
                    + (f" worth ₹{value_cr:.1f} Cr." if value_cr > 0 else ".")
                    + (" Insider buying signals management confidence." if is_buy
                       else " Insider selling — monitor for further activity.")
                ),
                "score": score,
                "signal": "BUY" if is_buy else "WATCH",
                "confidence": min(85, 55 + int(value_cr * 2)) if is_buy else 40,
                "category": "Insider Trade",
                "impact": "High" if value_cr > 10 else "Medium",
                "source": "NSE Insider Filings",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "person": person,
                    "transaction": "Buy" if is_buy else "Sell",
                    "shares": f"{quantity:,}",
                    "value": f"₹{value_cr:.1f} Cr" if value_cr > 0 else "N/A",
                },
            })
    except Exception as e:
        print(f"[insider_trades] {e}")
    return opportunities
