import { useState, useContext } from "react";
import { ThemeContext } from "../App";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const SAMPLE = `RELIANCE 50 2800\nHDFCBANK 30 1650\nINFY 100 1420\nTCS 20 3800`;

const Icon = ({ d, size = 16, stroke = "currentColor", strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  wallet:   "M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M16 12h5M16 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z",
  trending: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  pnl:      "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  chart:    "M18 20V10M12 20V4M6 20v-6",
  health:   "M22 12h-4l-3 9L9 3l-3 9H2",
  robot:    "M12 2a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2zM9 12h6M9 16h4",
  check:    "M20 6L9 17l-5-5",
  back:     "M19 12H5M12 5l-7 7 7 7",
  briefcase:"M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  warn:     "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  sample:   "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2",
};

function parseHoldings(raw) {
  return raw.trim().split("\n").reduce((acc, line) => {
    const m = line.match(/([A-Z]+)\s+(\d+(?:\.\d+)?)\s+[₹]?(\d+(?:\.\d+)?)/i);
    if (m) acc.push({ symbol: m[1].toUpperCase(), qty: parseFloat(m[2]), avg_cost: parseFloat(m[3]) });
    return acc;
  }, []);
}

function ScoreRing({ score, grade }) {
  const color = score >= 85 ? "#16a34a" : score >= 70 ? "#d97706" : score >= 55 ? "#ea580c" : "#ef4444";
  const r = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke={c("--border")} strokeWidth="9" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x="55" y="50" textAnchor="middle" fill={color} fontSize="22" fontWeight="700" fontFamily="Inter">{score}</text>
        <text x="55" y="67" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="Inter">/ 100</text>
      </svg>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 4 }}>Grade {grade}</div>
    </div>
  );
}

export default function Portfolio() {
  const [raw, setRaw] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);       // /api/portfolio response
  const [doctor, setDoctor] = useState(null);   // /api/portfolio/doctor response
  const [error, setError] = useState(null);
  useContext(ThemeContext);

  async function analyze() {
    const holdings = parseHoldings(raw);
    if (!holdings.length) { setError("Could not parse holdings. Format: SYMBOL QTY AVGPRICE"); return; }
    setLoading(true); setError(null); setData(null); setDoctor(null);
    try {
      const [res1, res2] = await Promise.all([
        fetch(`${BACKEND}/api/portfolio`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings }),
        }),
        fetch(`${BACKEND}/api/portfolio/doctor`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings }),
        }),
      ]);
      if (!res1.ok) throw new Error((await res1.json()).detail || `HTTP ${res1.status}`);
      if (!res2.ok) throw new Error((await res2.json()).detail || `HTTP ${res2.status}`);
      const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
      setData(d1);
      setDoctor(d2);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const summary = data?.summary;
  const inProfit = summary && summary.total_pnl >= 0;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", background: c("--bg-base") }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: c("--text-primary"), marginBottom: 6 }}>Portfolio Analyzer</h1>
        <p style={{ fontSize: 13, color: c("--text-secondary") }}>P&L · Risk · Signals · AI Health Diagnosis</p>
      </div>

      {/* Input */}
      {!data && (
        <>
          <div style={{ fontSize: 11, color: c("--text-muted"), marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            FORMAT: SYMBOL  QUANTITY  AVG_PRICE (one per line)
          </div>
          <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={6}
            style={{ width: "100%", background: c("--bg-elevated"), border: `1px solid ${c("--border")}`, borderRadius: 12, color: c("--text-primary"), fontSize: 14, padding: 16, fontFamily: "Inter, sans-serif", lineHeight: 1.6, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }}
            onFocus={e => { e.target.style.borderColor = "#047857"; e.target.style.boxShadow = "0 0 0 3px rgba(4,120,87,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = c("--border"); e.target.style.boxShadow = "none"; }}
          />
          <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
            <button onClick={analyze} disabled={!raw.trim() || loading}
              style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: raw.trim() && !loading ? "#047857" : "#e5e7eb", color: "#fff", fontSize: 14, fontWeight: 600, cursor: raw.trim() && !loading ? "pointer" : "not-allowed" }}>
              {loading ? "Analyzing…" : <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon d={ICONS.briefcase} size={15} stroke="#fff" />Analyze Portfolio</span>}
            </button>
            <button onClick={() => setRaw(SAMPLE)}
              style={{ padding: "12px 24px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Icon d={ICONS.sample} size={15} />Try Sample
            </button>
          </div>
        </>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ width: 40, height: 40, border: "4px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: c("--text-secondary"), fontSize: 14 }}>Fetching live prices & running AI diagnosis…</div>
        </div>
      )}

      {error && <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#dc2626", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.warn} size={15} stroke="#dc2626" />{error}</div>}

      {data && summary && (
        <>
          {/* ── Summary Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { icon: ICONS.wallet,   label: "TOTAL INVESTED", val: `₹${summary.total_invested?.toLocaleString("en-IN")}`, sub: `Across ${summary.count} Securities`, subColor: c("--text-secondary") },
              { icon: ICONS.trending, label: "CURRENT VALUE",  val: `₹${summary.total_current?.toLocaleString("en-IN")}`, sub: `${inProfit ? "↑ +" : "↓ "}₹${Math.abs(summary.total_pnl)?.toLocaleString("en-IN")}`, subColor: inProfit ? "#16a34a" : "#ef4444" },
              { icon: ICONS.pnl,      label: "TOTAL P&L",      val: `${inProfit ? "+" : ""}₹${summary.total_pnl?.toLocaleString("en-IN")}`, valColor: inProfit ? "#16a34a" : "#ef4444", sub: "Since Inception", subColor: c("--text-secondary") },
            ].map((s, i) => (
              <div key={i} style={{ background: c("--bg-elevated"), borderRadius: 12, padding: 20, border: `1px solid ${c("--border")}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Icon d={s.icon} size={16} stroke={c("--text-muted")} />
                  <span style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.valColor || c("--text-primary"), marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: s.subColor }}>{s.sub}</div>
              </div>
            ))}
            <div style={{ background: "linear-gradient(135deg, #047857 0%, #059669 100%)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Icon d={ICONS.chart} size={16} stroke="#d1fae5" />
                <span style={{ fontSize: 11, color: "#d1fae5", textTransform: "uppercase", letterSpacing: "0.05em" }}>RETURN</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{summary.total_pnl_pct}%</div>
              <div style={{ fontSize: 12, color: "#d1fae5" }}>Overall portfolio return</div>
            </div>
          </div>

          {/* ── Doctor: Health Score + Sector Allocation + Issues ── */}
          {doctor && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, marginBottom: doctor.issues.length > 0 ? 0 : 24 }}>
                {/* Score */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Icon d={ICONS.health} size={15} />Health Score</div>
                  <ScoreRing score={doctor.score} grade={doctor.grade} />
                  {doctor.issues.length === 0 &&
                    <div style={{ fontSize: 12, color: "#16a34a", textAlign: "center", display: "flex", alignItems: "center", gap: 5 }}><Icon d={ICONS.check} size={13} stroke="#16a34a" />No critical issues found</div>
                  }
                </div>

                {/* Sector Allocation */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), marginBottom: 16 }}>Sector Allocation</div>
                  {Object.entries(doctor.sector_allocation).sort((a, b) => b[1] - a[1]).map(([sector, pct], i) => {
                    const colors = ["#047857", "#0369a1", "#7c3aed", "#ea580c", "#d97706", "#dc2626"];
                    const col = colors[i % colors.length];
                    return (
                      <div key={sector} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: c("--text-primary") }}>{sector}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: col }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: c("--border"), borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.8s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Issues below sector allocation */}
              {doctor.issues.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `220px 1fr`, gap: 20, marginBottom: 24 }}>
                  <div />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                    {doctor.issues.map((iss, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.06)", borderRadius: 10, borderLeft: "3px solid #dc2626" }}>
                        <Icon d={ICONS.warn} size={14} stroke="#dc2626" />
                        <span style={{ fontSize: 12, color: "#dc2626", lineHeight: 1.5 }}>{iss}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Holdings Table ── */}
          <div style={{ background: c("--bg-elevated"), borderRadius: 12, border: `1px solid ${c("--border")}`, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${c("--border")}` }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: c("--text-primary"), marginBottom: 2 }}>Portfolio Composition</h2>
              <p style={{ fontSize: 13, color: c("--text-secondary") }}>Detailed breakdown with live prices & signals</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1.5fr 1fr", padding: "10px 24px", background: c("--bg-surface"), borderBottom: `1px solid ${c("--border")}` }}>
              {["SYMBOL", "QTY", "AVG COST", "CURRENT PRICE", "P&L", "SIGNAL"].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 600, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
              ))}
            </div>
            {data.holdings?.map((h, i) => {
              if (h.error) return (
                <div key={i} style={{ padding: "14px 24px", borderBottom: i < data.holdings.length - 1 ? `1px solid ${c("--border")}` : "none", color: "#dc2626", fontSize: 13 }}>
                  {h.symbol} — {h.error}
                </div>
              );
              const pos = h.pnl >= 0;
              const sigMap = {
                accumulate: { bg: "rgba(34,197,94,0.12)", text: "#16a34a", label: "ACCUMULATE" },
                hold:       { bg: "rgba(59,130,246,0.12)", text: "#2563eb", label: "HOLD" },
                review:     { bg: "rgba(239,68,68,0.12)",  text: "#dc2626", label: "REVIEW" },
              };
              const sig = sigMap[h.signal] || sigMap.hold;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1.5fr 1fr", padding: "14px 24px", borderBottom: i < data.holdings.length - 1 ? `1px solid ${c("--border")}` : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: c("--text-primary"), marginBottom: 2 }}>{h.symbol}</div>
                    {h.weight_pct && <div style={{ fontSize: 11, color: c("--text-muted") }}>{h.weight_pct}% of portfolio</div>}
                  </div>
                  <div style={{ fontSize: 13, color: c("--text-primary") }}>{h.qty}</div>
                  <div style={{ fontSize: 13, color: c("--text-primary") }}>₹{h.avg_cost?.toLocaleString("en-IN")}</div>
                  <div style={{ fontSize: 13, color: c("--text-primary") }}>₹{h.current_price?.toLocaleString("en-IN")}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: pos ? "#16a34a" : "#ef4444" }}>{pos ? "+" : ""}₹{h.pnl?.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 12, color: pos ? "#16a34a" : "#ef4444" }}>{pos ? "+" : ""}{h.pnl_pct}%</div>
                  </div>
                  <div>
                    <span style={{ padding: "4px 10px", borderRadius: 6, background: sig.bg, color: sig.text, fontSize: 11, fontWeight: 600 }}>{sig.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Multi-Agent Orchestrated Intelligence & Advice ── */}
          {doctor && (
            <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Orchestrator Hero Synthesis */}
              <div style={{
                background: "linear-gradient(135deg, #064e3b 0%, #047857 60%, #059669 100%)",
                borderRadius: 16, padding: "26px 28px", color: "#fff",
                boxShadow: "0 4px 20px rgba(4,120,87,0.15)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon d={ICONS.robot} size={18} stroke="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>Multi-Agent Orchestrated Advisory</div>
                      <div style={{ fontSize: 11, color: "#a7f3d0" }}>Synthesized across Market Regime, News RAG, Risk Engine & Doctor</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 20, background: "rgba(255,255,255,0.18)", color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                      Regime: {doctor.regime?.regime || "Active"}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 20, background: "rgba(255,255,255,0.18)", color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/></svg>
                      News: {doctor.relevant_news?.length || 0} feeds
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 20, background: "rgba(255,255,255,0.18)", color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      Grade {doctor.grade}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#ecfdf5", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                  {doctor.synthesized_advice || doctor.ai_advice}
                </div>
              </div>

              {/* 4 Multi-Agent Attribution Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                {/* 1. Market Regime Agent */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                      Market Regime
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(4,120,87,0.1)", color: "#047857", textTransform: "uppercase" }}>
                      from Regime Agent
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: doctor.regime?.color || "#047857", marginBottom: 4 }}>
                    {doctor.regime?.regime || "Sideways Chop"}
                  </div>
                  <div style={{ fontSize: 12, color: c("--text-secondary"), lineHeight: 1.5 }}>
                    {doctor.regime?.description || "Market trend and volatility conditions monitored."}
                  </div>
                </div>

                {/* 2. News RAG Agent */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
                      News Intelligence
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(3,105,161,0.1)", color: "#0284c7", textTransform: "uppercase" }}>
                      from News Agent
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: c("--text-primary"), fontWeight: 500, marginBottom: 4 }}>
                    {doctor.relevant_news?.[0]?.title ? `"${doctor.relevant_news[0].title}"` : "No urgent catalysts"}
                  </div>
                  <div style={{ fontSize: 11, color: c("--text-muted") }}>
                    {doctor.relevant_news?.length ? `Cross-referenced ${doctor.relevant_news.length} recent articles across portfolio tickers.` : "Live news streams checked."}
                  </div>
                </div>

                {/* 3. Risk Agent */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      Risk & Allocation
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(234,88,12,0.1)", color: "#ea580c", textTransform: "uppercase" }}>
                      from Risk Agent
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: c("--text-secondary"), lineHeight: 1.5 }}>
                    {doctor.allocation_summary ? `Allocation: ${doctor.allocation_summary}` : "Concentration within acceptable limits."}
                  </div>
                </div>

                {/* 4. Portfolio Doctor */}
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      Health Diagnostics
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(124,58,237,0.1)", color: "#7c3aed", textTransform: "uppercase" }}>
                      from Portfolio Doctor
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: c("--text-secondary"), lineHeight: 1.5 }}>
                    Grade {doctor.grade} ({doctor.score}/100) — {doctor.issues?.length ? `${doctor.issues.length} areas to optimize.` : "Portfolio metrics healthy."}
                  </div>
                </div>
              </div>

              {/* Cross-Referenced Risk Flags */}
              {doctor.risk_flags?.length > 0 && (
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon d={ICONS.warn} size={15} stroke="#dc2626" />
                    Cross-Referenced Risk Flags
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {doctor.risk_flags.map((rf, idx) => (
                      <div key={idx} style={{
                        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                        padding: "10px 14px", borderRadius: 8,
                        background: rf.severity === "high" ? "rgba(220,38,38,0.06)" : "rgba(217,119,6,0.06)",
                        borderLeft: `3px solid ${rf.severity === "high" ? "#dc2626" : "#d97706"}`,
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: rf.severity === "high" ? "#dc2626" : "#d97706", marginBottom: 2 }}>
                            {rf.flag}
                          </div>
                          <div style={{ fontSize: 12, color: c("--text-secondary") }}>{rf.detail}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-surface"), color: c("--text-muted"), whiteSpace: "nowrap", marginLeft: 12 }}>
                          {rf.agent}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {doctor.suggestions?.length > 0 && (
                <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c("--text-primary"), marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon d={ICONS.check} size={15} stroke="#047857" />
                    Orchestrated Action Items
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {doctor.suggestions.map((s, i) => (
                      <div key={i} style={{ padding: "10px 14px", background: "rgba(4,120,87,0.06)", borderRadius: 8, borderLeft: "3px solid #047857", fontSize: 12, color: c("--text-primary"), lineHeight: 1.5 }}>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={() => { setData(null); setDoctor(null); }}
            style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-elevated"), color: c("--text-secondary"), fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <Icon d={ICONS.back} size={15} />Analyze Another Portfolio
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
