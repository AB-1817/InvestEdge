# InvestEdge — System Architecture

> Version: Post-Phase-8 Production Upgrade  
> Generated: 2026-11-19

---

## High-Level Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend — Vercel (React 18 + Vite)"]
        UI1[ChatUI / Market Brain]
        UI2[NewsRAG / Intelligence]
        UI3[LLMMetricsPanel]
        UI4[Dashboard / Portfolio / Backtesting]
    end

    subgraph Backend["Backend — Render / Google Cloud Run (FastAPI)"]
        direction TB
        HEALTH["/healthz  /readyz"]
        LEGACY["/api/* — Legacy Endpoints\n(chat, news, patterns, opportunity,\nportfolio, backtest, ledger, regime)"]

        subgraph V2["API v2 — /api/v2/*"]
            AGR["/api/v2/agent/query"]
            RAGR["/api/v2/rag/query\n/api/v2/rag/ingest"]
            MET["/api/v2/metrics/llm\n/api/v2/metrics/llm/recent"]
        end

        subgraph Agents["Multi-Agent System (backend/agents_v2/)"]
            ROOT[Root Agent\nHierarchical Delegation]
            SA1[market_data_agent]
            SA2[technical_agent]
            SA3[fundamentals_agent]
            SA4[news_rag_agent]
            SA5[portfolio_agent]
            SA6[risk_agent]
            CRITIC[Critic / Reflection Engine]
            ROOT --> SA1 & SA2 & SA3 & SA4 & SA5 & SA6
            ROOT --> CRITIC
        end

        subgraph RAG["Vector RAG (backend/rag/)"]
            EMB[Embeddings\nGemini or Fake Fallback]
            CHR[Chroma Vector Store\nPersistent Local]
            ING[Ingest Pipeline\nNews + Fundamentals]
            RET[Retriever\nTop-k MMR + Citations]
            EMB --> CHR
            ING --> EMB
            CHR --> RET
        end

        subgraph OBS["Observability (backend/observability/)"]
            METR[Internal Metrics\nSQLite llm_metrics table]
            LANG[Langfuse Traces\nOptional — NullTracer fallback]
            SESS[Session State\nBounded history + summarization]
        end

        subgraph EVALS["Evaluation Harness (backend/evals/)"]
            GOLD[golden.jsonl\n32 cases]
            RUN["python -m backend.evals.run\n--mock or --live"]
            GATE[CI Quality Gate\nFails if metrics regress]
        end
    end

    subgraph External["External Services"]
        GROQ[Groq Cloud\nLLaMA 3.3 70B]
        GEM[Google Gemini\nEmbeddings + LLM]
        YF[yfinance / NSE\nMarket Data]
        LF[Langfuse Cloud\nOptional Tracing]
        GCR[GCP Secret Manager\nSecrets at Runtime]
    end

    Client -- "HTTPS VITE_API_URL" --> Backend
    AGR --> Agents
    RAGR --> RAG
    MET --> OBS
    LEGACY --> OBS
    Agents --> OBS
    SA4 --> RAG
    Agents --> GROQ & GEM
    RAG --> GEM
    LEGACY --> GROQ & YF
    OBS --> LANG --> LF
    OBS --> METR
    Backend --> GCR
```

---

## Data Flow — Agent Query

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as FastAPI /api/v2/agent/query
    participant ROOT as Root Agent
    participant SUB as Sub-Agent (ReAct Loop)
    participant TOOL as Tool (wraps existing backend logic)
    participant CRITIC as Critic / Reflection
    participant LLM as Groq / Gemini
    participant OBS as Observability Layer

    FE->>API: POST {query, symbol, max_steps}
    API->>ROOT: execute(query)
    ROOT->>SUB: delegate(query, context)
    loop ReAct steps (max_steps)
        SUB->>LLM: reason(query + observations)
        LLM-->>SUB: thought + tool_call
        SUB->>TOOL: execute(args)
        TOOL-->>SUB: observation
        OBS->>OBS: record tool latency
    end
    SUB-->>ROOT: draft answer + evidence
    ROOT->>CRITIC: check_groundedness(draft, evidence)
    CRITIC->>LLM: critique(draft)
    LLM-->>CRITIC: flagged_claims
    CRITIC-->>ROOT: revised answer
    ROOT->>OBS: record_llm_call(tokens, latency, cost)
    ROOT-->>API: AgentQueryResult {answer, trace, citations, trace_id}
    API-->>FE: JSON response
```

---

## Data Flow — RAG Query

```mermaid
sequenceDiagram
    participant USER as User / Agent
    participant API as /api/v2/rag/query
    participant RET as Retriever
    participant EMB as Embeddings Provider
    participant CHR as Chroma Store
    participant LLM as LLM (answer synthesis)

    USER->>API: POST {query, symbol, k, use_mmr}
    API->>RET: retrieve(query, filters)
    RET->>EMB: embed(query)
    EMB-->>RET: query_vector
    RET->>CHR: similarity_search(vector, k, filters)
    CHR-->>RET: top-k chunks + metadata
    RET->>RET: MMR rerank (if use_mmr)
    RET-->>API: chunks + citations [{source, url, chunk_id, published_at}]
    API->>LLM: synthesize(query, chunks)
    LLM-->>API: answer
    API-->>USER: {answer, citations, retrieved_count}
```

---

## Ingestion Pipeline

```mermaid
flowchart LR
    subgraph Sources
        NEWS[News Articles\nvia /api/news]
        RADAR[Opportunity Radar\nFilings, Bulk Deals,\nInsider Trades]
        FUNDS[Fundamentals\nQuarterly results,\nP/E, ROE, EPS]
    end

    subgraph Processing
        CHUNK[Chunker\nOverlap=50 tokens\nMax=512 tokens]
        META[Metadata Tagging\nsymbol, source,\npublished_at, doc_type, url]
    end

    subgraph Storage
        EMB2[Embedding Model]
        CHR2[Chroma Collection\ninvestedge_knowledge]
    end

    Sources --> CHUNK --> META --> EMB2 --> CHR2
```

---

## Observability Stack

```mermaid
flowchart TD
    subgraph Every LLM Call
        CALL[LLM API Call\nGroq or Gemini]
        REC[record_llm_call\nlatency, tokens in/out,\ncost, model, trace_id]
    end

    subgraph Storage
        SQLITE[SQLite — llm_metrics table\nAlways enabled]
        LANGFUSE[Langfuse Cloud\nNested spans per agent run\nOnly if LANGFUSE_* keys set]
        NULLTRACE[NullTracer\nNo-op when no keys]
    end

    subgraph API
        SUM[GET /api/v2/metrics/llm\np50/p95 latency, total tokens,\ntotal cost, error rate]
        REC2[GET /api/v2/metrics/llm/recent\nLast N calls with trace IDs]
    end

    subgraph Frontend
        PANEL[LLMMetricsPanel.jsx\nCompact bar in ChatUI header\nFull panel in NewsRAG sidebar]
    end

    CALL --> REC
    REC --> SQLITE --> SUM & REC2
    REC --> LANGFUSE
    SUM & REC2 --> PANEL
```

---

## Deployment Topology

```mermaid
flowchart LR
    GH[GitHub main branch]

    subgraph CI["GitHub Actions"]
        LINT[ruff lint]
        TYPE[mypy typecheck]
        TEST[pytest 65 tests]
        DOCKER[docker build]
        EVAL[evals --mock gate]
        LINT --> TYPE --> TEST --> DOCKER --> EVAL
    end

    subgraph Deploy["Deployment Options"]
        RENDER[Render\nAuto-deploy from GitHub\nSimple PaaS]
        GCR2[Google Cloud Run\nDocker image → Artifact Registry\nSecrets from Secret Manager\nMin 1 / Max 10 instances]
        VERCEL[Vercel\nReact 18 + Vite\nVITE_API_URL env var only]
    end

    GH --> CI
    CI --> RENDER & GCR2 & VERCEL
```

---

## Security Architecture

```mermaid
flowchart TD
    REQ[Incoming Request]

    REQ --> RL[Rate Limiter\nIn-memory per IP\nTier: api / v2-agent / v2-rag / metrics]
    RL --> SZ[Size Check\nBody ≤ 1 MB on v2 routes]
    SZ --> VAL[Pydantic Validation\nAll fields typed and bounded]
    VAL --> ROUTE{Route}

    ROUTE -->|/api/v2/rag/ingest| AUTH[X-Admin-Token\nor Bearer Auth\nRAG_ADMIN_TOKEN env]
    ROUTE -->|/api/v2/agent/query| INJECT[Prompt Injection Guard\nRetrieved text wrapped in\nUNTRUSTED DATA delimiters]
    ROUTE -->|Other| PROC[Processing]

    AUTH --> PROC
    INJECT --> PROC
    PROC --> RESP[Response]

    subgraph NO["Never"]
        NOKEY[No LLM keys in frontend bundle]
        NOHC[No secrets hardcoded]
        NOFW[No instruction-following from retrieved text]
    end
```

---

## Module Dependency Map

```mermaid
flowchart TD
    MAIN[main.py\nFastAPI App] --> CHAT[chat_service.py]
    MAIN --> ORCH[orchestrator.py\nLegacy]
    MAIN --> AR[agents_v2/routes.py]
    MAIN --> RR[rag/routes.py]
    MAIN --> MR[observability/routes.py]

    AR --> ROOT2[agents_v2/root_agent.py]
    ROOT2 --> SUBS[agents_v2/subagents.py]
    ROOT2 --> TOOLS2[agents_v2/tools.py]
    ROOT2 --> CRIT[agents_v2/reflection.py]
    ROOT2 --> PROV[agents_v2/providers.py]
    PROV --> OBS2[observability/metrics.py]
    PROV --> TRAC[observability/tracer.py]

    RR --> RETR[rag/retriever.py]
    RETR --> STORE[rag/store.py]
    RETR --> EMBED[rag/embeddings.py]
    RR --> INGEST[rag/ingest.py]
    INGEST --> STORE

    CHAT --> OBS2
    TOOLS2 --> ORCH
```

