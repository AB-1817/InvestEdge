import { useState, useEffect, useContext } from "react";
import { ThemeContext } from "../App";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";
const QUICK_PROMPTS = ["HDFC Bank Q3 Risks", "Semiconductor Supply Chain", "Nifty 50 Technicals"];

function sentimentFromTitle(title) {
  const t = title.toLowerCase();
  if (/surge|rally|high|growth|strong|bullish|gain|rise|up|profit|beat/.test(t)) return "bullish";
  if (/slump|fall|drop|risk|loss|bearish|decline|down|weak|miss|cut/.test(t)) return "bearish";
  return "neutral";
}

function tagsFromSentiment(s) {
  if (s === "bullish") return ["BULLISH"];
  if (s === "bearish") return ["BEARISH"];
  return ["NEUTRAL"];
}

export default function NewsRAG() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [synthesis, setSynthesis] = useState(null);
  const [error, setError] = useState(null);
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [stream, setStream] = useState(null);
  const [signals, setSignals] = useState([]);
  const [indices, setIndices] = useState(null);
  useContext(ThemeContext);

  useEffect(() => {
    setFeedLoading(true);
    fetch(`${BACKEND}/api/news`)
      .then(r => r.json())
      .then(data => {
        const items = (data.articles || []).slice(0, 8).map(a => ({
          source: a.publisher || a.symbol,
          time: a.time || "recently",
          title: a.title,
          summary: a.title.slice(0, 80) + "...",
          tags: tagsFromSentiment(sentimentFromTitle(a.title)),
          sentiment: sentimentFromTitle(a.title),
          link: a.link,
        }));
        setFeed(items);
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false));

    fetch(`${BACKEND}/api/news/stream`).then(r => r.json()).then(setStream).catch(() => {});
    fetch(`${BACKEND}/api/news/signals`).then(r => r.json()).then(data => setSignals(data.signals || [])).catch(() => {});
    fetch(`${BACKEND}/api/market/indices`).then(r => r.json()).then(setIndices).catch(() => {});
  }, []);

  async function synthesize() {
    if (!query.trim()) return;
    setLoading(true); setError(null); setSynthesis(null);
    try {
      const res = await fetch(`${BACKEND}/api/news/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      const data = await res.json();
      setSynthesis(data);
      const stockSymbol = data.analyzed_stocks?.[0] || "";
      const feedUrl = stockSymbol
        ? `${BACKEND}/api/news?symbol=${stockSymbol}`
        : `${BACKEND}/api/news?q=${encodeURIComponent(query.trim())}`;
      setFeedLoading(true);
      fetch(feedUrl)
        .then(r => r.json())
        .then(fd => {
          const items = (fd.articles || []).slice(0, 8).map(a => ({
            source: a.publisher || a.symbol,
            time: a.time || "recently",
            title: a.title,
            tags: tagsFromSentiment(sentimentFromTitle(a.title)),
            sentiment: sentimentFromTitle(a.title),
            link: a.link,
          }));
          setFeed(items);
        })
        .catch(() => {})
        .finally(() => setFeedLoading(false));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const trendColor = t => t === "up" ? "var(--accent-green)" : t === "down" ? "var(--accent-red)" : "var(--text-secondary)";

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-base)" }}>
      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        {/* Search Bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ position: "relative", maxWidth: 680 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && synthesize()}
              placeholder="Search insights, tickers, or global news..."
              style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none" }}
            />
          </div>
        </div>

        {/* Intelligence Retrieval */}
        <div style={{ background: "var(--bg-elevated)", borderRadius: 12, padding: "24px", border: "1px solid var(--border)", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-green-light)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", marginBottom: 2 }}>Intelligence Retrieval</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>Ask about global markets, sectoral shifts, or specific stock sentiments.</p>
            </div>
          </div>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g., 'Summarize the impact of the latest RBI policy on mid-cap IT stocks and highlight key risks from recent earnings calls.'"
            rows={3}
            style={{ width: "100%", padding: "14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", resize: "vertical", marginBottom: 16 }}
            onFocus={e => { e.target.style.borderColor = "#047857"; e.target.style.background = "var(--bg-elevated)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.background = "var(--bg-surface)"; }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>QUICK PROMPTS:</span>
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => setQuery(p)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>{p}</button>
              ))}
            </div>
            <button
              onClick={synthesize}
              disabled={!query.trim() || loading}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: query.trim() && !loading ? "#047857" : "var(--border)", color: "#ffffff", fontSize: 14, fontWeight: 600, cursor: query.trim() && !loading ? "pointer" : "not-allowed", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> {loading ? "Synthesizing..." : "Synthesize"}
            </button>
          </div>
        </div>

        {synthesis && (
          <div style={{ background: "var(--accent-green-light)", borderRadius: 12, padding: "20px", border: "1px solid var(--border)", marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: "var(--accent-green)", fontWeight: 600, marginBottom: 12, fontFamily: "Inter, sans-serif" }}>AI SYNTHESIS</div>
            <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.7, fontFamily: "Inter, sans-serif" }}>{synthesis.summary}</div>
            {synthesis.sources?.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--accent-green)", fontFamily: "Inter, sans-serif" }}>SOURCES: {synthesis.sources.length} articles analyzed</div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--accent-red)", fontSize: 14, fontFamily: "Inter, sans-serif", marginBottom: 32 }}>
            {error}
          </div>
        )}

        {/* Real-time Intelligence Feed */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 24, background: "#047857", borderRadius: 2 }} />
              <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif" }}>
                Real-time Intelligence Feed {synthesis?.analyzed_stocks?.[0] ? `— ${synthesis.analyzed_stocks[0]}` : ""}
              </h2>
            </div>
          </div>

          {feedLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>Loading live news...</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {feed.map((item, i) => (
                <div key={i}
                  onClick={() => item.link && window.open(item.link, "_blank")}
                  style={{ background: "var(--bg-elevated)", borderRadius: 12, padding: "20px", border: "1px solid var(--border)", cursor: item.link ? "pointer" : "default", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                        {(item.source || "N")[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif" }}>{item.source}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "Inter, sans-serif" }}>{item.time}</div>
                      </div>
                    </div>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", marginBottom: 12, lineHeight: 1.4 }}>{item.title}</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    {item.tags.map(tag => (
                      <span key={tag} style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: tag === "BULLISH" ? "rgba(34,197,94,0.12)" : tag === "BEARISH" ? "rgba(239,68,68,0.12)" : "var(--bg-surface)",
                        color: tag === "BULLISH" ? "var(--accent-green)" : tag === "BEARISH" ? "var(--accent-red)" : "var(--text-secondary)",
                        fontFamily: "Inter, sans-serif"
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div style={{ width: 320, padding: "24px", borderLeft: "1px solid var(--border)", overflowY: "auto", background: "var(--bg-base)" }}>
        {/* Intelligence Stream */}
        <div style={{ background: "linear-gradient(135deg, #047857 0%, #059669 100%)", borderRadius: 12, padding: "20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1fae5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#ffffff", fontFamily: "Inter, sans-serif" }}>Intelligence Stream</h3>
          </div>
          <p style={{ fontSize: 13, color: "#d1fae5", lineHeight: 1.6, fontFamily: "Inter, sans-serif", marginBottom: 16 }}>
            {stream ? stream.text : "Loading live market intelligence..."}
          </p>
          {stream && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#d1fae5", fontFamily: "Inter, sans-serif" }}>Market Sentiment</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#ffffff", fontFamily: "Inter, sans-serif" }}>{stream.sentiment_score}/100</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${stream.sentiment_score}%`, height: "100%", background: "#22c55e", borderRadius: 3 }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#ffffff", fontFamily: "Inter, sans-serif", marginLeft: "auto" }}>Live Analysis</span>
          </div>
        </div>

        {/* Trending Signals */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", marginBottom: 16 }}>TRENDING SIGNALS</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {signals.length === 0
              ? <div style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "Inter, sans-serif" }}>Loading signals...</div>
              : signals.map((signal, i) => (
                <div key={i} style={{ background: "var(--bg-elevated)", borderRadius: 10, padding: "14px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", marginBottom: 2 }}>{signal.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>{signal.mentions}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: trendColor(signal.trend), fontFamily: "Inter, sans-serif" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {signal.trend === "up"
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        : signal.trend === "down"
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      } {signal.change}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Market Indices */}
        <div style={{ marginTop: 24, padding: "16px", background: "var(--bg-surface)", borderRadius: 10 }}>
          {indices ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {indices.nifty && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>NIFTY 50</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: indices.nifty.change_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)", fontFamily: "Inter, sans-serif" }}>
                    {indices.nifty.price.toLocaleString("en-IN")} <span style={{ fontSize: 11 }}>{indices.nifty.change_pct >= 0 ? "+" : ""}{indices.nifty.change_pct}%</span>
                  </div>
                </div>
              )}
              {indices.sensex && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif" }}>SENSEX</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: indices.sensex.change_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)", fontFamily: "Inter, sans-serif" }}>
                    {indices.sensex.price.toLocaleString("en-IN")} <span style={{ fontSize: 11 }}>{indices.sensex.change_pct >= 0 ? "+" : ""}{indices.sensex.change_pct}%</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 13, fontFamily: "Inter, sans-serif" }}>Loading indices...</div>
          )}
        </div>
      </div>
    </div>
  );
}
