"""
InvestEdge Agents v2: Hierarchical Multi-Agent Orchestration with Google ADK / ReAct loops.
Features 6 specialized subagents, tool wrapping of existing logic, and critic reflection.
"""
from .root_agent import ADKRootAgent
from .tools import ALL_TOOLS, get_tool_definitions
from .subagents import (
    MarketDataAgent, TechnicalAgent, FundamentalsAgent,
    NewsRAGAgent, PortfolioAgent, RiskAgent
)
from .reflection import CriticReflectionEngine

__all__ = [
    "ADKRootAgent",
    "ALL_TOOLS",
    "get_tool_definitions",
    "MarketDataAgent",
    "TechnicalAgent",
    "FundamentalsAgent",
    "NewsRAGAgent",
    "PortfolioAgent",
    "RiskAgent",
    "CriticReflectionEngine",
]

