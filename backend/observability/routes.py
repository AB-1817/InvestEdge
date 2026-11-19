"""
Observability API Routes (Phase 4).
Exposes /api/v2/metrics/llm summary and recent invocation history.
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from observability.metrics import get_metrics_summary, get_recent_calls

router = APIRouter(prefix="/api/v2/metrics/llm", tags=["Observability & Metrics"])


class TokenMetrics(BaseModel):
    prompt: int
    completion: int
    total: int


class CostMetrics(BaseModel):
    total_cost_usd: float
    avg_cost_per_request_usd: float


class LatencyMetrics(BaseModel):
    p50: float
    p95: float
    mean: float


class MetricsSummaryResponse(BaseModel):
    period_hours: int
    total_calls: int
    successful_calls: int
    failed_calls: int
    error_rate_pct: float
    tokens: TokenMetrics
    costs: CostMetrics
    latency_ms: LatencyMetrics
    mean_tokens_per_sec: float
    models: Dict[str, Any]


@router.get("", response_model=MetricsSummaryResponse)
async def get_llm_metrics_summary(hours: int = Query(24, ge=1, le=168, description="Time window in hours")):
    """
    Returns aggregated LLM telemetry summary:
    - p50 / p95 / mean latency
    - total prompt, completion, and total tokens
    - total cost and avg cost per request
    - overall error rate (%)
    - per-model usage breakdown
    """
    try:
        data = get_metrics_summary(hours=hours)
        return data
    except Exception as e:
        raise HTTPException(500, f"Failed to retrieve LLM metrics summary: {str(e)}")


@router.get("/recent")
async def get_recent_llm_calls(limit: int = Query(50, ge=1, le=200, description="Max recent calls to return")):
    """
    Returns the most recent N LLM invocation records with granular trace_id,
    token counts, latency, tokens/sec, and estimated cost.
    """
    try:
        records = get_recent_calls(limit=limit)
        return {"count": len(records), "records": records}
    except Exception as e:
        raise HTTPException(500, f"Failed to retrieve recent LLM calls: {str(e)}")

