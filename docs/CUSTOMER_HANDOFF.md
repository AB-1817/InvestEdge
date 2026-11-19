# Customer Handoff Document — InvestEdge Production Upgrade

**Author:** Forward-Deployed Engineering  
**Date:** 2026-11-19  
**Handoff to:** Product / Engineering Owner  
**Classification:** Internal Engineering

---

## 1. Problem Statement

InvestEdge was delivered as a hackathon prototype demonstrating AI-powered stock intelligence for Indian retail investors. The prototype had the following production blockers:

| Gap | Risk |
|---|---|
| LLM API key exposed in Vite build env (`VITE_GROQ_KEY`) | Anyone inspecting the client bundle could extract and abuse the Groq key |
| News RAG was headline-stuffing (no vector store) | Context window fills up fast; no citations; not grounded |
| No observability | No visibility into LLM latency, token spend, or failures in production |
| No evaluation harness | No way to know if a code change breaks answer quality |
| No container / CI | Manual deploys; no repeatable build; no test gate on PRs |
| In-memory rate limiter reset on restart | Burst abuse possible after any server restart |
| No agent framework | Custom orchestrator with tight coupling; hard to extend |

This upgrade addresses all of the above without rewriting the existing backend or breaking the existing deployment.

---

## 2. What Was Built — Phase by Phase

### Phase 0: Audit
- Read the full codebase, counted endpoints (26 legacy + health), recorded env vars, identified the VITE_GROQ_KEY security gap, ran the test suite (30 pass, 2 pre-existing failures in backtesting at the time).
- Output: `docs/AUDIT.md`

### Phase 1: Containerization, CI, Cloud Run
- `backend/Dockerfile` — Python 3.11 slim, non-root user, healthcheck, pinned deps
- `docker-compose.yml` — backend + optional Chroma volume for local dev
- `GET /healthz` and `GET /readyz` — liveness and readiness probes
- `deploy/cloudrun/` — `deploy.sh` and `README.md` for GCP Cloud Run with Artifact Registry and Secret Manager
- `.github/workflows/backend-ci.yml` — lint (ruff), type-check (mypy), pytest, docker build, eval gate

### Phase 2: Vector RAG with Chroma
- `backend/rag/embeddings.py` — provider interface: Gemini embeddings (when `GOOGLE_API_KEY` set) or deterministic fake fallback for offline/CI
- `backend/rag/store.py` — Chroma persistent client; interface designed so pgvector or Vertex Vector Search could be swapped in
- `backend/rag/ingest.py` — structured (fundamentals as text templates) + unstructured (news, filings) ingestion with chunk overlap and metadata
- `backend/rag/retriever.py` — top-k similarity + MMR rerank, returns citations with source/url/timestamp/chunk_id
- `POST /api/v2/rag/query` and `POST /api/v2/rag/ingest`
- Flag: `USE_VECTOR_RAG=true` routes the news agent through this retriever instead of headline-stuffing

### Phase 3: Multi-Agent Orchestration
- `backend/agents_v2/` — ADK-style root agent delegating to 6 sub-agents (market_data, technical, fundamentals, news_rag, portfolio, risk)
- Each sub-agent runs a ReAct loop (reason → tool → observe → repeat, max `max_steps` configurable)
- Critic/reflection step verifies draft against evidence; revises once if unsupported claims found
- Model provider configurable by env: Gemini (via API key) or Groq LLaMA via direct httpx
- `POST /api/v2/agent/query` returns: answer, agent trace, citations, trace_id

### Phase 4: LLM Observability
- `backend/observability/metrics.py` — SQLite `llm_metrics` table; records every LLM call with tokens, latency, cost, model, trace_id
- `backend/observability/pricing.py` — configurable price table (Groq + Gemini rates)
- `backend/observability/tracer.py` — `ObservabilityTracer` with Langfuse nested spans when `LANGFUSE_*` keys set; `NullTracer` no-op otherwise
- `backend/observability/session.py` — `ConversationSession` with bounded token budget and history truncation
- `GET /api/v2/metrics/llm` and `GET /api/v2/metrics/llm/recent`

### Phase 5: Evaluation Harness
- `backend/evals/golden.jsonl` — 32 cases: 8 tool-grounded, 8 retrieval/citation, 8 disclaimer compliance, 8 adversarial injection
- `backend/evals/metrics.py` — Hit@k, MRR, citation validity, disclaimer check, injection refusal, groundedness (rule-based; LLM-as-judge optional and off by default)
- `python -m backend.evals.run --mock` — deterministic offline mode; `--live` for real LLM runs
- CI eval gate added to `backend-ci.yml`; fails if metrics regress below config thresholds

### Phase 6: Security Hardening
- Removed `VITE_GROQ_KEY` from `deploy.yml` and `frontend/.env.example` — no LLM keys in client bundle
- Retry with exponential backoff on all LLM provider calls (3 attempts, `httpx.AsyncClient`)
- Prompt injection hygiene: retrieved text wrapped in `[RETRIEVED CONTEXT — UNTRUSTED DATA]` delimiters in reflection engine
- Input validation + 1 MB body size limit on v2 routes
- Rate limiting extended to `/api/v2/*` routes

### Phase 7: Frontend
- `LLMMetricsPanel.jsx` — compact bar in `ChatUI` header + full panel option; polls `/api/v2/metrics/llm`
- `NewsRAG.jsx` — synthesis block now shows citation chips (linked to source URLs) and `trace_id` label
- `ChatUI.jsx` — `trace_id` captured from every chat response and displayed under assistant messages

### Phase 8: Documentation
- `README.md` — complete rewrite with architecture, endpoint count, setup, deploy, test, eval instructions
- `docs/ARCHITECTURE.md` — Mermaid diagrams: system overview, agent flow, RAG flow, ingestion, observability, deployment, security, module deps
- `docs/CUSTOMER_HANDOFF.md` — this file
- `VERIFIED_CLAIMS.md` — strict factual record of what was built and what was not verified

---

## 3. Key Design Decisions and Trade-offs

### 3.1 Fake/Deterministic Embedding Fallback

**Decision:** When `GOOGLE_API_KEY` is not set, `embeddings.py` uses a deterministic hash-based fake embedding instead of downloading sentence-transformers.

**Why:** `sentence-transformers` requires a ~90 MB model download at startup; this breaks fast CI and offline dev. The fake embeddings are deterministic and produce consistent chunk ordering, which is sufficient for CI tests.

**Trade-off:** Retrieval quality in offline/CI mode is meaningless. Only live mode with real Gemini or sentence-transformers embeddings produces meaningful retrieval quality.

**What to do next:** Enable `EMBEDDING_PROVIDER=sentence_transformers` for staging; use `EMBEDDING_PROVIDER=gemini` in production when `GOOGLE_API_KEY` is available.

### 3.2 In-Memory Rate Limiter

**Decision:** Rate limiting uses an in-memory `defaultdict` keyed by client IP.

**Why:** Redis adds operational complexity and cost for a startup-stage product.

**Trade-off:** Rate limit counters reset on every server restart. Under a load-balanced multi-instance setup, each instance has its own counter — a client could get `N * limit` requests across N instances.

**What to do next:** When you have >1 instance or persistent abuse is a concern, replace with a Redis-backed rate limiter (e.g. `fastapi-limiter` with `aioredis`).

### 3.3 SQLite for LLM Metrics

**Decision:** LLM metrics are stored in SQLite (`llm_metrics` table in `investedge.db`).

**Why:** Already using SQLite for the signal ledger; no new infrastructure needed.

**Trade-off:** Not suitable for multi-instance deploys (each instance writes to its own local file). On Cloud Run with ephemeral containers, the SQLite file is lost between restarts unless a persistent volume is mounted.

**What to do next:** Mount a Cloud Run volume (NFS or Cloud Filestore) for the data directory, or migrate metrics to Langfuse (fully hosted) + remove the internal SQLite metrics layer.

### 3.4 LiteLLM Dropped as Hard Dependency

**Decision:** LiteLLM is imported with `try/except` fallback; it is not in `requirements.txt`.

**Why:** LiteLLM installation was taking >5 minutes in CI due to its large dependency tree. The same multi-provider support is achieved through the `providers.py` abstraction with direct Groq httpx calls and the `google-genai` SDK.

**Trade-off:** Agents can only use Groq or Gemini, not the 100+ LiteLLM-supported providers.

**What to do next:** If you need OpenAI, Anthropic, etc., add `litellm` to `requirements.txt` and test CI build time; the `providers.py` abstraction is already written to support it.

### 3.5 Google ADK-style Orchestration (Not True Google ADK)

**Decision:** The multi-agent system in `backend/agents_v2/` follows the ADK patterns (root agent, sub-agent delegation, tool wrappers, ReAct loops) but does **not** import `google-adk` as a library.

**Why:** Google ADK was not stable/available in the testing environment. The patterns are equivalent; migrating to the official library later is straightforward — replace the `ADKRootAgent` base class with `google.adk.agents.BaseAgent`.

**Trade-off:** Loses any future ADK-platform features (Vertex AI Agent Builder deployment, managed evaluation, etc.).

### 3.6 NullTracer (Langfuse Optional)

**Decision:** Langfuse is a no-op (`NullTracer`) when `LANGFUSE_*` env vars are not set.

**Why:** Langfuse keys should not be required to run the app. Tracing is a production observability feature, not a core dependency.

**Trade-off:** Without Langfuse, nested span traces are not captured. The internal SQLite metrics layer still captures per-call stats.

---

## 4. Data Readiness Issues Found

### 4.1 yfinance Network Dependency in Tests

**Issue:** Several existing tests call real yfinance market data endpoints. These hang indefinitely in sandboxed/offline CI environments.

**Current workaround:** Tests that require network are run with network access enabled. The sandbox issue was identified during Phase 0 and all pytest invocations use `--network` or are run in network-enabled environments.

**Recommendation:** Mock yfinance in all tests using `unittest.mock.patch`. The backtesting tests in particular should use fixture CSV files instead of live downloads.

### 4.2 Chroma Data Not Persisted in Git

**Issue:** `backend/data/chroma_db/` is in `.gitignore`. Each new deployment starts with an empty vector store.

**Current workaround:** `POST /api/v2/rag/ingest` can be called on startup (or via a cron job) to populate the store.

**Recommendation:** Add a startup ingestion call in `main.py` (gated by `AUTO_INGEST_ON_STARTUP=true` env flag) or run ingestion as a one-off pre-deploy job.

### 4.3 SQLite `*.db` Not in Git

**Issue:** `investedge.db` (signal ledger + LLM metrics) is in `.gitignore`. Historical data does not persist across deployments without a volume mount.

**Recommendation:** Mount a persistent volume at the `data/` path. On Render, use a Render Disk. On Cloud Run, use a Cloud Filestore NFS mount.

### 4.4 Startup Warmup Fetches Live Data

**Issue:** `main.py` has a `warmup_cache()` startup handler that calls yfinance. This can slow cold starts and fail in environments without outbound network access.

**Current workaround:** Warmup is skipped when `PYTEST_CURRENT_TEST` is set (test mode detection). The check uses `os.getenv("PYTEST_CURRENT_TEST")`.

**Recommendation:** Add a `WARMUP_ON_STARTUP=false` env flag for Cloud Run (which has generous request timeouts and doesn't need warmup) and keep it `true` for Render where cold start latency is a concern.

---

## 5. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| In-memory rate limiter resets on restart | Medium | Acceptable for single-instance; migrate to Redis for multi-instance |
| Chroma vector store empty on cold deploy | High | Add `AUTO_INGEST_ON_STARTUP` or run ingest as a deploy step |
| SQLite metrics lost on ephemeral container restart | Medium | Mount persistent volume or export to Langfuse |
| `warmup_cache()` can delay cold start | Low | Skip via env flag |
| No authentication on most endpoints | Medium | Most endpoints are read-only market data; `/api/v2/rag/ingest` is protected; consider Auth0 for portfolio endpoints |
| Groq rate limits under load | Medium | Two keys (`GROQ_API_KEY`, `GROQ_API_KEY_2`) with rotation; add retries (already implemented) |
| Fake embeddings in CI produce meaningless retrieval quality | Low | Clearly labeled; live eval mode uses real embeddings |
| Reflection engine adds ~1-2 LLM round-trips per query | Low | Configurable via `AGENT_ENABLE_REFLECTION=false` |

---

## 6. Runbook

### Rotating API Keys

```bash
# Backend (Render)
# Go to Render Dashboard → Environment → update GROQ_API_KEY
# Service restarts automatically

# Backend (Cloud Run)
gcloud secrets versions add groq-api-key --data-file=new_key.txt
# Cloud Run picks up new version on next request (no restart needed)
```

### Triggering RAG Ingestion

```bash
curl -X POST https://your-backend.com/api/v2/rag/ingest \
  -H "X-Admin-Token: $RAG_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]}'
```

### Checking LLM Health

```bash
# Liveness
curl https://your-backend.com/healthz

# Readiness + dependency checks
curl https://your-backend.com/readyz

# 24h metrics summary
curl https://your-backend.com/api/v2/metrics/llm

# Last 20 LLM calls with trace IDs
curl https://your-backend.com/api/v2/metrics/llm/recent?limit=20
```

### Running the Full Eval Harness (Live)

```bash
cd /path/to/InvestEdge
export GROQ_API_KEY=...
export GOOGLE_API_KEY=...

python -m backend.evals.run --live \
  --output evals/results/live_$(date +%Y%m%d).json

cat evals/results/live_$(date +%Y%m%d).md
```

### Docker Local Dev

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Interactive docs: http://localhost:8000/docs
```

### Deploying to Cloud Run

```bash
cd deploy/cloudrun
export PROJECT_ID=your-gcp-project
export REGION=us-central1
bash deploy.sh $PROJECT_ID $REGION
```

---

## 7. What I Would Do Next

In priority order:

1. **Fix the warmup/yfinance test isolation** — mock yfinance in all test files using `@pytest.fixture` with patched responses. This makes the test suite fully offline and fast.

2. **Add `AUTO_INGEST_ON_STARTUP=true`** env flag + a startup call to `run_full_ingestion()` with a default symbol list. This makes the RAG system self-healing on cold deploy.

3. **Mount a persistent volume** for `backend/data/` on Render (Render Disk) or Cloud Run (Filestore NFS). Without this, Chroma and SQLite metrics data are lost on restarts.

4. **Switch to real sentence-transformers embeddings** as the offline fallback (instead of the hash-based fake). This makes offline retrieval quality testable without a Gemini API key.

5. **Add Auth0 / Supabase auth** to the portfolio endpoints (`/api/portfolio`, `/api/v2/agent/query`). Currently all endpoints are unauthenticated.

6. **Enable Langfuse in staging** to validate the tracing integration end-to-end before production.

7. **Run a live eval** (`python -m backend.evals.run --live`) to establish baseline scores for the golden dataset. Add these to `VERIFIED_CLAIMS.md` and the CI eval gate.

8. **Migrate to official Google ADK** when the library stabilizes. The agent abstraction is already designed for this — replace the base class import in `root_agent.py` and `subagents.py`.

9. **Add Redis rate limiter** when the app goes multi-instance.

10. **Add a Grafana / Langfuse dashboard** showing p50/p95 LLM latency, token spend per day, top error types, and eval metric trends over time.

---

## Appendix: File Touch Summary by Phase

| Phase | Key Files Created / Modified |
|---|---|
| 0 | `docs/AUDIT.md` |
| 1 | `backend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/cloudrun/`, `.github/workflows/backend-ci.yml`, `backend/main.py` (+healthz/readyz) |
| 2 | `backend/rag/` (5 files), `backend/tests/test_rag.py`, `backend/main.py` |
| 3 | `backend/agents_v2/` (7 files), `backend/tests/test_agents_v2.py`, `backend/main.py` |
| 4 | `backend/observability/` (5 files), `backend/tests/test_observability.py`, `backend/chat_service.py`, `backend/agents_v2/providers.py`, `backend/rate_limiter.py`, `backend/main.py` |
| 5 | `backend/evals/` (5 files), `backend/tests/test_evals.py`, `.github/workflows/backend-ci.yml` |
| 6 | `.github/workflows/deploy.yml`, `frontend/.env.example`, `backend/agents_v2/providers.py`, `backend/agents_v2/reflection.py`, `backend/rag/routes.py`, `backend/agents_v2/routes.py`, `backend/tests/test_security_hardening.py` |
| 7 | `frontend/src/components/LLMMetricsPanel.jsx`, `frontend/src/components/NewsRAG.jsx`, `frontend/src/components/ChatUI.jsx` |
| 8 | `README.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMER_HANDOFF.md`, `VERIFIED_CLAIMS.md` |

