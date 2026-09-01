import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CHAT_API = `${BACKEND}/api/chat`;
const GROQ_MODEL = "llama-3.3-70b-versatile";
console.log("[ChatUI] API URL:", BACKEND);

const TOOLS = [
  {
    type: "function",
    function: {
      name: "analyze_chart_patterns",
      description: "Fetches live NSE/BSE stock data and runs full technical analysis. Use when user asks about: chart patterns, technicals, RSI, buy/sell signals, bullish/bearish, EMA, MACD, Bollinger Bands, support/resistance.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "NSE/BSE stock symbol e.g. RELIANCE, HDFCBANK, INFY, TCS" },
          period: { type: "string", enum: ["3mo", "6mo", "1y"], description: "Analysis period — use 6mo by default" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fundamental_opportunity",
      description: "Fetches fundamental data, valuation, growth, analyst consensus and news. Use for: P/E, earnings, ROE, dividends, analyst targets, balance sheet questions.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "NSE/BSE stock symbol" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_portfolio",
      description: "Analyzes user's portfolio — P&L, current value, technical signals, per-holding recommendations. Use ONLY when user explicitly provides stocks with quantity and average purchase price.",
      parameters: {
        type: "object",
        properties: {
          holdings: {
            type: "array",
            description: "List of stock holdings",
            items: {
              type: "object",
              properties: {
                symbol: { type: "string", description: "Stock symbol e.g. RELIANCE" },
                qty: { type: "number", description: "Number of shares held" },
                avg_cost: { type: "number", description: "Average purchase price in INR" },
              },
              required: ["symbol", "qty", "avg_cost"],
            },
          },
        },
        required: ["holdings"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are InvestEdge AI — a sharp, data-driven stock intelligence assistant built for Indian retail investors on NSE/BSE. Built by Team Maharudra for ET AI Hackathon 2026.

You have three tools:
1. analyze_chart_patterns — technical analysis of any NSE/BSE stock
2. get_fundamental_opportunity — fundamentals, valuation, analyst targets
3. analyze_portfolio — portfolio P&L, risk, per-holding signals

ALWAYS use tools for specific stock questions. Never fabricate price data.

Format:
- **bold** key numbers and signals
- Bullet points for signal lists
- Cite exact numbers (RSI, P/E, % targets)
- End technical responses: "📊 **Verdict:** [Bullish/Bearish/Neutral] — [action]"
- End fundamental responses: "💡 **Investment Case:** [2 sentence thesis]"
- Portfolio: 1-line health summary first

Tone: confident, direct, numbers-first. Sharp analyst, not a chatbot.`;

async function callTool(name, input) {
  const endpoints = {
    analyze_chart_patterns: "/api/patterns",
    get_fundamental_opportunity: "/api/opportunity",
    analyze_portfolio: "/api/portfolio",
  };
  const body = name === "analyze_portfolio"
    ? { holdings: input.holdings }
    : name === "analyze_chart_patterns"
      ? { symbol: input.symbol, period: input.period || "6mo" }
      : { symbol: input.symbol };

  const res = await fetch(BACKEND + endpoints[name], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Unknown error" }));
    return { error: e.detail || `HTTP ${res.status}` };
  }
  return res.json();
}

async function runAgent(messages, onText, onChart) {
  let history = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content || "" })),
  ];

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: history,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq API error ${res.status}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from Groq");

    const msg = choice.message;
    if (msg.content) onText(msg.content);

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length || choice.finish_reason === "stop") break;

    history.push({ role: "assistant", content: msg.content || null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const input = JSON.parse(tc.function.arguments || "{}");
      const sym = input.symbol || "portfolio";

      onText(`\n\n_Fetching live data for **${sym.toUpperCase().replace(".NS", "")}**..._\n\n`);

      const result = await callTool(name, input);
      if (result.chart_data?.length > 0) onChart(result);

      history.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }
}

function StockChart({ data, symbol, signals }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data?.length || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { t: 30, r: 70, b: 36, l: 58 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
    const prices = data.flatMap(d => [d.high, d.low]).filter(Boolean);
    const minP = Math.min(...prices) * 0.9975;
    const maxP = Math.max(...prices) * 1.0025;
    const xS = i => pad.l + (i / (data.length - 1)) * cW;
    const yS = p => pad.t + cH - ((p - minP) / (maxP - minP)) * cH;
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + (i / 5) * cH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      const price = maxP - (i / 5) * (maxP - minP);
      ctx.fillStyle = "#94a3b8"; ctx.font = "9.5px JetBrains Mono, monospace";
      ctx.fillText(`₹${price >= 1000 ? price.toFixed(0) : price.toFixed(1)}`, W - pad.r + 4, y + 3);
    }
    const ema20Points = data.map((d, i) => d.ema20 ? [xS(i), yS(d.ema20)] : null).filter(Boolean);
    const ema50Points = data.map((d, i) => d.ema50 ? [xS(i), yS(d.ema50)] : null).filter(Boolean);
    const drawLine = (pts, color) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.stroke();
    };
    drawLine(ema20Points, "#2563eb80");
    drawLine(ema50Points, "#ea580c80");
    const cw = Math.max(2, Math.floor(cW / data.length) - 1);
    data.forEach((d, i) => {
      if (!d.open || !d.close || !d.high || !d.low) return;
      const x = xS(i);
      const up = d.close >= d.open;
      const col = up ? "#16a34a" : "#dc2626";
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, yS(d.high)); ctx.lineTo(x, yS(d.low)); ctx.stroke();
      const bT = yS(Math.max(d.open, d.close));
      const bH = Math.max(1, yS(Math.min(d.open, d.close)) - bT);
      ctx.fillStyle = col;
      ctx.fillRect(x - cw / 2, bT, cw, bH);
    });
    const last = data[data.length - 1];
    if (last?.close) {
      const y = yS(last.close);
      ctx.strokeStyle = "#d9770688"; ctx.lineWidth = 0.7; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#d97706"; ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.fillText(`₹${last.close >= 1000 ? last.close.toFixed(0) : last.close.toFixed(1)}`, W - pad.r + 4, y + 4);
    }
    ctx.fillStyle = "#94a3b8"; ctx.font = "9px JetBrains Mono, monospace";
    data.forEach((d, i) => {
      if (i % Math.floor(data.length / 6) === 0 && d.time) ctx.fillText(d.time.slice(5), xS(i) - 10, H - 8);
    });
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 13px JetBrains Mono, monospace";
    ctx.fillText(symbol, pad.l + 8, 22);
    ctx.fillStyle = "#2563eb"; ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText("EMA20", pad.l + 80, 22);
    ctx.fillStyle = "#ea580c";
    ctx.fillText("EMA50", pad.l + 145, 22);
  }, [data, symbol]);

  const bull = signals?.filter(s => s.direction === "bullish").length || 0;
  const bear = signals?.filter(s => s.direction === "bearish").length || 0;

  return (
    <div style={{ margin: "10px 0 14px", borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <canvas ref={ref} width={700} height={260} style={{ width: "100%", display: "block" }} />
      {signals?.length > 0 && (
        <div style={{ background: "#f8fafc", padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 5, borderTop: "1px solid #e2e8f0" }}>
          {signals.map((s, i) => (
            <span key={i} style={{
              fontSize: 10.5, padding: "2px 8px", borderRadius: 4,
              fontFamily: "JetBrains Mono, monospace",
              background: s.direction === "bullish" ? "#dcfce7" : s.direction === "bearish" ? "#fee2e2" : "#f1f5f9",
              color: s.direction === "bullish" ? "#16a34a" : s.direction === "bearish" ? "#dc2626" : "#64748b",
              border: `1px solid ${s.direction === "bullish" ? "#bbf7d0" : s.direction === "bearish" ? "#fecaca" : "#e2e8f0"}`,
            }}>{s.type}</span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#94a3b8", fontFamily: "monospace", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#16a34a", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#16a34a"><circle cx="12" cy="12" r="10"/></svg>
              {bull}
            </span>
            <span style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#dc2626"><circle cx="12" cy="12" r="10"/></svg>
              {bear}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function renderMd(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:600">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color:var(--text-secondary)">$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--bg-elevated);padding:1px 6px;border-radius:3px;font-size:12px;color:#0891b2;font-family:JetBrains Mono,monospace">$1</code>')
    .replace(/^(?:📊\s*)?\*\*Verdict:\*\* (.*)/gm,
      '<div style="margin:14px 0 4px;padding:10px 14px;background:rgba(124,58,237,0.15);border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;font-size:13px;color:#a78bfa;font-family:JetBrains Mono,monospace"><strong style="color:#a78bfa">Verdict:</strong> $1</div>')
    .replace(/^(?:💡\s*)?\*\*Investment Case:\*\* (.*)/gm,
      '<div style="margin:14px 0 4px;padding:10px 14px;background:rgba(8,145,178,0.15);border-left:3px solid #0891b2;border-radius:0 8px 8px 0;font-size:13px;color:#22d3ee;font-family:JetBrains Mono,monospace"><strong style="color:#22d3ee">Investment Case:</strong> $1</div>')
    .replace(/^### (.*)/gm, '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.06em;font-family:JetBrains Mono,monospace">$1</div>')
    .replace(/^## (.*)/gm, '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin:12px 0 6px">$1</div>')
    .replace(/^- (.*)/gm, '<div style="display:flex;gap:7px;margin:4px 0;line-height:1.5"><span style="color:#16a34a;margin-top:1px;flex-shrink:0">▪</span><span>$1</span></div>')
    .replace(/\n/g, "<br/>");
}

function Bubble({ msg, chartData }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div style={{
          maxWidth: "72%",
          background: "linear-gradient(135deg,#16a34a,#22c55e)",
          borderRadius: "16px 16px 4px 16px",
          padding: "10px 16px",
          fontSize: 14, color: "#fff", lineHeight: 1.6,
          fontFamily: "Inter, sans-serif",
          boxShadow: "0 2px 12px rgba(22,163,74,0.2)",
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginTop: 2,
          background: "linear-gradient(135deg,#16a34a,#0891b2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {chartData && <StockChart data={chartData.chart_data} symbol={chartData.display} signals={chartData.signals} />}
          {msg.content && (
            <div style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.8, fontFamily: "Inter, sans-serif" }}
              dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "linear-gradient(135deg,#16a34a,#0891b2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg></div>
      <div style={{ display: "flex", gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
            animation: `dot 1.3s ease-in-out ${i * 0.22}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

const CHIPS = [
  "Is RELIANCE bullish right now?",
  "Analyze HDFCBANK chart patterns",
  "Fundamental view on INFY",
  "TCS — buy, hold or sell?",
  "BAJFINANCE technical analysis",
  "Full analysis of ICICIBANK",
];

const PORTFOLIO_EXAMPLE = `Analyze my portfolio:
RELIANCE — 50 shares at ₹2800
HDFCBANK — 30 shares at ₹1650
INFY — 100 shares at ₹1420
TCS — 20 shares at ₹3800`;

export default function ChatUI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chartByMsgIdx, setChartByMsgIdx] = useState({});
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    const userMsg = { role: "user", content: q };
    const base = [...messages, userMsg];
    setMessages(base);
    setLoading(true);
    const assistantIdx = base.length;
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const apiMsgs = base.map(m => ({ role: m.role, content: m.content }));
      await runAgent(
        apiMsgs,
        (chunk) => setMessages(prev => {
          const next = [...prev];
          next[assistantIdx] = { role: "assistant", content: (next[assistantIdx]?.content || "") + chunk };
          return next;
        }),
        (chartData) => setChartByMsgIdx(prev => ({ ...prev, [assistantIdx]: chartData }))
      );
    } catch (e) {
      setMessages(prev => {
        const next = [...prev];
        next[assistantIdx] = {
          role: "assistant",
          content: `**Error:** ${e.message}\n\n- Make sure backend is running: \`python -m uvicorn main:app --reload --port 8000\`\n- Ensure API keys are set in .env`,
        };
        return next;
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, messages, loading]);

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
      {/* Header */}
      <header style={{
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        padding: "16px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
            fontFamily: "Inter, sans-serif",
            margin: 0,
          }}>Market Brain</h1>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 40px 0" }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{
              fontSize: 36,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "Inter, sans-serif",
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}>Institutional Intelligence at Your Fingertips</h2>
            <p style={{
              fontSize: 16,
              color: "var(--text-secondary)",
              fontFamily: "Inter, sans-serif",
              marginBottom: 48,
            }}>Ask about specific ticker charts, fundamental health, or portfolio optimization strategies.</p>
            
            {/* Action Buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 32 }}>
              {CHIPS.map((c, i) => (
                <button key={i} onClick={() => send(c)} style={{
                  padding: "10px 18px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg-elevated)",
                  color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
                  fontFamily: "Inter, sans-serif", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "#047857"; e.target.style.color = "#047857"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
                >{c}</button>
              ))}
            </div>
            <button onClick={() => send(PORTFOLIO_EXAMPLE)} style={{
              padding: "12px 24px", borderRadius: 8,
              border: "1px solid #047857", background: "#047857",
              color: "#ffffff", fontSize: 14, cursor: "pointer",
              fontFamily: "Inter, sans-serif", transition: "all 0.15s",
              fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#065f46"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#047857"; }}
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Try portfolio analysis</button>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {messages.map((msg, i) => (
              <Bubble key={i} msg={msg} chartData={chartByMsgIdx[i] || null} />
            ))}
            {loading && <Typing />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "20px 40px 24px", background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            background: "var(--bg-elevated)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            padding: "12px 16px",
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Describe the stock analysis you need..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: input.trim() && !loading ? "#047857" : "#e5e7eb",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              }}
            ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
          </div>
          <div style={{
            textAlign: "center",
            marginTop: 12,
            fontSize: 11,
            color: "#9ca3af",
            fontFamily: "Inter, sans-serif",
          }}>INVESTEDGE AI CAN MAKE MISTAKES. VERIFY CRITICAL DATA.</div>
        </div>
      </div>
    </div>
  );
}
