import { useState, useRef, useEffect, useCallback } from "react";

// ── Groq config — loaded from environment variable (never hardcode keys) ───────
const GROQ_KEY = import.meta.env.VITE_GROQ_KEY;
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // best for tool use
const BACKEND = import.meta.env.VITE_API_URL;

// ── Tools (OpenAI / Groq function-calling format) ─────────────────────────────
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

// ── Tool executor — calls FastAPI backend ─────────────────────────────────────
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

// ── Groq agentic loop (OpenAI-compatible format) ──────────────────────────────
async function runAgent(messages, onText, onChart) {
  // Groq uses standard OpenAI message format — no conversion needed
  let history = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content || "" })),
  ];

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(GROQ_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
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

    // Emit text content immediately
    if (msg.content) onText(msg.content);

    // No tool calls → we're done
    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length || choice.finish_reason === "stop") break;

    // Add assistant message (with tool_calls) to history
    history.push({ role: "assistant", content: msg.content || null, tool_calls: toolCalls });

    // Execute each tool call and add results
    for (const tc of toolCalls) {
      const name = tc.function.name;
      const input = JSON.parse(tc.function.arguments || "{}");
      const sym = input.symbol || "portfolio";

      onText(`\n\n_📡 Fetching live data for **${sym.toUpperCase().replace(".NS", "")}**..._\n\n`);

      const result = await callTool(name, input);
      if (result.chart_data?.length > 0) onChart(result);

      // Groq tool result role = "tool"
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
    ctx.fillStyle = "#080e1a"; ctx.fillRect(0, 0, W, H);
    const prices = data.flatMap(d => [d.high, d.low]).filter(Boolean);
    const minP = Math.min(...prices) * 0.9975;
    const maxP = Math.max(...prices) * 1.0025;
    const xS = i => pad.l + (i / (data.length - 1)) * cW;
    const yS = p => pad.t + cH - ((p - minP) / (maxP - minP)) * cH;
    ctx.strokeStyle = "#111c2e"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + (i / 5) * cH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      const price = maxP - (i / 5) * (maxP - minP);
      ctx.fillStyle = "#3d5068"; ctx.font = "9.5px JetBrains Mono, monospace";
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
    drawLine(ema20Points, "#2196f380");
    drawLine(ema50Points, "#ff980080");
    const cw = Math.max(2, Math.floor(cW / data.length) - 1);
    data.forEach((d, i) => {
      if (!d.open || !d.close || !d.high || !d.low) return;
      const x = xS(i);
      const up = d.close >= d.open;
      const col = up ? "#00d4a0" : "#ff4466";
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
      ctx.strokeStyle = "#facc1588"; ctx.lineWidth = 0.7; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#facc15"; ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.fillText(`₹${last.close >= 1000 ? last.close.toFixed(0) : last.close.toFixed(1)}`, W - pad.r + 4, y + 4);
    }
    ctx.fillStyle = "#3d5068"; ctx.font = "9px JetBrains Mono, monospace";
    data.forEach((d, i) => {
      if (i % Math.floor(data.length / 6) === 0 && d.time) ctx.fillText(d.time.slice(5), xS(i) - 10, H - 8);
    });
    ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 13px JetBrains Mono, monospace";
    ctx.fillText(symbol, pad.l + 8, 22);
    ctx.fillStyle = "#2196f3"; ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillText("EMA20", pad.l + 80, 22);
    ctx.fillStyle = "#ff9800";
    ctx.fillText("EMA50", pad.l + 145, 22);
  }, [data, symbol]);

  const bull = signals?.filter(s => s.direction === "bullish").length || 0;
  const bear = signals?.filter(s => s.direction === "bearish").length || 0;

  return (
    <div style={{ margin: "10px 0 14px", borderRadius: 10, overflow: "hidden", border: "1px solid #0f1e33" }}>
      <canvas ref={ref} width={700} height={260} style={{ width: "100%", display: "block" }} />
      {signals?.length > 0 && (
        <div style={{ background: "#080e1a", padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 5 }}>
          {signals.map((s, i) => (
            <span key={i} style={{
              fontSize: 10.5, padding: "2px 8px", borderRadius: 4,
              fontFamily: "JetBrains Mono, monospace",
              background: s.direction === "bullish" ? "#001f12" : s.direction === "bearish" ? "#1f0010" : "#111827",
              color: s.direction === "bullish" ? "#00d4a0" : s.direction === "bearish" ? "#ff4466" : "#64748b",
              border: `1px solid ${s.direction === "bullish" ? "#00d4a020" : s.direction === "bearish" ? "#ff446620" : "#ffffff0d"}`,
            }}>{s.type}</span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#475569", fontFamily: "monospace" }}>
            🟢 {bull} &nbsp; 🔴 {bear}
          </span>
        </div>
      )}
    </div>
  );
}

function renderMd(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e2e8f0;font-weight:600">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color:#94a3b8">$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#0d1a2e;padding:1px 6px;border-radius:3px;font-size:12px;color:#7dd3fc;font-family:JetBrains Mono,monospace">$1</code>')
    .replace(/^📊 \*\*Verdict:\*\* (.*)/gm,
      '<div style="margin:14px 0 4px;padding:10px 14px;background:#0c1020;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;font-size:13px;color:#c4b5fd;font-family:JetBrains Mono,monospace">📊 <strong style="color:#c4b5fd">Verdict:</strong> $1</div>')
    .replace(/^💡 \*\*Investment Case:\*\* (.*)/gm,
      '<div style="margin:14px 0 4px;padding:10px 14px;background:#0c1020;border-left:3px solid #0ea5e9;border-radius:0 8px 8px 0;font-size:13px;color:#7dd3fc;font-family:JetBrains Mono,monospace">💡 <strong style="color:#7dd3fc">Investment Case:</strong> $1</div>')
    .replace(/^### (.*)/gm, '<div style="font-size:12px;font-weight:600;color:#64748b;margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.06em;font-family:JetBrains Mono,monospace">$1</div>')
    .replace(/^## (.*)/gm, '<div style="font-size:15px;font-weight:600;color:#e2e8f0;margin:12px 0 6px">$1</div>')
    .replace(/^- (.*)/gm, '<div style="display:flex;gap:7px;margin:4px 0;line-height:1.5"><span style="color:#334155;margin-top:1px;flex-shrink:0">▸</span><span>$1</span></div>')
    .replace(/\n/g, "<br/>");
}

function Bubble({ msg, chartData }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div style={{
          maxWidth: "72%",
          background: "linear-gradient(135deg,#3730a3,#6d28d9)",
          borderRadius: "16px 16px 4px 16px",
          padding: "10px 16px",
          fontSize: 14, color: "#e9d5ff", lineHeight: 1.6,
          fontFamily: "Inter, sans-serif",
          boxShadow: "0 2px 12px #6d28d915",
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
          background: "linear-gradient(135deg,#0284c7,#6d28d9)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff",
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {chartData && <StockChart data={chartData.chart_data} symbol={chartData.display} signals={chartData.signals} />}
          {msg.content && (
            <div style={{ fontSize: 13.5, color: "#94a3b8", lineHeight: 1.8, fontFamily: "Inter, sans-serif" }}
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
        background: "linear-gradient(135deg,#0284c7,#6d28d9)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13,
      }}>🧠</div>
      <div style={{ display: "flex", gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#6d28d9",
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
          content: `⚠️ **Error:** ${e.message}\n\n- Make sure backend is running: \`uvicorn main:app --reload --port 8000\`\n- Get a free Gemini key at aistudio.google.com and paste it in ChatUI.jsx`,
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px",
        borderBottom: "1px solid #0f1e33",
        background: "#080e1a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#1e1b4b,#4c1d95)",
            border: "1px solid #7c3aed50",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🧠</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", fontFamily: "Outfit, sans-serif" }}>
              Market Brain
            </div>
            <div style={{ fontSize: 10.5, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
              AI Orchestrator · Gemini 2.0 Flash · NSE · BSE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["PATTERN", "FUNDAMENTALS", "PORTFOLIO"].map(l => (
            <div key={l} style={{
              fontSize: 9.5, padding: "3px 8px", borderRadius: 4,
              background: "#0a1628", border: "1px solid #0f1e33",
              color: "#334155", fontFamily: "JetBrains Mono, monospace",
            }}>{l}</div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0" }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: 680, margin: "0 auto", paddingTop: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📈</div>
            <div style={{
              fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 8,
              fontFamily: "Outfit, sans-serif", letterSpacing: "-0.02em"
            }}>
              Ask about any NSE/BSE stock
            </div>
            <div style={{ fontSize: 13.5, color: "#334155", marginBottom: 32, lineHeight: 1.6 }}>
              Technical patterns · Fundamentals · Portfolio analysis · All powered by live data
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {CHIPS.map((c, i) => (
                <button key={i} onClick={() => send(c)} style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "1px solid #0f1e33", background: "#080e1a",
                  color: "#475569", fontSize: 12.5, cursor: "pointer",
                  fontFamily: "Inter, sans-serif", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "#4f46e5"; e.target.style.color = "#a78bfa"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#0f1e33"; e.target.style.color = "#475569"; }}
                >{c}</button>
              ))}
            </div>
            <button onClick={() => send(PORTFOLIO_EXAMPLE)} style={{
              padding: "10px 18px", borderRadius: 8,
              border: "1px solid #1e3a5f", background: "#080e1a",
              color: "#0ea5e9", fontSize: 12, cursor: "pointer",
              fontFamily: "JetBrains Mono, monospace", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.target.style.background = "#0c1a2e"; }}
              onMouseLeave={e => { e.target.style.background = "#080e1a"; }}
            >📂 Try portfolio analysis →</button>
          </div>
        ) : (
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            {messages.map((msg, i) => (
              <Bubble key={i} msg={msg} chartData={chartByMsgIdx[i] || null} />
            ))}
            {loading && <Typing />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "14px 24px 18px", borderTop: "1px solid #0f1e33", background: "#080e1a", flexShrink: 0 }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: "#0a1220", borderRadius: 12,
            border: "1px solid #0f1e33", padding: "10px 12px",
            transition: "border-color 0.15s",
          }}
            onFocus={e => e.currentTarget.style.borderColor = "#4f46e5"}
            onBlur={e => e.currentTarget.style.borderColor = "#0f1e33"}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about any stock... 'Is HDFC bullish?' or paste your portfolio holdings"
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#cbd5e1", fontSize: 14, resize: "none",
                fontFamily: "Inter, sans-serif", lineHeight: 1.55,
                maxHeight: 120, overflowY: "auto",
              }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading} style={{
              width: 36, height: 36, borderRadius: 8, border: "none",
              background: input.trim() && !loading ? "linear-gradient(135deg,#4f46e5,#7c3aed)" : "#0f1e33",
              color: input.trim() && !loading ? "#fff" : "#1e3a5f",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", flexShrink: 0,
            }}>↑</button>
          </div>
          <div style={{
            textAlign: "center", marginTop: 8, fontSize: 10.5,
            color: "#0f1e33", fontFamily: "JetBrains Mono, monospace"
          }}>
            Team Maharudra · ET AI Hackathon 2026 · PS6: AI for the Indian Investor
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dot {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.3; }
          40% { transform: scale(1.15); opacity: 1; }
        }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
