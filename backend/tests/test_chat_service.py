import pytest
import os
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_chat_proxy_missing_key(monkeypatch):
    """Verifies 503 Service Unavailable when server has no GROQ_API_KEY configured."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY_2", raising=False)

    payload = {
        "messages": [{"role": "user", "content": "Hello Market Brain"}]
    }

    res = client.post("/api/chat", json=payload)
    assert res.status_code == 503
    data = res.json()
    assert "Groq API key is not configured" in data["detail"]
    assert "gsk_" not in str(data)


def test_chat_proxy_request_validation():
    """Verifies that malformed requests are rejected with 422 Unprocessable Entity."""
    res = client.post("/api/chat", json={})
    assert res.status_code == 422


def test_chat_proxy_secret_boundary(monkeypatch):
    """Verifies that Groq keys never leak in API responses."""
    test_key = "mock_key_TEST_SECRET_DO_NOT_EXPOSE"
    monkeypatch.setenv("GROQ_API_KEY", test_key)

    payload = {
        "messages": [{"role": "user", "content": "Test"}]
    }

    res = client.post("/api/chat", json=payload)
    res_str = res.text
    # Key must NEVER appear in response body
    assert test_key not in res_str
    assert "TEST_SECRET" not in res_str
