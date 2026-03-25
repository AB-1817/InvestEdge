import { useState } from "react";

const BACKEND = import.meta.env.VITE_API_URL;

const POPULAR = [
  "HDFC earnings", "Reliance AGM", "Infosys guidance",
  "IT sector outlook", "SEBI new rules", "Bajaj Finance NPA",
  "Nifty 50 target", "FII inflows",
];

function NewsCard({ article, idx }) {
  return (
    <a
      href={article.link || "#"}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block", padding: "16px 18px",
        background: "#080e1a", border: "1px solid #0f1e33",
        borderRadius: 12, marginBottom: 10,
        textDecoration: "none", transition: "all 0.15s",
        animation: `fadeUp 0.3s ${idx * 0.05}s both`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#1e3a66"; e.currentTarget.style.background = "#0a1220"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#0f1e33"; e.currentTarget.style.background = "#080e1a"; }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: "linear-gradient(135deg,#071830,#0ea5e920)",
          border: "1px solid #0ea5e930",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14,
        }}>🗞️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 6,
            fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
            {article.title}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {article.symbol && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: "#071830", border: "1px solid #0ea5e930",
                color: "#0ea5e9", fontFamily: "JetBrains Mono, monospace",
              }}>{article.symbol}</span>
            )}
            {article.publisher && (
              <span style={{ fontSize: 10.5, color: "#334155",
                fontFamily: "JetBrains Mono, monospace" }}>
                {article.publisher}
              </span>
            )}
            {article.time && (
              <span style={{ fontSize: 10.5, color: "#1e3a5f",
                fontFamily: "JetBrains Mono, monospace" }}>
                {article.time}
              </span>
            )}
          </div>
        </div>
        <div style={{ color: "#1e3a5f", fontSize: 12, flexShrink: 0 }}>→</div>
      </div>
    </a>
  );
}

export default function NewsRAG() {
  const [query, setQuery] = useState("");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  async function search() {
    if (!query.trim() && !symbol.trim()) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append("q", query.trim());
      if (symbol.trim()) params.append("symbol", symbol.trim().toUpperCase());
      const res = await fetch(`${BACKEND}/api/news?${params}`);
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      setResults(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px" }}>
      <div className="section-header">
        <div className="section-icon" style={{ background: "#071830", border: "1px solid #0ea5e930" }}>🗞️</div>
        <div>
          <div className="section-title">News RAG</div>
          <div className="section-sub">Vector Database — Semantic News & Filings Search</div>
        </div>
      </div>

      <div style={{
        padding: "14px 16px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 10, marginBottom: 24,
        fontSize: 13, color: "#64748b", lineHeight: 1.6,
      }}>
        Semantic search over <strong style={{ color: "#94a3b8" }}>ET Markets news & SEBI corporate filings</strong>.
        Source-cited results with publisher, date, and linked article.
        <span style={{ color: "#0ea5e9" }}> RAG · Embeddings · Vector Index</span>
      </div>

      {/* Search inputs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input
          className="input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Search news… 'HDFC earnings', 'Reliance AGM', 'RBI rate cut'"
          style={{ flex: 2 }}
        />
        <input
          className="input"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Filter by symbol"
          style={{ flex: 0.8, fontFamily: "JetBrains Mono, monospace" }}
        />
        <button
          className="btn btn-primary"
          onClick={search}
          disabled={(!query.trim() && !symbol.trim()) || loading}
          style={{ background: "linear-gradient(135deg,#075985,#0ea5e9)", minWidth: 110 }}
        >
          {loading ? "Searching…" : "🔍 Search"}
        </button>
      </div>

      {/* Popular searches */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        <span style={{ fontSize: 10.5, color: "#1e3a5f", fontFamily: "JetBrains Mono, monospace",
          alignSelf: "center" }}>Popular:</span>
        {POPULAR.map(p => (
          <button key={p} onClick={() => { setQuery(p); }} style={{
            padding: "4px 10px", borderRadius: 6,
            border: "1px solid #0f1e33", background: "#080e1a",
            color: "#334155", fontSize: 11, cursor: "pointer",
            fontFamily: "Inter, sans-serif", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "#0ea5e9"; e.target.style.color = "#0ea5e9"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#0f1e33"; e.target.style.color = "#334155"; }}
          >{p}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #0f1e33",
            borderTopColor: "#0ea5e9", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Searching news index…
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
            Backend must be running: uvicorn main:app --reload --port 8000
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
              letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {results.total} results
              {results.query && <span style={{ color: "#1e3a5f" }}> for "{results.query}"</span>}
            </div>
            <div style={{
              fontSize: 9.5, padding: "3px 9px", borderRadius: 4,
              background: "#071830", border: "1px solid #0ea5e920",
              color: "#0ea5e9", fontFamily: "JetBrains Mono, monospace",
            }}>Vector RAG · Live Feed</div>
          </div>

          {results.articles?.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ color: "#334155", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
                No news found for these search terms.
              </div>
            </div>
          )}

          {results.articles?.map((article, i) => (
            <NewsCard key={i} article={article} idx={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !results && !error && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#334155",
            fontFamily: "Outfit, sans-serif", marginBottom: 8 }}>
            Search the news index
          </div>
          <div style={{ fontSize: 13, color: "#1e3a5f", fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
            Type a company name, event, or market keyword<br />
            to search through live ET Markets news feed
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
