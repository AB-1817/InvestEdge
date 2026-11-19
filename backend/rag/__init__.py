"""
InvestEdge RAG (Retrieval-Augmented Generation) package.
Provides modular vector embeddings, Chroma vector store, unstructured/structured ingestion,
and semantic retriever with citations.
"""
from .embeddings import get_embedding_provider, BaseEmbeddingProvider
from .store import ChromaVectorStore, Document, SearchResult
from .retriever import Retriever, Citation
from .ingest import run_full_ingestion, chunk_text

__all__ = [
    "get_embedding_provider",
    "BaseEmbeddingProvider",
    "ChromaVectorStore",
    "Document",
    "SearchResult",
    "Retriever",
    "Citation",
    "run_full_ingestion",
    "chunk_text",
]
