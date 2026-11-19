import { useState, useEffect } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function LLMMetricsPanel({ compact = false }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRecent, setShowRecent] = useState(false);
  const [recentCalls, setRecentCalls] = useState([]);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/api/v2/metrics/llm?hours=24`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err.message || "Failed to load telemetry");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecent() {
    try {
      const res = await fetch(`${BACKEND}/api/v2/metrics/llm/recent?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setRecentCalls(data.records || []);
      }
    } catch (_) {}
  }

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (showRecent) {
      fetchRecent();
    }
  }, [showRecent]);

  if (compact) {
    return (
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 12,
        fontFamily: "Inter, sans-serif",
        color: "var(--text-secondary)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>LLM Telemetry:</span>
        </div>
        <span>Calls: <strong>{metrics?.total_calls ?? "--"}</strong></span>
        <span>p50 Latency: <strong>{metrics?.latency_ms?.p50 ? `${metrics.latency_ms.p50}ms` : "--"}</strong></span>
        <span>Est. Cost: <strong>{metrics?.costs?.total_cost_usd !== undefined ? `$${metrics.costs.total_cost_usd.toFixed(4)}` : "--"}</strong></span>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--accent-green)",
            padding: 0,
            fontSize: 12,
            textDecoration: "underline"
          }}
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 16,
      fontFamily: "Inter, sans-serif",
      color: "var(--text-primary)",
      marginBottom: 20
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            LLM Observability & Cost Metrics (24h)
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowRecent(prev => !prev)}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              cursor: "pointer"
            }}
          >
            {showRecent ? "Hide Traces" : "View Traces"}
          </button>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--accent-green)",
              cursor: "pointer"
            }}
          >
            {loading ? "Updating..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ fontSize: 12, color: "var(--accent-red)" }}>{error}</div>
      ) : !metrics ? (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Loading metrics...</div>
      ) : (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: 10,
            marginBottom: showRecent ? 16 : 0
          }}>
            <div style={{ background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Invocations</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{metrics.total_calls}</div>
            </div>

            <div style={{ background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>p50 / p95 Latency</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                {metrics.latency_ms.p50} / {metrics.latency_ms.p95} ms
              </div>
            </div>

            <div style={{ background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Tokens</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                {metrics.tokens.total.toLocaleString()}
              </div>
            </div>

            <div style={{ background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Est. Cost (USD)</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#3b82f6" }}>
                ${metrics.costs.total_cost_usd.toFixed(4)}
              </div>
            </div>

            <div style={{ background: "var(--bg-elevated)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Error Rate</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: metrics.error_rate_pct > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
                {metrics.error_rate_pct}%
              </div>
            </div>
          </div>

          {showRecent && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                Recent Invocations & Trace IDs:
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                {recentCalls.map((rc, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    background: "var(--bg-elevated)",
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "monospace"
                  }}>
                    <span style={{ color: "var(--text-primary)" }}>{rc.trace_id}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{rc.model}</span>
                    <span style={{ color: "#10b981" }}>{rc.latency_ms}ms</span>
                    <span style={{ color: "#3b82f6" }}>${rc.estimated_cost_usd}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

