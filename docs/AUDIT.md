# InvestEdge — Phase 0 Architecture & Security Audit

> **Audit date:** 2026-11-19  
> **Auditor:** Automated code review (all numbers verified by running the actual code)  
> **Repo:** https://github.com/AB-1817/InvestEdge  
> **Branch audited:** `main` (HEAD `690b313`)

---

## 1. Repository Layout

```
InvestEdge/
├── backend/                      # FastAPI application
│   ├── main.py                   # App entry point; inline route handlers (1 147 lines)
│   ├── orchestrator.py           # Multi-agent orchestration logic
│   ├── chat_service.py           # /api/chat proxy to Groq Cloud
│   ├── video_engine.py           # 6 video-insight endpoints
│   ├── earnings_event_study.py   # Historical earnings event study helper
│   ├── ledger_service.py         # Signal ledger service layer
│   ├── models_ledger.py          # Pydantic models for signals & outcomes
│   ├── storage.py                # SQLite persistence (SignalLedgerRepository)
│   ├── outcome_evaluator.py      # PENDING → RESOLVED outcome evaluation
│   ├── rate_limiter.py           # Sliding-window rate limiter middleware
│   ├── routes_track_record.py    # /api/track-record/* endpoints
│   ├── requirements.txt          # 9 pinned dependencies (loose, no version pins)
│   ├── runtime.txt               # Render Python version spec
│   ├── .env.example
│   ├── opportunity_radar/        # Opportunity Radar sub-package (7 modules + router)
│   │   ├── router.py             # GET /api/radar
│   │   ├── bulk_deals.py
│   │   ├── filings.py
│   │   ├── quarterly_results.py
│   │   ├── insider_trades.py
│   │   ├── commentary.py
│   │   ├── regulation.py
│   │   ├── screener_signals.py
│   │   └── scoring.py
│   ├── backtesting/              # Backtesting sub-package
│   │   ├── engine.py
│   │   ├── strategies.py
│   │   ├── metrics.py
│   │   ├── models.py
│   │   ├── data.py
│   │   └── routes.py
│   └── tests/                    # Integration tests (FastAPI TestClient)
│       ├── test_chat_service.py
│       ├── test_cors.py
│       ├── test_rate_limiter.py
│       └── test_track_record.py
├── frontend/                     # React 18 + Vite SPA
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/           # 11 feature components
│   │   └── ...
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── .github/workflows/
│   └── deploy.yml                # Frontend build + GitHub Pages deploy
├── conftest.py                   # [ADDED in audit] Root pytest path fix
├── README.md
└── runtime.txt
```

---

## 2. Current Architecture

### 2.1 Backend (FastAPI)

| Layer | Description |
|-------|-------------|
| **Framework** | FastAPI 0.111 + Uvicorn |
| **Language** | Python 3.10 |
| **Market Data** | yfinance (synchronous calls wrapped in `asyncio.to_thread`) |
| **LLM Provider** | Groq Cloud API (`api.groq.com/openai/v1`) via httpx; two API keys with round-robin fallback |
| **Model list** | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.6-27b`, `groq/compound-mini` (tried in order) |
| **Storage** | SQLite via stdlib `sqlite3` — schema in `storage.py` (`signals`, `signal_outcomes` tables) |
| **Cache** | In-process Python dict (`_CACHE`) with TTL; no Redis |
| **Auth** | None (public API, keys server-side only) |
| **Deployment** | Render (backend), Vercel (frontend) |

### 2.2 Custom Multi-Agent Orchestrator (NOT Google ADK)

The orchestrator is hand-rolled in `orchestrator.py`. It runs 4 "agents" as concurrent `asyncio.gather` tasks:

| Agent | Implementation |
|-------|---------------|
| **Chart Pattern Agent** | Pure-Python technical indicators (EMA, RSI, MACD, BBands, ATR) on yfinance OHLCV |
| **Fundamental Agent** | yfinance `Ticker.info` (P/E, ROE, rev growth, analyst targets) |
| **News RAG Agent** | `yfinance.Ticker.news` headlines → keyword sentiment scoring (no embeddings, no vector store) |
| **Market Regime Agent** | Nifty 50 EMA/RSI classification → Groq LLM narrative |

Consensus scoring is deterministic Python; Groq is used only for narrative synthesis.

### 2.3 Frontend (React 18 + Vite)

| Component | Endpoint(s) consumed |
|-----------|---------------------|
| `Dashboard.jsx` | `/api/market/indices`, `/api/news/stream`, `/api/news/signals` |
| `StocksAnalysis.jsx` | `/api/orchestrate/explain/{symbol}` |
| `NewsRAG.jsx` | `/api/news`, `/api/news/stream`, `/api/news/signals`, `/api/news/synthesize` |
| `Portfolio.jsx` | `/api/portfolio`, `/api/portfolio/doctor` |
| `MarketRegime.jsx` | `/api/market/regime` |
| `ChartIntelligence.jsx` | `/api/patterns` |
| `OpportunityRadarNew.jsx` | `/api/radar` |
| `EarningsPredictor.jsx` | `/api/earnings/predict/{symbol}` |
| `BacktestEngine.jsx` | `/api/backtest/*` |
| `VideoEngine.jsx` | `/api/video/*` |
| `ChatUI.jsx` | `/api/chat` |
| `SignalTrackRecord.jsx` | `/api/track-record/*` |

---

## 3. Complete API Endpoint Inventory

### 3.1 `backend/main.py` (inline routes)

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | POST | `/api/patterns` | Chart pattern detection (RSI, MACD, EMA, BB, ATR) |
| 2 | POST | `/api/opportunity` | Fundamental analysis (valuation, ROE, analyst targets) |
| 3 | POST | `/api/portfolio` | Portfolio multi-holding P&L + signals |
| 4 | POST | `/api/portfolio/doctor` | Multi-agent portfolio health (delegates to orchestrator.py) |
| 5 | GET | `/api/orchestrate/explain/{symbol}` | Single-stock 4-agent orchestration |
| 6 | GET | `/api/market/regime` | Nifty 50 market regime classifier |
| 7 | GET | `/api/earnings/predict/{symbol}` | AI earnings surprise predictor |
| 8 | GET | `/api/market/indices` | Live Nifty/Sensex/BankNifty prices |
| 9 | GET | `/api/news` | News feed (yfinance headlines) |
| 10 | GET | `/api/news/stream` | AI market intelligence stream |
| 11 | GET | `/api/news/signals` | Trending signals (cached) |
| 12 | POST | `/api/news/synthesize` | AI news synthesis (Groq) |

### 3.2 `backend/chat_service.py`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 13 | POST | `/api/chat` | Server-side Groq LLM proxy (Market Brain ChatUI) |

### 3.3 `backend/opportunity_radar/router.py`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 14 | GET | `/api/radar` | Opportunity Radar (bulk deals, filings, insider trades, results, etc.) |

### 3.4 `backend/video_engine.py`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 15 | GET | `/api/video/market-wrap` | Daily market wrap script + data |
| 16 | GET | `/api/video/race-chart` | YTD performance race chart |
| 17 | GET | `/api/video/sector-rotation` | Sector rotation analysis |
| 18 | GET | `/api/video/fii-dii` | FII/DII flow tracker |
| 19 | GET | `/api/video/ipo-tracker` | IPO tracker |
| 20 | POST | `/api/video/script` | On-demand video script generator |

### 3.5 `backend/backtesting/routes.py`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 21 | GET | `/api/backtest/strategies` | List available backtest strategies |
| 22 | POST | `/api/backtest/run` | Run a backtest simulation |
| 23 | GET | `/api/backtest/signal-evidence/{symbol}` | Historical signal evidence |

### 3.6 `backend/routes_track_record.py`

| # | Method | Path | Description |
|---|--------|------|-------------|
| 24 | GET | `/api/track-record/summary` | Signal track record summary |
| 25 | GET | `/api/track-record/signals` | Signal history list |
| 26 | POST | `/api/track-record/evaluate` | Trigger outcome evaluation |

**Total confirmed API endpoints: 26**

> ⚠️ **Missing routes (pre-existing test failures):**
> - `GET /health` — referenced by `test_health_route_unlimited` → returns 404
> - `GET /api/earnings/event-study/{symbol}` — referenced by `test_earnings_event_study_labeling` → returns 404

---

## 4. Environment Variables

### 4.1 Backend (`backend/.env.example`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | YES | Primary Groq Cloud API key |
| `GROQ_API_KEY_2` | NO | Secondary Groq key (fallback rotation) |
| `CORS_ORIGINS` | NO | Comma-separated trusted origins (defaults include Vercel URL) |
| `INVESTEDGE_DB_PATH` | NO | SQLite database path (default: `backend/investedge.db`) |

### 4.2 Frontend (`frontend/.env.example`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_GROQ_KEY` | YES ⚠️ | **Groq API key bundled into client JS** |
| `VITE_API_URL` | YES | Backend base URL |

---

## 5. Security Gaps

### 5.1 🚨 CRITICAL: LLM API Key Exposed in Client Bundle

**File:** `.github/workflows/deploy.yml` line 33  
**Finding:** `VITE_GROQ_KEY: ${{ secrets.VITE_GROQ_KEY }}` is passed at build time and baked into the Vite bundle as `import.meta.env.VITE_GROQ_KEY`. Any VITE_ prefixed variable is embedded in the compiled JavaScript shipped to the browser.

**Impact:** Anyone who loads the frontend can extract the Groq API key from the bundle and make unlimited LLM calls at the user's cost/quota.

**Analysis of frontend usage:** Reviewing all 11 component files, `VITE_GROQ_KEY` is imported via `import.meta.env.VITE_GROQ_KEY`. The `/api/chat` backend proxy (`chat_service.py`) correctly uses the **server-side** `GROQ_API_KEY`, but other components (ChatUI, possibly others) may still reference the client-side key.

**Required fix (Phase 6):** Remove `VITE_GROQ_KEY` from the frontend entirely; route all LLM calls through the existing `/api/chat` backend proxy.

### 5.2 No `GET /health` or `GET /readyz` endpoints

The rate limiter explicitly whitelists `/health` from rate limiting (`if path in ["/", "/health", "/docs", ...]`) but `main.py` never defines a `GET /health` route, causing 404. This breaks Render health checks and the existing test.

### 5.3 No Input Size Limits on New Endpoints (Partial)

`/api/chat` enforces 30-message and 4000-char limits. Other heavy endpoints (`/api/radar`, `/api/backtest/run`, `/api/portfolio/doctor`) have no request-body size guards.

### 5.4 No Request Timeout on yfinance Calls

yfinance downloads are synchronous, run via `asyncio.to_thread`, and have no timeout. A slow yfinance response blocks a thread indefinitely.

### 5.5 Prompt Injection via News Headlines

The News RAG agent (in `orchestrator.py`) injects raw news headlines directly into LLM prompts (`news_summary = "\\n".join(...)`). Retrieved text is treated as trusted data, violating the prompt-injection hygiene rule.

### 5.6 No Authentication on Admin-Adjacent Routes

`POST /api/track-record/evaluate` triggers market data fetches and DB writes with no authentication. The test suite verifies `POST /api/track-record/record` returns 404/405, but the evaluate endpoint is public.

### 5.7 SQLite Not Suitable for Multi-Instance Production

SQLite has write serialization limits; Render horizontal scaling would corrupt the DB. Must be noted in the handoff.

---

## 6. Test Status (VERIFIED — run 2026-11-19)

**Command:**  
```
python -m pytest e:\InvestEdge -v --tb=short
```

**Result: 30 passed, 2 failed (pre-existing, not introduced by audit)**

### Passing (30 tests)

| Test File | Tests | Status |
|-----------|-------|--------|
| `backtesting/tests/test_engine.py` | 4 | ✅ All pass |
| `backtesting/tests/test_metrics.py` | 4 | ✅ All pass |
| `backtesting/tests/test_routes.py` | 3 | ✅ All pass |
| `backtesting/tests/test_strategies.py` | 4 | ✅ All pass |
| `tests/test_chat_service.py` | 3 | ✅ All pass |
| `tests/test_cors.py` | 5 | ✅ All pass |
| `tests/test_rate_limiter.py` | 2/3 | ⚠️ 1 fails |
| `tests/test_track_record.py` | 5/6 | ⚠️ 1 fails |

### Pre-existing Failures (2 tests)

| Test | Failure Reason | Pre-existing? |
|------|---------------|---------------|
| `test_health_route_unlimited` | `GET /health` returns 404 — route not defined in `main.py` | YES |
| `test_earnings_event_study_labeling` | `GET /api/earnings/event-study/RELIANCE` returns 404 — route not defined | YES |

> These failures exist in the unmodified repo. The backtesting tests (test_engine.py) make real yfinance network calls to download RELIANCE.NS data — they depend on network connectivity and yfinance API availability.

---

## 7. What Does NOT Exist Yet

| Feature | Status |
|---------|--------|
| Docker / Dockerfile | ❌ Not present |
| `GET /healthz` or `GET /readyz` | ❌ Not present (even `/health` returns 404) |
| Vector database / embeddings | ❌ No vector store, no embedding model, no chunking |
| LLM token / cost tracking | ❌ Zero instrumentation |
| Langfuse or any tracing | ❌ Not present |
| Google ADK or any agent framework | ❌ Custom orchestrator only |
| Evaluation harness / golden dataset | ❌ Not present |
| `conftest.py` for pytest path fix | ✅ Added during audit (not code change) |
| `docs/` directory | ✅ Created during audit |
| Cloud Run deployment scripts | ❌ Not present |
| Backend CI workflow | ❌ Only frontend deploy.yml exists |
| Per-session conversation state | ❌ ChatUI is stateless; `/api/chat` proxies raw messages |

---

## 8. Data Flow Diagram (Text)

```
Browser (React SPA)
    │
    │  HTTPS  (via CORS allowlist)
    ▼
FastAPI Backend (Render)
    ├── RateLimitMiddleware (sliding window, per-IP, per-tier)
    ├── /api/chat  ──────────────────────────────────► Groq Cloud API
    │                                                  (server-side key)
    ├── /api/orchestrate/explain/{symbol}
    │       └── orchestrator.py::get_stock_explanation()
    │               ├── detect_patterns()   ──► yfinance (OHLCV)
    │               ├── fundamental_analysis() ► yfinance (Ticker.info)
    │               ├── market_regime()     ──► yfinance (^NSEI)
    │               ├── _fetch_news_titles()──► yfinance (Ticker.news)
    │               └── _groq_chat()        ──► Groq Cloud API
    │
    ├── /api/portfolio/doctor
    │       └── orchestrator.py::get_contextual_advice()  [same pattern]
    │
    ├── /api/radar
    │       └── opportunity_radar/router.py::run_radar()
    │               ├── bulk_deals, filings, insider_trades ► NSE API (httpx)
    │               ├── quarterly_results, screener_signals ► yfinance
    │               └── commentary, regulation ──────────► RBI/SEBI RSS
    │
    ├── /api/backtest/run
    │       └── backtesting/engine.py::run_backtest()     ─► yfinance
    │               └── result saved to: SQLite (signals, signal_outcomes)
    │
    └── /api/video/*
            └── video_engine.py                            ─► yfinance + Groq

SQLite DB (backend/investedge.db)
    ├── signals table
    └── signal_outcomes table
```

---

## 9. Dependency Analysis

### Backend `requirements.txt` (9 packages, all version-ranged)

```
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
yfinance>=0.2.40
pandas>=2.2.0
numpy>=1.26.0
pydantic>=2.0.0
httpx>=0.27.0
python-dotenv>=1.0.0
beautifulsoup4>=4.12.0
```

**Issues:**
- No version pinning (no `==`). Reproducible builds require pinned deps.
- No `pytest`, `ruff`, `mypy`, or `httpx[test]` in dev deps.
- Missing packages needed by all phases: `chromadb`, `sentence-transformers`, `langfuse`, `google-adk`, `litellm`.

### Frontend `package.json`

React 18 + Vite — not fully read but standard SPA setup.

---

## 10. What the Upgrade Phases Must Deliver

> This section is a forward-looking summary for the development plan.

| Phase | Key Deliverables |
|-------|-----------------|
| **1** | Dockerfile, CI, `/healthz` + `/readyz`, Cloud Run scripts |
| **2** | Real RAG: Chroma + embeddings, replace headline-stuffing |
| **3** | Google ADK agents, ReAct loops, `/api/v2/agent/query` |
| **4** | Langfuse tracing, internal metrics DB, session state |
| **5** | Eval harness, 30+ golden cases, CI eval gate |
| **6** | Remove `VITE_GROQ_KEY` from bundle, prompt-injection hygiene |
| **7** | Frontend citations panel, LLM metrics widget |
| **8** | README, ARCHITECTURE.md, CUSTOMER_HANDOFF.md, VERIFIED_CLAIMS.md |
