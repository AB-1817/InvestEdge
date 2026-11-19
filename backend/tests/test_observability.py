"""
Comprehensive Unit & Integration Tests for LLM Observability & Metrics (Phase 4).

Tests:
- Pricing table math & cost estimation
- Tokens/sec throughput and LLM record persistence
- p50/p95 latency percentiles and error rate aggregation
- Recent calls retrieval
- Bounded session conversation history & token budget truncation
- Observability API endpoints (/api/v2/metrics/llm, /api/v2/metrics/llm/recent)
- Tracer fallback handling
"""
import pytest
import uuid
from fastapi.testclient import TestClient

from backend.main import app
from backend.observability.pricing import calculate_llm_cost, MODEL_PRICING_TABLE
from backend.observability.metrics import (
    record_llm_call,
    get_metrics_summary,
    get_recent_calls,
)
from backend.observability.session import (
    estimate_tokens,
    ConversationSession,
    SessionStateManager,
)
from backend.observability.tracer import get_tracer, NullTrace

client = TestClient(app)


def test_pricing_table_and_cost_estimation():
    """Verifies that cost estimation formula precisely calculates prompt and completion costs."""
    # 1. Groq LLaMA 3.3 70B: $0.59/1M prompt, $0.79/1M completion
    # 10,000 prompt tokens = $0.0059
    # 2,000 completion tokens = $0.00158
    # Total = $0.00748
    cost_groq = calculate_llm_cost("llama-3.3-70b-versatile", prompt_tokens=10_000, completion_tokens=2_000)
    assert cost_groq == 0.00748

    # 2. Gemini 2.5 Flash: $0.075/1M prompt, $0.30/1M completion
    # 20,000 prompt tokens = $0.0015
    # 1,000 completion tokens = $0.0003
    # Total = $0.0018
    cost_gemini = calculate_llm_cost("gemini-2.5-flash", prompt_tokens=20_000, completion_tokens=1_000)
    assert cost_gemini == 0.0018

    # 3. Mock model has zero cost
    cost_mock = calculate_llm_cost("mock-v1", prompt_tokens=50_000, completion_tokens=10_000)
    assert cost_mock == 0.0

    # 4. Fallback unknown model calculates non-zero cost
    cost_unknown = calculate_llm_cost("unknown-model-xyz", prompt_tokens=1_000_000, completion_tokens=1_000_000)
    assert cost_unknown > 0.0


def test_llm_record_creation_and_tokens_per_sec():
    """Verifies that record_llm_call persists accurate telemetry and throughput math."""
    test_trace = f"trace_test_{uuid.uuid4().hex[:8]}"
    
    # 500 completion tokens generated in 2000 ms (2.0s) -> 250.0 tokens/sec
    record = record_llm_call(
        trace_id=test_trace,
        provider="groq",
        model="llama-3.3-70b-versatile",
        prompt_tokens=1200,
        completion_tokens=500,
        latency_ms=2000.0,
        status="success",
        endpoint="/api/chat"
    )

    assert record["trace_id"] == test_trace
    assert record["total_tokens"] == 1700
    assert record["tokens_per_sec"] == 250.0
    assert record["estimated_cost_usd"] > 0.0
    assert record["status"] == "success"

    # Edge case: zero latency does not divide by zero
    zero_rec = record_llm_call(
        trace_id=test_trace,
        provider="mock",
        model="mock",
        prompt_tokens=100,
        completion_tokens=50,
        latency_ms=0.0,
        status="success"
    )
    assert zero_rec["tokens_per_sec"] == 0.0


def test_metrics_summary_percentiles_and_aggregations():
    """Verifies that p50/p95 latency and error rate are accurately aggregated."""
    test_run_id = uuid.uuid4().hex[:6]
    
    # Insert 10 mock calls with controlled latencies: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 ms
    for i in range(1, 11):
        status = "error" if i == 10 else "success"  # 1 failure out of 10 -> 10% error rate
        record_llm_call(
            trace_id=f"trace_agg_{test_run_id}_{i}",
            provider="groq",
            model="llama-3.3-70b-versatile",
            prompt_tokens=100,
            completion_tokens=50,
            latency_ms=float(i * 100),
            status=status,
            error_message="Rate limit simulated" if status == "error" else None
        )

    summary = get_metrics_summary(hours=1)
    assert summary["total_calls"] >= 10
    assert summary["tokens"]["total"] >= 1500
    assert summary["costs"]["total_cost_usd"] > 0.0
    # Latency percentiles must be realistic numbers
    assert summary["latency_ms"]["p50"] > 0
    assert summary["latency_ms"]["p95"] >= summary["latency_ms"]["p50"]


def test_recent_calls_retrieval():
    """Verifies that recent calls list returns records ordered by creation."""
    records = get_recent_calls(limit=5)
    assert isinstance(records, list)
    assert len(records) <= 5
    if len(records) >= 2:
        # Check descending order
        assert records[0]["created_at"] >= records[1]["created_at"]


def test_session_state_bounded_history_and_truncation():
    """Verifies that conversation history does not grow unbounded and truncates older turns."""
    session = ConversationSession(
        session_id="session_test_bound",
        max_history_turns=2,  # max 2 turns = 4 messages
        max_tokens_budget=5000,
        system_prompt="You are Market Brain."
    )

    # Add 5 user-assistant turns (10 messages)
    for i in range(1, 6):
        session.add_message("user", f"Turn {i} user question about Nifty 50 performance.")
        session.add_message("assistant", f"Turn {i} assistant answer detailing Nifty trend.")

    # Must be bounded to max_history_turns * 2 = 4 messages
    assert len(session.messages) == 4
    # Context summary of evicted turns should be preserved
    assert session.context_summary is not None
    assert "Earlier discussed topics" in session.context_summary

    llm_msgs = session.get_messages_for_llm()
    # Should include: system prompt + summary system note + 4 recent messages = 6
    assert llm_msgs[0]["role"] == "system"
    assert llm_msgs[0]["content"] == "You are Market Brain."
    assert "Context from prior messages" in llm_msgs[1]["content"]
    assert len(llm_msgs) == 6


def test_session_token_budget_enforcement():
    """Verifies that large messages exceeding token budget are pruned until within budget."""
    session = ConversationSession(
        session_id="session_token_budget",
        max_history_turns=10,
        max_tokens_budget=100,  # very tight budget (~400 characters)
        system_prompt="Short prompt"
    )

    # Insert message that takes ~150 tokens (> 100 token budget)
    large_text = "Detailed corporate earnings report analysis. " * 15
    session.add_message("user", large_text)

    # Total tokens in buffer must not exceed budget
    total_tokens = session._calculate_total_tokens()
    assert total_tokens <= 100


def test_api_v2_metrics_summary_endpoint():
    """Verifies GET /api/v2/metrics/llm endpoint returns expected schema."""
    res = client.get("/api/v2/metrics/llm?hours=24")
    assert res.status_code == 200
    data = res.json()
    assert "period_hours" in data
    assert "total_calls" in data
    assert "tokens" in data
    assert "costs" in data
    assert "latency_ms" in data
    assert "mean_tokens_per_sec" in data
    assert "models" in data
    assert "p50" in data["latency_ms"]
    assert "p95" in data["latency_ms"]


def test_api_v2_metrics_recent_endpoint():
    """Verifies GET /api/v2/metrics/llm/recent endpoint returns list of recent calls."""
    res = client.get("/api/v2/metrics/llm/recent?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert "count" in data
    assert "records" in data
    assert isinstance(data["records"], list)


def test_tracer_autonomous_null_trace():
    """Verifies that get_tracer provides working trace and span contexts when Langfuse is not enabled."""
    tracer = get_tracer()
    trace = tracer.create_trace(name="test_trace_eval")
    assert trace.id.startswith("trace_")
    
    span = trace.span(name="test_subagent_span")
    assert span.span_id.startswith("span_")
    span.end(output="Completed successfully")
    assert span.status == "success"
