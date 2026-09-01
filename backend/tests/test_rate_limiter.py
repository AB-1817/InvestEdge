import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_rate_limit_exceeded_returns_429(monkeypatch):
    """Verifies that exceeding an endpoint rate limit returns 429 with Retry-After header."""
    # Rapid requests to /api/news/synthesize (limit: 10/min)
    client_ip = "192.168.1.100"
    headers = {"X-Forwarded-For": client_ip}

    responses = []
    for _ in range(12):
        res = client.post("/api/news/synthesize", json={}, headers=headers)
        responses.append(res.status_code)

    assert 429 in responses
    last_res = client.post("/api/news/synthesize", json={}, headers=headers)
    assert last_res.status_code == 429
    assert last_res.json()["detail"].startswith("Rate limit exceeded")
    assert "Retry-After" in last_res.headers


def test_oversized_chat_payload_rejected():
    """Verifies that oversized message lists or text are rejected with 400 Bad Request."""
    # 1. Message list count > 30
    oversized_msgs = [{"role": "user", "content": "hello"} for _ in range(35)]
    res = client.post("/api/chat", json={"messages": oversized_msgs})
    assert res.status_code == 400
    assert "exceeds maximum limit of 30 messages" in res.json()["detail"]

    # 2. Message content length > 4000 chars
    huge_msg = [{"role": "user", "content": "A" * 5000}]
    res2 = client.post("/api/chat", json={"messages": huge_msg})
    assert res2.status_code == 400
    assert "exceeds maximum limit of 4000 characters" in res2.json()["detail"]


def test_health_route_unlimited():
    """Verifies that health check endpoint bypasses rate limiting."""
    for _ in range(20):
        res = client.get("/health")
        assert res.status_code == 200
