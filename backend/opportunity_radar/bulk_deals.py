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


async def _nse_get(url: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(headers=NSE_HEADERS, timeout=20, follow_redirects=True) as client:
        # Warm up session with homepage cookie
        await client.get("https://www.nseindia.com/")
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


async def fetch_bulk_deals() -> List[Dict]:
    opportunities = []
    try:
        data = await _nse_get("https://www.nseindia.com/api/block-deal")
        deals = data.get("data", [])
        for deal in deals[:20]:
            symbol = deal.get("symbol", "").replace("-EQ", "").strip()
            client_name = deal.get("clientName", "Unknown")
            quantity = int(deal.get("quantity", 0) or 0)
            price = float(deal.get("price", 0) or 0)
            deal_type = str(deal.get("buySell", "")).upper()
            if not symbol or price <= 0:
                continue
            is_buy = "BUY" in deal_type
            value_cr = (quantity * price) / 1e7
            if value_cr < 1:
                continue
            score = min(30, int(15 + value_cr * 0.5)) if is_buy else 0
            opportunities.append({
                "type": "bulk_deal",
                "symbol": symbol,
                "title": f"{'Block Buy' if is_buy else 'Block Sell'}: {client_name[:40]}",
                "description": (
                    f"{client_name} {'purchased' if is_buy else 'sold'} {quantity:,} shares "
                    f"@ ₹{price:.2f}. Deal value: ₹{value_cr:.1f} Cr. "
                    f"{'Institutional accumulation — strong conviction signal.' if is_buy else 'Large block sale — monitor for follow-through.'}"
                ),
                "score": score,
                "signal": "BUY" if is_buy else "WATCH",
                "confidence": min(90, 55 + int(value_cr)),
                "category": "Bulk / Block Deal",
                "impact": "High" if value_cr > 50 else "Medium",
                "source": "NSE Block Deals",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "details": {
                    "client": client_name,
                    "quantity": f"{quantity:,}",
                    "price": f"₹{price:.2f}",
                    "value": f"₹{value_cr:.1f} Cr",
                    "side": "Buy" if is_buy else "Sell",
                },
            })
    except Exception as e:
        print(f"[bulk_deals] {e}")
    return opportunities
