# InvestEdge AI — Unified Financial Intelligence OS
### ET AI Hackathon 2026 · Team Maharudra · PS6

> AI-powered stock intelligence platform for Indian retail investors on NSE/BSE.  
> Real-time technical analysis, fundamentals, portfolio management, news RAG — all orchestrated by a Groq (Llama 3.3 70B) agentic AI.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Orchestrator** | Groq API — Llama 3.3 70B Versatile (function calling) |
| **Backend** | FastAPI · yfinance · pandas-ta · Pydantic |
| **Frontend** | React 18 · Vite · Vanilla CSS |
| **Data Sources** | NSE/BSE via yfinance, ET Markets News |

---

## Architecture

```
NSE / BSE Market Data  ──►  FastAPI Backend (port 8000)
                                 ├── /api/patterns    (technical analysis + chart data)
                                 ├── /api/opportunity (fundamentals + analyst targets)
                                 ├── /api/portfolio   (P&L + per-holding signals)
                                 └── /api/news        (semantic news RAG)
                                          │
                              Groq Agentic Loop (Llama 3.3 70B)
                              Tool use → auto-selects the right API
                                          │
                              React Frontend (port 5173)
                                 ├── 🏠 Landing — architecture overview
                                 ├── 🧠 Market Brain — AI chat
                                 ├── 🔭 Opportunity Radar — fundamentals
                                 ├── 📊 Chart Intelligence — candlestick + technicals
                                 ├── 💼 Portfolio — P&L analyzer
                                 ├── 🗞️ News RAG — semantic search
                                 └── 🎬 Video Engine — AI market recap
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Free Groq API key → [console.groq.com](https://console.groq.com)

---

### 1. Backend

```bash
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac / Linux

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --reload --port 8000
```

API docs → http://localhost:8000/docs

---

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

App → http://localhost:5173

---

### 3. Configure Groq API Key

Open `frontend/src/components/ChatUI.jsx` and paste your key:

```js
const GROQ_KEY = "gsk_your_groq_key_here"; // ← paste here
```

Get a free key (10M tokens/day) at [console.groq.com](https://console.groq.com)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/patterns` | Technical analysis + candlestick chart data |
| `POST` | `/api/opportunity` | Fundamentals, valuation, analyst consensus |
| `POST` | `/api/portfolio` | Portfolio P&L + per-holding signals |
| `GET` | `/api/news` | Semantic news search (keyword + symbol) |
| `GET` | `/health` | Service health check |

---

## Project Structure

```
stocksense/
├── backend/
│   ├── main.py              # FastAPI app — all API endpoints
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment variables template
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css        # Global design system
│       └── components/
│           ├── LandingPage.jsx
│           ├── Sidebar.jsx
│           ├── ChatUI.jsx          # Groq agentic loop + Market Brain
│           ├── OpportunityRadar.jsx
│           ├── ChartIntelligence.jsx
│           ├── Portfolio.jsx
│           ├── NewsRAG.jsx
│           └── VideoEngine.jsx
├── .gitignore
└── README.md
```

---

## Build for Production

```bash
# Frontend production build
cd frontend && npm run build
# Output → frontend/dist/
# Deploy dist/ to Vercel, Netlify, or serve with Nginx
```

---
