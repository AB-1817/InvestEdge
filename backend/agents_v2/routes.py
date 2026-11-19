"""
FastAPI Routes for Multi-Agent System v2 (/api/v2/agent).
"""
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .root_agent import ADKRootAgent, AgentQueryResult

logger = logging.getLogger("investedge.agents.routes")
router = APIRouter(prefix="/api/v2/agent", tags=["Multi-Agent System v2"])

root_agent_instance = ADKRootAgent()


class AgentQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1500, description="User financial inquiry")
    symbol: Optional[str] = Field(default=None, max_length=25, description="Optional stock symbol (e.g. RELIANCE, TCS)")
    holdings: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=100, description="Optional portfolio holdings list")
    max_steps: Optional[int] = Field(default=4, ge=1, le=10, description="Maximum ReAct steps per sub-agent")
    enable_reflection: Optional[bool] = Field(default=None, description="Toggle critic reflection step")


@router.post("/query", response_model=AgentQueryResult)
async def query_multi_agent(req: AgentQueryRequest):
    """
    Hierarchical multi-agent query endpoint.
    Delegates user query across specialized subagents with ReAct tool loops,
    gathers multi-perspective financial evidence, audits draft with critic reflection,
    and returns a cited answer with full execution trace.
    """
    try:
        agent = ADKRootAgent(
            max_steps=req.max_steps or 4,
            enable_reflection=req.enable_reflection
        )
        result = await agent.execute(
            query=req.query,
            symbol=req.symbol,
            holdings=req.holdings,
            max_steps=req.max_steps
        )
        return result
    except Exception as e:
        logger.error(f"Error in multi-agent orchestration endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Multi-agent execution error: {str(e)}")

