"""
Embedding Provider Interface & Implementations for InvestEdge RAG.

Supported providers:
1. GeminiEmbeddings (via google-genai text-embedding-004 when GOOGLE_API_KEY is present)
2. SentenceTransformerEmbeddings (via all-MiniLM-L6-v2 when sentence-transformers is installed)
3. DeterministicFallbackEmbeddings (offline hash projection with unit-length normalization, for CI/testing)
"""
import os
import math
import hashlib
import logging
from abc import ABC, abstractmethod
from typing import List, Optional

logger = logging.getLogger("investedge.rag.embeddings")


class BaseEmbeddingProvider(ABC):
    """Abstract interface for document and query embeddings."""

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the embedding vector dimensionality."""
        pass

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embeds a batch of texts into vectors."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Embeds a single query string into a vector."""
        pass


class DeterministicFallbackEmbeddingProvider(BaseEmbeddingProvider):
    """
    Deterministic offline embedding provider using character n-gram hashing and L2 normalization.
    Guarantees deterministic vector representations for offline testing and fallback without external APIs.
    """

    def __init__(self, dim: int = 384):
        self._dim = dim

    @property
    def dimension(self) -> int:
        return self._dim

    def _embed_single(self, text: str) -> List[float]:
        if not text:
            return [0.0] * self._dim

        vec = [0.0] * self._dim
        words = text.lower().split()
        for i, word in enumerate(words):
            # Generate deterministic index and magnitude using MD5
            digest = hashlib.md5(f"{word}_{i % 7}".encode("utf-8")).hexdigest()
            idx = int(digest[:6], 16) % self._dim
            val = ((int(digest[6:10], 16) / 0xFFFF) * 2.0) - 1.0
            vec[idx] += val

        # Add n-gram hash features
        for k in range(len(text) - 3):
            sub = text[k:k+4].lower()
            digest = hashlib.sha256(sub.encode("utf-8")).hexdigest()
            idx = int(digest[:6], 16) % self._dim
            vec[idx] += 0.5

        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 1e-9:
            return [round(v / norm, 6) for v in vec]
        return [0.0] * self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_single(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_single(text)


class GeminiEmbeddingProvider(BaseEmbeddingProvider):
    """
    Gemini Embeddings using Google GenAI SDK (text-embedding-004).
    Activated when GOOGLE_API_KEY is configured.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "text-embedding-004"):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        self.model = model
        self._dim = 768
        self._client = None

        if self.api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
                logger.info(f"Initialized GeminiEmbeddingProvider with model={self.model}")
            except Exception as e:
                logger.warning(f"Could not initialize google-genai client: {e}")

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not self._client or not texts:
            # Graceful fallback if client failed initialization
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_documents(texts)

        try:
            results = []
            # Batch in chunks of 50 to respect API quotas
            for i in range(0, len(texts), 50):
                batch = texts[i:i + 50]
                resp = self._client.models.embed_content(
                    model=self.model,
                    contents=batch,
                )
                if hasattr(resp, "embeddings"):
                    for emb in resp.embeddings:
                        results.append(list(emb.values))
                elif hasattr(resp, "embedding"):
                    results.append(list(resp.embedding.values))
            return results
        except Exception as e:
            logger.error(f"Gemini embed_documents failed: {e}. Falling back to deterministic embeddings.")
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        if not self._client or not text:
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_query(text)

        try:
            resp = self._client.models.embed_content(
                model=self.model,
                contents=[text],
            )
            if hasattr(resp, "embeddings") and resp.embeddings:
                return list(resp.embeddings[0].values)
            elif hasattr(resp, "embedding"):
                return list(resp.embedding.values)
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_query(text)
        except Exception as e:
            logger.error(f"Gemini embed_query failed: {e}. Falling back to deterministic embedding.")
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_query(text)


class SentenceTransformerEmbeddingProvider(BaseEmbeddingProvider):
    """
    Local sentence-transformers embedding provider using all-MiniLM-L6-v2.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._dim = 384
        self._model = None
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(model_name)
            logger.info(f"Initialized SentenceTransformer ({model_name})")
        except Exception as e:
            logger.warning(f"Could not load sentence-transformers: {e}")

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not self._model or not texts:
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_documents(texts)
        embs = self._model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
        return embs.tolist()

    def embed_query(self, text: str) -> List[float]:
        if not self._model or not text:
            return DeterministicFallbackEmbeddingProvider(self._dim).embed_query(text)
        emb = self._model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
        return emb.tolist()


def get_embedding_provider(provider_name: Optional[str] = None) -> BaseEmbeddingProvider:
    """
    Factory creating configured embedding provider based on environment:
    - EMBEDDING_PROVIDER=fake -> DeterministicFallbackEmbeddingProvider
    - EMBEDDING_PROVIDER=gemini (or GOOGLE_API_KEY is set) -> GeminiEmbeddingProvider
    - EMBEDDING_PROVIDER=sentence_transformers -> SentenceTransformerEmbeddingProvider
    - Default fallback -> DeterministicFallbackEmbeddingProvider if no keys present
    """
    choice = (provider_name or os.getenv("EMBEDDING_PROVIDER", "")).lower().strip()

    if choice == "fake" or choice == "deterministic":
        return DeterministicFallbackEmbeddingProvider(dim=384)

    if choice == "gemini" or (not choice and os.getenv("GOOGLE_API_KEY")):
        return GeminiEmbeddingProvider()

    if choice == "sentence_transformers":
        try:
            import sentence_transformers  # noqa: F401
            return SentenceTransformerEmbeddingProvider()
        except ImportError:
            logger.warning("sentence-transformers not installed, falling back to deterministic provider")
            return DeterministicFallbackEmbeddingProvider(dim=384)

    # If sentence-transformers is installed, use it
    try:
        import sentence_transformers  # noqa: F401
        return SentenceTransformerEmbeddingProvider()
    except ImportError:
        pass

    # Default to deterministic offline provider
    return DeterministicFallbackEmbeddingProvider(dim=384)
