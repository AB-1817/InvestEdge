import { useState, useEffect } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const STOCK_TABS = ["DLF", "RELIANCE", "INFY", "HDFCBANK", "TCS", "WIPRO", "BAJFINANCE"];

function cleanAiText(text) {
  if (!text) return "";
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (cleaned.includes("<think>")) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, "").trim();
  }
  return cleaned.replace(/<\/?think>/gi, "").trim();
}
export default function StocksAnalysis() {
  const [activeStock, setActiveStock] = useState("DLF");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [orchestrated, setOrchestrated] = useState(null);
  const [orchestratedLoading, setOrchestratedLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);

  useEffect(() => {
    fetchStockData(activeStock);
    fetchOrchestratedData(activeStock);
  }, [activeStock]);

  async function fetchStockData(symbol) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`${BACKEND}/api/opportunity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrchestratedData(symbol) {
    setOrchestratedLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/orchestrate/explain/${symbol}`);
      if (res.ok) {
        setOrchestrated(await res.json());
      }
    } catch (e) {
      console.warn("Orchestrated explain fetch error:", e);
    } finally {
      setOrchestratedLoading(false);
    }
  }

  function handleScout() {
    const sym = searchInput.trim().toUpperCase();
    const target = sym || activeStock;
    if (sym && !STOCK_TABS.includes(sym)) {
      setActiveStock(sym);
    }
    fetchStockData(target);
    fetchOrchestratedData(target);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleScout();
  }

  const getSignalType = () => {
    if (!data?.signals) return "Hold";
    const pos = data.signals.filter(s => s.sentiment === "positive").length;
    const caut = data.signals.filter(s => s.sentiment === "caution").length;
    if (pos >= 5) return "Strong Buy";
    if (pos >= 3) return "Buy";
    if (pos >= 1) return "Moderate Buy";
    if (caut > pos) return "Hold";
    return "Buy";
  };

  const signalType = getSignalType();
  const signalBg =
    signalType === "Strong Buy" ? "linear-gradient(135deg,#065f46 0%,#047857 100%)" :
    signalType === "Buy" ? "linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%)" :
    signalType === "Moderate Buy" ? "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)" :
    "linear-gradient(135deg,#374151 0%,#4b5563 100%)";

  const positiveSignals = data?.signals?.filter(s => s.sentiment === "positive") || [];
  const cautionSignals  = data?.signals?.filter(s => s.sentiment === "caution")  || [];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "32px 40px", background: c("--bg-base") }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
          Stocks Analysis
        </h1>
        <p style={{ fontSize: 14, color: c("--text-secondary"), fontFamily: "Inter, sans-serif" }}>
          AI-driven algorithmic scoring to identify asymmetric risk-reward setups in the NIFTY 500 universe.
        </p>
      </div>

      {/* Stock Tabs + Search + Scout */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="Search stock… (e.g. TATAMOTORS)"
          style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
            background: c("--bg-elevated"), color: c("--text-primary"), fontSize: 13,
            fontFamily: "Inter, sans-serif", width: 220, outline: "none",
          }}
        />
        {STOCK_TABS.map(stock => (
          <button
            key={stock}
            onClick={() => { setSearchInput(""); setActiveStock(stock); }}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: activeStock === stock && !searchInput ? "2px solid #047857" : `1px solid ${c("--border")}`,
              background: activeStock === stock && !searchInput ? "rgba(4,120,87,0.1)" : c("--bg-elevated"),
              color: activeStock === stock && !searchInput ? "#047857" : c("--text-secondary"),
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              fontFamily: "Inter, sans-serif", transition: "all 0.2s",
            }}
          >{stock}</button>
        ))}
        <button
          onClick={handleScout}
          disabled={loading}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: loading ? "#9ca3af" : "#047857",
            color: "#ffffff", fontSize: 13, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "Inter, sans-serif", marginLeft: "auto",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          {loading ? "Scanning…" : "Scout"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ width: 40, height: 40, border: "4px solid #e5e7eb", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: c("--text-secondary"), fontFamily: "Inter, sans-serif", fontSize: 14 }}>Analyzing {searchInput || activeStock}…</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#dc2626", fontSize: 14, fontFamily: "Inter, sans-serif" }}>
          {error}
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && data && (
        <div>
          {/* Top Cards Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            {/* Stock Info Card */}
            <div style={{
              background: "linear-gradient(135deg, #047857 0%, #059669 100%)",
              borderRadius: 16, padding: "32px", color: "#ffffff", position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 16, right: 16, padding: "4px 12px",
                background: "rgba(255,255,255,0.2)", borderRadius: 6,
                fontSize: 11, fontWeight: 600, fontFamily: "Inter, sans-serif",
              }}>TOP OPPORTUNITY</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "Inter, sans-serif", marginBottom: 2 }}>{data.display}</div>
                <div style={{ fontSize: 13, opacity: 0.85, fontFamily: "Inter, sans-serif" }}>{data.name || `${data.display}.NS`}</div>
                {data.sector && <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "Inter, sans-serif", marginTop: 4 }}>{data.sector} · {data.industry}</div>}
              </div>
              <div style={{ fontSize: 40, fontWeight: 700, fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
                ₹{data.current_price?.toFixed(2) ?? "—"}
              </div>
              {data.market_cap && (
                <div style={{ fontSize: 12, opacity: 0.8, fontFamily: "Inter, sans-serif" }}>{data.market_cap}</div>
              )}
            </div>

            {/* Analyst Consensus Card */}
            <div style={{ background: signalBg, borderRadius: 16, padding: "32px", color: "#ffffff" }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8, fontFamily: "Inter, sans-serif" }}>Analyst Consensus</div>
              <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 20, fontFamily: "Inter, sans-serif" }}>{signalType}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>
                Based on {data.signals?.length || 0} fundamental signals
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>TARGET PRICE</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
                    {data.analyst?.target_mean ? `₹${data.analyst.target_mean.toFixed(1)}` : "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>UPSIDE</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
                    {data.analyst?.upside_pct != null ? `${data.analyst.upside_pct > 0 ? "+" : ""}${data.analyst.upside_pct.toFixed(1)}%` : "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>RECOMMENDATION</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif", textTransform: "capitalize" }}>
                    {data.analyst?.recommendation?.replace("_", " ") || "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>ANALYSTS</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>
                    {data.analyst?.num_analysts || "N/A"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
            {[
              { label: "P/E RATIO",    value: data.fundamentals?.pe ? `${data.fundamentals.pe}x` : "N/A",          sub: "Trailing P/E" },
              { label: "ROE",          value: data.fundamentals?.roe || "N/A",                                      sub: "Quality factor" },
              { label: "REV. GROWTH",  value: data.fundamentals?.revenue_growth || "N/A",                          sub: "YoY increase",  green: true },
              { label: "DEBT/EQUITY",  value: data.fundamentals?.debt_equity || "N/A",                             sub: "Balance sheet" },
              { label: "DIV. YIELD",   value: data.fundamentals?.dividend_yield || "N/A",                          sub: "Dividend payout" },
            ].map((m, i) => (
              <div key={i} style={{ background: c("--bg-elevated"), borderRadius: 12, padding: "20px", border: `1px solid ${c("--border")}` }}>
                <div style={{ fontSize: 11, color: c("--text-muted"), marginBottom: 8, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: m.green ? "#10b981" : c("--text-primary"), fontFamily: "Inter, sans-serif" }}>{m.value}</div>
                <div style={{ fontSize: 11, color: c("--text-muted"), marginTop: 4, fontFamily: "Inter, sans-serif" }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Multi-Agent Cross-Reference & Explanation (Orchestrator) ── */}
          <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: "24px", marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showExplanation ? 20 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(4,120,87,0.12)", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>
                    Why this signal? — Multi-Agent Cross-Reference
                  </div>
                  <div style={{ fontSize: 12, color: c("--text-secondary"), fontFamily: "Inter, sans-serif" }}>
                    Cross-referencing Chart, Fundamental, News & Market Regime agents
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowExplanation(s => !s)}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: `1px solid ${c("--border")}`,
                  background: c("--bg-surface"), color: c("--text-primary"),
                  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                {showExplanation ? "Collapse Analysis" : "Expand Analysis"}
              </button>
            </div>

            {showExplanation && (
              <>
                {orchestratedLoading && !orchestrated && (
                  <div style={{ textAlign: "center", padding: "28px 0" }}>
                    <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
                    <div style={{ fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif" }}>Synthesizing multi-agent consensus for {data.display}…</div>
                  </div>
                )}

                {orchestrated && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Synthesis & Deterministic Consensus Bar */}
                    <div style={{
                      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                      borderRadius: 12, padding: "20px 22px", color: "#fff",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>NET ORCHESTRATED SIGNAL</span>
                          <span style={{
                            fontSize: 14, fontWeight: 700, padding: "3px 12px", borderRadius: 6,
                            background: orchestrated.signal_color || "#047857", color: "#fff",
                          }}>
                            {orchestrated.net_signal}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: 6,
                            fontSize: 12, fontWeight: 600, color: "#38bdf8",
                          }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                            <span>{orchestrated.confidence}% Confidence</span>
                            <span style={{ opacity: 0.6 }}>•</span>
                            <span style={{ fontSize: 11, color: "#cbd5e1" }}>{orchestrated.confidence_breakdown?.agreement_votes}</span>
                          </div>
                          <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                            Score: {orchestrated.confidence_breakdown?.total_weighted_score > 0 ? "+" : ""}{orchestrated.confidence_breakdown?.total_weighted_score}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.7, fontFamily: "Inter, sans-serif" }}>
                        {orchestrated.synthesis}
                      </div>
                    </div>

                    {/* 4 Agent Contribution Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
                      {/* 1. Chart Pattern Agent */}
                      <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                            Chart Pattern Agent
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(4,120,87,0.1)", color: "#047857", textTransform: "uppercase" }}>
                            {orchestrated.agent_contributions?.chart_agent?.badge || "from Chart Agent"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-primary"), fontWeight: 500, marginBottom: 4 }}>
                          {orchestrated.agent_contributions?.chart_agent?.highlight}
                        </div>
                        {orchestrated.agent_contributions?.chart_agent?.backtest && (
                          <div style={{ fontSize: 11, color: "#047857", marginTop: 4 }}>
                            {orchestrated.agent_contributions.chart_agent.backtest}
                          </div>
                        )}
                      </div>

                      {/* 2. Fundamental Agent */}
                      <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                            Fundamental Agent
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(3,105,161,0.1)", color: "#0284c7", textTransform: "uppercase" }}>
                            {orchestrated.agent_contributions?.fundamental_agent?.badge || "from Fundamental Agent"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-primary"), fontWeight: 500, marginBottom: 4 }}>
                          {orchestrated.agent_contributions?.fundamental_agent?.highlight}
                        </div>
                        <div style={{ fontSize: 11, color: c("--text-muted") }}>
                          Analyst Consensus: {orchestrated.agent_contributions?.fundamental_agent?.recommendation?.replace("_", " ").toUpperCase() || "HOLD"}
                        </div>
                      </div>

                      {/* 3. News Agent */}
                      <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
                            News RAG Agent
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(234,88,12,0.1)", color: "#ea580c", textTransform: "uppercase" }}>
                            {orchestrated.agent_contributions?.news_agent?.badge || "from News Agent"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-primary"), fontWeight: 500, marginBottom: 4 }}>
                          {orchestrated.agent_contributions?.news_agent?.highlight}
                        </div>
                        {orchestrated.agent_contributions?.news_agent?.headlines?.[0] && (
                          <div style={{ fontSize: 11, color: c("--text-muted"), fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            "{orchestrated.agent_contributions.news_agent.headlines[0]}"
                          </div>
                        )}
                      </div>

                      {/* 4. Market Regime Agent */}
                      <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                            Market Regime Agent
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(124,58,237,0.1)", color: "#7c3aed", textTransform: "uppercase" }}>
                            {orchestrated.agent_contributions?.regime_agent?.badge || "from Regime Agent"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-primary"), fontWeight: 500, marginBottom: 4 }}>
                          {orchestrated.agent_contributions?.regime_agent?.highlight}
                        </div>
                      </div>
                    </div>

                    {/* Risk Factors */}
                    {orchestrated.risk_factors?.length > 0 && (
                      <div style={{ padding: "12px 16px", background: "rgba(220,38,38,0.05)", borderRadius: 10, borderLeft: "3px solid #dc2626" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Identified Cross-Agent Risk Factors:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {orchestrated.risk_factors.map((rf, idx) => (
                            <div key={idx} style={{ fontSize: 12, color: c("--text-primary"), lineHeight: 1.4 }}>
                              • {rf}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actionable Takeaway */}
                    {orchestrated.actionable_takeaway && (
                      <div style={{ padding: "12px 16px", background: "rgba(4,120,87,0.08)", borderRadius: 10, borderLeft: "3px solid #047857", fontSize: 12, color: c("--text-primary"), fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>
                        <div>
                          <strong>Takeaway:</strong> {orchestrated.actionable_takeaway}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Signals Section */}
          {(positiveSignals.length > 0 || cautionSignals.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
              {/* Positive Signals */}
              {positiveSignals.length > 0 && (
                <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${c("--border")}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
                      POSITIVE SIGNALS
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#ffffff", background: "#10b981", borderRadius: 20, padding: "2px 8px" }}>
                      {positiveSignals.length}
                    </span>
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {positiveSignals.map((s, i) => (
                      <div key={i} style={{
                        padding: "12px 14px", borderRadius: 10,
                        background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)",
                        borderLeft: "3px solid #10b981",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", fontFamily: "Inter, sans-serif", marginBottom: 4 }}>
                          {s.type}
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}>
                          {s.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caution Signals */}
              {cautionSignals.length > 0 && (
                <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${c("--border")}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
                      CAUTION SIGNALS
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#ffffff", background: "#f59e0b", borderRadius: 20, padding: "2px 8px" }}>
                      {cautionSignals.length}
                    </span>
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {cautionSignals.map((s, i) => (
                      <div key={i} style={{
                        padding: "12px 14px", borderRadius: 10,
                        background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
                        borderLeft: "3px solid #f59e0b",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "Inter, sans-serif", marginBottom: 4 }}>
                          {s.type}
                        </div>
                        <div style={{ fontSize: 12, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}>
                          {s.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No signals fallback */}
          {data.signals?.length === 0 && (
            <div style={{ padding: "20px", background: c("--bg-elevated"), border: `1px solid ${c("--border")}`, borderRadius: 12, color: c("--text-muted"), fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
              No fundamental signals detected for {data.display}. Data may be limited for this stock.
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
