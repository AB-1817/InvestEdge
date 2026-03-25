import { useState } from "react";

const BACKEND = "http://localhost:8000";

const CAT_COLORS = {
  valuation: "#f59e0b",
  growth:    "#00d4a0",
  quality:   "#3b82f6",
  analyst:   "#a78bfa",
  income:    "#10b981",
  risk:      "#f97316",
};

function SignalPill({ s }) {
  const c = CAT_COLORS[s.cat] || "#64748b";
  const isPos = s.sentiment === "positive";
  return (
    <div style={{
      padding: "12px 14px",
      background: isPos ? "#001a10" : "#1a0a00",
      border: `1px solid ${c}25`,
      borderLeft: `3px solid ${c}`,
      borderRadius: 8,
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: c, fontFamily: "JetBrains Mono, monospace" }}>
          {s.type}
        </span>
        <span style={{
          fontSize: 9.5, padding: "2px 7px", borderRadius: 4,
          background: c + "20", color: c,
          fontFamily: "JetBrains Mono, monospace",
          textTransform: "uppercase",
        }}>{s.cat}</span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, fontFamily: "Inter, sans-serif" }}>
        {s.detail}
      </div>
    </div>
  );
}

function FundStat({ label, value, color }) {
  if (!value) return null;
  return (
    <div style={{
      padding: "10px 14px", background: "#0a1220",
      border: "1px solid #0f1e33", borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, color: "#334155", marginBottom: 3,
        textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "JetBrains Mono, monospace" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "#e2e8f0",
        fontFamily: "JetBrains Mono, monospace" }}>
        {value}
      </div>
    </div>
  );
}

export default function OpportunityRadar() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/opportunity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const posSignals = data?.signals?.filter(s => s.sentiment === "positive") || [];
  const cautSignals = data?.signals?.filter(s => s.sentiment === "caution") || [];

  const quickSuggestions = ["RELIANCE", "INFY", "HDFCBANK", "TCS", "WIPRO", "BAJFINANCE"];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px" }}>
      {/* Header */}
      <div className="section-header">
        <div className="section-icon" style={{ background: "#1a0800", border: "1px solid #f9731630" }}>🔭</div>
        <div>
          <div className="section-title">Opportunity Radar</div>
          <div className="section-sub">The Scout — NLP on Fundamentals & Filings</div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        padding: "14px 16px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 10, marginBottom: 24,
        fontSize: 13, color: "#64748b", lineHeight: 1.6, fontFamily: "Inter, sans-serif",
      }}>
        Analyzes <strong style={{ color: "#94a3b8" }}>SEBI filings & fundamental data</strong> to detect
        valuation opportunities, growth signals, analyst consensus, management quality, and balance sheet risks.
        Detects: <span style={{ color: "#f97316" }}>Management Tone Shifts · Capital Allocation Signals · Operational Anomalies</span>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          className="input"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Enter stock symbol… RELIANCE, INFY, HDFCBANK"
          style={{ flex: 1, fontFamily: "JetBrains Mono, monospace" }}
        />
        <button
          className="btn btn-primary"
          onClick={analyze}
          disabled={!symbol.trim() || loading}
          style={{ minWidth: 120, background: "linear-gradient(135deg,#92400e,#f97316)" }}
        >
          {loading ? "Scanning…" : "🔭 Scout"}
        </button>
      </div>

      {/* Quick suggestions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        {quickSuggestions.map(s => (
          <button key={s} onClick={() => { setSymbol(s); }} style={{
            padding: "5px 12px", borderRadius: 6,
            border: "1px solid #0f1e33", background: "#080e1a",
            color: "#475569", fontSize: 11.5, cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "#f97316"; e.target.style.color = "#f97316"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#0f1e33"; e.target.style.color = "#475569"; }}
          >{s}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #0f1e33",
            borderTopColor: "#f97316", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Scanning fundamentals for {symbol}…
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 18px", background: "#1f0010",
          border: "1px solid #ff446640", borderRadius: 10,
          color: "#ff7a9a", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
          ⚠️ {error}
          <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
            Make sure backend is running: uvicorn main:app --reload --port 8000
          </div>
        </div>
      )}

      {/* Results */}
      {data && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          {/* Company header */}
          <div style={{
            padding: "18px 20px", background: "#0a1220",
            border: "1px solid #0f1e33", borderRadius: 12, marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0",
                fontFamily: "Outfit, sans-serif" }}>{data.name}</div>
              <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                {data.display} · {data.sector} · {data.market_cap}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#e2e8f0",
                fontFamily: "JetBrains Mono, monospace" }}>
                ₹{data.current_price?.toLocaleString("en-IN")}
              </div>
              {data.analyst?.upside_pct != null && (
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: data.analyst.upside_pct > 0 ? "#00d4a0" : "#ff4466",
                  fontFamily: "JetBrains Mono, monospace",
                }}>
                  {data.analyst.upside_pct > 0 ? "+" : ""}{data.analyst.upside_pct}% analyst upside
                </div>
              )}
            </div>
          </div>

          {/* Fundamentals grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            <FundStat label="Trailing P/E"  value={data.fundamentals?.pe}           color="#f59e0b" />
            <FundStat label="Forward P/E"   value={data.fundamentals?.fwd_pe}        color="#f59e0b" />
            <FundStat label="P/B Ratio"     value={data.fundamentals?.pb}            color="#f59e0b" />
            <FundStat label="ROE"           value={data.fundamentals?.roe}           color="#00d4a0" />
            <FundStat label="Profit Margin" value={data.fundamentals?.profit_margin} color="#00d4a0" />
            <FundStat label="Rev. Growth"   value={data.fundamentals?.revenue_growth}  color="#3b82f6" />
            <FundStat label="EPS Growth"    value={data.fundamentals?.earnings_growth} color="#3b82f6" />
            <FundStat label="Debt/Equity"   value={data.fundamentals?.debt_equity}     color="#f97316" />
            <FundStat label="Beta"          value={data.fundamentals?.beta}            color="#94a3b8" />
            <FundStat label="Div. Yield"    value={data.fundamentals?.dividend_yield}  color="#10b981" />
          </div>

          {/* Analyst */}
          {data.analyst?.target_mean && (
            <div style={{
              padding: "14px 18px", background: "#0c0f1a",
              border: "1px solid #4f46e530", borderRadius: 10, marginBottom: 20,
              display: "flex", gap: 20, flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Consensus Target</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa",
                  fontFamily: "JetBrains Mono, monospace" }}>₹{data.analyst.target_mean}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Range</div>
                <div style={{ fontSize: 13, color: "#64748b", fontFamily: "JetBrains Mono, monospace" }}>
                  ₹{data.analyst.target_low} – ₹{data.analyst.target_high}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Recommendation</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#00d4a0",
                  fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" }}>
                  {data.analyst.recommendation} ({data.analyst.num_analysts} analysts)
                </div>
              </div>
            </div>
          )}

          {/* Signals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: "#00d4a0", fontFamily: "JetBrains Mono, monospace",
                marginBottom: 10, letterSpacing: "0.06em" }}>
                ✅ POSITIVE SIGNALS ({posSignals.length})
              </div>
              {posSignals.map((s, i) => <SignalPill key={i} s={s} />)}
              {posSignals.length === 0 && <div style={{ color: "#334155", fontSize: 12,
                fontFamily: "JetBrains Mono, monospace" }}>No positive signals</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#f97316", fontFamily: "JetBrains Mono, monospace",
                marginBottom: 10, letterSpacing: "0.06em" }}>
                ⚠️ CAUTION SIGNALS ({cautSignals.length})
              </div>
              {cautSignals.map((s, i) => <SignalPill key={i} s={s} />)}
              {cautSignals.length === 0 && <div style={{ color: "#334155", fontSize: 12,
                fontFamily: "JetBrains Mono, monospace" }}>No caution signals</div>}
            </div>
          </div>

          {/* News */}
          {data.news?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Recent News
              </div>
              {data.news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{
                  display: "block", padding: "10px 14px",
                  background: "#080e1a", border: "1px solid #0f1e33",
                  borderRadius: 8, marginBottom: 6,
                  textDecoration: "none", transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#1e3a66"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#0f1e33"}
                >
                  <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 3,
                    fontFamily: "Inter, sans-serif" }}>{n.title}</div>
                  <div style={{ fontSize: 10.5, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
                    {n.publisher} · {n.time}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
