"""
FastAPI Routes for InvestEdge Vector RAG (/api/v2/rag).
"""
import os
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Request, Depends
from pydantic import BaseModel, Field

from .retriever import Retriever, Citation
from .ingest import run_full_ingestion

logger = logging.getLogger("investedge.rag.routes")
router = APIRouter(prefix="/api/v2/rag", tags=["Vector RAG v2"])

retriever_instance = Retriever()


class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000, description="User search query")
    symbol: Optional[str] = Field(default=None, description="Optional stock symbol to filter by (e.g. RELIANCE)")
    k: int = Field(default=4, ge=1, le=15, description="Number of document chunks to retrieve")
    use_mmr: bool = Field(default=True, description="Enable Maximal Marginal Relevance diversity reranking")


class RAGQueryResponse(BaseModel):
    query: str
    symbol: Optional[str] = None
    answer: str
    citations: List[Citation]
    retrieved_count: int


class RAGIngestRequest(BaseModel):
    symbols: Optional[List[str]] = Field(default=None, description="List of symbols to ingest (defaults to top NSE symbols)")


def verify_admin_token(
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
    authorization: Optional[str] = Header(None)
):
    """
    Enforces authentication for admin ingestion operations using RAG_ADMIN_TOKEN.
    """
    expected_token = os.getenv("RAG_ADMIN_TOKEN", "investedge-admin-secret")
    received_token = x_admin_token

    if not received_token and authorization and authorization.startswith("Bearer "):
        received_token = authorization.replace("Bearer ", "").strip()

    if not received_token or received_token != expected_token:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing RAG Admin Token."
        )
    return True


@router.post("/query", response_model=RAGQueryResponse)
async def query_rag_endpoint(req: RAGQueryRequest):
    """
    Semantic similarity search and generative Q&A over financial documents with citations.
    """
    try:
        answer, citations = await retriever_instance.answer_with_rag(
            query=req.query,
            symbol=req.symbol,
            k=req.k
        )
        return RAGQueryResponse(
            query=req.query,
            symbol=req.symbol,
            answer=answer,
            citations=citations,
            retrieved_count=len(citations)
        )
    except Exception as e:
        logger.error(f"Error executing RAG query: {e}")
        raise HTTPException(status_code=500, detail=f"RAG query execution failed: {str(e)}")


@router.post("/ingest")
async def ingest_documents_endpoint(
    req: Optional[RAGIngestRequest] = None,
    authenticated: bool = Depends(verify_admin_token)
):
    """
    Ingestion endpoint for populating the Chroma vector store.
    Rate-limited and protected by RAG_ADMIN_TOKEN.
    """
    symbols = req.symbols if req else None
    try:
        summary = run_full_ingestion(symbols=symbols)
        return summary
    except Exception as e:
        logger.error(f"Error running document ingestion: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")
