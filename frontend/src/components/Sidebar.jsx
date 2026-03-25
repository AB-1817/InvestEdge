const ICONS = {
  home:      "⚡",
  chat:      "🧠",
  radar:     "🔭",
  chart:     "📊",
  portfolio: "💼",
  news:      "🗞️",
  video:     "🎬",
};

const NAV = [
  { id: "home",      label: "Overview",     sub: "Architecture",    icon: ICONS.home },
  { id: "chat",      label: "Market Brain",  sub: "AI Orchestrator", icon: ICONS.chat },
  { id: "radar",     label: "Opp. Radar",   sub: "The Scout",       icon: ICONS.radar },
  { id: "chart",     label: "Chart Intel",  sub: "The Analyst",     icon: ICONS.chart },
  { id: "portfolio", label: "Portfolio",    sub: "P&L Analyzer",    icon: ICONS.portfolio },
  { id: "news",      label: "News RAG",     sub: "Vector Search",   icon: ICONS.news },
  { id: "video",     label: "Video Engine", sub: "The Producer",    icon: ICONS.video },
];

export default function Sidebar({ active, onNav }) {
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: "#080e1a",
      borderRight: "1px solid #0f1e33",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{
        padding: "20px 18px 16px",
        borderBottom: "1px solid #0f1e33",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff",
            boxShadow: "0 4px 16px #7c3aed40",
          }}>S</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "Outfit, sans-serif" }}>
              InvestEdge
            </div>
            <div style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
              AI · NSE · BSE
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
        <div style={{ fontSize: 9.5, color: "#1e3a5f", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 8px 10px" }}>
          Navigation
        </div>
        {NAV.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 8, border: "none",
                cursor: "pointer",
                background: isActive ? "linear-gradient(135deg,#1e1b4b,#2e1065)" : "transparent",
                marginBottom: 2,
                transition: "all 0.15s",
                textAlign: "left",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#0f1e33"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: 7,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
                background: isActive ? "rgba(124,58,237,0.3)" : "#0a1220",
                border: isActive ? "1px solid #4f46e540" : "1px solid #0f1e33",
                flexShrink: 0,
              }}>{item.icon}</span>
              <div>
                <div style={{
                  fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#c4b5fd" : "#64748b",
                  fontFamily: "Inter, sans-serif",
                }}>{item.label}</div>
                <div style={{
                  fontSize: 9.5, color: isActive ? "#6d28d9" : "#1e3a5f",
                  fontFamily: "JetBrains Mono, monospace",
                }}>{item.sub}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "14px 16px",
        borderTop: "1px solid #0f1e33",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9.5, color: "#1e3a5f", fontFamily: "JetBrains Mono, monospace",
          textAlign: "center", lineHeight: 1.6 }}>
          Team Maharudra<br />
          ET AI Hackathon 2026
        </div>
        <div style={{
          marginTop: 8, display: "flex", alignItems: "center", gap: 5,
          justifyContent: "center",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#00d4a0",
            boxShadow: "0 0 6px #00d4a0",
            animation: "pulse-glow 2s infinite",
          }} />
          <span style={{ fontSize: 9.5, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
            Systems online
          </span>
        </div>
      </div>
    </aside>
  );
}
