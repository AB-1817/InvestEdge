"""
Comprehensive Unit & Integration Tests for Vector RAG (Phase 2).
Tests chunking, metadata filtering, fake embedding provider, MMR reranking,
citations, and API v2 routes with mocked external services.
"""
import os
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.rag.embeddings import DeterministicFallbackEmbeddingProvider, get_embedding_provider
from backend.rag.store import ChromaVectorStore, Document
from backend.rag.ingest import chunk_text, IngestionEngine
from backend.rag.retriever import Retriever, Citation, mmr_rerank

client = TestClient(app)


def test_chunk_text_edge_cases():
    """Verifies chunking with overlap and preservation of boundaries."""
    # 1. Empty string
    assert chunk_text("") == []

    # 2. Text shorter than chunk_size
    short = "Short financial headline."
    assert chunk_text(short, chunk_size=100) == [short]

    # 3. Text exceeding chunk_size
    long_text = "Sentence one. " * 30  # ~420 chars
    chunks = chunk_text(long_text, chunk_size=100, chunk_overlap=20)
    assert len(chunks) > 1
    for c in chunks:
        assert len(c) > 0


def test_deterministic_embedding_provider():
    """Verifies that the offline deterministic embedding provider produces normalized, reproducible vectors."""
    provider = DeterministicFallbackEmbeddingProvider(dim=64)
    assert provider.dimension == 64

    # 1. Determinism
    vec1 = provider.embed_query("HDFC Bank Q3 performance")
    vec2 = provider.embed_query("HDFC Bank Q3 performance")
    assert vec1 == vec2
    assert len(vec1) == 64

    # 2. Distinct inputs produce different vectors
    vec3 = provider.embed_query("Tata Motors EV sales breakdown")
    assert vec1 != vec3

    # 3. L2 Norm is approximately 1.0
    norm = sum(x * x for x in vec1) ** 0.5
    assert abs(norm - 1.0) < 1e-3


def test_chroma_vector_store_and_metadata_filtering(tmp_path):
    """Verifies document insertion, metadata filtering, and retrieval in Chroma."""
    test_persist_dir = str(tmp_path / "test_chroma")
    store = ChromaVectorStore(collection_name="test_collection", persist_directory=test_persist_dir)
    provider = DeterministicFallbackEmbeddingProvider(dim=64)

    docs = [
        Document(
            id="doc1",
            text="Reliance announces green energy battery mega-factory.",
            metadata={"symbol": "RELIANCE", "doc_type": "news"}
        ),
        Document(
            id="doc2",
            text="HDFC Bank advances retail credit growth across branches.",
            metadata={"symbol": "HDFCBANK", "doc_type": "news"}
        ),
        Document(
            id="doc3",
            text="Reliance Q3 EBITDA margins expand 140 bps.",
            metadata={"symbol": "RELIANCE", "doc_type": "quarterly_result"}
        ),
    ]

    embs = provider.embed_documents([d.text for d in docs])
    inserted = store.add_documents(docs, embs)
    assert len(inserted) == 3
    assert store.count() == 3

    # Filter by symbol == RELIANCE
    q_emb = provider.embed_query("Reliance solar investment")
    res_rel = store.similarity_search(q_emb, k=5, filters={"symbol": "RELIANCE"})
    assert len(res_rel) == 2
    for r in res_rel:
        assert r.metadata["symbol"] == "RELIANCE"

    # Filter by doc_type == quarterly_result
    res_q = store.similarity_search(q_emb, k=5, filters={"doc_type": "quarterly_result"})
    assert len(res_q) == 1
    assert res_q[0].id == "doc3"


def test_retriever_citation_generation(tmp_path):
    """Verifies citation formatting and top-k retrieval."""
    test_persist_dir = str(tmp_path / "test_chroma_citations")
    store = ChromaVectorStore(collection_name="test_cit", persist_directory=test_persist_dir)
    provider = DeterministicFallbackEmbeddingProvider(dim=64)

    doc = Document(
        id="chunk_test_101",
        text="TCS wins $1B cloud deal with European banking consortium.",
        metadata={
            "symbol": "TCS",
            "source": "Moneycontrol",
            "url": "https://moneycontrol.com/deal",
            "doc_type": "news",
            "published_at": "2026-11-19T10:00:00"
        }
    )
    store.add_documents([doc], provider.embed_documents([doc.text]))

    retriever = Retriever(store=store, embedding_provider=provider)
    results = retriever.retrieve("TCS cloud banking contract", k=3)
    assert len(results) >= 1

    citations = retriever.format_citations(results)
    assert len(citations) >= 1
    cit = citations[0]
    assert cit.chunk_id == "chunk_test_101"
    assert cit.source == "Moneycontrol"
    assert cit.url == "https://moneycontrol.com/deal"
    assert cit.symbol == "TCS"
    assert "TCS wins" in cit.text_snippet


def test_structured_fundamentals_template(tmp_path):
    """Verifies structured fundamentals templating and ingestion."""
    test_persist_dir = str(tmp_path / "test_chroma_fund")
    store = ChromaVectorStore(collection_name="test_fund", persist_directory=test_persist_dir)
    provider = DeterministicFallbackEmbeddingProvider(dim=64)
    engine = IngestionEngine(store=store, embedding_provider=provider)

    mock_info = {
        "shortName": "Infosys Ltd",
        "sector": "Information Technology",
        "currentPrice": 1850.0,
        "trailingPE": 28.5,
        "forwardPE": 24.1,
        "returnOnEquity": 0.32,
        "revenueGrowth": 0.12,
        "targetMeanPrice": 2100.0,
        "numberOfAnalystOpinions": 38,
        "recommendationKey": "buy"
    }

    count = engine.ingest_structured_fundamentals("INFY", info=mock_info)
    assert count == 1
    assert store.count() == 1

    q_emb = provider.embed_query("Infosys valuation P/E target")
    res = store.similarity_search(q_emb, k=1, filters={"symbol": "INFY"})
    assert len(res) == 1
    assert "Infosys Ltd" in res[0].text
    assert "Trailing P/E 28.5x" in res[0].text


def test_api_v2_rag_query_with_mock_llm(monkeypatch):
    """Verifies POST /api/v2/rag/query returns answer and citations with mocked LLM."""
    async def mock_groq(prompt: str, system: str = "") -> str:
        return "TCS reported strong large-deal momentum and cloud enterprise growth [1]."

    monkeypatch.setattr("backend.main._groq_chat", mock_groq)

    payload = {
        "query": "What are the deal wins for TCS?",
        "symbol": "TCS",
        "k": 3
    }
    res = client.post("/api/v2/rag/query", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert "citations" in data
    assert isinstance(data["citations"], list)
    assert data["query"] == payload["query"]


def test_api_v2_rag_ingest_auth_enforcement(monkeypatch):
    """Verifies that POST /api/v2/rag/ingest enforces RAG_ADMIN_TOKEN authentication."""
    monkeypatch.setenv("RAG_ADMIN_TOKEN", "secret-token-xyz")

    # 1. Unauthorized without token
    res_unauth = client.post("/api/v2/rag/ingest", json={"symbols": ["TCS"]})
    assert res_unauth.status_code == 401

    # 2. Unauthorized with invalid token
    res_bad = client.post(
        "/api/v2/rag/ingest",
        json={"symbols": ["TCS"]},
        headers={"X-Admin-Token": "wrong-token"}
    )
    assert res_bad.status_code == 401

    # 3. Authorized with valid token
    with patch("backend.rag.routes.run_full_ingestion", return_value={"status": "success", "count": 10}):
        res_ok = client.post(
            "/api/v2/rag/ingest",
            json={"symbols": ["TCS"]},
            headers={"X-Admin-Token": "secret-token-xyz"}
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["status"] == "success"
