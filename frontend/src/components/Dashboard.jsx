import { useEffect, useState } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

const MODULES = [
  { link: "chat", title: "Market Brain", desc: "Real-time macro analysis and sentiment mapping across Indian indices and global cues.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  { link: "radar", title: "Opportunity Radar", desc: "Scan for breakout patterns and liquidity gaps in BSE SmallCap and MidCap segments.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg> },
  { link: "chart", title: "Chart Intelligence", desc: "AI-driven technical overlays — RSI, MACD, EMA crossovers, Bollinger Bands and backtesting.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { link: "portfolio", title: "Portfolio Engine", desc: "Track your holdings P&L, get stop-loss suggestions and rebalancing signals in real time.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg> },
  { link: "news", title: "News RAG", desc: "AI synthesis of live financial news — ask about any stock or sector and get instant intelligence.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg> },
  { link: "video", title: "Video Engine", desc: "Transcribe and analyze YouTube financial content for consensus and counter-narratives.", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><polygon points="10 8 16 12 10 16 10 8"/></svg> },
];

const V = "var";
const c = (name) => `var(${name})`;

function StatCard({ label, value, sub, subColor, change, changeUp, children }) {
  return (
    <div style={{ background: c("--bg-elevated"), borderRadius: 12, padding: "20px 24px", border: `1px solid ${c("--border")}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: c("--text-muted"), fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>{label}</span>
        {change != null && (
          <span style={{ fontSize: 11, fontWeight: 600, color: changeUp ? "#16a34a" : "#ef4444", background: changeUp ? "rgba(22,163,74,0.1)" : "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 4, fontFamily: "Inter, sans-serif", display: "inline-flex", alignItems: "center", gap: 3 }}>
            {changeUp ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            )}
            {change}
          </span>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: subColor || c("--text-muted"), fontFamily: "Inter, sans-serif" }}>{sub}</div>}
      {children}
    </div>
  );
}

const DEFAULT_INDICES = {
  nifty: { price: 24055.8, change_pct: -0.1 },
  sensex: { price: 76944.28, change_pct: -0.02 },
  banknifty: { price: 57409.6, change_pct: -1.06 },
};

const DEFAULT_NEWS = [
  { title: "RBI policy stance maintains focus on growth with stable inflation targets", publisher: "LiveMint", symbol: "HDFCBANK", time: "Today" },
  { title: "Reliance Industries expands green energy investments across key hubs", publisher: "Economic Times", symbol: "RELIANCE", time: "Today" },
  { title: "IT sector sees renewed deal pipelines in cloud and enterprise AI", publisher: "Moneycontrol", symbol: "TCS", time: "Today" },
  { title: "Automobile sector reports strong festive booking momentum", publisher: "Business Standard", symbol: "TATAMOTORS", time: "Today" },
];

const DEFAULT_STREAM = {
  text: "Indian markets are consolidating near key support levels with Nifty holding firm above 24,000. Banking and IT sectors show resilient institutional accumulation.",
  sentiment_score: 62,
};

export default function Dashboard({ onNav }) {
  const [indices, setIndices] = useState(() => {
    try {
      const saved = localStorage.getItem("investedge_indices");
      return saved ? JSON.parse(saved) : DEFAULT_INDICES;
    } catch {
      return DEFAULT_INDICES;
    }
  });

  const [news, setNews] = useState(() => {
    try {
      const saved = localStorage.getItem("investedge_news");
      return (saved && JSON.parse(saved).length > 0) ? JSON.parse(saved) : DEFAULT_NEWS;
    } catch {
      return DEFAULT_NEWS;
    }
  });

  const [stream, setStream] = useState(() => {
    try {
      const saved = localStorage.getItem("investedge_stream");
      return saved ? JSON.parse(saved) : DEFAULT_STREAM;
    } catch {
      return DEFAULT_STREAM;
    }
  });

  const [time, setTime] = useState(new Date());
  const userName = "Investor";
  const userInitials = "IN";

  useEffect(() => {
    fetch(`${BACKEND}/api/market/indices`)
      .then(r => r.json())
      .then(d => {
        if (d && d.nifty) {
          setIndices(d);
          try { localStorage.setItem("investedge_indices", JSON.stringify(d)); } catch {}
        }
      })
      .catch(() => {});

    fetch(`${BACKEND}/api/news`)
      .then(r => r.json())
      .then(d => {
        const articles = d.articles?.slice(0, 4) || [];
        if (articles.length > 0) {
          setNews(articles);
          try { localStorage.setItem("investedge_news", JSON.stringify(articles)); } catch {}
        }
      })
      .catch(() => {});

    const fetchStream = (attempt = 0) => {
      fetch(`${BACKEND}/api/news/stream`)
        .then(r => r.json())
        .then(d => {
          if (d?.text) {
            setStream(d);
            try { localStorage.setItem("investedge_stream", JSON.stringify(d)); } catch {}
          } else if (attempt < 3) {
            setTimeout(() => fetchStream(attempt + 1), 3000);
          }
        })
        .catch(() => { if (attempt < 3) setTimeout(() => fetchStream(attempt + 1), 3000); });
    };
    fetchStream();
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const nifty = indices?.nifty;
  const sensex = indices?.sensex;
  const banknifty = indices?.banknifty;
  const sentimentScore = stream?.sentiment_score ?? null;

  const sentimentLabel = s => s == null ? "Loading..." : s >= 65 ? "Bullish" : s <= 40 ? "Bearish" : "Neutral";
  const sentimentColor = s => s == null ? c("--text-muted") : s >= 65 ? "#16a34a" : s <= 40 ? "#ef4444" : "#d97706";

  return (
    <div style={{ flex: 1, overflowY: "auto", background: c("--bg-base"), minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ background: c("--bg-elevated"), borderBottom: `1px solid ${c("--border")}`, padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ position: "relative", maxWidth: 420, flex: 1 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c("--text-muted")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input placeholder="Search markets, signals, or news..." style={{ width: "100%", padding: "9px 14px 9px 36px", borderRadius: 8, border: `1px solid ${c("--border")}`, background: c("--bg-surface"), fontSize: 13, fontFamily: "Inter, sans-serif", outline: "none", color: c("--text-primary") }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginRight: 8 }}>
            {time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST
          </span>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", marginRight: 4 }} />
          <span style={{ fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif", marginRight: 16 }}>Live</span>
          <button style={{ width: 34, height: 34, borderRadius: "50%", background: c("--bg-surface"), border: `1px solid ${c("--border")}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c("--text-secondary")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700, fontFamily: "Inter, sans-serif" }}>{userInitials}</div>
        </div>
      </header>

      <div style={{ padding: "28px 40px" }}>
        {/* Live Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard label="Nifty 50" value={nifty ? nifty.price.toLocaleString("en-IN") : "—"} sub={nifty ? `${nifty.change_pct >= 0 ? "+" : ""}${nifty.change_pct}% today` : "Fetching..."} subColor={nifty ? (nifty.change_pct >= 0 ? "#16a34a" : "#ef4444") : undefined} change={nifty ? `${Math.abs(nifty.change_pct)}%` : null} changeUp={nifty?.change_pct >= 0} />
          <StatCard label="Sensex" value={sensex ? sensex.price.toLocaleString("en-IN") : "—"} sub={sensex ? `${sensex.change_pct >= 0 ? "+" : ""}${sensex.change_pct}% today` : "Fetching..."} subColor={sensex ? (sensex.change_pct >= 0 ? "#16a34a" : "#ef4444") : undefined} change={sensex ? `${Math.abs(sensex.change_pct)}%` : null} changeUp={sensex?.change_pct >= 0} />
          <StatCard label="Bank Nifty" value={banknifty ? banknifty.price.toLocaleString("en-IN") : "—"} sub={banknifty ? `${banknifty.change_pct >= 0 ? "+" : ""}${banknifty.change_pct}% today` : "Fetching..."} subColor={banknifty ? (banknifty.change_pct >= 0 ? "#16a34a" : "#ef4444") : undefined} change={banknifty ? `${Math.abs(banknifty.change_pct)}%` : null} changeUp={banknifty?.change_pct >= 0} />
          <StatCard label="Market Sentiment" value={sentimentScore != null ? `${sentimentScore}/100` : "—"} sub={sentimentLabel(sentimentScore)} subColor={sentimentColor(sentimentScore)}>
            {sentimentScore != null && (
              <div style={{ marginTop: 10, height: 4, background: c("--border"), borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${sentimentScore}%`, height: "100%", background: sentimentColor(sentimentScore), borderRadius: 2 }} />
              </div>
            )}
          </StatCard>
        </div>

        {/* Welcome Banner */}
        <div style={{ background: "linear-gradient(135deg, #065f46 0%, #047857 100%)", borderRadius: 16, padding: "36px 48px", marginBottom: 28, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, background: "rgba(255,255,255,0.04)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", right: 80, bottom: -60, width: 160, height: 160, background: "rgba(255,255,255,0.04)", borderRadius: "50%" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#ffffff", fontFamily: "Inter, sans-serif", marginBottom: 10 }}>Welcome back, {userName}.</h1>
            <p style={{ fontSize: 14, color: "#d1fae5", fontFamily: "Inter, sans-serif", marginBottom: 24, maxWidth: 560, lineHeight: 1.7 }}>
              {stream?.text || "Loading live market intelligence..."}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => onNav("radar")} style={{ padding: "10px 22px", background: "#ffffff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#047857", cursor: "pointer", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Scout Opportunities
              </button>
              <button onClick={() => onNav("portfolio")} style={{ padding: "10px 22px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#ffffff", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
                View Portfolio
              </button>
            </div>
          </div>
        </div>

        {/* Bottom 2-col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
          {/* Modules */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 2 }}>Intelligence Modules</h2>
              <p style={{ fontSize: 13, color: c("--text-muted"), fontFamily: "Inter, sans-serif" }}>Click any module to get started</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {MODULES.map((m, i) => (
                <div key={i} onClick={() => onNav(m.link)}
                  style={{ background: c("--bg-elevated"), borderRadius: 12, padding: "20px", border: `1px solid ${c("--border")}`, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)"; e.currentTarget.style.borderColor = "#047857"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = c("--border"); }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(4,120,87,0.08)", border: "1px solid rgba(4,120,87,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    {m.icon}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif", marginBottom: 6 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: c("--text-muted"), fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>{m.desc}</div>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "#047857", fontFamily: "Inter, sans-serif" }}>
                    Open
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: c("--text-primary"), fontFamily: "Inter, sans-serif" }}>Live News Feed</h2>
              <button onClick={() => onNav("news")} style={{ fontSize: 12, color: "#047857", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>View all →</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {news.length === 0 ? (
                <div style={{ padding: 24, background: c("--bg-elevated"), borderRadius: 12, border: `1px solid ${c("--border")}`, textAlign: "center", color: c("--text-muted"), fontSize: 13, fontFamily: "Inter, sans-serif" }}>Loading live news...</div>
              ) : news.map((item, i) => {
                const t = item.title?.toLowerCase() || "";
                const bull = /surge|rally|growth|strong|gain|rise|profit|beat/.test(t);
                const bear = /slump|fall|drop|risk|loss|decline|weak|miss/.test(t);
                const accent = bull ? "#16a34a" : bear ? "#ef4444" : "#d97706";
                const tag = bull ? "BULLISH" : bear ? "BEARISH" : "NEUTRAL";
                const tagBg = bull ? "rgba(22,163,74,0.1)" : bear ? "rgba(239,68,68,0.1)" : "rgba(217,119,6,0.1)";
                return (
                  <div key={i} onClick={() => item.link && window.open(item.link, "_blank")}
                    style={{ background: c("--bg-elevated"), borderRadius: 10, padding: "14px", border: `1px solid ${c("--border")}`, borderLeft: `3px solid ${accent}`, cursor: item.link ? "pointer" : "default", transition: "box-shadow 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: c("--text-muted"), fontFamily: "Inter, sans-serif" }}>{item.publisher || item.symbol}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: tagBg, color: accent, fontFamily: "Inter, sans-serif" }}>{tag}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: c("--text-primary"), fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}>{item.title}</div>
                  </div>
                );
              })}
            </div>


          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 4px", fontSize: 11, color: c("--text-muted"), fontFamily: "Inter, sans-serif", borderTop: `1px solid ${c("--border")}`, marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              All systems operational
            </span>
            <span>Data: Yahoo Finance · NSE · BSE</span>
            <span>AI: Groq LLaMA 3.3</span>
          </div>
          <span>© 2025 InvestEdge Intelligence</span>
        </div>
      </div>
    </div>
  );
}
