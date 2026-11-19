# InvestEdge

AI-powered stock intelligence for Indian retail investors — built for NSE/BSE, runs on Groq LLaMA 3.3 70B.

[![CI](https://github.com/AB-1817/InvestEdge/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/AB-1817/InvestEdge/actions/workflows/backend-ci.yml)
[![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen)](backend/tests/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://python.org)

---

Started as a hackathon project (ET AI Hackathon 2026). Now upgraded into something you can actually deploy and trust in production — with real RAG, multi-agent reasoning, LLM cost tracking, an eval harness, and no API keys leaking into the browser.

**Live demo:** [invest-edge-eight.vercel.app](https://invest-edge-eight.vercel.app)  
**Backend:** Deployed on Render

---

## What it does

Type a question like *"Is HDFC Bank a buy right now?"* and InvestEdge will:

1. Pull live price, technicals, and fundamentals from NSE/BSE via yfinance
2. Search a Chroma vector store of recent news and filings for relevant context
3. Run that through 6 specialized sub-agents (market data, technicals, fundamentals, news, portfolio, risk) each doing a ReAct loop — reason, call a tool, observe, repeat
4. Have a critic agent review the draft answer and flag anything that isn't backed by evidence
5. Return the answer with citations, a trace ID, and the full agent execution trace

The old version just stuffed headlines into a prompt. This actually retrieves, reasons, and cites.

---

## Stack

| Layer | What |
|---|---|
| Frontend | React 18 + Vite, deployed on Vercel |
| Backend | FastAPI (Python 3.10+), deployed on Render |
| LLM | Groq LLaMA 3.3 70B (primary), Google Gemini (optional) |
| Embeddings | Google Gemini `text-embedding-004` or deterministic fallback for offline |
| Vector DB | Chroma (local persistent) |
| Observability | SQLite metrics layer + optional Langfuse tracing |
| Market data | yfinance |

---

## Getting started

You need a [Groq API key](https://console.groq.com). Free tier works fine.

### Backend

```bash
cd backend
cp .env.example .env
# open .env and set GROQ_API_KEY

pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Check it's alive:
```
http://localhost:8000/healthz
http://localhost:8000/docs      ← interactive API explorer
```

### Frontend

```bash
cd frontend
cp .env.example .env
# set VITE_API_URL=http://localhost:8000

npm install
npm run dev
```

Open `http://localhost:5173`.

### Docker

```bash
docker-compose up --build
```

Chroma data persists to `./backend/data/chroma_db` via a volume.

---

## Populating the vector store

The RAG system starts empty. After the backend is running, seed it:

```bash
curl -X POST http://localhost:8000/api/v2/rag/ingest \
  -H "X-Admin-Token: your_token_from_env" \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]}'
```

This pulls news, fundamentals, and filings for each symbol and stores them as searchable chunks with metadata. Run it again any time to refresh.

---

## Environment variables

### Backend (`backend/.env`)

```
# Required
GROQ_API_KEY=                    # your Groq key

# Optional — better retrieval and agent quality
GOOGLE_API_KEY=                  # enables Gemini embeddings + Gemini as agent LLM
GROQ_API_KEY_2=                  # second key for load rotation under rate limits

# Agent settings
AGENT_MODEL_PROVIDER=groq        # groq | gemini | mock
AGENT_ENABLE_REFLECTION=true     # critic step — adds ~1 extra LLM call, worth it

# RAG settings
EMBEDDING_PROVIDER=gemini        # gemini | sentence_transformers | fake
USE_VECTOR_RAG=false             # set true to route news agent through Chroma
RAG_ADMIN_TOKEN=                 # protects the /ingest endpoint

# Observability (all optional — app works fine without them)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

# CORS — comma-separated list of trusted origins
CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173
```

### Frontend (`frontend/.env`)

```
VITE_API_URL=http://localhost:8000
```

No LLM keys go in the frontend. All LLM calls go through the backend. If you see `VITE_GROQ_KEY` anywhere, it was a security bug — it's been removed.

---

## Running tests

```bash
python -m pytest backend/tests backend/backtesting/tests -v
```

65 tests, all passing. Some tests hit real yfinance endpoints so they need network access.

---

## Evaluation harness

There's a 32-case golden dataset covering: factual questions that need tool output, retrieval questions that should cite sources, questions that should include a risk disclaimer, and adversarial prompts embedded in fake "news" trying to hijack the agent.

```bash
# Offline mode — deterministic, no API keys needed, runs in CI
python -m backend.evals.run --mock

# Live mode — real LLM + embeddings, produces meaningful scores
python -m backend.evals.run --live
```

CI runs mock mode on every push and fails the build if the metrics regress. Live scores are not published here because I haven't run a full live eval yet — see `VERIFIED_CLAIMS.md` for what's actually been measured.

---

## API

The original endpoints are all still there, untouched. New stuff is under `/api/v2/`.

**New endpoints:**

```
POST /api/v2/agent/query      multi-agent hierarchical query
POST /api/v2/rag/query        vector RAG with citations
POST /api/v2/rag/ingest       populate the vector store (admin token required)
GET  /api/v2/metrics/llm      24h LLM usage summary (latency, tokens, cost)
GET  /api/v2/metrics/llm/recent  last N LLM calls with trace IDs
GET  /healthz                 liveness
GET  /readyz                  readiness
```

**Example — multi-agent query:**

```bash
curl -X POST http://localhost:8000/api/v2/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Is TCS a good buy right now?", "symbol": "TCS"}'
```

Returns the answer, which sub-agents ran, what tools they called, citations, and a trace ID you can look up in Langfuse if you have it set up.

Full docs at `http://localhost:8000/docs`.

---

## Deployment

### Render (simplest)

1. Connect this repo to Render
2. Build command: `pip install -r requirements.txt`
3. Start command: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add your env vars under Environment

### Google Cloud Run

Scripts are in `deploy/cloudrun/`. Secrets go into GCP Secret Manager so they're never baked into the Docker image.

```bash
cd deploy/cloudrun
bash deploy.sh YOUR_GCP_PROJECT_ID us-central1
```

### Vercel (frontend)

Point Vercel at the `frontend/` directory. Set `VITE_API_URL` to your backend URL. That's it.

---

## Project layout

```
backend/
  main.py               FastAPI app
  agents_v2/            multi-agent system (root agent + 6 sub-agents + critic)
  rag/                  vector RAG (embeddings, Chroma store, retriever, ingest)
  observability/        LLM metrics, Langfuse tracing, session state
  evals/                evaluation harness (golden dataset + runner)
  opportunity_radar/    opportunity scanning agent
  backtesting/          strategy backtesting engine
  tests/                65 pytest tests

frontend/
  src/components/
    ChatUI.jsx           market brain chat interface
    NewsRAG.jsx          news intelligence with citations
    LLMMetricsPanel.jsx  live LLM telemetry panel

deploy/cloudrun/        GCP Cloud Run deploy scripts
docs/                   architecture diagrams, audit, handoff doc
```

---

## CI

Every push runs: lint (ruff) → type check (mypy) → tests → Docker build → eval gate. The eval gate runs the mock harness and fails if any metric drops below the configured threshold.

---

Built by **Team Maharudra** for ET AI Hackathon 2026.
