import pytest
import os
import httpx
from main import app
from fastapi.testclient import TestClient

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


def test_chat_proxy_success_mocked(monkeypatch):
    """Verifies that a successful Groq HTTP 200 response is cleanly returned by POST /api/chat."""
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_mock_key")

    mock_groq_response = {
        "id": "chatcmpl-mock123",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! I am InvestEdge AI."
                },
                "finish_reason": "stop"
            }
        ]
    }

    class MockHttpxResponse:
        status_code = 200
        is_success = True
        headers = {"content-type": "application/json"}
        def json(self):
            return mock_groq_response

    async def mock_post(*args, **kwargs):
        return MockHttpxResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    payload = {
        "messages": [{"role": "user", "content": "Hello"}]
    }

    res = client.post("/api/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["choices"][0]["message"]["content"] == "Hello! I am InvestEdge AI."
