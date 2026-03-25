import { useState } from "react";

const BACKEND = "http://localhost:8000";

const SAMPLE = `RELIANCE 50 2800
HDFCBANK 30 1650
INFY 100 1420
TCS 20 3800`;

function parseHoldings(raw) {
  const lines = raw.trim().split("\n");
  const holdings = [];
  for (const line of lines) {
    // Support: "RELIANCE 50 2800" or "RELIANCE — 50 shares at ₹2800"
    const m1 = line.match(/([A-Z]+)\s+(\d+(?:\.\d+)?)\s+[\u20b9₹]?(\d+(?:\.\d+)?)/i);
    const m2 = line.match(/([A-Z]+)[^0-9]*(\d+(?:\.\d+)?)[^0-9]*[\u20b9₹]?(\d+(?:\.\d+)?)/i);
    const m = m1 || m2;
    if (m) holdings.push({ symbol: m[1].toUpperCase(), qty: parseFloat(m[2]), avg_cost: parseFloat(m[3]) });
  }
  return holdings;
}

function PnlBar({ pct }) {
  const pos = pct >= 0;
  return (
    <div style={{ height: 6, background: "#0a1220", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{
        height: "100%", width: `${Math.min(Math.abs(pct) * 2, 100)}%`,
        background: pos ? "linear-gradient(90deg,#059669,#00d4a0)" : "linear-gradient(90deg,#dc2626,#ff4466)",
        borderRadius: 3, transition: "width 0.6s ease",
      }} />
    </div>
  );
}

export default function Portfolio() {
  const [raw, setRaw] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    const holdings = parseHoldings(raw);
    if (!holdings.length) { setError("Could not parse any holdings. Format: SYMBOL QTY AVGPRICE"); return; }
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const summary = data?.summary;
  const inProfit = summary && summary.total_pnl >= 0;

  const signalColor = sig => ({
    accumulate: "#00d4a0",
    hold:       "#3b82f6",
    review:     "#f97316",
  }[sig] || "#94a3b8");

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px" }}>
      <div className="section-header">
        <div className="section-icon" style={{ background: "#071a0a", border: "1px solid #00d4a030" }}>💼</div>
        <div>
          <div className="section-title">Portfolio Analyzer</div>
          <div className="section-sub">P&L · Risk · Per-Holding Signals</div>
        </div>
      </div>

      {/* Input */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
          marginBottom: 8, letterSpacing: "0.06em" }}>
          FORMAT: SYMBOL&nbsp;&nbsp;QUANTITY&nbsp;&nbsp;AVG_PRICE &nbsp;(one per line)
        </div>
        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={6}
          placeholder={"RELIANCE 50 2800\nHDFCBANK 30 1650\nINFY 100 1420"}
          style={{
            width: "100%", background: "#0a1220",
            border: "1px solid #0f1e33", borderRadius: 10,
            color: "#94a3b8", fontSize: 13, padding: "14px 16px",
            fontFamily: "JetBrains Mono, monospace", lineHeight: 1.8,
            outline: "none", resize: "vertical",
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = "#00d4a0"}
          onBlur={e => e.target.style.borderColor = "#0f1e33"}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
        <button
          className="btn btn-primary"
          onClick={analyze}
          disabled={!raw.trim() || loading}
          style={{ background: "linear-gradient(135deg,#065f46,#00d4a0)" }}
        >
          {loading ? "Analyzing…" : "💼 Analyze Portfolio"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setRaw(SAMPLE)}
        >Try Sample</button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #0f1e33",
            borderTopColor: "#00d4a0", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Fetching live prices & signals…
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
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total Invested", value: `₹${summary.total_invested?.toLocaleString("en-IN")}`, color: "#94a3b8" },
              { label: "Current Value",  value: `₹${summary.total_current?.toLocaleString("en-IN")}`, color: "#e2e8f0" },
              {
                label: "Total P&L",
                value: `${inProfit ? "+" : ""}₹${summary.total_pnl?.toLocaleString("en-IN")}`,
                color: inProfit ? "#00d4a0" : "#ff4466",
              },
              {
                label: "Return",
                value: `${inProfit ? "+" : ""}${summary.total_pnl_pct}%`,
                color: inProfit ? "#00d4a0" : "#ff4466",
              },
              { label: "Holdings", value: summary.count, color: "#3b82f6" },
            ].map(s => (
              <div key={s.label} style={{
                padding: "16px", background: "#0a1220",
                border: `1px solid ${s.color}25`, borderRadius: 10, textAlign: "center",
              }}>
                <div style={{ fontSize: 9.5, color: "#334155", marginBottom: 6,
                  textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "JetBrains Mono, monospace" }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color,
                  fontFamily: "JetBrains Mono, monospace" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Holdings table */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              Holdings Breakdown
            </div>
            {data.holdings?.map((h, i) => {
              if (h.error) return (
                <div key={i} style={{ padding: "12px 16px", background: "#1f0010",
                  borderRadius: 10, marginBottom: 8,
                  color: "#ff7a9a", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
                  {h.symbol} — Error: {h.error}
                </div>
              );
              const pos = h.pnl >= 0;
              return (
                <div key={i} style={{
                  padding: "16px 18px", background: "#080e1a",
                  border: "1px solid #0f1e33", borderRadius: 12, marginBottom: 10,
                  transition: "border-color 0.2s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#1e3a66"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#0f1e33"}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    {/* Left */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0",
                          fontFamily: "JetBrains Mono, monospace" }}>{h.symbol}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4,
                          background: signalColor(h.signal) + "20",
                          color: signalColor(h.signal),
                          fontFamily: "JetBrains Mono, monospace",
                          border: `1px solid ${signalColor(h.signal)}30`,
                          textTransform: "uppercase",
                        }}>{h.signal}</span>
                        {h.weight_pct && (
                          <span style={{ fontSize: 10, color: "#334155",
                            fontFamily: "JetBrains Mono, monospace" }}>
                            {h.weight_pct}% of portfolio
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>
                        {h.qty} × ₹{h.avg_cost} → ₹{h.current_price?.toLocaleString("en-IN")}
                      </div>
                      {h.signal_reason && (
                        <div style={{ fontSize: 11, color: "#334155", marginTop: 5,
                          fontFamily: "Inter, sans-serif", fontStyle: "italic" }}>
                          {h.signal_reason}
                        </div>
                      )}
                    </div>
                    {/* Right */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 17, fontWeight: 700,
                        color: pos ? "#00d4a0" : "#ff4466",
                        fontFamily: "JetBrains Mono, monospace" }}>
                        {pos ? "+" : ""}₹{h.pnl?.toLocaleString("en-IN")}
                      </div>
                      <div style={{ fontSize: 12, color: pos ? "#059669" : "#dc2626",
                        fontFamily: "JetBrains Mono, monospace" }}>
                        {pos ? "+" : ""}{h.pnl_pct}%
                      </div>
                    </div>
                  </div>
                  <PnlBar pct={h.pnl_pct} />
                  {/* Indicators row */}
                  <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                    {h.rsi != null && (
                      <span style={{ fontSize: 10, color: h.rsi < 35 ? "#00d4a0" : h.rsi > 65 ? "#ff4466" : "#475569",
                        fontFamily: "JetBrains Mono, monospace" }}>RSI {h.rsi?.toFixed(0)}</span>
                    )}
                    {h.ema20 != null && (
                      <span style={{ fontSize: 10, color: "#2196f3", fontFamily: "JetBrains Mono, monospace" }}>
                        EMA20 ₹{h.ema20?.toFixed(0)}
                      </span>
                    )}
                    {h.suggested_sl != null && (
                      <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: "JetBrains Mono, monospace" }}>
                        SL ₹{h.suggested_sl}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
