# InvestEdge — Unified AI Financial Intelligence OS

> **ET AI Hackathon 2026 · PS6 · Team Maharudra**

A full-stack AI-powered investment intelligence platform built for Indian retail investors. Combines real-time market data, agentic AI workflows, chart pattern recognition, news synthesis, and portfolio diagnostics — all in one unified OS.

**Live Demo:** [invest-edge-eight.vercel.app](https://invest-edge-eight.vercel.app)  
**Backend API:** [investedge-api.onrender.com](https://investedge-api.onrender.com)

---

## AI Agents

InvestEdge is powered by **9 specialized AI agents**, each handling a distinct financial intelligence task:

| # | Agent | Endpoint | Role |
|---|---|---|---|
| 1 | **Market Brain Agent** | Frontend (Groq tool-calling) | Conversational AI with live chart, fundamental & portfolio tools |
| 2 | **Chart Pattern Agent** | `POST /api/patterns` | Detects RSI, MACD, EMA crossovers, Bollinger Bands, volume signals |
| 3 | **Fundamental Analysis Agent** | `POST /api/opportunity` | P/E, ROE, revenue growth, analyst consensus, upside targets |
| 4 | **Portfolio Agent** | `POST /api/portfolio` | Live P&L, per-holding signals, stop-loss suggestions |
| 5 | **Portfolio Doctor Agent** | `POST /api/portfolio/doctor` | Health scoring, sector risk, concentration analysis + Groq AI advice |
| 6 | **Opportunity Radar Agent** | `GET /api/radar` | Scans bulk deals, insider trades, filings, quarterly results, regulatory changes |
| 7 | **News RAG Agent** | `POST /api/news/synthesize` | Retrieves live Yahoo Finance news and synthesizes with Groq LLaMA |
| 8 | **Market Regime Agent** | `GET /api/market/regime` | Classifies Nifty 50 into Bull/Bear/Sideways/High Volatility using EMA + RSI + ATR |
| 9 | **Earnings Predictor Agent** | `GET /api/earnings/predict/{symbol}` | Predicts earnings beat/miss probability using price action, volume & news sentiment |

> All agents use **Groq LLaMA 3.3 70B** for AI reasoning and **yfinance** for live market data.

---

## Features

### Core Modules
| Module | Description |
|---|---|
| **Market Brain** | AI chat agent with live NSE/BSE data — technical analysis, fundamentals, portfolio Q&A |
| **Stocks Analysis** | Algorithmic scoring with fundamental signals, analyst consensus, P/E, ROE, revenue growth |
| **Opportunity Radar** | Real-time scan of bulk deals, insider trades, filings, quarterly results, regulatory changes |
| **Chart Intelligence** | RSI, MACD, EMA crossovers, Bollinger Bands, volume signals, backtesting on any NSE/BSE stock |
| **News RAG** | AI synthesis of live Yahoo Finance news — ask about any stock or sector |
| **Video Engine** | Auto-generate 30–90s market recap videos with TTS voiceover and canvas animations |

### Innovation Modules
| Module | Description |
|---|---|
| **Portfolio Analyzer** | P&L tracking, health scoring, sector allocation, AI recommendations via Groq |
| **Market Regime Detector** | Classifies Nifty 50 into Bull Run / Bear Phase / Sideways Chop / High Volatility using EMA + RSI + ATR |
| **Earnings Surprise Predictor** | Beat/miss probability using price action, volume, news sentiment, analyst data |

---

## Tech Stack

### Frontend
- **React 18** + Vite
- Pure inline styles with CSS variables (full dark/light mode)
- SVG icons throughout — zero emoji
- Deployed on **Vercel**

### Backend
- **FastAPI** (Python)
- **yfinance** — live NSE/BSE market data
- **Groq LLaMA 3.3 70B** — AI analysis, synthesis, recommendations
- **httpx** — async HTTP client
- Deployed on **Render**

### Data Sources
- Yahoo Finance (via yfinance) — prices, fundamentals, news
- NSE · BSE · RBI · SEBI (via opportunity radar scrapers)

---

## Project Structure

```
InvestEdge/
├── backend/
│   ├── main.py                  # FastAPI app — all API endpoints
│   ├── video_engine.py          # Video generation endpoints
│   ├── opportunity_radar/       # Radar module (bulk deals, filings, etc.)
│   │   ├── router.py
│   │   ├── bulk_deals.py
│   │   ├── filings.py
│   │   ├── insider_trades.py
│   │   ├── quarterly_results.py
│   │   ├── commentary.py
│   │   ├── regulation.py
│   │   └── scoring.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx              # Root — routing, theme context
    │   ├── index.css            # CSS variables (dark/light theme)
    │   └── components/
    │       ├── Dashboard.jsx
    │       ├── Sidebar.jsx
    │       ├── ChatUI.jsx
    │       ├── StocksAnalysis.jsx
    │       ├── OpportunityRadarNew.jsx
    │       ├── ChartIntelligence.jsx
    │       ├── NewsRAG.jsx
    │       ├── VideoEngine.jsx
    │       ├── Portfolio.jsx
    │       ├── MarketRegime.jsx
    │       └── EarningsPredictor.jsx
    ├── package.json
    └── .env.example
```

---

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `.env`:
```
GROQ_API_KEY=your_groq_api_key_here
```

Run:
```bash
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
```

Create `.env`:
```
VITE_API_URL=http://localhost:8000
```

Run:
```bash
npm run dev
```

Open `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/patterns` | Chart pattern analysis (RSI, MACD, EMA, BB) |
| `POST` | `/api/opportunity` | Fundamental analysis + analyst consensus |
| `POST` | `/api/portfolio` | Portfolio P&L with live prices |
| `POST` | `/api/portfolio/doctor` | Portfolio health score + AI recommendations |
| `GET` | `/api/radar` | Opportunity radar scan |
| `GET` | `/api/market/regime` | Market regime detection |
| `GET` | `/api/earnings/predict/{symbol}` | Earnings beat/miss probability |
| `GET` | `/api/news` | Live Yahoo Finance news feed |
| `GET` | `/api/news/stream` | AI market intelligence stream |
| `GET` | `/api/news/signals` | Trending market signals |
| `POST` | `/api/news/synthesize` | RAG-powered news synthesis |
| `GET` | `/api/market/indices` | Live Nifty 50, Sensex, Bank Nifty |

---

## Deployment

### Vercel (Frontend)
1. Connect GitHub repo to Vercel
2. Set environment variables:
   - `VITE_API_URL` = your Render backend URL
   - `VITE_GROQ_KEY` = your Groq API key
3. Deploy

### Render (Backend)
1. Connect GitHub repo to Render
2. Set environment variables:
   - `GROQ_API_KEY` = your Groq API key
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

---

## Team

**Team Maharudra** — ET AI Hackathon 2026, PS6

- **Akash Bhuyan** ([@AB-1817](https://github.com/AB-1817))
- **Rushikesh Kedar** ([@Rushi9234](https://github.com/Rushi9234)) 
---

