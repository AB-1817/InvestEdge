import { useState, useEffect } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const Icon = ({ d, size = 16, stroke = "currentColor", strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS = {
  compass:  "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z",
  refresh:  "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  robot:    "M12 2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zM9 12h6M9 16h4",
  warn:     "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  check:    "M20 6L9 17l-5-5",
  ema:      "M3 12h4l3-8 4 16 3-8h4",
  perf:     "M18 20V10M12 20V4M6 20v-6",
};

const REGIME_THEMES = {
  "Bull Run":        { bg: "linear-gradient(135deg, #065f46 0%, #047857 100%)", badge: "#dcfce7", badgeText: "#16a34a" },
  "Bear Phase":      { bg: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)", badge: "#fee2e2", badgeText: "#dc2626" },
  "Sideways Chop":   { bg: "linear-gradient(135deg, #78350f 0%, #d97706 100%)", badge: "#fef3c7", badgeText: "#d97706" },
  "High Volatility": { bg: "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 100%)", badge: "#ede9fe", badgeText: "#7c3aed" },
};

function MetricBox({ label, value, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "14px 18px", backdropFilter: "blur(8px)" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "#fff" }}>{value}</div>
    </div>
  );
}

export default function MarketRegime() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  async function fetchRegime() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/market/regime`);
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchRegime();
    const t = setInterval(fetchRegime, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(t);
  }, []);

  const theme = data ? (REGIME_THEMES[data.regime] || REGIME_THEMES["Sideways Chop"]) : null;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", background: c("--bg-base") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: c("--text-primary"), marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}><Icon d={ICONS.compass} size={22} stroke={c("--text-primary")} />Market Regime Detector</h1>
          <p style={{ fontSize: 13, color: c("--text-secondary") }}>Real-time classification of Nifty 50 market phase using EMA, RSI & ATR</p>
        </div>
        <button onClick={fetchRegime} disabled={loading}
          style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon d={ICONS.refresh} size={14} />{loading ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {loading && !data && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div style={{ width: 44, height: 44, border: "4px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: c("--text-secondary"), fontSize: 14 }}>Detecting market regime…</div>
        </div>
      )}

      {error && <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#dc2626", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.warn} size={15} stroke="#dc2626" />{error}</div>}

      {data && (
        <>
          {/* Hero Regime Card */}
          <div style={{ background: theme.bg, borderRadius: 20, padding: "40px 48px", marginBottom: 28, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -60, top: -60, width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
            <div style={{ position: "absolute", right: 60, bottom: -80, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{data.regime}</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Active for ~{data.regime_days} trading days</div>
                </div>
              </div>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, maxWidth: 600, marginBottom: 28 }}>{data.description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <MetricBox label="Nifty 50" value={data.metrics.nifty?.toLocaleString("en-IN")} />
                <MetricBox label="RSI" value={data.metrics.rsi} color={data.metrics.rsi > 70 ? "#fca5a5" : data.metrics.rsi < 30 ? "#86efac" : "#fff"} />
                <MetricBox label="20-Day Return" value={`${data.metrics.ret_20d >= 0 ? "+" : ""}${data.metrics.ret_20d}%`} color={data.metrics.ret_20d >= 0 ? "#86efac" : "#fca5a5"} />
                <MetricBox label="ATR %" value={`${data.metrics.atr_pct}%`} color={data.metrics.atr_pct > 1.2 ? "#fca5a5" : "#fff"} />
              </div>
            </div>
          </div>

          {/* EMA Structure */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary"), marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.ema} size={15} stroke={c("--text-muted")} />EMA Structure</div>
              {[
                { label: "Current Price", val: data.metrics.nifty?.toLocaleString("en-IN"), prefix: "₹" },
                { label: "EMA 20", val: data.metrics.ema20?.toLocaleString("en-IN"), prefix: "₹" },
                { label: "EMA 50", val: data.metrics.ema50?.toLocaleString("en-IN"), prefix: "₹" },
              ].map((row, i) => {
                const isPrice = i === 0;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${c("--border")}` : "none" }}>
                    <span style={{ fontSize: 13, color: c("--text-muted") }}>{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: isPrice ? 700 : 500, color: c("--text-primary") }}>{row.prefix}{row.val}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: data.metrics.nifty > data.metrics.ema20 ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)", fontSize: 12, color: data.metrics.nifty > data.metrics.ema20 ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon d={data.metrics.nifty > data.metrics.ema20 ? ICONS.check : ICONS.warn} size={13} stroke={data.metrics.nifty > data.metrics.ema20 ? "#16a34a" : "#ef4444"} />
                    {data.metrics.nifty > data.metrics.ema20 ? "Price above EMA20 — bullish structure" : "Price below EMA20 — bearish structure"}
                  </span>
              </div>
            </div>

            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary"), marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.perf} size={15} stroke={c("--text-muted")} />Performance</div>
              {[
                { label: "20-Day Return", val: data.metrics.ret_20d },
                { label: "60-Day Return", val: data.metrics.ret_60d },
              ].map((row, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: c("--text-muted") }}>{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: row.val >= 0 ? "#16a34a" : "#ef4444" }}>{row.val >= 0 ? "+" : ""}{row.val}%</span>
                  </div>
                  <div style={{ height: 8, background: c("--border"), borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(Math.abs(row.val) * 5, 100)}%`, height: "100%", background: row.val >= 0 ? "#16a34a" : "#ef4444", borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              ))}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: c("--bg-surface"), fontSize: 12, color: c("--text-secondary") }}>
                RSI {data.metrics.rsi} — {data.metrics.rsi > 70 ? "Overbought zone" : data.metrics.rsi < 30 ? "Oversold zone" : "Neutral zone"}
              </div>
            </div>
          </div>

          {/* AI Insight */}
          <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary"), marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.robot} size={15} stroke={c("--text-muted")} />AI Market Insight</div>
            <div style={{ fontSize: 14, color: c("--text-secondary"), lineHeight: 1.8 }}>{data.ai_insight}</div>
          </div>

          {lastRefresh && (
            <div style={{ fontSize: 11, color: c("--text-muted"), textAlign: "right" }}>
              Last updated: {lastRefresh.toLocaleTimeString("en-IN")}
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
