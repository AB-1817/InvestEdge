"""
Specialized Sub-Agents with ReAct Tool Loops for InvestEdge Agents v2.

Implements 6 domain-specific agents:
1. MarketDataAgent
2. TechnicalAgent
3. FundamentalsAgent
4. NewsRAGAgent
5. PortfolioAgent
6. RiskAgent
"""
import json
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from .tools import ALL_TOOLS, get_tool_definitions
from .providers import call_agent_llm, LLMResponse

logger = logging.getLogger("investedge.agents.subagents")


class AgentStep(BaseModel):
    step_number: int
    thought: str
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    observation: Optional[Any] = None


class SubAgentResult(BaseModel):
    agent_name: str
    final_output: str
    steps: List[AgentStep] = Field(default_factory=list)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    tokens_used: int = 0


class BaseSubAgent:
    """Base class executing a ReAct tool loop (Reason -> Action -> Observe)."""

    def __init__(
        self,
        name: str,
        role: str,
        system_prompt: str,
        allowed_tools: List[str]
    ):
        self.name = name
        self.role = role
        self.system_prompt = system_prompt
        self.allowed_tools = allowed_tools
        self.tool_definitions = get_tool_definitions(allowed_tools)

    async def run(
        self,
        task: str,
        context: Optional[Dict[str, Any]] = None,
        max_steps: int = 4
    ) -> SubAgentResult:
        """
        Executes ReAct step loop with max-step guard to prevent infinite tool loops.
        """
        steps: List[AgentStep] = []
        citations: List[Dict[str, Any]] = []
        total_tokens = 0

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": f"TASK: {task}\nCONTEXT: {json.dumps(context or {}, default=str)}"
            }
        ]

        step_idx = 0
        final_answer = ""

        while step_idx < max_steps:
            step_idx += 1
            # 1. Reason: Call LLM with tool schemas
            try:
                llm_res: LLMResponse = await call_agent_llm(
                    messages=messages,
                    tools=self.tool_definitions if self.tool_definitions else None,
                    temperature=0.2
                )
                total_tokens += llm_res.total_tokens
            except Exception as e:
                logger.error(f"[{self.name}] LLM step call failed: {e}")
                final_answer = f"{self.role} could not complete analysis due to model provider error: {str(e)}"
                break

            # 2. Check if model emitted tool calls
            if llm_res.tool_calls:
                tc = llm_res.tool_calls[0]
                t_name = tc.name
                t_args = tc.arguments

                if t_name in ALL_TOOLS:
                    # Execute tool
                    obs = await ALL_TOOLS[t_name].execute(**t_args)
                    steps.append(AgentStep(
                        step_number=step_idx,
                        thought=llm_res.content or f"Calling tool {t_name}",
                        tool_name=t_name,
                        tool_args=t_args,
                        observation=obs
                    ))

                    # If tool produced RAG evidence, collect citations
                    if isinstance(obs, dict) and "evidence" in obs:
                        citations.extend(obs.get("evidence", []))

                    # Feed observation back to conversation history
                    messages.append({
                        "role": "assistant",
                        "content": llm_res.content or f"Calling {t_name}"
                    })
                    messages.append({
                        "role": "user",
                        "content": f"TOOL OBSERVATION ({t_name}):\n{json.dumps(obs, default=str)[:2000]}"
                    })
                else:
                    # Invalid tool call
                    messages.append({
                        "role": "user",
                        "content": f"Tool '{t_name}' is not allowed or does not exist."
                    })
            else:
                # Model produced final text
                final_answer = llm_res.content or ""
                steps.append(AgentStep(
                    step_number=step_idx,
                    thought="Direct answer generated.",
                    tool_name=None,
                    tool_args=None,
                    observation=None
                ))
                break

        # Max steps guard check
        if not final_answer:
            # If loop reached max steps without a text answer, synthesize available observations
            obs_summary = "\n".join(
                f"- {s.tool_name}: {str(s.observation)[:200]}"
                for s in steps if s.observation
            )
            final_answer = (
                f"[{self.name} summary after {len(steps)} steps]: "
                f"Analyzed available tool data: {obs_summary or 'No observations recorded.'}"
            )

        return SubAgentResult(
            agent_name=self.name,
            final_output=final_answer,
            steps=steps,
            citations=citations,
            tokens_used=total_tokens
        )


# ─── 1. Market Data Agent ─────────────────────────────────────────────────────

class MarketDataAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="market_data_agent",
            role="Macro & Market Regime Specialist",
            system_prompt=(
                "You are the InvestEdge Market Data Agent. Your role is analyzing overall market health, "
                "macro indices (Nifty 50, Sensex), and classifying the active Market Regime (Bull Run, Bear Phase, "
                "High Volatility, or Sideways Chop). Call the 'get_market_regime' tool to gather real-time data."
            ),
            allowed_tools=["get_market_regime"]
        )


# ─── 2. Technical Agent ───────────────────────────────────────────────────────

class TechnicalAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="technical_agent",
            role="Quantitative Technical Analyst",
            system_prompt=(
                "You are the InvestEdge Technical Agent. Your role is running quantitative technical analysis "
                "over historical prices (RSI, EMAs 20/50/200, MACD, Bollinger Bands, ATR) and identifying "
                "support/resistance levels and backtest evidence. Call 'detect_chart_patterns' to analyze stocks."
            ),
            allowed_tools=["detect_chart_patterns"]
        )


# ─── 3. Fundamentals Agent ────────────────────────────────────────────────────

class FundamentalsAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="fundamentals_agent",
            role="Equity Research Fundamental Analyst",
            system_prompt=(
                "You are the InvestEdge Fundamental Agent. Your role is evaluating corporate balance sheets, "
                "P/E multiples, capital efficiency (ROE), top-line growth, debt leverage, and Wall Street "
                "consensus price targets. Call 'fundamental_analysis' to gather corporate metrics."
            ),
            allowed_tools=["fundamental_analysis"]
        )


# ─── 4. News RAG Agent ────────────────────────────────────────────────────────

class NewsRAGAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="news_rag_agent",
            role="Financial Intelligence Retrieval Specialist",
            system_prompt=(
                "You are the InvestEdge News RAG Agent. Your role is searching the vectorized knowledge store "
                "for verified news articles, Opportunity Radar filings, block deals, and quarterly earnings disclosures. "
                "Call 'news_rag_search' to retrieve cited evidence."
            ),
            allowed_tools=["news_rag_search"]
        )


# ─── 5. Portfolio Agent ───────────────────────────────────────────────────────

class PortfolioAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="portfolio_agent",
            role="Portfolio Allocation Specialist",
            system_prompt=(
                "You are the InvestEdge Portfolio Agent. Your role is analyzing multi-holding portfolios, "
                "position sizing weights, aggregate P&L performance, and technical stop-loss calculations. "
                "Call 'analyze_portfolio' to evaluate positions."
            ),
            allowed_tools=["analyze_portfolio"]
        )


# ─── 6. Risk Agent ────────────────────────────────────────────────────────────

class RiskAgent(BaseSubAgent):
    def __init__(self):
        super().__init__(
            name="risk_agent",
            role="Chief Risk Officer & Portfolio Health Doctor",
            system_prompt=(
                "You are the InvestEdge Risk Agent. Your role is evaluating concentration risk, sector "
                "overweights, drawdowns, regime conflicts, and computing portfolio health grades (A-D). "
                "Call 'assess_portfolio_risk' to generate diagnostic audits."
            ),
            allowed_tools=["assess_portfolio_risk"]
        )

