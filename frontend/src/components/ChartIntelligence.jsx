import { useState, useRef, useEffect } from "react";

const BACKEND = import.meta.env.VITE_API_URL;

function StockChart({ data, symbol, signals }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data?.length || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const pad = { t: 32, r: 74, b: 36, l: 62 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#080e1a"; ctx.fillRect(0, 0, W, H);
    const prices = data.flatMap(d => [d.high, d.low]).filter(Boolean);
    const minP = Math.min(...prices) * 0.998;
    const maxP = Math.max(...prices) * 1.002;
    const xS = i => pad.l + (i / (data.length - 1)) * cW;
    const yS = p => pad.t + cH - ((p - minP) / (maxP - minP)) * cH;
    // Grid
    ctx.strokeStyle = "#111c2e"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + (i / 5) * cH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      const price = maxP - (i / 5) * (maxP - minP);
      ctx.fillStyle = "#3d5068"; ctx.font = "9.5px JetBrains Mono, monospace";
      ctx.fillText(`₹${price >= 1000 ? price.toFixed(0) : price.toFixed(1)}`, W - pad.r + 4, y + 3);
    }
    // EMA lines
    const ema20Pts = data.map((d, i) => d.ema20 ? [xS(i), yS(d.ema20)] : null).filter(Boolean);
    const ema50Pts = data.map((d, i) => d.ema50 ? [xS(i), yS(d.ema50)] : null).filter(Boolean);
    const drawL = (pts, col) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.stroke();
    };
    drawL(ema20Pts, "#2196f380"); drawL(ema50Pts, "#ff980080");
    // Candles
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
      ctx.fillStyle = col; ctx.fillRect(x - cw / 2, bT, cw, bH);
    });
    // Price line
    const last = data[data.length - 1];
    if (last?.close) {
      const y = yS(last.close);
      ctx.strokeStyle = "#facc1580"; ctx.lineWidth = 0.7; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#facc15"; ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.fillText(`₹${last.close >= 1000 ? last.close.toFixed(0) : last.close.toFixed(1)}`, W - pad.r + 4, y + 4);
    }
    // X dates
    ctx.fillStyle = "#3d5068"; ctx.font = "9px JetBrains Mono, monospace";
    data.forEach((d, i) => {
      if (i % Math.floor(data.length / 6) === 0 && d.time) ctx.fillText(d.time.slice(5), xS(i) - 10, H - 8);
    });
    // Labels
    ctx.fillStyle = "#e2e8f0"; ctx.font = "bold 13px JetBrains Mono, monospace";
    ctx.fillText(symbol, pad.l + 8, 22);
    ctx.fillStyle = "#2196f3"; ctx.font = "10px JetBrains Mono, monospace"; ctx.fillText("EMA20", pad.l + 80, 22);
    ctx.fillStyle = "#ff9800"; ctx.fillText("EMA50", pad.l + 145, 22);
  }, [data, symbol]);

  const bull = signals?.filter(s => s.direction === "bullish").length || 0;
  const bear = signals?.filter(s => s.direction === "bearish").length || 0;
  return (
    <div style={{ margin: "12px 0 16px", borderRadius: 12, overflow: "hidden", border: "1px solid #0f1e33" }}>
      <canvas ref={ref} width={700} height={280} style={{ width: "100%", display: "block" }} />
      {signals?.length > 0 && (
        <div style={{ background: "#080e1a", padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 5 }}>
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

const PERIODS = ["3mo", "6mo", "1y"];

export default function ChartIntelligence() {
  const [symbol, setSymbol] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/patterns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s, period }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const quickSuggestions = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "BAJFINANCE", "SBIN", "ICICIBANK"];
  const price = data?.price;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px" }}>
      {/* Header */}
      <div className="section-header">
        <div className="section-icon" style={{ background: "#071830", border: "1px solid #3b82f630" }}>📊</div>
        <div>
          <div className="section-title">Chart Intelligence</div>
          <div className="section-sub">The Analyst — Technical Patterns & Indicators</div>
        </div>
      </div>

      <div style={{
        padding: "14px 16px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 10, marginBottom: 24,
        fontSize: 13, color: "#64748b", lineHeight: 1.6,
      }}>
        Computer vision on live NSE/BSE charts. Detects:
        <span style={{ color: "#3b82f6" }}> RSI · MACD · EMA Crossovers · Bollinger Bands · Volume Surges · 52-Week Levels · Historical Backtesting</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input
          className="input"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Stock symbol… RELIANCE, TCS, NIFTY50"
          style={{ flex: 1, fontFamily: "JetBrains Mono, monospace" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: period === p ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : "#0a1220",
              color: period === p ? "#fff" : "#475569",
              fontSize: 11.5, fontFamily: "JetBrains Mono, monospace",
              border: period === p ? "none" : "1px solid #0f1e33",
              transition: "all 0.15s",
            }}>{p}</button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={analyze}
          disabled={!symbol.trim() || loading}
          style={{ minWidth: 130, background: "linear-gradient(135deg,#1d4ed8,#3b82f6)" }}
        >
          {loading ? "Analyzing…" : "📊 Analyze"}
        </button>
      </div>

      {/* Suggestions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        {quickSuggestions.map(s => (
          <button key={s} onClick={() => setSymbol(s)} style={{
            padding: "4px 11px", borderRadius: 6,
            border: "1px solid #0f1e33", background: "#080e1a",
            color: "#475569", fontSize: 11, cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "#3b82f6"; e.target.style.color = "#3b82f6"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#0f1e33"; e.target.style.color = "#475569"; }}
          >{s}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #0f1e33",
            borderTopColor: "#3b82f6", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Running technical analysis on {symbol}…
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 18px", background: "#1f0010",
          border: "1px solid #ff446640", borderRadius: 10,
          color: "#ff7a9a", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          {/* Price row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16, flexWrap: "wrap", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0",
                fontFamily: "JetBrains Mono, monospace" }}>
                ₹{price?.current?.toLocaleString("en-IN")}
              </span>
              {price?.change_pct != null && (
                <span style={{
                  fontSize: 14, fontWeight: 600,
                  color: price.change_pct >= 0 ? "#00d4a0" : "#ff4466",
                  fontFamily: "JetBrains Mono, monospace",
                }}>
                  {price.change_pct >= 0 ? "▲" : "▼"} {Math.abs(price.change_pct)}%
                </span>
              )}
            </div>
            <div style={{
              padding: "6px 16px", borderRadius: 8,
              background: data.bias === "bullish" ? "#001f12" : data.bias === "bearish" ? "#1f0010" : "#0a1220",
              border: `1px solid ${data.bias === "bullish" ? "#00d4a040" : data.bias === "bearish" ? "#ff446640" : "#0f1e33"}`,
              color: data.bias === "bullish" ? "#00d4a0" : data.bias === "bearish" ? "#ff4466" : "#94a3b8",
              fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
            }}>
              {data.bias === "bullish" ? "🟢" : data.bias === "bearish" ? "🔴" : "⚪"} {data.bias?.toUpperCase()} BIAS
              <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.7 }}>
                ({data.bias_counts?.bullish}B · {data.bias_counts?.bearish}Be)
              </span>
            </div>
          </div>

          {/* Chart */}
          {data.chart_data?.length > 0 && (
            <StockChart data={data.chart_data} symbol={data.display} signals={data.signals} />
          )}

          {/* Key metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 9, marginBottom: 20 }}>
            {[
              { label: "RSI(14)", value: price?.rsi?.toFixed(1), color: price?.rsi < 35 ? "#00d4a0" : price?.rsi > 65 ? "#ff4466" : "#e2e8f0" },
              { label: "EMA 20", value: price?.ema20 ? `₹${price.ema20.toFixed(0)}` : null, color: "#2196f3" },
              { label: "EMA 50", value: price?.ema50 ? `₹${price.ema50.toFixed(0)}` : null, color: "#ff9800" },
              { label: "EMA 200", value: price?.ema200 ? `₹${price.ema200.toFixed(0)}` : null, color: "#94a3b8" },
              { label: "52W High", value: price?.["52w_high"] ? `₹${price["52w_high"].toFixed(0)}` : null, color: "#00d4a0" },
              { label: "52W Low", value: price?.["52w_low"] ? `₹${price["52w_low"].toFixed(0)}` : null, color: "#ff4466" },
              { label: "ATR", value: price?.atr?.toFixed(1), color: "#f59e0b" },
            ].filter(m => m.value).map(m => (
              <div key={m.label} style={{
                padding: "10px 12px", background: "#0a1220",
                border: "1px solid #0f1e33", borderRadius: 8, textAlign: "center",
              }}>
                <div style={{ fontSize: 9.5, color: "#334155", marginBottom: 4,
                  fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" }}>{m.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: m.color,
                  fontFamily: "JetBrains Mono, monospace" }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Signal cards */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              Detected Signals ({data.signals?.length || 0})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {data.signals?.map((s, i) => (
                <div key={i} className={`signal-card ${s.direction === "bullish" ? "bull" : s.direction === "bearish" ? "bear" : "neu"}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "JetBrains Mono, monospace",
                      color: s.direction === "bullish" ? "#00d4a0" : s.direction === "bearish" ? "#ff4466" : "#94a3b8" }}>
                      {s.type}
                    </span>
                    <span style={{
                      fontSize: 9.5, padding: "1px 7px", borderRadius: 4,
                      background: s.strength === "strong" ? "#2d1b69" : "#0a1220",
                      color: s.strength === "strong" ? "#a78bfa" : "#475569",
                      fontFamily: "JetBrains Mono, monospace",
                    }}>{s.strength}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>{s.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Backtest */}
          {data.backtest && (
            <div style={{
              padding: "14px 18px", background: "#0c0f1a",
              border: "1px solid #a78bfa30", borderRadius: 10,
            }}>
              <div style={{ fontSize: 10, color: "#6d28d9", fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Backtest Result
              </div>
              <div style={{ fontSize: 12.5, color: "#94a3b8", fontFamily: "JetBrains Mono, monospace",
                lineHeight: 1.6 }}>{data.backtest}</div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
