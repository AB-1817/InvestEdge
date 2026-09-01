import pytest
import os
import sys
import uuid
from datetime import datetime
from fastapi.testclient import TestClient

# Ensure sys.path includes backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from main import app
from models_ledger import SignalRecordSchema
from storage import SignalLedgerRepository
from ledger_service import record_investedge_signal
from outcome_evaluator import evaluate_pending_signals

client = TestClient(app)


def test_signal_creation_and_idempotency():
    """Verifies that genuine signals are recorded and duplicates are safely ignored by database constraints."""
    run_id = str(uuid.uuid4())[:6]
    ts = datetime.now().isoformat()
    sym = f"TEST_{run_id}"
    sig_type = "RSI Oversold"
    strat = "pattern_agent"

    sig_id_1 = record_investedge_signal(
        symbol=sym,
        signal_type=sig_type,
        strategy_name=strat,
        signal_direction="BUY",
        signal_price=145.5,
        market_regime="Sideways Chop",
        confidence=82.0,
        snapshot={"rsi": 28.4, "ema20": 148.0},
        signal_timestamp=ts
    )
    assert sig_id_1 is not None

    # Attempt to record identical signal (simulating React rerender or API polling)
    sig_id_2 = record_investedge_signal(
        symbol=sym,
        signal_type=sig_type,
        strategy_name=strat,
        signal_direction="BUY",
        signal_price=145.5,
        market_regime="Sideways Chop",
        confidence=82.0,
        snapshot={"rsi": 28.4, "ema20": 148.0},
        signal_timestamp=ts
    )
    # Second attempt should return None or ignore duplicate gracefully
    assert sig_id_2 is None

    # Retrieve record detail
    detail = SignalLedgerRepository.get_signal_detail(sig_id_1)
    assert detail is not None
    assert detail["symbol"] == sym.upper()
    assert detail["signal_price"] == 145.5
    assert len(detail["outcomes"]) == 3  # 1D, 5D, 15D horizons initialized as PENDING


def test_immutable_signal_snapshot():
    """Verifies that signal snapshots remain strictly immutable after creation."""
    run_id = str(uuid.uuid4())[:6]
    ts = datetime.now().isoformat()
    sym = f"INFY_{run_id}"
    sig_type = "Golden Cross"
    strat = "ma_crossover"

    sig_id = record_investedge_signal(
        symbol=sym,
        signal_type=sig_type,
        strategy_name=strat,
        signal_direction="BUY",
        signal_price=1820.0,
        market_regime="Bull Run",
        confidence=90.0,
        snapshot={"ema20": 1810, "ema50": 1780},
        signal_timestamp=ts
    )
    assert sig_id is not None

    detail_before = SignalLedgerRepository.get_signal_detail(sig_id)
    assert detail_before["signal_price"] == 1820.0
    assert detail_before["market_regime"] == "Bull Run"

    # Simulate outcome update
    pending = SignalLedgerRepository.get_pending_outcomes()
    target_item = next((i for i in pending if i["signal_id"] == sig_id and i["horizon_days"] == 1), None)
    if target_item:
        SignalLedgerRepository.update_outcome(
            outcome_id=target_item["outcome_id"],
            evaluation_date="2026-08-04",
            outcome_price=1850.0,
            return_pct=1.65,
            benchmark_return_pct=0.5,
            alpha_pct=1.15,
            result="SUCCESS"
        )

    detail_after = SignalLedgerRepository.get_signal_detail(sig_id)
    # Original prediction input fields must NOT be mutated!
    assert detail_after["signal_price"] == 1820.0
    assert detail_after["market_regime"] == "Bull Run"
    assert detail_after["source_data_snapshot"]["ema20"] == 1810


def test_track_record_summary_api():
    """Verifies GET /api/track-record/summary returns sample size n and valid metrics."""
    res = client.get("/api/track-record/summary?horizon_days=15")
    assert res.status_code == 200
    data = res.json()
    assert "total_signals" in data
    assert "win_rate_pct" in data
    assert "sample_size" in data
    assert "statistical_note" in data


def test_track_record_signals_list_api():
    """Verifies GET /api/track-record/signals returns signal history list."""
    res = client.get("/api/track-record/signals?horizon_days=15")
    assert res.status_code == 200
    data = res.json()
    assert "signals" in data
    assert isinstance(data["signals"], list)


def test_earnings_event_study_labeling():
    """Verifies GET /api/earnings/event-study/{symbol} is explicitly labeled DATA LIMITED."""
    res = client.get("/api/earnings/event-study/RELIANCE")
    assert res.status_code == 200
    data = res.json()
    assert "classification" in data
    assert "HISTORICAL EARNINGS EVENT STUDY" in data["classification"]
    assert "disclosure" in data
    assert "NOT historical accuracy" in data["disclosure"]


def test_unauthorized_signal_insertion_rejection():
    """Verifies that public clients cannot POST arbitrary fake signals to the ledger."""
    res = client.post("/api/track-record/record", json={"symbol": "FAKE_STOCK", "signal_direction": "BUY"})
    assert res.status_code in (404, 405)
