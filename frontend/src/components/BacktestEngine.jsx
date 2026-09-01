import { useState, useEffect, useRef, useContext } from "react";
import { ThemeContext } from "../App";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const c = (n) => `var(${n})`;

const Icon = ({ d, size = 16, stroke = "currentColor", strokeWidth = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  chart:    "M18 20V10M12 20V4M6 20v-6",
  play:     "M5 3l14 9-14 9V3z",
  refresh:  "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  sliders:  "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  check:    "M20 6L9 17l-5-5",
  warn:     "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  list:     "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  arrowUp:  "M12 19V5M5 12l7-7 7 7",
  arrowDown:"M12 5v14M5 12l7 7 7-7",
};

const POPULAR_SYMBOLS = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "SBIN", "TATAMOTORS", "ICICIBANK", "BAJFINANCE"];

export default function BacktestEngine() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [strategy, setStrategy] = useState("rsi_reversion");
  const [period, setPeriod] = useState("3y");
  const [capital, setCapital] = useState("100000");
  const [feePct, setFeePct] = useState("0.10");
  const [slippagePct, setSlippagePct] = useState("0.05");
  const [stopLossPct, setStopLossPct] = useState("5.0");
  const [takeProfitPct, setTakeProfitPct] = useState("10.0");
  const [riskFreeRatePct, setRiskFreeRatePct] = useState("6.0");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [strategiesList, setStrategiesList] = useState([]);
  const [activeTab, setActiveTab] = useState("equity");

  const canvasRef = useRef(null);
  useContext(ThemeContext);

  // Fetch available strategies on mount
  useEffect(() => {
    fetch(`${BACKEND}/api/backtest/strategies`)
      .then(r => r.json())
      .then(data => setStrategiesList(data.strategies || []))
      .catch(() => {});
  }, []);

  async function runSimulation(symToRun) {
    const targetSym = (symToRun || symbol).trim().toUpperCase();
    if (!targetSym) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const payload = {
      symbol: targetSym,
      period: period,
      strategy_name: strategy,
      initial_capital: parseFloat(capital) || 100000.0,
      fee_pct: parseFloat(feePct) || 0.10,
      slippage_pct: parseFloat(slippagePct) || 0.05,
      stop_loss_pct: stopLossPct ? parseFloat(stopLossPct) : null,
      take_profit_pct: takeProfitPct ? parseFloat(takeProfitPct) : null,
      risk_free_rate_pct: parseFloat(riskFreeRatePct) || 6.0,
      execution_mode: "next_open",
      holding_days: 15,
    };

    try {
      const res = await fetch(`${BACKEND}/api/backtest/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Draw Equity Curve Canvas
  useEffect(() => {
    if (!result || !result.equity_curve || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const data = result.equity_curve;
    if (data.length < 2) return;

    // Background gradient
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, W, H);

    // Padding
    const pL = 60, pR = 30, pT = 30, pB = 40;
    const chartW = W - pL - pR;
    const chartH = H - pT - pB;

    const stratVals = data.map(d => d.strategy_equity);
    const bmVals = data.map(d => d.benchmark_equity);
    const allVals = [...stratVals, ...bmVals];

    const minV = Math.min(...allVals) * 0.95;
    const maxV = Math.max(...allVals) * 1.05;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pT + (chartH / 4) * i;
      const val = maxV - ((maxV - minV) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pL, y);
      ctx.lineTo(W - pR, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`₹${Math.round(val).toLocaleString("en-IN")}`, pL - 8, y + 4);
    }

    // Benchmark line (blue dashed)
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = pL + (i / (data.length - 1)) * chartW;
      const y = pT + (1 - (pt.benchmark_equity - minV) / (maxV - minV)) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Strategy line (Emerald green)
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = pL + (i / (data.length - 1)) * chartW;
      const y = pT + (1 - (pt.strategy_equity - minV) / (maxV - minV)) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under strategy line
    const lastX = pL + chartW;
    const lastY = pT + (1 - (data[data.length - 1].strategy_equity - minV) / (maxV - minV)) * chartH;
    const grad = ctx.createLinearGradient(0, pT, 0, H - pB);
    grad.addColorStop(0, "rgba(34,197,94,0.25)");
    grad.addColorStop(1, "rgba(34,197,94,0.0)");
    ctx.fillStyle = grad;
    ctx.lineTo(lastX, H - pB);
    ctx.lineTo(pL, H - pB);
    ctx.closePath();
    ctx.fill();

    // X axis dates
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    const step = Math.floor(data.length / 5);
    for (let i = 0; i < data.length; i += step) {
      const x = pL + (i / (data.length - 1)) * chartW;
      ctx.fillText(data[i].date, x, H - 15);
    }
  }, [result]);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px", background: c("--bg-base"), fontFamily: "Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: c("--text-primary"), marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon d={ICONS.chart} size={22} stroke={c("--text-primary")} />
          Strategy Backtester & Signal Validator
        </h1>
        <p style={{ fontSize: 13, color: c("--text-secondary") }}>
          Deterministic historical simulation engine with zero look-ahead bias & transaction cost modeling
        </p>
      </div>

      {/* Controls Panel */}
      <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24, marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Symbol Input */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Stock Symbol
            </label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && runSimulation()}
              placeholder="e.g. RELIANCE"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 14, outline: "none" }}
            />
          </div>

          {/* Strategy Dropdown */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Strategy
            </label>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 14, outline: "none" }}
            >
              <option value="rsi_reversion">RSI Mean Reversion (RSI &lt; 32)</option>
              <option value="golden_cross">Golden Cross (EMA20 &gt; EMA50)</option>
              <option value="macd_crossover">MACD Bullish Crossover</option>
              <option value="bollinger_reversion">Bollinger Lower Band Breakdown</option>
              <option value="composite_investedge">InvestEdge Composite (Tech + Vol + Regime)</option>
            </select>
          </div>

          {/* Period Dropdown */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Historical Window
            </label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 14, outline: "none" }}
            >
              <option value="1y">1 Year</option>
              <option value="3y">3 Years</option>
              <option value="5y">5 Years</option>
              <option value="10y">10 Years</option>
            </select>
          </div>

          {/* Starting Capital */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
              Initial Capital (₹)
            </label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 14, outline: "none" }}
            />
          </div>
        </div>

        {/* Execution & Risk Controls (Simulation Assumptions) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, paddingTop: 16, borderTop: `1px solid ${c("--border")}`, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, color: c("--text-muted"), display: "block", marginBottom: 4 }}>Fee % (per side)</label>
            <input value={feePct} onChange={e => setFeePct(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: c("--text-muted"), display: "block", marginBottom: 4 }}>Slippage % (per side)</label>
            <input value={slippagePct} onChange={e => setSlippagePct(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: c("--text-muted"), display: "block", marginBottom: 4 }}>Stop-Loss %</label>
            <input value={stopLossPct} onChange={e => setStopLossPct(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: c("--text-muted"), display: "block", marginBottom: 4 }}>Take-Profit %</label>
            <input value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: c("--text-muted"), display: "block", marginBottom: 4 }}>Risk-Free Rate % (annual)</label>
            <input value={riskFreeRatePct} onChange={e => setRiskFreeRatePct(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-primary"), fontSize: 13 }} />
          </div>
        </div>

        {/* Action Button & Quick Picks */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: c("--text-muted") }}>QUICK SYMBOLS:</span>
            {POPULAR_SYMBOLS.map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); runSimulation(s); }}
                style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), color: c("--text-secondary"), fontSize: 12, cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => runSimulation()}
            disabled={!symbol.trim() || loading}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#047857", color: "#fff", fontSize: 14, fontWeight: 600, cursor: symbol.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Icon d={ICONS.play} size={15} stroke="#fff" />
            {loading ? "Simulating..." : "Run Backtest"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div style={{ width: 44, height: 44, border: "4px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: c("--text-secondary"), fontSize: 14 }}>Running event-driven simulation & metrics calculation…</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#dc2626", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon d={ICONS.warn} size={15} stroke="#dc2626" />
          {error}
        </div>
      )}

      {/* Results View */}
      {result && (
        <>
          {/* Executive Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
              <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Strategy Return</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: result.summary.total_return_pct >= 0 ? "#16a34a" : "#ef4444" }}>
                {result.summary.total_return_pct >= 0 ? "+" : ""}{result.summary.total_return_pct}%
              </div>
              <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>CAGR: {result.summary.cagr_pct != null ? `${result.summary.cagr_pct}%` : "N/A"}</div>
            </div>

            <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
              <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Benchmark (Nifty 50)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: c("--text-primary") }}>
                {result.summary.benchmark_return_pct >= 0 ? "+" : ""}{result.summary.benchmark_return_pct}%
              </div>
              <div style={{ fontSize: 12, color: result.summary.alpha_pct >= 0 ? "#16a34a" : "#ef4444", marginTop: 4 }}>
                Alpha: {result.summary.alpha_pct >= 0 ? "+" : ""}{result.summary.alpha_pct}%
              </div>
            </div>

            <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
              <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Win Rate</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: result.summary.win_rate_pct >= 50 ? "#16a34a" : "#d97706" }}>
                {result.summary.win_rate_pct}%
              </div>
              <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>{result.summary.winning_trades} wins / {result.summary.losing_trades} losses</div>
            </div>

            <div style={{ background: c("--bg-elevated"), borderRadius: 14, border: `1px solid ${c("--border")}`, padding: 20 }}>
              <div style={{ fontSize: 11, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Max Drawdown</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ef4444" }}>
                -{result.summary.max_drawdown_pct}%
              </div>
              <div style={{ fontSize: 12, color: c("--text-secondary"), marginTop: 4 }}>Profit Factor: {result.summary.profit_factor}</div>
            </div>
          </div>

          {/* Additional Metrics Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total Trades", val: result.summary.total_trades },
              { label: "Avg Trade Return", val: `${result.summary.avg_trade_return_pct >= 0 ? "+" : ""}${result.summary.avg_trade_return_pct}%` },
              { label: "Sharpe Ratio", val: result.summary.sharpe_ratio ?? "N/A" },
              { label: "Sortino Ratio", val: result.summary.sortino_ratio ?? "N/A" },
              { label: "Best / Worst Trade", val: `+${result.summary.best_trade_pct}% / ${result.summary.worst_trade_pct}%` },
            ].map((m, idx) => (
              <div key={idx} style={{ background: c("--bg-surface"), borderRadius: 10, border: `1px solid ${c("--border")}`, padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: c("--text-primary") }}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: "flex", gap: 12, borderBottom: `1px solid ${c("--border")}`, marginBottom: 20 }}>
            <button
              onClick={() => setActiveTab("equity")}
              style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: activeTab === "equity" ? "3px solid #047857" : "none", color: activeTab === "equity" ? c("--text-primary") : c("--text-muted"), fontWeight: activeTab === "equity" ? 700 : 500, cursor: "pointer", fontSize: 14 }}
            >
              Equity Curve & Drawdowns
            </button>
            <button
              onClick={() => setActiveTab("trades")}
              style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: activeTab === "trades" ? "3px solid #047857" : "none", color: activeTab === "trades" ? c("--text-primary") : c("--text-muted"), fontWeight: activeTab === "trades" ? 700 : 500, cursor: "pointer", fontSize: 14 }}
            >
              Trade History Log ({result.trades.length})
            </button>
          </div>

          {/* Tab 1: Equity Curve */}
          {activeTab === "equity" && (
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, padding: 24, marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: c("--text-primary") }}>Portfolio Growth vs Benchmark</div>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#22c55e", fontWeight: 600 }}>
                    <span style={{ width: 12, height: 3, background: "#22c55e", borderRadius: 2 }} /> Strategy
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#3b82f6", fontWeight: 600 }}>
                    <span style={{ width: 12, height: 3, background: "#3b82f6", borderRadius: 2 }} /> Nifty 50 Benchmark
                  </span>
                </div>
              </div>

              <canvas ref={canvasRef} width={900} height={360} style={{ width: "100%", height: 360, borderRadius: 10, display: "block" }} />
            </div>
          )}

          {/* Tab 2: Trade Log */}
          {activeTab === "trades" && (
            <div style={{ background: c("--bg-elevated"), borderRadius: 16, border: `1px solid ${c("--border")}`, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ display: "grid", gridTemplateColumns: "0.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr", padding: "12px 20px", background: c("--bg-surface"), borderBottom: `1px solid ${c("--border")}` }}>
                {["#", "ENTRY DATE", "ENTRY PRICE", "EXIT DATE", "EXIT PRICE", "HOLDING", "NET RETURN", "EXIT REASON"].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: c("--text-muted"), textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                ))}
              </div>

              {result.trades.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: c("--text-muted"), fontSize: 13 }}>No trades generated for this strategy and symbol window.</div>
              ) : (
                result.trades.map((t, idx) => {
                  const pos = t.net_return_pct >= 0;
                  return (
                    <div key={t.trade_id} style={{ display: "grid", gridTemplateColumns: "0.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.2fr", padding: "12px 20px", borderBottom: idx < result.trades.length - 1 ? `1px solid ${c("--border")}` : "none", alignItems: "center", fontSize: 13 }}>
                      <div style={{ color: c("--text-muted") }}>{t.trade_id}</div>
                      <div style={{ color: c("--text-primary"), fontWeight: 500 }}>{t.entry_date}</div>
                      <div style={{ color: c("--text-primary") }}>₹{t.entry_price}</div>
                      <div style={{ color: c("--text-primary"), fontWeight: 500 }}>{t.exit_date}</div>
                      <div style={{ color: c("--text-primary") }}>₹{t.exit_price}</div>
                      <div style={{ color: c("--text-secondary") }}>{t.holding_days}d</div>
                      <div style={{ fontWeight: 700, color: pos ? "#16a34a" : "#ef4444" }}>
                        {pos ? "+" : ""}{t.net_return_pct}% (₹{t.pnl_amount > 0 ? "+" : ""}{t.pnl_amount})
                      </div>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: t.exit_reason === "stop_loss" ? "rgba(239,68,68,0.12)" : t.exit_reason === "take_profit" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)", color: t.exit_reason === "stop_loss" ? "#dc2626" : t.exit_reason === "take_profit" ? "#16a34a" : "#2563eb", textTransform: "uppercase" }}>
                          {t.exit_reason}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Statistical Honesty & Methodology Disclosure */}
          <div style={{ background: c("--bg-surface"), borderRadius: 12, border: `1px solid ${c("--border")}`, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <Icon d={ICONS.shield} size={18} stroke="#047857" />
              <div style={{ fontSize: 12, color: c("--text-secondary"), lineHeight: 1.6 }}>
                <strong style={{ color: c("--text-primary") }}>Quantitative Methodology & Simulation Assumptions: </strong>
                {result.disclosure} Evaluated across {result.summary.total_trades} discrete trade signals. Next-session Open entry guarantees zero look-ahead bias.
              </div>
            </div>

            {/* Reproducibility Metadata Badges */}
            {result.parameters && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12, borderTop: `1px solid ${c("--border")}` }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Engine: {result.parameters.engine_version || "v1.0.0-investedge"}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Price Basis: {result.parameters.price_basis || "auto_adjusted"}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Risk-Free Rate: {result.parameters.risk_free_rate_pct ?? 6.0}% annual
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Fee: {result.parameters.fee_pct}% per side (Entry & Exit)
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Slippage: {result.parameters.slippage_pct}% per side (Entry & Exit)
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: c("--bg-elevated"), color: c("--text-muted"), border: `1px solid ${c("--border")}` }}>
                  Mode: {result.parameters.execution_mode}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
