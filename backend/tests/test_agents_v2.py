"""
Comprehensive Unit & Integration Tests for Multi-Agent System v2 (Phase 3).
Tests: tool wrappers, hierarchical routing, ReAct tool loop, max-step guard,
critic reflection revision of unsupported claims, and /api/v2/agent/query route.
"""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.agents_v2.tools import ALL_TOOLS, get_tool_definitions
from backend.agents_v2.root_agent import ADKRootAgent
from backend.agents_v2.subagents import TechnicalAgent, AgentStep
from backend.agents_v2.reflection import CriticReflectionEngine, ReflectionResult
from backend.agents_v2.providers import LLMResponse, LLMToolCall

client = TestClient(app)


def test_tool_wrappers_registered_and_schemas():
    """Verifies that all 6 tools are properly wrapped and export valid schemas."""
    expected_tools = [
        "detect_chart_patterns",
        "fundamental_analysis",
        "get_market_regime",
        "news_rag_search",
        "analyze_portfolio",
        "assess_portfolio_risk",
    ]
    for t_name in expected_tools:
        assert t_name in ALL_TOOLS
        tool = ALL_TOOLS[t_name]
        schema = tool.to_schema()
        assert schema["type"] == "function"
        assert schema["function"]["name"] == t_name
        assert "description" in schema["function"]
        assert "parameters" in schema["function"]


@pytest.mark.asyncio
async def test_tool_execution_wrapper():
    """Verifies that tool execute() handles async execution gracefully."""
    tool = ALL_TOOLS["get_market_regime"]
    with patch("main.market_regime", new_callable=AsyncMock) as mock_regime:
        mock_regime.return_value = {
            "regime": "Bull Run",
            "description": "Strong uptrend",
            "metrics": {"rsi": 62.0},
            "ai_insight": "Momentum intact."
        }
        res = await tool.execute()
        assert res["regime"] == "Bull Run"
        assert res["metrics"]["rsi"] == 62.0


def test_root_agent_routing():
    """Verifies that the hierarchical root agent routes queries to the appropriate sub-agents."""
    agent = ADKRootAgent()

    # 1. Stock specific query -> Technical + Fundamental + News RAG + Market Data
    routes_stock = agent.route_query("What is the valuation and RSI for RELIANCE?", symbol="RELIANCE")
    assert "technical_agent" in routes_stock
    assert "fundamentals_agent" in routes_stock
    assert "news_rag_agent" in routes_stock
    assert "market_data_agent" in routes_stock

    # 2. Portfolio query -> Portfolio + Risk + Market Data
    routes_port = agent.route_query(
        "Analyze my portfolio concentration and risk",
        holdings=[{"symbol": "TCS", "qty": 10, "avg_cost": 3500}]
    )
    assert "portfolio_agent" in routes_port
    assert "risk_agent" in routes_port
    assert "market_data_agent" in routes_port


@pytest.mark.asyncio
async def test_subagent_react_loop_and_max_step_guard():
    """Verifies that subagents execute the ReAct loop and cleanly terminate at max_steps."""
    agent = TechnicalAgent()

    # Mock LLM calling tool repeatedly to test max-step limit
    step_count = 0

    async def mock_call_llm(*args, **kwargs):
        nonlocal step_count
        step_count += 1
        return LLMResponse(
            content=f"Reasoning step {step_count}",
            tool_calls=[
                LLMToolCall(
                    id="tc_123",
                    name="detect_chart_patterns",
                    arguments={"symbol": "RELIANCE", "period": "6mo"}
                )
            ],
            model="mock",
            provider="mock",
            total_tokens=50
        )

    with patch("backend.agents_v2.subagents.call_agent_llm", side_effect=mock_call_llm):
        with patch.object(ALL_TOOLS["detect_chart_patterns"], "execute", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {"bias": "bullish", "rsi": 28.5}
            res = await agent.run(task="Check RELIANCE RSI", context={"symbol": "RELIANCE"}, max_steps=3)

            # Must not exceed max_steps
            assert len(res.steps) <= 3
            assert res.agent_name == "technical_agent"
            assert "summary after" in res.final_output or "bullish" in res.final_output


@pytest.mark.asyncio
async def test_critic_reflection_revises_unsupported_claims():
    """
    Verifies that the CriticReflectionEngine identifies an unsupported metric
    and revises the draft response once.
    """
    critic = CriticReflectionEngine(enabled=True)

    query = "What is the target price for Infosys?"
    # Draft makes an ungrounded claim of ₹9,999 which is not in ground truth
    draft = "Infosys target price is ₹9,999 with 85% upside."

    tool_observations = [
        {
            "tool_name": "fundamental_analysis",
            "output": {"symbol": "INFY", "target_price": 1950.0, "current_price": 1850.0}
        }
    ]

    async def mock_critic_call(*args, **kwargs):
        return LLMResponse(
            content="CRITIQUE: The target price of ₹9,999 is unsupported by the evidence.\nREVISED: Infosys consensus target price is ₹1,950 based on Wall Street research.",
            model="mock",
            provider="mock"
        )

    with patch("backend.agents_v2.reflection.call_agent_llm", side_effect=mock_critic_call):
        result: ReflectionResult = await critic.reflect_and_revise(
            query=query,
            draft_answer=draft,
            tool_observations=tool_observations,
            retrieved_evidence=[]
        )

        assert result.reflection_applied is True
        assert "₹1,950" in result.final_answer
        assert "₹9,999" not in result.final_answer


def test_api_v2_agent_query_endpoint(monkeypatch):
    """Verifies POST /api/v2/agent/query returns final answer, trace, and citations."""
    async def mock_execute(self, query, symbol=None, holdings=None, max_steps=None):
        from backend.agents_v2.root_agent import AgentQueryResult
        return AgentQueryResult(
            query=query,
            symbol=symbol,
            final_answer="Comprehensive multi-agent analysis for RELIANCE: Bullish technicals and resilient fundamentals.",
            trace_id="trace_test_999",
            agent_trace=[
                {"agent_name": "technical_agent", "steps_taken": 2, "tools_invoked": ["detect_chart_patterns"], "tokens_used": 100, "summary": "RSI oversold"}
            ],
            citations=[{"chunk_id": "c1", "source": "NSE", "doc_type": "news", "text_snippet": "RIL energy", "similarity_score": 0.88}],
            reflection_applied=False,
            total_steps=2,
            execution_time_ms=120.5,
            model_provider="mock"
        )

    import agents_v2.routes
    monkeypatch.setattr(agents_v2.routes.ADKRootAgent, "execute", mock_execute)
    try:
        import backend.agents_v2.routes
        monkeypatch.setattr(backend.agents_v2.routes.ADKRootAgent, "execute", mock_execute)
    except Exception:
        pass

    payload = {
        "query": "Give me a full multi-agent breakdown of RELIANCE",
        "symbol": "RELIANCE",
        "max_steps": 3
    }
    res = client.post("/api/v2/agent/query", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "final_answer" in data
    assert "trace_id" in data
    assert "agent_trace" in data
    assert len(data["agent_trace"]) > 0
    assert "citations" in data
    assert data["trace_id"] == "trace_test_999"

