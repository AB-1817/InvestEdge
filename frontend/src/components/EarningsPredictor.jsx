import { useState } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const Icon = ({ d, size = 16, stroke = "currentColor", strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS = {
  chart:  "M18 20V10M12 20V4M6 20v-6",
  search: "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z",
  robot:  "M12 2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zM9 12h6M9 16h4",
  warn:   "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  back:   "M19 12H5M12 5l-7 7 7 7",
  signal: "M22 12h-4l-3 9L9 3l-3 9H2",
  metric: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2",
};

const POPULAR = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "SBIN", "BAJFINANCE", "ICICIBANK", "WIPRO", "TATAMOTORS", "LT", "AXISBANK", "MARUTI"];

function ProbMeter({ prob, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: c("--text-muted") }}>Miss</span>
        <span style={{ fontSize: 12, color: c("--text-muted") }}>Beat</span>
      </div>
      <div style={{ height: 12, background: c("--border"), borderRadius: 6, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${prob}%`, background: `linear-gradient(90deg, #ef4444, #d97706, ${color})`, borderRadius: 6, transition: "width 1s ease" }} />
        <div style={{ position: "absolute", left: `${prob}%`, top: -4, transform: "translateX(-50%)", width: 4, height: 20, background: "#fff", borderRadius: 2, boxShadow: "0 0 4px rgba(0,0,0,0.3)" }} />
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 32, fontWeight: 800, color, fontFamily: "Inter" }}>{prob}%</div>
    </div>
  );
}

export default function EarningsPredictor() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function predict(sym) {
    const s = (sym || symbol).trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/earnings/predict/${s}`);
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", background: c("--bg-base") }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: c("--text-primary"), marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}><Icon d={ICONS.chart} size={22} stroke={c("--text-primary")} />Earnings Surprise Predictor</h1>
        <p style={{ fontSize: 13, color: c("--text-secondary") }}>AI-powered beat/miss probability using price action, volume, news sentiment & analyst data</p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && predict()}
          placeholder="Enter NSE symbol (e.g. RELIANCE)"
          style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-primary"), fontSize: 14, outline: "none" }}
          onFocus={e => e.target.style.borderColor = "#047857"}
          onBlur={e => e.target.style.borderColor = c("--border")}
        />
        <button onClick={() => predict()} disabled={!symbol.trim() || loading}
          style={{ padding: "11px 24px", borderRadius: 10, border: "none", background: "#047857", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
          <Icon d={ICONS.search} size={15} stroke="#fff" />{loading ? "Predicting…" : "Predict"}
        </button>
      </div>

      {/* Quick picks */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {POPULAR.map(s => (
          <button key={s} onClick={() => { setSymbol(s); predict(s); }}
            style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ width: 40, height: 40, border: "4px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: c("--text-secondary"), fontSize: 14 }}>Analyzing earnings signals…</div>
        </div>
      )}

      {error && <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#dc2626", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.warn} size={15} stroke="#dc2626" />{error}</div>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
          {/* Left: Meter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c("--text-primary"), marginBottom: 4 }}>{data.symbol}</div>
              <div style={{ fontSize: 13, color: c("--text-muted"), marginBottom: 20 }}>Earnings Beat Probability</div>
              <ProbMeter prob={data.beat_probability} color={data.verdict_color} />
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <span style={{ padding: "6px 20px", borderRadius: 20, background: `${data.verdict_color}18`, color: data.verdict_color, fontSize: 14, fontWeight: 700 }}>
                  {data.verdict}
                </span>
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}><Icon d={ICONS.metric} size={14} stroke={c("--text-muted")} />Key Metrics</div>
              {[
                { label: "RSI", val: data.metrics.rsi },
                { label: "10-Day Return", val: `${data.metrics.ret_10d >= 0 ? "+" : ""}${data.metrics.ret_10d}%`, color: data.metrics.ret_10d >= 0 ? "#16a34a" : "#ef4444" },
                { label: "Volume Ratio", val: `${data.metrics.vol_ratio}x` },
                { label: "News Sentiment", val: data.metrics.news_sentiment, color: data.metrics.news_sentiment === "positive" ? "#16a34a" : data.metrics.news_sentiment === "negative" ? "#ef4444" : "#d97706" },
                { label: "Analyst Rec", val: data.metrics.analyst_rec?.replace("_", " ").toUpperCase() || "—" },
                { label: "Upside to Target", val: data.metrics.upside_pct != null ? `${data.metrics.upside_pct >= 0 ? "+" : ""}${data.metrics.upside_pct}%` : "—", color: data.metrics.upside_pct >= 0 ? "#16a34a" : "#ef4444" },
              ].map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 5 ? `1px solid ${c("--border")}` : "none" }}>
                  <span style={{ fontSize: 12, color: c("--text-muted") }}>{m.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: m.color || c("--text-primary") }}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Factors + AI */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Factors */}
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary"), marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.signal} size={15} stroke={c("--text-muted")} />Signal Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.factors.map((f, i) => {
                  const pos = f.impact.startsWith("+");
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 16px", borderRadius: 10, background: pos ? "rgba(22,163,74,0.06)" : "rgba(239,68,68,0.06)", borderLeft: `3px solid ${pos ? "#16a34a" : "#ef4444"}` }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pos ? "#16a34a" : "#ef4444", minWidth: 32 }}>{f.impact}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c("--text-primary"), marginBottom: 2 }}>{f.factor}</div>
                        <div style={{ fontSize: 12, color: c("--text-muted") }}>{f.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Analysis */}
            <div style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.robot} size={15} stroke="rgba(255,255,255,0.8)" />AI Earnings Analysis</div>
              <div style={{ fontSize: 14, color: "#c7d2fe", lineHeight: 1.8 }}>{data.ai_analysis}</div>
            </div>

            <button onClick={() => setData(null)}
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 14, cursor: "pointer", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon d={ICONS.back} size={15} />Predict Another Stock
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
