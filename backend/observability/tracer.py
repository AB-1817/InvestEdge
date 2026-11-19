"""
Observability & Tracing Layer for InvestEdge (Langfuse & No-Op Fallback).

When LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set, wraps Langfuse Python SDK.
Otherwise, defaults to a zero-overhead NullTracer that generates standards-compliant
trace IDs and provides identical span/generation context manager interfaces.
"""
import os
import uuid
import logging
from typing import Optional, Dict, Any, List
from contextlib import contextmanager

logger = logging.getLogger("investedge.observability.tracer")


class NullSpan:
    """Zero-overhead fallback span context."""
    def __init__(self, span_id: str, name: str, trace_id: str, parent_id: Optional[str] = None):
        self.span_id = span_id
        self.name = name
        self.trace_id = trace_id
        self.parent_id = parent_id
        self.status = "success"
        self.output = None

    def end(self, output: Any = None, status: str = "success", level: Optional[str] = None):
        self.output = output
        self.status = status

    def event(self, name: str, metadata: Optional[Dict[str, Any]] = None):
        pass

    def generation(self, name: str, model: str = "", input: Any = None, output: Any = None, usage: Optional[Dict[str, Any]] = None):
        return self


class NullTrace:
    """Zero-overhead fallback trace context."""
    def __init__(self, trace_id: str, name: str, session_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        self.id = trace_id
        self.name = name
        self.session_id = session_id
        self.metadata = metadata or {}

    def span(self, name: str, metadata: Optional[Dict[str, Any]] = None, input: Any = None) -> NullSpan:
        span_id = f"span_{uuid.uuid4().hex[:12]}"
        return NullSpan(span_id=span_id, name=name, trace_id=self.id)

    def generation(self, name: str, model: str = "", input: Any = None, output: Any = None, usage: Optional[Dict[str, Any]] = None) -> NullSpan:
        span_id = f"gen_{uuid.uuid4().hex[:12]}"
        return NullSpan(span_id=span_id, name=name, trace_id=self.id)

    def update(self, output: Any = None, metadata: Optional[Dict[str, Any]] = None):
        if metadata:
            self.metadata.update(metadata)


class ObservabilityTracer:
    """
    Unified Tracing Engine. Automatically binds to Langfuse if configured,
    or runs in autonomous local mode.
    """
    def __init__(self):
        self.public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
        self.secret_key = os.getenv("LANGFUSE_SECRET_KEY")
        self.host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
        self.is_enabled = bool(self.public_key and self.secret_key)
        self.client = None

        if self.is_enabled:
            try:
                from langfuse import Langfuse
                self.client = Langfuse(
                    public_key=self.public_key,
                    secret_key=self.secret_key,
                    host=self.host
                )
                logger.info(f"Langfuse tracing initialized successfully with host: {self.host}")
            except Exception as e:
                logger.warning(f"Failed to initialize Langfuse SDK ({e}); falling back to autonomous NullTracer.")
                self.is_enabled = False
                self.client = None
        else:
            logger.debug("Langfuse keys absent; running in lightweight NullTracer mode.")

    def create_trace(
        self,
        name: str,
        trace_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ):
        """Creates and returns a new trace context."""
        tid = trace_id or f"trace_{uuid.uuid4().hex[:16]}"
        if self.is_enabled and self.client:
            try:
                return self.client.trace(
                    id=tid,
                    name=name,
                    session_id=session_id,
                    user_id=user_id,
                    metadata=metadata,
                    tags=tags,
                )
            except Exception as e:
                logger.warning(f"Error creating Langfuse trace: {e}")

        return NullTrace(trace_id=tid, name=name, session_id=session_id, metadata=metadata)

    def flush(self):
        """Flushes buffered spans to backend if Langfuse is active."""
        if self.is_enabled and self.client:
            try:
                self.client.flush()
            except Exception as e:
                logger.debug(f"Langfuse flush error: {e}")


# Global singleton tracer
_TRACER_INSTANCE: Optional[ObservabilityTracer] = None


def get_tracer() -> ObservabilityTracer:
    """Returns singleton tracer instance."""
    global _TRACER_INSTANCE
    if _TRACER_INSTANCE is None:
        _TRACER_INSTANCE = ObservabilityTracer()
    return _TRACER_INSTANCE
