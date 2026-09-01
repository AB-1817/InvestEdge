import asyncio
from datetime import datetime
from typing import List, Optional, Dict

from .bulk_deals import fetch_bulk_deals
from .filings import fetch_corporate_filings
from .quarterly_results import fetch_quarterly_results
from .insider_trades import fetch_insider_trades
from .commentary import fetch_management_commentary
from .regulation import fetch_regulatory_changes
from .screener_signals import fetch_screener_signals
from .scoring import score_and_rank

FILTER_MAP = {
    "bulk_deal": fetch_bulk_deals,
    "filing": fetch_corporate_filings,
    "quarterly_result": fetch_quarterly_results,
    "insider_trade": fetch_insider_trades,
    "management_commentary": fetch_management_commentary,
    "regulatory_change": fetch_regulatory_changes,
    "screener_signal": fetch_screener_signals,
}


async def run_radar(filters: Optional[List[str]] = None) -> Dict:
    if filters:
        scanners = [FILTER_MAP[f]() for f in filters if f in FILTER_MAP]
    else:
        scanners = [fn() for fn in FILTER_MAP.values()]

    results = await asyncio.gather(*scanners, return_exceptions=True)

    all_opps: List[Dict] = []
    sources_active = []
    for i, result in enumerate(results):
        if isinstance(result, list):
            all_opps.extend(result)
            sources_active.append(list(FILTER_MAP.keys())[i] if not filters else filters[i])

    ranked = score_and_rank(all_opps)
    top50 = ranked[:50]

    very_hot = [o for o in top50 if "VERY HOT" in o.get("bucket", "")]
    hot      = [o for o in top50 if o.get("bucket", "").startswith("HOT")]
    warm     = [o for o in top50 if o.get("bucket", "").startswith("WARM")]

    avg_conf = (
        round(sum(o.get("confidence", 0) for o in top50) / len(top50), 1)
        if top50 else 0
    )

    return {
        "opportunities": top50,
        "summary": {
            "total": len(top50),
            "very_hot": len(very_hot),
            "hot": len(hot),
            "warm": len(warm),
            "avg_confidence": avg_conf,
            "strong_buy": len([o for o in top50 if o.get("signal") == "STRONG BUY"]),
            "buy": len([o for o in top50 if o.get("signal") == "BUY"]),
        },
        "top_opportunity": top50[0] if top50 else None,
        "last_updated": datetime.now().isoformat(),
        "data_sources": [
            "NSE Block Deals", "NSE Corporate Filings", "NSE Insider Filings",
            "Yahoo Finance", "RBI RSS", "SEBI RSS", "News NLP",
        ],
        "scan_status": "success",
    }
