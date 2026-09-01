import { useState, useEffect, useContext } from "react";
import { ThemeContext } from "../App";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const Icon = ({ d, size = 16, stroke = "currentColor", strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  refresh:  "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  filter:   "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  check:    "M20 6L9 17l-5-5",
  x:        "M18 6L6 18M6 6l12 12",
  info:     "M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  clock:    "M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

export default function SignalTrackRecord() {
  const [horizonDays, setHorizonDays] = useState(15);
  const [summary, setSummary] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter states
  const [symFilter, setSymFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("ALL");
  
  // Selected detail modal
  const [selectedSignal, setSelectedSignal] = useState(null);

  useContext(ThemeContext);

  useEffect(() => {
    fetchTrackRecord();
  }, [horizonDays, resultFilter]);

  async function fetchTrackRecord() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Summary
      const sumRes = await fetch(`${BACKEND}/api/track-record/summary?horizon_days=${horizonDays}`);
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }

      // 2. Fetch Signals List
      let url = `${BACKEND}/api/track-record/signals?horizon_days=${horizonDays}&limit=200`;
      if (resultFilter !== "ALL") {
        url += `&result=${resultFilter}`;
      }
      const sigRes = await fetch(url);
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        setSignals(sigData.signals || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluatePending() {
    setEvaluating(true);
    try {
      await fetch(`${BACKEND}/api/track-record/evaluate`, { method: "POST" });
      await fetchTrackRecord();
    } catch (e) {
      alert("Evaluation failed: " + e.message);
    } finally {
      setEvaluating(false);
    }
  }

  async function handleViewDetail(sigId) {
    try {
      const res = await fetch(`${BACKEND}/api/track-record/signal/${sigId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSignal(data);
      }
    } catch (e) {
      alert("Could not load signal details: " + e.message);
    }
  }

  const filteredSignals = signals.filter(s => {
    if (!symFilter.trim()) return true;
    return s.symbol.includes(symFilter.trim().toUpperCase());
  });

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", background: c("--bg-base"), fontFamily: "Inter, sans-serif" }}>
      
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: c("--text-primary"), marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon d={ICONS.shield} size={22} stroke="#047857" />
            InvestEdge Live Signal Track Record
          </h1>
          <p style={{ fontSize: 13, color: c("--text-secondary") }}>
            Audits actual live InvestEdge predictions issued since deployment — evaluated on trading-session horizons
          </p>
        </div>

        <button
          onClick={handleEvaluatePending}
          disabled={evaluating}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#047857", color: "#fff", fontSize: 13, fontWeight: 600, cursor: evaluating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}
        >
          <Icon d={ICONS.refresh} size={14} stroke="#fff" />
          {evaluating ? "Evaluating Market..." : "Evaluate Pending Signals"}
        </button>
      </div>

      {/* Methodology & Transparency Disclosure */}
      <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: 18, marginBottom: 24, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Icon d={ICONS.info} size={18} stroke="#047857" />
        <div style={{ fontSize: 12, color: c("--text-secondary"), lineHeight: 1.6 }}>
          <strong style={{ color: c("--text-primary") }}>Live Track Record Methodology: </strong>
          Records genuine InvestEdge signals generated since deployment. Evaluates outcome price, net return %, and Nifty 50 benchmark alpha over exact trading-session horizons (+1D, +5D, +15D). Distinct from historical backtest simulation.
        </div>
      </div>

      {/* Horizon Selector Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[
          { days: 1, label: "1 Trading Day (+1D)" },
          { days: 5, label: "5 Trading Days (+5D)" },
          { days: 15, label: "15 Trading Days (+15D)" },
        ].map(tab => (
          <button
            key={tab.days}
            onClick={() => setHorizonDays(tab.days)}
            style={{ padding: "8px 16px", borderRadius: 20, border: `1px solid ${c("--border")}`, background: horizonDays === tab.days ? "#047857" : c("--bg-elevated"), color: horizonDays === tab.days ? "#fff" : c("--text-secondary"), fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Executive Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Win Rate %</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.win_rate_pct >= 50 ? "#16a34a" : "#d97706" }}>
              {summary.win_rate_pct}%
            </div>
            <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>
              Sample size <strong style={{ color: c("--text-primary") }}>n = {summary.sample_size}</strong>
            </div>
          </div>

          <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Avg Net Return</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.avg_return_pct >= 0 ? "#16a34a" : "#ef4444" }}>
              {summary.avg_return_pct >= 0 ? "+" : ""}{summary.avg_return_pct}%
            </div>
            <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>Median: {summary.median_return_pct}%</div>
          </div>

          <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Avg Nifty Alpha</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.avg_alpha_pct >= 0 ? "#16a34a" : "#ef4444" }}>
              {summary.avg_alpha_pct >= 0 ? "+" : ""}{summary.avg_alpha_pct}%
            </div>
            <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>Excess return over Nifty 50</div>
          </div>

          <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
            <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Signals Count</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c("--text-primary") }}>
              {summary.resolved_signals} <span style={{ fontSize: 14, color: c("--text-muted"), fontWeight: 500 }}>resolved</span>
            </div>
            <div style={{ fontSize: 12, color: "#d97706", marginTop: 4 }}>{summary.pending_signals} pending horizon</div>
          </div>
        </div>
      )}

      {/* Filter Control Bar */}
      <div style={{ background: c("--bg-elevated"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: 16, marginBottom: 20, display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <Icon d={ICONS.filter} size={15} stroke={c("--text-muted")} />
          <input
            value={symFilter}
            onChange={e => setSymFilter(e.target.value)}
            placeholder="Filter by stock symbol..."
            style={{ width: 220, padding: "7px 12px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13, outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: c("--text-muted") }}>RESULT:</span>
          {["ALL", "SUCCESS", "FAILURE", "NEUTRAL"].map(r => (
            <button
              key={r}
              onClick={() => setResultFilter(r)}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: resultFilter === r ? "#047857" : c("--bg-surface"), color: resultFilter === r ? "#fff" : c("--text-secondary"), fontSize: 12, cursor: "pointer" }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Signals Log Table */}
      <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr 0.8fr", padding: "12px 20px", background: c("--bg-surface"), borderBottom: `1px solid ${c("--border")}` }}>
          {["DATE", "SYMBOL", "SIGNAL TYPE", "SIGNAL PRICE", "EVAL DATE", "OUTCOME", "RETURN %", "ALPHA %", "RESULT", "ACTION"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: c("--text-muted"), fontSize: 13 }}>Loading track record ledger...</div>
        ) : filteredSignals.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: c("--text-muted"), fontSize: 13 }}>
            No live signals recorded yet for this horizon filter. Live signals automatically record when InvestEdge AI agents detect signals.
          </div>
        ) : (
          filteredSignals.map((s, idx) => {
            const isResolved = s.status === "RESOLVED";
            const posRet = (s.return_pct || 0) >= 0;
            const posAlpha = (s.alpha_pct || 0) >= 0;

            return (
              <div key={s.signal_id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 1fr 1fr 0.8fr", padding: "12px 20px", borderBottom: idx < filteredSignals.length - 1 ? `1px solid ${c("--border")}` : "none", alignItems: "center", fontSize: 13 }}>
                <div style={{ color: c("--text-secondary") }}>{s.signal_timestamp?.slice(0, 10)}</div>
                <div style={{ color: c("--text-primary"), fontWeight: 700 }}>{s.symbol}</div>
                <div style={{ color: c("--text-primary"), fontSize: 12 }}>{s.signal_type}</div>
                <div style={{ color: c("--text-primary") }}>₹{s.signal_price}</div>
                <div style={{ color: c("--text-secondary") }}>{s.evaluation_date || "Pending"}</div>
                <div style={{ color: c("--text-primary") }}>{s.outcome_price ? `₹${s.outcome_price}` : "Pending"}</div>
                <div style={{ fontWeight: 700, color: isResolved ? (posRet ? "#16a34a" : "#ef4444") : c("--text-muted") }}>
                  {isResolved ? `${posRet ? "+" : ""}${s.return_pct}%` : "Pending"}
                </div>
                <div style={{ fontWeight: 600, color: isResolved ? (posAlpha ? "#16a34a" : "#ef4444") : c("--text-muted") }}>
                  {isResolved ? `${posAlpha ? "+" : ""}${s.alpha_pct}%` : "Pending"}
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: s.result === "SUCCESS" ? "rgba(34,197,94,0.12)" : s.result === "FAILURE" ? "rgba(239,68,68,0.12)" : "rgba(217,119,6,0.12)", color: s.result === "SUCCESS" ? "#16a34a" : s.result === "FAILURE" ? "#dc2626" : "#d97706", textTransform: "uppercase" }}>
                    {s.status === "PENDING" ? "PENDING" : s.result}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => handleViewDetail(s.signal_id)}
                    style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-secondary"), fontSize: 11, cursor: "pointer" }}
                  >
                    Snapshot
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedSignal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 28, width: 560, maxWidth: "90%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c("--text-primary") }}>
                Signal Audit Snapshot — {selectedSignal.symbol}
              </div>
              <button onClick={() => setSelectedSignal(null)} style={{ background: "none", border: "none", color: c("--text-muted"), cursor: "pointer" }}>
                <Icon d={ICONS.x} size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, fontSize: 13 }}>
              <div><strong style={{ color: c("--text-muted") }}>Signal ID:</strong> {selectedSignal.signal_id}</div>
              <div><strong style={{ color: c("--text-muted") }}>Timestamp:</strong> {selectedSignal.signal_timestamp}</div>
              <div><strong style={{ color: c("--text-muted") }}>Signal Price:</strong> ₹{selectedSignal.signal_price}</div>
              <div><strong style={{ color: c("--text-muted") }}>Market Regime:</strong> {selectedSignal.market_regime}</div>
              <div><strong style={{ color: c("--text-muted") }}>Strategy:</strong> {selectedSignal.strategy_name}</div>
              <div><strong style={{ color: c("--text-muted") }}>Engine Version:</strong> {selectedSignal.engine_version}</div>
            </div>

            {/* Captured Indicator Snapshot */}
            <div style={{ background: c("--bg-surface"), borderRadius: 10, border: `1px solid ${c("--border")}`, padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", marginBottom: 8 }}>Captured Technical Snapshot</div>
              <pre style={{ fontSize: 11, color: c("--text-primary"), margin: 0, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(selectedSignal.source_data_snapshot, null, 2)}
              </pre>
            </div>

            {/* Multi-Horizon Outcomes */}
            <div style={{ fontSize: 12, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", marginBottom: 8 }}>Multi-Horizon Outcomes</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {selectedSignal.outcomes && selectedSignal.outcomes.map(o => (
                <div key={o.horizon_days} style={{ background: c("--bg-surface"), borderRadius: 8, border: `1px solid ${c("--border")}`, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted") }}>+{o.horizon_days} Trading Days</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: o.return_pct >= 0 ? "#16a34a" : "#ef4444", marginTop: 4 }}>
                    {o.status === "RESOLVED" ? `${o.return_pct >= 0 ? "+" : ""}${o.return_pct}%` : "PENDING"}
                  </div>
                  <div style={{ fontSize: 11, color: c("--text-secondary"), marginTop: 2 }}>
                    {o.status === "RESOLVED" ? `Alpha: ${o.alpha_pct}%` : "Awaiting session"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
