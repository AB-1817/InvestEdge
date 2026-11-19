"""
Internal LLM Metrics Layer for InvestEdge.

Always-on persistence of LLM telemetry (tokens, latency, tokens/sec, provider, model,
and estimated cost) into the SQLite database. Provides p50/p95 latency aggregation,
cost per request calculation, error rate monitoring, and recent trace retrieval.
"""
import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import numpy as np

from storage import get_db_connection
from observability.pricing import calculate_llm_cost

logger = logging.getLogger("investedge.observability.metrics")


def init_metrics_db():
    """Initializes llm_metrics SQLite table and indexes."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS llm_metrics (
                call_id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                session_id TEXT,
                endpoint TEXT,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                latency_ms REAL NOT NULL DEFAULT 0.0,
                tokens_per_sec REAL NOT NULL DEFAULT 0.0,
                estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
                status TEXT NOT NULL DEFAULT 'success',
                error_message TEXT,
                created_at TEXT NOT NULL
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_llm_metrics_trace ON llm_metrics (trace_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_llm_metrics_created_at ON llm_metrics (created_at);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_llm_metrics_provider ON llm_metrics (provider);")
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to initialize llm_metrics table: {e}")


# Initialize schema on module load
init_metrics_db()


def record_llm_call(
    trace_id: str,
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: float,
    status: str = "success",
    error_message: Optional[str] = None,
    endpoint: Optional[str] = None,
    session_id: Optional[str] = None,
    call_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Persists a single LLM invocation metric record into the database.
    Calculates tokens/sec and estimated USD cost accurately.
    """
    cid = call_id or f"llm_{uuid.uuid4().hex[:12]}"
    prompt_toks = max(0, int(prompt_tokens))
    comp_toks = max(0, int(completion_tokens))
    total_toks = prompt_toks + comp_toks
    lat_ms = max(0.0, float(latency_ms))

    # Calculate generation throughput (tokens/sec) based on completion tokens
    if lat_ms > 0 and comp_toks > 0:
        tokens_per_sec = round(comp_toks / (lat_ms / 1000.0), 2)
    else:
        tokens_per_sec = 0.0

    cost_usd = calculate_llm_cost(model, prompt_toks, comp_toks)
    created_at = datetime.utcnow().isoformat()

    record = {
        "call_id": cid,
        "trace_id": trace_id,
        "session_id": session_id,
        "endpoint": endpoint or "/api/chat",
        "provider": provider.lower(),
        "model": model,
        "prompt_tokens": prompt_toks,
        "completion_tokens": comp_toks,
        "total_tokens": total_toks,
        "latency_ms": lat_ms,
        "tokens_per_sec": tokens_per_sec,
        "estimated_cost_usd": cost_usd,
        "status": status,
        "error_message": error_message,
        "created_at": created_at,
    }

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO llm_metrics (
                call_id, trace_id, session_id, endpoint, provider, model,
                prompt_tokens, completion_tokens, total_tokens, latency_ms,
                tokens_per_sec, estimated_cost_usd, status, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record["call_id"], record["trace_id"], record["session_id"],
                record["endpoint"], record["provider"], record["model"],
                record["prompt_tokens"], record["completion_tokens"],
                record["total_tokens"], record["latency_ms"],
                record["tokens_per_sec"], record["estimated_cost_usd"],
                record["status"], record["error_message"], record["created_at"]
            ))
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to record LLM call telemetry to database: {e}")

    return record


def get_metrics_summary(hours: int = 24) -> Dict[str, Any]:
    """
    Computes aggregated LLM health & economics metrics:
    - p50 / p95 / mean latency
    - total prompt, completion, and total tokens
    - total estimated cost and avg cost per request
    - overall error rate (%)
    - provider & model breakdowns
    """
    since_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT call_id, provider, model, prompt_tokens, completion_tokens,
               total_tokens, latency_ms, tokens_per_sec, estimated_cost_usd, status
        FROM llm_metrics
        WHERE created_at >= ?
        """, (since_time,))
        rows = cursor.fetchall()

    if not rows:
        return {
            "period_hours": hours,
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "error_rate_pct": 0.0,
            "tokens": {"prompt": 0, "completion": 0, "total": 0},
            "costs": {"total_cost_usd": 0.0, "avg_cost_per_request_usd": 0.0},
            "latency_ms": {"p50": 0.0, "p95": 0.0, "mean": 0.0},
            "mean_tokens_per_sec": 0.0,
            "models": {}
        }

    total_calls = len(rows)
    successful_calls = sum(1 for r in rows if r["status"] == "success")
    failed_calls = total_calls - successful_calls
    error_rate = round((failed_calls / total_calls) * 100.0, 2)

    prompt_toks = sum(r["prompt_tokens"] for r in rows)
    comp_toks = sum(r["completion_tokens"] for r in rows)
    total_toks = sum(r["total_tokens"] for r in rows)
    total_cost = round(sum(r["estimated_cost_usd"] for r in rows), 6)
    avg_cost = round(total_cost / total_calls, 6) if total_calls > 0 else 0.0

    latencies = [float(r["latency_ms"]) for r in rows]
    p50_latency = round(float(np.percentile(latencies, 50)), 2)
    p95_latency = round(float(np.percentile(latencies, 95)), 2)
    mean_latency = round(float(np.mean(latencies)), 2)

    valid_tps = [float(r["tokens_per_sec"]) for r in rows if r["tokens_per_sec"] > 0]
    mean_tps = round(float(np.mean(valid_tps)), 2) if valid_tps else 0.0

    # Model breakdowns
    models: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        m = r["model"]
        if m not in models:
            models[m] = {
                "calls": 0,
                "total_tokens": 0,
                "cost_usd": 0.0,
                "provider": r["provider"]
            }
        models[m]["calls"] += 1
        models[m]["total_tokens"] += r["total_tokens"]
        models[m]["cost_usd"] = round(models[m]["cost_usd"] + r["estimated_cost_usd"], 6)

    return {
        "period_hours": hours,
        "total_calls": total_calls,
        "successful_calls": successful_calls,
        "failed_calls": failed_calls,
        "error_rate_pct": error_rate,
        "tokens": {
            "prompt": prompt_toks,
            "completion": comp_toks,
            "total": total_toks,
        },
        "costs": {
            "total_cost_usd": total_cost,
            "avg_cost_per_request_usd": avg_cost,
        },
        "latency_ms": {
            "p50": p50_latency,
            "p95": p95_latency,
            "mean": mean_latency,
        },
        "mean_tokens_per_sec": mean_tps,
        "models": models,
    }


def get_recent_calls(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves the most recent N LLM invocation records."""
    clamped_limit = min(max(1, limit), 200)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT call_id, trace_id, session_id, endpoint, provider, model,
               prompt_tokens, completion_tokens, total_tokens, latency_ms,
               tokens_per_sec, estimated_cost_usd, status, error_message, created_at
        FROM llm_metrics
        ORDER BY created_at DESC
        LIMIT ?
        """, (clamped_limit,))
        rows = cursor.fetchall()

    return [dict(r) for r in rows]
