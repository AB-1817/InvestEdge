"""
Vector Store Interface & Chroma Implementation for InvestEdge RAG.

Abstracts storage, indexing, and similarity search so pgvector or Vertex Vector Search
can be swapped in seamlessly.
"""
import os
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("investedge.rag.store")


class Document(BaseModel):
    """Represents a chunked document to be embedded and indexed."""
    id: str = Field(..., description="Unique document chunk identifier")
    text: str = Field(..., description="Raw text snippet")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata dictionary")


class SearchResult(BaseModel):
    """Result returned from similarity search."""
    id: str
    text: str
    metadata: Dict[str, Any]
    score: float = Field(..., description="Similarity score or distance (higher is better)")


class BaseVectorStore(ABC):
    """Abstract interface for vector database implementations."""

    @abstractmethod
    def add_documents(self, documents: List[Document], embeddings: List[List[float]]) -> List[str]:
        """Index a batch of documents with their corresponding precomputed embeddings."""
        pass

    @abstractmethod
    def similarity_search(
        self,
        query_embedding: List[float],
        k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        """Perform similarity search with optional metadata filters."""
        pass

    @abstractmethod
    def count(self) -> int:
        """Returns the total number of documents indexed."""
        pass

    @abstractmethod
    def clear(self) -> None:
        """Clears the collection."""
        pass


class ChromaVectorStore(BaseVectorStore):
    """
    Chroma vector store implementation using persistent local client or Chroma server.
    """

    def __init__(
        self,
        collection_name: str = "investedge_knowledge",
        persist_directory: Optional[str] = None
    ):
        self.collection_name = collection_name
        base_dir = os.path.dirname(os.path.dirname(__file__))
        default_dir = os.path.join(base_dir, "data", "chroma_db")
        self.persist_directory = persist_directory or os.getenv("CHROMA_PERSIST_DIR", default_dir)

        os.makedirs(self.persist_directory, exist_ok=True)
        self._client = None
        self._collection = None
        self._init_collection()

    def _init_collection(self):
        try:
            import chromadb
            from chromadb.config import Settings

            # Support remote Chroma service if CHROMA_HOST is set
            chroma_host = os.getenv("CHROMA_HOST")
            if chroma_host:
                port = int(os.getenv("CHROMA_PORT", "8000"))
                self._client = chromadb.HttpClient(host=chroma_host, port=port)
                logger.info(f"Connected to remote Chroma at {chroma_host}:{port}")
            else:
                self._client = chromadb.PersistentClient(
                    path=self.persist_directory,
                    settings=Settings(anonymized_telemetry=False)
                )

            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            logger.info(f"Initialized Chroma collection '{self.collection_name}' at {self.persist_directory}")
        except Exception as e:
            logger.error(f"Failed to initialize Chroma collection: {e}")
            self._client = None
            self._collection = None

    def add_documents(self, documents: List[Document], embeddings: List[List[float]]) -> List[str]:
        if not documents:
            return []
        if self._collection is None:
            self._init_collection()
            if self._collection is None:
                logger.error("Chroma collection is unavailable; cannot add documents.")
                return []

        ids = [doc.id for doc in documents]
        texts = [doc.text for doc in documents]
        # Clean metadata values to primitive types for Chroma compatibility
        metadatas = []
        for doc in documents:
            clean_meta = {}
            for k, v in doc.metadata.items():
                if v is None:
                    clean_meta[k] = ""
                elif isinstance(v, (str, int, float, bool)):
                    clean_meta[k] = v
                else:
                    clean_meta[k] = str(v)
            metadatas.append(clean_meta)

        try:
            self._collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=texts,
                metadatas=metadatas
            )
            return ids
        except Exception as e:
            logger.error(f"Error upserting documents into Chroma: {e}")
            return []

    def similarity_search(
        self,
        query_embedding: List[float],
        k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        if self._collection is None:
            self._init_collection()
            if self._collection is None:
                return []

        where_filter = None
        if filters:
            # Build Chroma filter
            clean_filters = {k: v for k, v in filters.items() if v is not None}
            if len(clean_filters) == 1:
                key, val = next(iter(clean_filters.items()))
                where_filter = {key: {"$eq": val}}
            elif len(clean_filters) > 1:
                where_filter = {"$and": [{k: {"$eq": v}} for k, v in clean_filters.items()]}

        try:
            res = self._collection.query(
                query_embeddings=[query_embedding],
                n_results=k,
                where=where_filter,
                include=["documents", "metadatas", "distances"]
            )

            results: List[SearchResult] = []
            if not res or not res["ids"] or not res["ids"][0]:
                return results

            ids = res["ids"][0]
            docs = res["documents"][0] if res.get("documents") else [""] * len(ids)
            metas = res["metadatas"][0] if res.get("metadatas") else [{}] * len(ids)
            distances = res["distances"][0] if res.get("distances") else [0.0] * len(ids)

            for doc_id, text, meta, dist in zip(ids, docs, metas, distances):
                # Cosine distance to similarity: similarity = 1 - distance
                similarity = round(max(0.0, 1.0 - dist), 4)
                results.append(SearchResult(
                    id=doc_id,
                    text=text,
                    metadata=meta,
                    score=similarity
                ))

            # Sort descending by score
            results.sort(key=lambda x: x.score, reverse=True)
            return results
        except Exception as e:
            logger.error(f"Error during Chroma similarity search: {e}")
            return []

    def count(self) -> int:
        if self._collection is None:
            self._init_collection()
            if self._collection is None:
                return 0
        try:
            return self._collection.count()
        except Exception:
            return 0

    def clear(self) -> None:
        if self._client and self.collection_name:
            try:
                self._client.delete_collection(self.collection_name)
                self._init_collection()
            except Exception as e:
                logger.warning(f"Error clearing collection: {e}")
