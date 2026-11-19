"""
Hierarchical Root Orchestrator Agent for InvestEdge Agents v2.

Delegates to specialized sub-agents, aggregates multi-perspective evidence,
and executes the Critic/Reflection step before finalizing answers.
"""
import uuid
import time
import asyncio
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from .subagents import (
    MarketDataAgent, TechnicalAgent, FundamentalsAgent,
    NewsRAGAgent, PortfolioAgent, RiskAgent, SubAgentResult
)
from .reflection import CriticReflectionEngine, ReflectionResult

logger = logging.getLogger("investedge.agents.root")


class AgentQueryResult(BaseModel):
    query: str
    symbol: Optional[str] = None
    final_answer: str
    trace_id: str
    agent_trace: List[Dict[str, Any]]
    citations: List[Dict[str, Any]]
    reflection_applied: bool
    total_steps: int
    execution_time_ms: float
    model_provider: str


class ADKRootAgent:
    """
    Root agent delegating tasks hierarchically to 6 specialized sub-agents.
    """

    def __init__(
        self,
        max_steps: int = 5,
        enable_reflection: Optional[bool] = None
    ):
        self.max_steps = max_steps
        self.market_agent = MarketDataAgent()
        self.tech_agent = TechnicalAgent()
        self.fund_agent = FundamentalsAgent()
        self.news_agent = NewsRAGAgent()
        self.portfolio_agent = PortfolioAgent()
        self.risk_agent = RiskAgent()
        self.critic = CriticReflectionEngine(enabled=enable_reflection)

    def route_query(
        self,
        query: str,
        symbol: Optional[str] = None,
        holdings: Optional[List[Dict[str, Any]]] = None
    ) -> List[str]:
        """
        Determines which sub-agents to activate based on user intent and payload.
        """
        q = query.lower()
        active = []

        if holdings or "portfolio" in q or "doctor" in q or "allocation" in q:
            active.extend(["portfolio_agent", "risk_agent", "market_data_agent"])
            if symbol:
                active.append("news_rag_agent")
            return active

        if symbol or any(w in q for w in ["stock", "share", "target", "rsi", "pe", "valuation", "nifty", "earnings"]):
            active.extend(["technical_agent", "fundamentals_agent", "news_rag_agent", "market_data_agent"])
            return active

        # General inquiry default
        return ["market_data_agent", "news_rag_agent"]

    async def execute(
        self,
        query: str,
        symbol: Optional[str] = None,
        holdings: Optional[List[Dict[str, Any]]] = None,
        max_steps: Optional[int] = None
    ) -> AgentQueryResult:
        """
        Executes hierarchical agent workflow:
        1. Route to sub-agents
        2. Run sub-agents in parallel
        3. Collect observations & draft synthesis
        4. Critic reflection step
        5. Return grounded response with full execution trace
        """
        t0 = time.perf_counter()
        trace_id = f"trace_{uuid.uuid4().hex[:12]}"
        steps_limit = max_steps or self.max_steps

        # 1. Routing
        subagent_names = self.route_query(query, symbol, holdings)
        agent_map = {
            "market_data_agent": self.market_agent,
            "technical_agent": self.tech_agent,
            "fundamentals_agent": self.fund_agent,
            "news_rag_agent": self.news_agent,
            "portfolio_agent": self.portfolio_agent,
            "risk_agent": self.risk_agent,
        }

        # 2. Parallel Delegation
        tasks = []
        for name in subagent_names:
            agent = agent_map[name]
            task_desc = f"Address user query: '{query}' for symbol '{symbol or 'N/A'}'."
            ctx = {"query": query, "symbol": symbol, "holdings": holdings or []}
            tasks.append(agent.run(task=task_desc, context=ctx, max_steps=steps_limit))

        subagent_results: List[SubAgentResult] = await asyncio.gather(*tasks, return_exceptions=False)

        # 3. Aggregate Traces & Observations
        trace_records = []
        all_citations = []
        all_observations = []
        total_steps_count = 0

        draft_parts = []
        for res in subagent_results:
            total_steps_count += len(res.steps)
            all_citations.extend(res.citations)
            draft_parts.append(f"### {res.agent_name.replace('_', ' ').title()}:\n{res.final_output}")

            for s in res.steps:
                if s.observation:
                    all_observations.append({
                        "agent": res.agent_name,
                        "tool_name": s.tool_name,
                        "output": s.observation
                    })

            trace_records.append({
                "agent_name": res.agent_name,
                "steps_taken": len(res.steps),
                "tools_invoked": [s.tool_name for s in res.steps if s.tool_name],
                "tokens_used": res.tokens_used,
                "summary": res.final_output[:250] + ("..." if len(res.final_output) > 250 else "")
            })

        draft_combined = "\n\n".join(draft_parts)

        # 4. Critic & Reflection Step
        reflection_res: ReflectionResult = await self.critic.reflect_and_revise(
            query=query,
            draft_answer=draft_combined,
            tool_observations=all_observations,
            retrieved_evidence=all_citations
        )

        final_answer = reflection_res.final_answer
        exec_time = round((time.perf_counter() - t0) * 1000, 2)

        from .providers import os
        provider_name = os.getenv("AGENT_MODEL_PROVIDER", "gemini" if os.getenv("GOOGLE_API_KEY") else "groq")

        return AgentQueryResult(
            query=query,
            symbol=symbol,
            final_answer=final_answer,
            trace_id=trace_id,
            agent_trace=trace_records,
            citations=all_citations[:8],
            reflection_applied=reflection_res.reflection_applied,
            total_steps=total_steps_count,
            execution_time_ms=exec_time,
            model_provider=provider_name
        )

