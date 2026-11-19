# Verified Claims

This file lists only things that are factually true and were verified by actually running code in this repo.
Nothing here is invented. If something wasn't run, it says so.

---

## What was built

### Phase 0 — Audit
- Read the full codebase and wrote `docs/AUDIT.md`
- Counted endpoints: 26 legacy `/api/*` routes at time of audit
- Identified `VITE_GROQ_KEY` exposed in `.github/workflows/deploy.yml` (since fixed)

### Phase 1 — Containerization and CI
- Added `backend/Dockerfile` (Python 3.11 slim, non-root user, healthcheck)
- Added `docker-compose.yml` for local full-stack dev with Chroma volume
- Added `GET /healthz` and `GET /readyz` endpoints
- Added `deploy/cloudrun/deploy.sh` and `deploy/cloudrun/README.md`
- Added `.github/workflows/backend-ci.yml` (ruff lint, mypy, pytest, docker build, eval gate)

### Phase 2 — Vector RAG
- `backend/rag/embeddings.py` — Gemini `text-embedding-004` when `GOOGLE_API_KEY` is set; deterministic hash-based fallback otherwise
- `backend/rag/store.py` — Chroma persistent client with collection interface
- `backend/rag/ingest.py` — structured (fundamentals as text templates) + unstructured (news, filings) ingestion with chunk overlap and metadata
- `backend/rag/retriever.py` — top-k similarity + MMR rerank, returns citations with source/url/timestamp/chunk_id
- `POST /api/v2/rag/query` and `POST /api/v2/rag/ingest` (admin token required)
- `USE_VECTOR_RAG=true` env flag routes the news agent through Chroma instead of raw headlines

### Phase 3 — Multi-Agent Orchestration
- `backend/agents_v2/root_agent.py` — hierarchical root agent delegating to 6 sub-agents
- `backend/agents_v2/subagents.py` — market_data, technical, fundamentals, news_rag, portfolio, risk agents, each with a ReAct tool loop (configurable max steps)
- `backend/agents_v2/tools.py` — tool wrappers around existing backend functions; no logic duplication
- `backend/agents_v2/reflection.py` — critic step verifies draft against retrieved evidence; revises once if unsupported claims found
- `backend/agents_v2/providers.py` — LLM abstraction supporting Groq (direct httpx) and Gemini (google-genai SDK)
- `POST /api/v2/agent/query` — returns answer, agent trace, citations, trace_id
- Legacy `/api/orchestrate` left untouched

### Phase 4 — LLM Observability
- `backend/observability/metrics.py` — SQLite `llm_metrics` table; records every LLM call with input tokens, output tokens, latency ms, estimated cost, model, trace_id
- `backend/observability/pricing.py` — price table for Groq LLaMA 3.3 70B and Gemini models; `calculate_llm_cost()` function
- `backend/observability/tracer.py` — `ObservabilityTracer` with Langfuse nested spans when `LANGFUSE_*` env vars set; `NullTracer` no-op otherwise; no crash when Langfuse is unavailable
- `backend/observability/session.py` — `ConversationSession` with bounded token budget and history truncation
- `GET /api/v2/metrics/llm` and `GET /api/v2/metrics/llm/recent`

### Phase 5 — Evaluation Harness
- `backend/evals/golden.jsonl` — 32 cases: 8 tool-grounded, 8 retrieval/citation, 8 disclaimer compliance, 8 adversarial injection
- `backend/evals/metrics.py` — Hit@k, MRR, citation validity, disclaimer check, injection refusal; LLM-as-judge optional and off by default
- `backend/evals/run.py` — CLI runner; `--mock` for deterministic offline mode, `--live` for real LLM
- Eval gate added to `backend-ci.yml`

### Phase 6 — Security Hardening
- Removed `VITE_GROQ_KEY` from `deploy.yml` and `frontend/.env.example`
- Added retry with exponential backoff (3 attempts) on all LLM provider calls
- Wrapped retrieved text in `[RETRIEVED CONTEXT — UNTRUSTED DATA]` delimiters in the reflection engine
- Added 1 MB body size limit and Pydantic field-level `max_length` on all v2 route request bodies
- Verified: `Select-String -Path "dist\assets\*.js" -Pattern "gsk_"` → zero matches

### Phase 7 — Frontend
- `LLMMetricsPanel.jsx` — compact bar in ChatUI header + full panel in NewsRAG sidebar; polls `/api/v2/metrics/llm`
- `NewsRAG.jsx` — synthesis block shows citation chips with source links and `trace_id` label
- `ChatUI.jsx` — `trace_id` captured from every chat response and shown under assistant messages

### Phase 8 — Documentation
- `README.md` — complete rewrite
- `docs/ARCHITECTURE.md` — 8 Mermaid diagrams (system overview, agent flow, RAG flow, ingestion, observability, deployment, security, module deps)
- `docs/CUSTOMER_HANDOFF.md` — design decisions, known risks, runbook, next steps
- `VERIFIED_CLAIMS.md` — this file

---

## Numbers that were actually measured

**Tests:** `python -m pytest backend/tests backend/backtesting/tests`
→ **65 passed**, 17 warnings (non-critical deprecations), 0 failures
→ Verified multiple times on Python 3.10.10, Windows

**Eval harness (mock mode):** `python -m backend.evals.run --mock`
→ 32 cases evaluated
→ CI Quality Gate: **PASSED**
→ All metrics above threshold (Hit@4: 100%, MRR: 1.0, Citation Validity: 100%, Disclaimer: 100%, Injection Defense: 100%, p95 Latency: 4.5ms)
→ **These are mock-mode scores.** Mock uses deterministic fake embeddings and a stub LLM. They verify the harness logic works, not real retrieval quality.

**Security scan:** `Select-String -Path "frontend/dist/assets/*.js" -Pattern "gsk_"` → zero matches
→ No Groq API key in the production frontend bundle

**Frontend build:** `npx vite build` → 46 modules, 365 KB bundle, built in 1.14s, exit 0

---

## What was NOT verified

| Claim | Why not verified |
|---|---|
| Live eval scores (Hit@k, MRR with real LLM) | No live eval run was executed — requires GROQ_API_KEY + GOOGLE_API_KEY and time |
| Google Cloud Run deployment | Scripts written and reviewed but not actually deployed to GCP |
| Langfuse tracing end-to-end | No Langfuse keys were available during development |
| Gemini embeddings quality | Gemini embedding calls not tested — no GOOGLE_API_KEY in test environment |
| sentence-transformers fallback | Not tested — the hash-based fake was used in all offline runs |
| Multi-instance rate limiting | Rate limiter is in-memory; multi-instance behavior not tested |
| Chroma persistence across container restarts | Volume mount tested locally; not tested in Cloud Run |
