import hashlib
from datetime import datetime
from typing import Dict, Any, Optional

from models_ledger import SignalRecordSchema
from storage import SignalLedgerRepository


def create_deterministic_signal_id(symbol: str, signal_type: str, strategy_name: str, date_str: str) -> str:
    """Generates a deterministic unique signal ID based on business identity."""
    clean_sym = symbol.upper().replace(".NS", "").replace(".BO", "").strip()
    clean_type = signal_type.lower().replace(" ", "_").strip()
    clean_strat = strategy_name.lower().replace(" ", "_").strip()
    raw_key = f"{clean_sym}_{clean_type}_{clean_strat}_{date_str}_v1.0.0-investedge"
    digest = hashlib.md5(raw_key.encode("utf-8")).hexdigest()[:8]
    return f"sig_{clean_sym}_{clean_type}_{date_str}_{digest}"


def record_investedge_signal(
    symbol: str,
    signal_type: str,
    strategy_name: str,
    signal_direction: str,
    signal_price: float,
    market_regime: str = "Sideways Chop",
    confidence: Optional[float] = None,
    snapshot: Optional[Dict[str, Any]] = None,
    signal_timestamp: Optional[str] = None
) -> Optional[str]:
    """
    Internal service function invoked strictly at InvestEdge business-logic boundaries
    (inside pattern detection, opportunity screening, or earnings prediction).
    Saves an immutable snapshot to the relational ledger.
    """
    if not symbol or signal_price <= 0:
        return None

    now_dt = datetime.now()
    ts_str = signal_timestamp or now_dt.isoformat()
    date_str = ts_str[:10]

    sig_id = create_deterministic_signal_id(symbol, signal_type, strategy_name, date_str)

    record = SignalRecordSchema(
        signal_id=sig_id,
        symbol=symbol.upper(),
        signal_type=signal_type,
        strategy_name=strategy_name,
        signal_direction=signal_direction.upper(),
        signal_timestamp=ts_str,
        signal_price=round(signal_price, 2),
        market_regime=market_regime,
        confidence=round(confidence, 1) if confidence is not None else None,
        source_data_snapshot=snapshot or {},
        engine_version="v1.0.0-investedge",
        created_at=ts_str
    )

    saved = SignalLedgerRepository.save_signal(record)
    return sig_id if saved else None
