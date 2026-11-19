"""
Tool Wrappers for InvestEdge Multi-Agent System (Agents v2).

Directly wraps existing production functions without duplicating business logic:
- Chart pattern detection (main.detect_patterns)
- Fundamental scanner (main.fundamental_analysis)
- Market regime classification (main.market_regime)
- Vector RAG semantic search (rag.retriever.Retriever)
- Portfolio analysis (main.analyze_portfolio)
- Risk & health diagnostics (orchestrator.get_contextual_advice)
- Earnings event study & predictor (main.earnings_predictor)
"""
import inspect
import logging
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger("investedge.agents.tools")


class AgentTool:
    """Descriptor and execution wrapper for an agent tool."""

    def __init__(
        self,
        name: str,
        description: str,
        func: Callable,
        parameters: Dict[str, Any]
    ):
        self.name = name
        self.description = description
        self.func = func
        self.parameters = parameters

    async def execute(self, **kwargs) -> Any:
        """Executes the wrapped function, handling sync/async signatures cleanly."""
        try:
            if inspect.iscoroutinefunction(self.func):
                return await self.func(**kwargs)
            return self.func(**kwargs)
        except Exception as e:
            logger.error(f"Error executing tool '{self.name}': {e}")
            return {"error": f"Tool execution failed: {str(e)}"}

    def to_schema(self) -> Dict[str, Any]:
        """Returns standard OpenAI / Gemini tool declaration schema."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters.get("properties", {}),
                    "required": self.parameters.get("required", [])
                }
            }
        }


# ─── 1. Technical Chart Tool Wrapper ──────────────────────────────────────────

async def _tool_detect_chart_patterns(symbol: str, period: str = "6mo") -> Dict[str, Any]:
    from main import detect_patterns, PatternReq
    req = PatternReq(symbol=symbol, period=period)
    res = await detect_patterns(req)
    # Return concise technical digest to preserve agent token budget
    return {
        "symbol": res.get("symbol"),
        "bias": res.get("bias"),
        "price": res.get("price"),
        "signals": res.get("signals", [])[:4],
        "support": res.get("support", []),
        "resistance": res.get("resistance", []),
        "backtest_summary": res.get("backtest"),
    }


# ─── 2. Fundamental Analysis Tool Wrapper ─────────────────────────────────────

async def _tool_fundamental_analysis(symbol: str) -> Dict[str, Any]:
    from main import fundamental_analysis, OppReq
    req = OppReq(symbol=symbol)
    res = await fundamental_analysis(req)
    return {
        "symbol": res.get("symbol"),
        "name": res.get("name"),
        "sector": res.get("sector"),
        "current_price": res.get("current_price"),
        "market_cap": res.get("market_cap"),
        "analyst": res.get("analyst"),
        "fundamentals": res.get("fundamentals"),
        "signals": res.get("signals", [])[:4],
    }


# ─── 3. Market Regime Tool Wrapper ────────────────────────────────────────────

async def _tool_market_regime() -> Dict[str, Any]:
    from main import market_regime
    res = await market_regime()
    return {
        "regime": res.get("regime"),
        "description": res.get("description"),
        "metrics": res.get("metrics"),
        "ai_insight": res.get("ai_insight"),
    }


# ─── 4. Vector RAG Search Tool Wrapper ────────────────────────────────────────

async def _tool_news_rag_search(query: str, symbol: Optional[str] = None, k: int = 4) -> Dict[str, Any]:
    from rag.retriever import Retriever
    retriever = Retriever()
    chunks = retriever.retrieve(query=query, symbol=symbol, k=k, use_mmr=True)
    citations = retriever.format_citations(chunks)
    return {
        "query": query,
        "symbol": symbol,
        "retrieved_count": len(chunks),
        "evidence": [
            {
                "chunk_id": c.chunk_id,
                "source": c.source,
                "symbol": c.symbol,
                "doc_type": c.doc_type,
                "snippet": c.text_snippet,
                "score": c.similarity_score
            }
            for c in citations
        ]
    }


# ─── 5. Portfolio Analyzer Tool Wrapper ───────────────────────────────────────

async def _tool_analyze_portfolio(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    from main import analyze_portfolio, PortfolioReq, Holding
    parsed_holdings = [
        Holding(
            symbol=h.get("symbol", ""),
            qty=int(h.get("qty", 1)),
            avg_cost=float(h.get("avg_cost", 0.0))
        )
        for h in holdings
    ]
    res = await analyze_portfolio(PortfolioReq(holdings=parsed_holdings))
    return {
        "summary": res.get("summary"),
        "holdings_count": len(res.get("holdings", [])),
        "holdings": res.get("holdings", []),
    }


# ─── 6. Risk Diagnostics Tool Wrapper ─────────────────────────────────────────

async def _tool_risk_assessment(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    from orchestrator import get_contextual_advice
    from main import Holding
    parsed = [
        Holding(
            symbol=h.get("symbol", ""),
            qty=int(h.get("qty", 1)),
            avg_cost=float(h.get("avg_cost", 0.0))
        )
        for h in holdings
    ]
    res = await get_contextual_advice(parsed)
    return {
        "health_score": res.get("score"),
        "grade": res.get("grade"),
        "issues": res.get("issues", []),
        "suggestions": res.get("suggestions", []),
        "risk_flags": res.get("risk_flags", []),
        "sector_allocation": res.get("sector_allocation", {}),
    }


# ─── Tool Registry ────────────────────────────────────────────────────────────

TOOL_CHART_PATTERNS = AgentTool(
    name="detect_chart_patterns",
    description="Analyzes technical indicators (RSI, EMAs 20/50/200, MACD, Bollinger Bands, ATR) and detects chart patterns for an Indian stock ticker (NSE/BSE).",
    func=_tool_detect_chart_patterns,
    parameters={
        "properties": {
            "symbol": {"type": "string", "description": "Stock symbol (e.g. RELIANCE, HDFCBANK, TCS, INFY)"},
            "period": {"type": "string", "enum": ["3mo", "6mo", "1y"], "description": "Lookback period"}
        },
        "required": ["symbol"]
    }
)

TOOL_FUNDAMENTAL_ANALYSIS = AgentTool(
    name="fundamental_analysis",
    description="Fetches company fundamentals, valuation multiples (trailing/forward P/E), return on equity (ROE), revenue growth, debt-to-equity, and Wall Street consensus price targets.",
    func=_tool_fundamental_analysis,
    parameters={
        "properties": {
            "symbol": {"type": "string", "description": "Stock symbol (e.g. RELIANCE, HDFCBANK, TCS)"}
        },
        "required": ["symbol"]
    }
)

TOOL_MARKET_REGIME = AgentTool(
    name="get_market_regime",
    description="Classifies overall Indian market macro environment on Nifty 50 into Bull Run, Bear Phase, High Volatility, or Sideways Chop.",
    func=_tool_market_regime,
    parameters={"properties": {}, "required": []}
)

TOOL_NEWS_RAG = AgentTool(
    name="news_rag_search",
    description="Performs semantic similarity search over financial news, corporate filings, Opportunity Radar block deals, and quarterly results, returning evidence with citations.",
    func=_tool_news_rag_search,
    parameters={
        "properties": {
            "query": {"type": "string", "description": "Search query or topic"},
            "symbol": {"type": "string", "description": "Optional stock symbol filter"},
            "k": {"type": "integer", "description": "Number of evidence chunks to retrieve"}
        },
        "required": ["query"]
    }
)

TOOL_ANALYZE_PORTFOLIO = AgentTool(
    name="analyze_portfolio",
    description="Computes portfolio aggregate P&L, weighted position sizing, current valuations, and suggested stop-loss prices across multiple holdings.",
    func=_tool_analyze_portfolio,
    parameters={
        "properties": {
            "holdings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "symbol": {"type": "string"},
                        "qty": {"type": "integer"},
                        "avg_cost": {"type": "number"}
                    },
                    "required": ["symbol", "qty", "avg_cost"]
                },
                "description": "List of portfolio holdings"
            }
        },
        "required": ["holdings"]
    }
)

TOOL_RISK_ASSESSMENT = AgentTool(
    name="assess_portfolio_risk",
    description="Assesses portfolio diversification, single-stock and sector concentration risk, regime conflict risk, and computes health grade (A-D).",
    func=_tool_risk_assessment,
    parameters={
        "properties": {
            "holdings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "symbol": {"type": "string"},
                        "qty": {"type": "integer"},
                        "avg_cost": {"type": "number"}
                    },
                    "required": ["symbol", "qty", "avg_cost"]
                }
            }
        },
        "required": ["holdings"]
    }
)

ALL_TOOLS: Dict[str, AgentTool] = {
    "detect_chart_patterns": TOOL_CHART_PATTERNS,
    "fundamental_analysis": TOOL_FUNDAMENTAL_ANALYSIS,
    "get_market_regime": TOOL_MARKET_REGIME,
    "news_rag_search": TOOL_NEWS_RAG,
    "analyze_portfolio": TOOL_ANALYZE_PORTFOLIO,
    "assess_portfolio_risk": TOOL_RISK_ASSESSMENT,
}


def get_tool_definitions(tool_names: List[str]) -> List[Dict[str, Any]]:
    """Returns OpenAI/Gemini tool declaration schemas for specified tool names."""
    defs = []
    for name in tool_names:
        if name in ALL_TOOLS:
            defs.append(ALL_TOOLS[name].to_schema())
    return defs

