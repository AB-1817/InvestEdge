import pytest
from fastapi.testclient import TestClient

# Import main FastAPI app
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from backend.main import app

client = TestClient(app)


def test_list_strategies_endpoint():
    response = client.get("/api/backtest/strategies")
    assert response.status_code == 200
    data = response.json()
    assert "strategies" in data
    assert len(data["strategies"]) >= 5


def test_run_backtest_endpoint():
    payload = {
        "symbol": "RELIANCE",
        "period": "1y",
        "strategy_name": "rsi_reversion",
        "initial_capital": 100000.0,
        "fee_pct": 0.10,
        "slippage_pct": 0.05,
        "holding_days": 15
    }
    response = client.post("/api/backtest/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] in ("RELIANCE", "RELIANCE.NS")
    assert "summary" in data
    assert "trades" in data
    assert "equity_curve" in data


def test_signal_evidence_endpoint():
    payload = {
        "symbol": "INFY",
        "signal_type": "RSI Oversold",
        "period": "1y"
    }
    response = client.post("/api/backtest/signal-evidence", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] in ("INFY", "INFY.NS")
    assert "total_signals" in data
    assert "win_rate_pct" in data
