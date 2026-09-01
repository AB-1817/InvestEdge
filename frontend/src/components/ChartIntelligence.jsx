import { useState, useRef, useEffect } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const QUICK = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "BAJFINANCE", "SBIN", "ICICIBANK", "TATAMOTORS"];
const PERIODS = [{ label: "3M", value: "3mo" }, { label: "6M", value: "6mo" }, { label: "1Y", value: "1y" }];

function StockChart({ data, symbol, signals }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!data?.length || !ref.current) return;
    const canvas = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const pad = { t: 24, r: 72, b: 40, l: 16 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;

    // Background
    ctx.fillStyle = "#0f1117"; ctx.fillRect(0, 0, W, H);

    const prices = data.flatMap(d => [d.high, d.low]).filter(Boolean);
    const minP = Math.min(...prices) * 0.998;
    const maxP = Math.max(...prices) * 1.002;
    const xS = i => pad.l + (i / (data.length - 1)) * cW;
    const yS = p => pad.t + cH - ((p - minP) / (maxP - minP)) * cH;

    // Grid lines
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + (i / 5) * cH;
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      const price = maxP - (i / 5) * (maxP - minP);
      ctx.fillStyle = "#4b5563"; ctx.font = "10px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`₹${price >= 1000 ? price.toFixed(0) : price.toFixed(1)}`, W - pad.r + 8, y + 4);
    }

    // Vertical grid
    const step = Math.floor(data.length / 6);
    data.forEach((d, i) => {
      if (i % step === 0) {
        const x = xS(i);
        ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + cH); ctx.stroke();
        if (d.time) {
          ctx.fillStyle = "#4b5563"; ctx.font = "10px 'Inter', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(d.time.slice(5), x, H - 10);
        }
      }
    });

    // EMA lines
    const drawLine = (pts, color, dash = []) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.stroke(); ctx.setLineDash([]);
    };
    drawLine(data.map((d, i) => d.ema20 ? [xS(i), yS(d.ema20)] : null).filter(Boolean), "#3b82f6");
    drawLine(data.map((d, i) => d.ema50 ? [xS(i), yS(d.ema50)] : null).filter(Boolean), "#f97316");

    // Candles
    const cw = Math.max(2, Math.floor(cW / data.length) - 1);
    data.forEach((d, i) => {
      if (!d.open || !d.close || !d.high || !d.low) return;
      const x = xS(i);
      const up = d.close >= d.open;
      const col = up ? "#22c55e" : "#ef4444";
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yS(d.high)); ctx.lineTo(x, yS(d.low)); ctx.stroke();
      const bT = yS(Math.max(d.open, d.close));
      const bH = Math.max(1, yS(Math.min(d.open, d.close)) - bT);
      ctx.fillStyle = up ? "#22c55e" : "#ef4444";
      ctx.fillRect(x - cw / 2, bT, cw, bH);
    });

    // Last price line
    const last = data[data.length - 1];
    if (last?.close) {
      const y = yS(last.close);
      ctx.strokeStyle = "rgba(234,179,8,0.6)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#eab308"; ctx.font = "bold 10px 'Inter', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`₹${last.close >= 1000 ? last.close.toFixed(0) : last.close.toFixed(1)}`, W - pad.r + 8, y + 4);
    }
  }, [data, symbol]);

  const bull = signals?.filter(s => s.direction === "bullish").length || 0;
  const bear = signals?.filter(s => s.direction === "bearish").length || 0;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937", background: "#0f1117" }}>
      {/* Chart legend */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 20, borderBottom: "1px solid #1f2937" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#f9fafb", fontFamily: "Inter, sans-serif" }}>{symbol}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#3b82f6", fontFamily: "Inter, sans-serif" }}>
          <span style={{ width: 16, height: 2, background: "#3b82f6", display: "inline-block", borderRadius: 1 }} /> EMA 20
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#f97316", fontFamily: "Inter, sans-serif" }}>
          <span style={{ width: 16, height: 2, background: "#f97316", display: "inline-block", borderRadius: 1 }} /> EMA 50
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280", fontFamily: "Inter, sans-serif", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#22c55e", display: "inline-flex", alignItems: "center", gap: 3 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
            {bull} bullish
          </span>
          <span style={{ margin: "0 4px", color: "#374151" }}>·</span>
          <span style={{ color: "#ef4444", display: "inline-flex", alignItems: "center", gap: 3 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
            {bear} bearish
          </span>
        </span>
      </div>
      <canvas ref={ref} style={{ width: "100%", height: 320, display: "block" }} />
      {/* Signal pills */}
      {signals?.length > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6, borderTop: "1px solid #1f2937" }}>
          {signals.map((s, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "3px 9px", borderRadius: 4,
              fontFamily: "Inter, sans-serif", fontWeight: 500,
              background: s.direction === "bullish" ? "rgba(34,197,94,0.12)" : s.direction === "bearish" ? "rgba(239,68,68,0.12)" : "rgba(107,114,128,0.12)",
              color: s.direction === "bullish" ? "#22c55e" : s.direction === "bearish" ? "#ef4444" : "#9ca3af",
              border: `1px solid ${s.direction === "bullish" ? "rgba(34,197,94,0.25)" : s.direction === "bearish" ? "rgba(239,68,68,0.25)" : "rgba(107,114,128,0.2)"}`,
            }}>{s.type}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const c = (n) => `var(${n})`;

export default function ChartIntelligence({ onNav }) {
  const [symbol, setSymbol] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function analyze(sym = symbol, per = period) {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/patterns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s, period: per }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const price = data?.price;
  const biasColor = data?.bias === "bullish" ? "#22c55e" : data?.bias === "bearish" ? "#ef4444" : "#9ca3af";

  return (
    <div style={{ height: "100%", overflowY: "auto", background: c("--bg-base") }}>
      {/* Top bar */}
      <div style={{ background: c("--bg-elevated"), borderBottom: `1px solid ${c("--border")}`, padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, position: "relative", maxWidth: 480 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="Search symbol — RELIANCE, TCS, HDFCBANK..."
            style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-base"), color: c("--text-primary"), fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none" }}
          />
        </div>
        {/* Period selector */}
        <div style={{ display: "flex", background: c("--bg-surface"), borderRadius: 8, padding: 3, gap: 2 }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => { setPeriod(p.value); if (symbol.trim()) analyze(symbol, p.value); }} style={{
              padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: period === p.value ? c("--bg-elevated") : "transparent",
              color: period === p.value ? c("--text-primary") : c("--text-muted"),
              fontSize: 13, fontWeight: period === p.value ? 600 : 400,
              fontFamily: "Inter, sans-serif",
              boxShadow: period === p.value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s",
            }}>{p.label}</button>
          ))}
        </div>
        <button
          onClick={() => analyze()}
          disabled={!symbol.trim() || loading}
          style={{
            padding: "10px 24px", borderRadius: 8, border: "none",
            background: symbol.trim() && !loading ? "#047857" : "#e5e7eb",
            color: "#ffffff", fontSize: 14, fontWeight: 600,
            cursor: symbol.trim() && !loading ? "pointer" : "not-allowed",
            fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 8,
            transition: "background 0.15s",
          }}
        >
          {loading ? (
            <>
              <svg style={{ animation: "spin 0.8s linear infinite" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              Analyzing
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Analyze
            </>
          )}
        </button>
      </div>

      <div style={{ padding: "24px 32px" }}>
        {/* Quick suggestions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {QUICK.map(s => (
            <button key={s} onClick={() => { setSymbol(s); analyze(s, period); }} style={{
              padding: "5px 12px", borderRadius: 6, border: `1px solid ${c("--border")}`,
              background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#047857"; e.currentTarget.style.color = "#047857"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.color = ""; }}
            >{s}</button>
          ))}
        </div>

        {/* Empty state */}
        {!data && !loading && !error && (
          <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: "80px 40px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(4,120,87,0.1)", border: "1px solid rgba(4,120,87,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 8 }}>Chart Intelligence</h2>
            <p style={{ fontSize: 14, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", maxWidth: 400, margin: "0 auto" }}>
              Enter any NSE/BSE symbol to run technical analysis — RSI, MACD, EMA crossovers, Bollinger Bands, volume signals and more.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 60, textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${c("--border")}`, borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, color: c("--text-secondary"), fontFamily: "Inter, sans-serif" }}>Running technical analysis on {symbol}...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
            {error}
          </div>
        )}

        {data && (
          <div>
            {/* Price header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", marginBottom: 4 }}>{data.display} · NSE</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif", letterSpacing: "-0.02em" }}>
                    ₹{price?.current?.toLocaleString("en-IN")}
                  </span>
                  {price?.change_pct != null && (
                    <span style={{ fontSize: 16, fontWeight: 600, color: price.change_pct >= 0 ? "#16a34a" : "#dc2626", fontFamily: "Inter, sans-serif", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {price.change_pct >= 0 ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                      )}
                      {Math.abs(price.change_pct)}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginTop: 4 }}>
                  O: ₹{price?.open} &nbsp;·&nbsp; H: ₹{price?.high} &nbsp;·&nbsp; L: ₹{price?.low}
                </div>
              </div>
              {/* Bias badge */}
              <div style={{
                padding: "10px 20px", borderRadius: 10,
                background: data.bias === "bullish" ? "rgba(22,163,74,0.08)" : data.bias === "bearish" ? "rgba(239,68,68,0.08)" : c("--bg-elevated"),
                border: `1px solid ${data.bias === "bullish" ? "rgba(22,163,74,0.25)" : data.bias === "bearish" ? "rgba(239,68,68,0.25)" : c("--border")}`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginBottom: 4, letterSpacing: "0.05em" }}>OVERALL BIAS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: biasColor, fontFamily: "Inter, sans-serif", textTransform: "uppercase" }}>{data.bias}</div>
                <div style={{ fontSize: 11, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{data.bias_counts?.bullish} <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg></span>
                  <span>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{data.bias_counts?.bearish} <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg></span>
                </div>
              </div>
            </div>

            {/* Chart */}
            {data.chart_data?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <StockChart data={data.chart_data} symbol={data.display} signals={data.signals} />
              </div>
            )}

            {/* Metrics strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
              {[
                {
                  label: "RELATIVE STRENGTH",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></svg>,
                  value: price?.rsi?.toFixed(1),
                  sub: price?.rsi < 35 ? "Oversold (30)" : price?.rsi > 65 ? "Overbought (70)" : "Neutral Zone",
                  subColor: price?.rsi < 35 ? "#16a34a" : price?.rsi > 65 ? "#ef4444" : "#6b7280",
                  bar: price?.rsi ? price.rsi / 100 : null, barColor: price?.rsi < 35 ? "#16a34a" : price?.rsi > 65 ? "#ef4444" : "#047857",
                },
                {
                  label: "EMA 200 CROSS",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={price?.current && price?.ema200 ? (price.current > price.ema200 ? "#16a34a" : "#ef4444") : "#6b7280"} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
                  value: price?.ema200 ? `₹${price.ema200.toFixed(0)}` : null,
                  sub: price?.current && price?.ema200 ? (price.current > price.ema200 ? "Price above long-term" : "Price below long-term") : "",
                  subColor: price?.current && price?.ema200 ? (price.current > price.ema200 ? "#16a34a" : "#ef4444") : "#6b7280",
                  bar: null,
                },
                {
                  label: "MACD DIVERGENCE",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                  value: price?.ema20 && price?.ema50 ? Math.abs(price.ema20 - price.ema50).toFixed(1) : null,
                  sub: price?.ema20 && price?.ema50 ? (price.ema20 > price.ema50 ? "Positive Arc" : "Negative Arc") : "",
                  subColor: price?.ema20 && price?.ema50 ? (price.ema20 > price.ema50 ? "#16a34a" : "#ef4444") : "#6b7280",
                  bar: null,
                },
                {
                  label: "VOLATILITY BANDS",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5"><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>,
                  value: price?.atr ? `${((price.atr / price.current) * 100).toFixed(1)}%` : null,
                  sub: price?.atr && price.current ? (price.atr / price.current > 0.025 ? "Squeeze Imminent" : price.atr / price.current > 0.015 ? "Moderate Range" : "Tight Range") : "",
                  subColor: "#d97706",
                  bar: price?.atr && price?.current ? Math.min(1, (price.atr / price.current) / 0.04) : null,
                  barColor: "#d97706",
                },
                {
                  label: "52W HIGH",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>,
                  value: price?.["52w_high"] ? `₹${price["52w_high"].toFixed(0)}` : null,
                  sub: price?.current && price?.["52w_high"] ? `${(((price["52w_high"] - price.current) / price["52w_high"]) * 100).toFixed(1)}% from top` : "",
                  subColor: "#6b7280", bar: null,
                },
                {
                  label: "52W LOW",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
                  value: price?.["52w_low"] ? `₹${price["52w_low"].toFixed(0)}` : null,
                  sub: price?.current && price?.["52w_low"] ? `${(((price.current - price["52w_low"]) / price["52w_low"]) * 100).toFixed(1)}% above base` : "",
                  subColor: "#6b7280", bar: null,
                },
              ].filter(m => m.value).map((m, i) => (
                <div key={i} style={{
                  padding: "16px", background: c("--bg-elevated"),
                  border: `1px solid ${c("--border")}`, borderRadius: 12,
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  {/* Label + icon row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", fontWeight: 500, letterSpacing: "0.06em" }}>{m.label}</span>
                    <span style={{ fontSize: 13, color: m.iconColor, fontWeight: 700 }}>{m.icon}</span>
                  </div>
                  {/* Value */}
                  <div style={{ fontSize: 22, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif", lineHeight: 1.1 }}>
                    {m.value}
                    {m.label === "RELATIVE STRENGTH" && (
                      <span style={{ fontSize: 12, fontWeight: 500, color: m.subColor, marginLeft: 6 }}>{m.sub}</span>
                    )}
                  </div>
                  {/* Sub text */}
                  {m.label !== "RELATIVE STRENGTH" && (
                    <div style={{ fontSize: 11, color: m.subColor, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>{m.sub}</div>
                  )}
                  {/* Progress bar */}
                  {m.bar != null && (
                    <div style={{ marginTop: 8, height: 3, background: c("--border"), borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(m.bar * 100)}%`, height: "100%", background: m.barColor, borderRadius: 2, transition: "width 0.6s ease" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Signals */}
            {data.signals?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>
                    Detected Signals
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#ffffff", background: "#047857", borderRadius: 20, padding: "2px 8px" }}>{data.signals.length}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, fontFamily: "Inter, sans-serif", alignItems: "center" }}>
                    <span style={{ color: "#16a34a", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                      {data.bias_counts?.bullish} Bullish
                    </span>
                    <span style={{ color: "#9ca3af" }}>·</span>
                    <span style={{ color: "#ef4444", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                      {data.bias_counts?.bearish} Bearish
                    </span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {data.signals.map((s, i) => {
                    const isBull = s.direction === "bullish";
                    const isBear = s.direction === "bearish";
                    const accentColor = isBull ? "#16a34a" : isBear ? "#ef4444" : "#9ca3af";
                    const strengthBg = s.strength === "strong" ? "#ede9fe" : s.strength === "moderate" ? "#dbeafe" : "#f3f4f6";
                    const strengthColor = s.strength === "strong" ? "#7c3aed" : s.strength === "moderate" ? "#1d4ed8" : "#6b7280";
                    return (
                      <div key={i} style={{
                        background: c("--bg-elevated"), border: `1px solid ${c("--border")}`,
                        borderRadius: 12, padding: "14px 16px",
                        borderLeft: `3px solid ${accentColor}`,
                        display: "flex", flexDirection: "column", gap: 8,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "Inter, sans-serif", color: accentColor, letterSpacing: "0.02em" }}>{s.type.toUpperCase()}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontFamily: "Inter, sans-serif", fontWeight: 600, background: strengthBg, color: strengthColor }}>{s.strength}</span>
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>{s.detail}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Backtest */}
            {data.backtest && (
              <div style={{ background: c("--bg-elevated"), border: `1px solid ${c("--border")}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ padding: "10px 16px", background: "rgba(124,58,237,0.08)", borderBottom: `1px solid rgba(124,58,237,0.2)`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", fontFamily: "Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>Quantitative Signal Evidence</span>
                  </div>
                  {onNav && (
                    <button
                      onClick={() => onNav("backtest")}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      Run Full Backtest →
                    </button>
                  )}
                </div>
                <div style={{ padding: "14px 16px", fontSize: 13, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.7 }}>{data.backtest}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
