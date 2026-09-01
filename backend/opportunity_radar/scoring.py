from collections import defaultdict
from typing import List, Dict


def score_and_rank(opportunities: List[Dict]) -> List[Dict]:
    """
    Group signals by symbol, sum scores, classify into buckets,
    return one enriched entry per (symbol, title) pair — sorted by total score.
    """
    symbol_meta: Dict[str, Dict] = defaultdict(lambda: {
        "total_score": 0,
        "max_confidence": 0,
        "signal_count": 0,
        "sources": set(),
    })

    for opp in opportunities:
        sym = opp["symbol"]
        symbol_meta[sym]["total_score"] += opp.get("score", 0)
        symbol_meta[sym]["max_confidence"] = max(
            symbol_meta[sym]["max_confidence"], opp.get("confidence", 0)
        )
        symbol_meta[sym]["signal_count"] += 1
        symbol_meta[sym]["sources"].add(opp.get("source", ""))

    enriched = []
    for opp in opportunities:
        sym = opp["symbol"]
        meta = symbol_meta[sym]
        total = meta["total_score"]

        if total >= 80:
            bucket, bucket_color = "VERY HOT 🔴", "#dc2626"
        elif total >= 60:
            bucket, bucket_color = "HOT 🟠", "#ea580c"
        elif total >= 40:
            bucket, bucket_color = "WARM 🟡", "#d97706"
        else:
            bucket, bucket_color = "COLD ⚪", "#9ca3af"

        enriched.append({
            **opp,
            "total_score": total,
            "bucket": bucket,
            "bucket_color": bucket_color,
            "symbol_confidence": meta["max_confidence"],
            "symbol_signal_count": meta["signal_count"],
            "symbol_sources": list(meta["sources"]),
        })

    # Deduplicate by (symbol, title)
    seen = set()
    unique = []
    for opp in enriched:
        key = f"{opp['symbol']}|{opp['title']}"
        if key not in seen:
            seen.add(key)
            unique.append(opp)

    unique.sort(key=lambda x: (x["total_score"], x.get("confidence", 0)), reverse=True)
    return unique
