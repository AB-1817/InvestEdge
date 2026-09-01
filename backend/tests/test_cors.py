import pytest
from fastapi.testclient import TestClient
from backend.main import app, get_cors_origins

client = TestClient(app)


def test_cors_allowed_trusted_origin():
    """Verifies that requests from trusted production/dev origins receive Access-Control-Allow-Origin header."""
    trusted_origin = "https://invest-edge-eight.vercel.app"
    headers = {
        "Origin": trusted_origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    }
    res = client.options("/api/chat", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == trusted_origin


def test_cors_untrusted_origin_denied():
    """Verifies that untrusted origins do NOT receive Access-Control-Allow-Origin header."""
    untrusted_origin = "https://malicious-attacker-domain.com"
    headers = {
        "Origin": untrusted_origin,
        "Access-Control-Request-Method": "POST",
    }
    res = client.options("/api/chat", headers=headers)
    # FastApi CORSMiddleware omits access-control-allow-origin header for unauthorized origins
    assert res.headers.get("access-control-allow-origin") != untrusted_origin
    assert res.headers.get("access-control-allow-origin") != "*"


def test_cors_no_wildcard_active():
    """Verifies that wildcard '*' is never returned in default/production configuration."""
    origins = get_cors_origins()
    assert "*" not in origins
    assert "https://invest-edge-eight.vercel.app" in origins
    assert "http://localhost:5173" in origins


def test_cors_origins_env_parsing(monkeypatch):
    """Verifies parsing of CORS_ORIGINS environment variable."""
    custom_origins = "https://custom1.investedge.app, https://custom2.investedge.app"
    monkeypatch.setenv("CORS_ORIGINS", custom_origins)

    parsed = get_cors_origins()
    assert len(parsed) == 2
    assert "https://custom1.investedge.app" in parsed
    assert "https://custom2.investedge.app" in parsed
    assert "*" not in parsed


def test_cors_disallowed_method():
    """Verifies that unapproved HTTP methods (e.g. TRACE/DELETE) are not allowed via CORS preflight."""
    headers = {
        "Origin": "https://invest-edge-eight.vercel.app",
        "Access-Control-Request-Method": "TRACE",
    }
    res = client.options("/api/chat", headers=headers)
    allow_methods = res.headers.get("access-control-allow-methods", "")
    assert "TRACE" not in allow_methods
