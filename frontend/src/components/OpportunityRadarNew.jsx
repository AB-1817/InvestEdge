import { useState, useEffect, useCallback } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const FILTERS = [
  { key: null,                    label: "All" },
  { key: "bulk_deal",             label: "Bulk Deals" },
  { key: "filing",                label: "Filings" },
  { key: "insider_trade",         label: "Insider Trades" },
  { key: "quarterly_result",      label: "Quarterly Results" },
  { key: "management_commentary", label: "Commentary" },
  { key: "regulatory_change",     label: "Regulatory" },
];

const TYPE_META = {
  bulk_deal:             { label: "Bulk Deal",    color: "#7c3aed" },
  filing:                { label: "Filing",       color: "#0369a1" },
  insider_trade:         { label: "Insider",      color: "#b45309" },
  quarterly_result:      { label: "Result Beat",  color: "#047857" },
  management_commentary: { label: "Commentary",   color: "#0f766e" },
  regulatory_change:     { label: "Regulatory",   color: "#9f1239" },
  screener_signal:       { label: "Screener",     color: "#1d4ed8" },
};

function bucketStyle(bucket) {
  if (bucket?.includes("VERY HOT")) return { bg: "rgba(220,38,38,0.12)", color: "#dc2626" };
  if (bucket?.includes("HOT"))      return { bg: "rgba(234,88,12,0.12)",  color: "#ea580c" };
  if (bucket?.includes("WARM"))     return { bg: "rgba(217,119,6,0.12)",  color: "#d97706" };
  return { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
}

function BucketBadge({ bucket }) {
  const s = bucketStyle(bucket);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: "Inter, sans-serif",
      display: "inline-block",
    }}>{bucket || "—"}</span>
  );
}

function ConfBar({ pct }) {
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#9ca3af";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 64, height: 6, background: c("--border"), borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>{pct}%</span>
    </div>
  );
}

function TopOpportunityCard({ top, onAnalyze }) {
  if (!top) return null;
  const signals = [
    ...(top.type ? [TYPE_META[top.type]?.label || top.type] : []),
    ...(top.title?.split(" ").slice(0, 2) || []),
  ].filter(Boolean).slice(0, 4);

  return (
    <div style={{
      borderRadius: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      background: c("--bg-elevated"), display: "flex", flexDirection: "column", minWidth: 300, maxWidth: 340,
    }}>
      <div style={{
        height: 180, background: "linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%)",
        position: "relative", display: "flex", alignItems: "flex-end", padding: "16px 20px",
      }}>
        <svg viewBox="0 0 340 180" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}>
          <rect x="20" y="80" width="30" height="100" fill="#fff" />
          <rect x="60" y="50" width="40" height="130" fill="#fff" />
          <rect x="110" y="30" width="50" height="150" fill="#fff" />
          <rect x="170" y="60" width="35" height="120" fill="#fff" />
          <rect x="215" y="40" width="45" height="140" fill="#fff" />
          <rect x="270" y="70" width="30" height="110" fill="#fff" />
          <rect x="310" y="90" width="25" height="90" fill="#fff" />
        </svg>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-block", background: "#dc2626", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
            fontFamily: "Inter, sans-serif", letterSpacing: "0.08em", marginBottom: 8,
          }}>TOP OPPORTUNITY</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#ffffff", fontFamily: "Inter, sans-serif", letterSpacing: "-0.5px" }}>
            {top.symbol}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Score</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#047857", fontFamily: "Inter, sans-serif" }}>
              {top.total_score}<span style={{ fontSize: 13, color: c("--text-muted"), fontWeight: 400 }}>/100</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Confidence</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>{top.confidence}%</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Signal Context</div>
          <div style={{ fontSize: 13, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.6, fontStyle: "italic" }}>
            "{top.description?.slice(0, 120) || top.title}"
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Active Signals</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {signals.map((s, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 20,
                background: c("--bg-surface"), color: c("--text-secondary"),
                fontFamily: "Inter, sans-serif", fontWeight: 500,
              }}>{s}</span>
            ))}
          </div>
        </div>

        <button onClick={onAnalyze} style={{
          width: "100%", padding: "14px", borderRadius: 12, border: "none",
          background: "#047857", color: "#ffffff", fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "Inter, sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          Analyze Deep-Dive →
        </button>
      </div>
    </div>
  );
}

function DetailModal({ opp, onClose }) {
  if (!opp) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: c("--bg-elevated"), borderRadius: 20, padding: 32, maxWidth: 560, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "80vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 4 }}>{opp.symbol}</div>
            <div style={{ fontSize: 14, color: c("--text-secondary"), fontFamily: "Inter, sans-serif" }}>{opp.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c("--text-muted"), display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Score", value: opp.total_score },
            { label: "Confidence", value: `${opp.confidence}%` },
            { label: "Impact", value: opp.impact },
          ].map((m, i) => (
            <div key={i} style={{ background: c("--bg-surface"), borderRadius: 10, padding: "12px 14px", border: `1px solid ${c("--border")}` }}>
              <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginBottom: 4, textTransform: "uppercase" }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>{m.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <BucketBadge bucket={opp.bucket} />
        </div>

        <div style={{ fontSize: 14, color: c("--text-secondary"), fontFamily: "Inter, sans-serif", lineHeight: 1.7, marginBottom: 20, padding: "14px 16px", background: c("--bg-surface"), borderRadius: 10, border: `1px solid ${c("--border")}` }}>
          {opp.description}
        </div>

        {opp.details && Object.keys(opp.details).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(opp.details).map(([k, v]) => (
                <div key={k} style={{ background: c("--bg-surface"), borderRadius: 8, padding: "8px 12px", border: `1px solid ${c("--border")}` }}>
                  <div style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif", textTransform: "uppercase", marginBottom: 2 }}>{k.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif" }}>
          <span>Source: {opp.source}</span>
          <span>{opp.date}</span>
        </div>
      </div>
    </div>
  );
}

export default function OpportunityRadarNew() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [minsAgo, setMinsAgo]         = useState(0);

  const fetchData = useCallback(async (filter = activeFilter) => {
    setLoading(true); setError(null);
    try {
      const url = filter ? `${BACKEND}/api/radar?filters=${filter}` : `${BACKEND}/api/radar`;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setData(await res.json());
      setLastRefresh(Date.now());
      setMinsAgo(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchData(activeFilter); }, [activeFilter]);
  useEffect(() => {
    const id = setInterval(() => fetchData(activeFilter), 300000);
    return () => clearInterval(id);
  }, [fetchData, activeFilter]);

  useEffect(() => {
    if (!lastRefresh) return;
    const id = setInterval(() => setMinsAgo(Math.floor((Date.now() - lastRefresh) / 60000)), 30000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  const opps    = data?.opportunities || [];
  const summary = data?.summary || {};
  const top     = data?.top_opportunity;
  const avgConf = summary.avg_confidence || 0;
  const confBarW = Math.min(100, avgConf);

  return (
    <div style={{ height: "100%", overflowY: "auto", background: c("--bg-base"), fontFamily: "Inter, sans-serif" }}>

      {/* Summary Cards */}
      <div style={{ padding: "28px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, background: c("--bg-elevated"), borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>

          <div style={{ padding: "24px 28px", borderRight: `1px solid ${c("--border")}` }}>
            <div style={{ fontSize: 10, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Total Opportunities</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: c("--text-primary"), lineHeight: 1 }}>{summary.total ?? "—"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", background: "rgba(22,163,74,0.1)", padding: "3px 8px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 3 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></svg>
                +14%
              </span>
            </div>
          </div>

          <div style={{ padding: "24px 28px", borderRight: `1px solid ${c("--border")}` }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Very Hot Signals</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: c("--text-primary"), lineHeight: 1 }}>{summary.very_hot ?? "—"}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(220,38,38,0.3)" }}>Active Alert</span>
            </div>
          </div>

          <div style={{ padding: "24px 28px", borderRight: `1px solid ${c("--border")}` }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Avg. Confidence</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: c("--text-primary"), lineHeight: 1 }}>{avgConf ? `${avgConf}%` : "—"}</span>
              <div style={{ width: 60, height: 8, background: c("--border"), borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${confBarW}%`, height: "100%", background: "#047857", borderRadius: 4 }} />
              </div>
            </div>
          </div>

          <div style={{ padding: "24px 28px" }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Last Updated</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: c("--text-primary"), lineHeight: 1 }}>
                {lastRefresh ? (minsAgo === 0 ? "Just now" : `${minsAgo}m ago`) : "—"}
              </span>
              <button onClick={() => fetchData(activeFilter)} disabled={loading}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#047857", padding: 4 }}>
                {loading
                  ? <span style={{ display: "inline-block", width: 18, height: 18, border: `2px solid ${c("--border")}`, borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ margin: "16px 32px 0", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "start" }}>
        <div>
          {/* Filter chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {FILTERS.map(f => (
              <button key={f.key ?? "all"} onClick={() => setActiveFilter(f.key)} style={{
                padding: "8px 20px", borderRadius: 24, border: "none", cursor: "pointer",
                background: activeFilter === f.key ? c("--text-primary") : c("--bg-elevated"),
                color: activeFilter === f.key ? c("--bg-base") : c("--text-secondary"),
                fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif",
                boxShadow: "0 1px 4px rgba(0,0,0,0.12)", transition: "all 0.15s",
              }}>{f.label}</button>
            ))}
          </div>

          {loading && !data && (
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, padding: 60, textAlign: "center" }}>
              <div style={{ width: 36, height: 36, border: `3px solid ${c("--border")}`, borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 14, color: c("--text-secondary") }}>Scanning all data sources…</div>
              <div style={{ fontSize: 12, color: c("--text-muted"), marginTop: 4 }}>NSE · BSE · Yahoo Finance · RBI · SEBI</div>
            </div>
          )}

          {opps.length > 0 && (
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 80px 110px 180px 160px", padding: "12px 24px", borderBottom: `1px solid ${c("--border")}` }}>
                {["SYMBOL", "SCORE", "BUCKET", "SIGNAL TYPE", "CONFIDENCE"].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: c("--text-muted"), letterSpacing: "0.07em" }}>{h}</div>
                ))}
              </div>
              {opps.map((opp, i) => {
                const tm = TYPE_META[opp.type] || { label: opp.type, color: "#6b7280" };
                return (
                  <div key={i} onClick={() => setSelectedOpp(opp)} style={{
                    display: "grid", gridTemplateColumns: "140px 80px 110px 180px 160px",
                    padding: "18px 24px",
                    borderBottom: i < opps.length - 1 ? `1px solid ${c("--border")}` : "none",
                    alignItems: "center", cursor: "pointer", transition: "background 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontSize: 15, fontWeight: 800, color: c("--text-primary") }}>{opp.symbol}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#047857" }}>{opp.total_score}</div>
                    <BucketBadge bucket={opp.bucket} />
                    <div style={{ fontSize: 13, color: tm.color, fontWeight: 600 }}>{tm.label}</div>
                    <ConfBar pct={opp.confidence} />
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && opps.length === 0 && (
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, padding: "60px 40px", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px", display: "block" }}>
                <circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>
              </svg>
              <div style={{ fontSize: 16, fontWeight: 600, color: c("--text-primary"), marginBottom: 6 }}>No signals detected</div>
              <div style={{ fontSize: 13, color: c("--text-secondary") }}>Markets may be closed or data sources are temporarily unavailable.</div>
            </div>
          )}
        </div>

        <TopOpportunityCard top={top} onAnalyze={() => top && setSelectedOpp(top)} />
      </div>

      {selectedOpp && <DetailModal opp={selectedOpp} onClose={() => setSelectedOpp(null)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
