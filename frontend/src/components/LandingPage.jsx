export default function LandingPage({ onNav }) {
  const cards = [
    {
      icon: "🔭",
      color: "#f97316",
      title: "Opportunity Radar",
      sub: "The Scout",
      desc: "NLP on SEBI filings & ET news. Detects management tone shifts, capital allocation signals, and operational anomalies.",
      nav: "radar",
      badge: "Filings · News · NLP",
    },
    {
      icon: "📊",
      color: "#3b82f6",
      title: "Chart Intelligence",
      sub: "The Analyst",
      desc: "Computer vision on live NSE/BSE charts. RSI, MACD, EMA crossovers, Bollinger Bands, backtesting.",
      nav: "chart",
      badge: "Technicals · Patterns",
    },
    {
      icon: "🧠",
      color: "#7c3aed",
      title: "Market Brain",
      sub: "AI Orchestrator",
      desc: "LLM reasoning engine (Claude). State management, compliance checks, source-cited answers to any market question.",
      nav: "chat",
      badge: "Claude · Gemini",
      featured: true,
    },
    {
      icon: "🗞️",
      color: "#0ea5e9",
      title: "News RAG",
      sub: "Vector Database",
      desc: "Semantic search over ET Market news and SEBI filings. Source-cited recommendations with embedded context.",
      nav: "news",
      badge: "RAG · Embeddings",
    },
    {
      icon: "🎬",
      color: "#00d4a0",
      title: "Video Engine",
      sub: "The Producer",
      desc: "Generative AI daily market recap videos. Automated summaries, narration, and visual overlays via pipeline.",
      nav: "video",
      badge: "Veo · HeyGen",
    },
  ];

  const stats = [
    { value: "3", label: "AI Agents" },
    { value: "NSE+BSE", label: "Coverage" },
    { value: "Live", label: "Data" },
    { value: "Claude", label: "LLM Engine" },
  ];

  return (
    <div style={{
      flex: 1, overflowY: "auto",
      background: "var(--bg-base)",
      padding: "0 0 48px",
    }}>
      {/* Hero */}
      <div style={{
        position: "relative",
        padding: "64px 48px 52px",
        overflow: "hidden",
        borderBottom: "1px solid #0f1e33",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
          width: 600, height: 400,
          background: "radial-gradient(ellipse, #4f46e520 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, #0f1e33 1px, transparent 0)`,
          backgroundSize: "32px 32px",
          opacity: 0.5,
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 14px", borderRadius: 999,
            background: "rgba(124,58,237,0.12)", border: "1px solid #7c3aed40",
            marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "#a78bfa", fontFamily: "JetBrains Mono, monospace" }}>
              ET AI Hackathon 2026 · PS6 · Team Maharudra
            </span>
          </div>

          <h1 style={{
            fontSize: 48, fontWeight: 800, lineHeight: 1.1,
            fontFamily: "Outfit, sans-serif",
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg,#e2e8f0 30%,#a78bfa 70%,#7dd3fc 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            marginBottom: 20,
          }}>
            Unified AI Financial<br />Intelligence OS
          </h1>

          <p style={{
            fontSize: 16, color: "#64748b", lineHeight: 1.7, maxWidth: 560, margin: "0 auto 36px",
            fontFamily: "Inter, sans-serif",
          }}>
            Real-time agentic workflow for Indian retail investors — combining Chart Pattern Intelligence,
            Opportunity Radar, RAG-powered news, and AI-orchestrated recommendations.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => onNav("chat")}>
              🧠 Open Market Brain
            </button>
            <button className="btn btn-secondary" onClick={() => onNav("chart")}>
              📊 Chart Intelligence
            </button>
            <button className="btn btn-secondary" onClick={() => onNav("radar")}>
              🔭 Opportunity Radar
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", marginTop: 48, flexWrap: "wrap" }}>
            {stats.map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2, textTransform: "uppercase",
                  letterSpacing: "0.08em", fontFamily: "JetBrains Mono, monospace" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture cards */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "48px 48px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Integrated Agentic Workflow
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#e2e8f0", fontFamily: "Outfit, sans-serif" }}>
            Specialized AI Agents
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {cards.map(card => (
            <button
              key={card.nav}
              onClick={() => onNav(card.nav)}
              style={{
                background: card.featured
                  ? "linear-gradient(135deg,#0f0c29,#201060,#0f0c29)"
                  : "var(--bg-card)",
                border: card.featured
                  ? "1px solid #7c3aed50"
                  : "1px solid #0f1e33",
                borderRadius: 14,
                padding: "22px 20px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: card.featured ? "0 4px 32px #7c3aed20" : "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = card.color + "60";
                e.currentTarget.style.boxShadow = `0 8px 32px ${card.color}20`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = card.featured ? "#7c3aed50" : "#0f1e33";
                e.currentTarget.style.boxShadow = card.featured ? "0 4px 32px #7c3aed20" : "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: card.color + "20",
                  border: `1px solid ${card.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>{card.icon}</div>
                <span style={{
                  fontSize: 9.5, padding: "3px 8px", borderRadius: 4,
                  background: card.color + "15",
                  color: card.color,
                  border: `1px solid ${card.color}30`,
                  fontFamily: "JetBrains Mono, monospace",
                }}>{card.badge}</span>
              </div>
              <div style={{ fontSize: 11, color: card.color, fontFamily: "JetBrains Mono, monospace",
                marginBottom: 4 }}>{card.sub}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: "Outfit, sans-serif",
                marginBottom: 8 }}>{card.title}</div>
              <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, fontFamily: "Inter, sans-serif" }}>
                {card.desc}
              </p>
              <div style={{ marginTop: 16, fontSize: 12, color: card.color, fontWeight: 500 }}>
                Open → 
              </div>
            </button>
          ))}
        </div>

        {/* Architecture flow diagram (simplified text) */}
        <div style={{
          marginTop: 40, padding: "24px",
          background: "#080e1a", borderRadius: 14,
          border: "1px solid #0f1e33",
        }}>
          <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
            Data Flow Architecture
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 12 }}>
            {[
              { label: "ET Markets News", color: "#0ea5e9" },
              { label: "SEBI Filings (PDF)", color: "#0ea5e9" },
              { label: "NSE/BSE Data", color: "#0ea5e9" },
            ].map(s => (
              <span key={s.label} style={{
                padding: "5px 12px", borderRadius: 6,
                background: "#071830", border: "1px solid #0ea5e930",
                color: "#0ea5e9", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              }}>{s.label}</span>
            ))}
            <span style={{ color: "#1e3a5f", fontSize: 18 }}>→</span>
            {[
              { label: "Opp Radar", color: "#f97316" },
              { label: "Chart Intel", color: "#3b82f6" },
            ].map(s => (
              <span key={s.label} style={{
                padding: "5px 12px", borderRadius: 6,
                background: s.color + "15", border: `1px solid ${s.color}30`,
                color: s.color, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              }}>{s.label}</span>
            ))}
            <span style={{ color: "#1e3a5f", fontSize: 18 }}>→</span>
            <span style={{
              padding: "5px 14px", borderRadius: 6,
              background: "#1e1b4b", border: "1px solid #7c3aed50",
              color: "#c4b5fd", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              fontWeight: 600,
            }}>🧠 Market Brain (LLM)</span>
            <span style={{ color: "#1e3a5f", fontSize: 18 }}>→</span>
            {[
              { label: "Chat UI", color: "#00d4a0" },
              { label: "Video Engine", color: "#00d4a0" },
            ].map(s => (
              <span key={s.label} style={{
                padding: "5px 12px", borderRadius: 6,
                background: "#001f12", border: "1px solid #00d4a030",
                color: "#00d4a0", fontSize: 11, fontFamily: "JetBrains Mono, monospace",
              }}>{s.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
