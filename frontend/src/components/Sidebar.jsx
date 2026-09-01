import { useContext, useState } from "react";
import { ThemeContext } from "../App.jsx";

const NAV_MAIN = [
  { id: "home", label: "Dashboard", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { id: "chat", label: "Market Brain", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 3A6.5 6.5 0 0 0 3 9.5c0 1.8.7 3.4 1.9 4.6l.1.1c.5.5.8 1.2.8 1.9V19c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-2.9c0-.7.3-1.4.8-1.9l.1-.1c1.2-1.2 1.9-2.8 1.9-4.6A6.5 6.5 0 0 0 9.5 3z"/><path d="M7 20v1.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V20"/></svg> },
  { id: "stocks", label: "Stocks Analysis", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { id: "radar", label: "Opportunity Radar", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg> },
  { id: "chart", label: "Chart Intelligence", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { id: "news", label: "News RAG", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="10" y1="10" x2="16" y2="10"/><line x1="10" y1="14" x2="16" y2="14"/></svg> },
  { id: "video", label: "Video Engine", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg> },
];

const NAV_INNOVATION = [
  { id: "backtest", label: "Strategy Backtester", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><line x1="12" y1="17" x2="12" y2="13"/></svg> },
  { id: "trackrecord", label: "Signal Track Record", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
  { id: "portfolio", label: "Portfolio", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
  { id: "regime", label: "Market Regime", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
  { id: "earnings", label: "Earnings Predictor", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
];

const INNOVATION_IDS = new Set(NAV_INNOVATION.map(n => n.id));

export default function Sidebar({ active, onNav, user, isOpen, onToggle }) {
  const { dark, toggle } = useContext(ThemeContext);
  const [innovOpen, setInnovOpen] = useState(() => INNOVATION_IDS.has(active));

  const NavItem = ({ item }) => {
    const isActive = active === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onNav(item.id)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "10px 12px", borderRadius: 8, border: "none",
          cursor: "pointer",
          background: isActive ? "var(--bg-elevated)" : "transparent",
          marginBottom: 2, transition: "all 0.2s", textAlign: "left",
          boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          borderLeft: isActive ? "3px solid #047857" : "3px solid transparent",
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)"; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: isActive ? "#047857" : "var(--text-muted)", flexShrink: 0 }}>{item.icon}</span>
        <div style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, color: isActive ? "var(--text-primary)" : "var(--text-muted)", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
      </button>
    );
  };
  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Logo - Always visible */}
      <div style={{
        padding: "24px 20px",
        flexShrink: 0,
        position: "relative",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#047857", fontFamily: "Inter, sans-serif", letterSpacing: "-0.02em" }}>
            InvestEdge
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "Inter, sans-serif" }}>
            Your Financial Co-Pilot
          </div>
        </div>
        
        {/* Toggle Button */}
        <button
          onClick={onToggle}
          style={{
            position: "absolute",
            top: "50%",
            right: -12,
            transform: "translateY(-50%)",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#047857",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(4,120,87,0.3)",
            zIndex: 10,
          }}
        >
          {isOpen ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          )}
        </button>
      </div>

      {/* Collapsible Content */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        maxHeight: isOpen ? "100%" : "0",
        opacity: isOpen ? 1 : 0,
        transition: "max-height 0.3s ease, opacity 0.3s ease",
      }}>
        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {/* Main nav items */}
          {NAV_MAIN.map(item => <NavItem key={item.id} item={item} />)}

          {/* AI Innovation section */}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setInnovOpen(o => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "transparent", marginBottom: 2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#047857" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#047857", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "Inter, sans-serif" }}>Innovation</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: innovOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            <div style={{ overflow: "hidden", maxHeight: innovOpen ? 200 : 0, transition: "max-height 0.25s ease", paddingLeft: 8 }}>
              {NAV_INNOVATION.map(item => <NavItem key={item.id} item={item} />)}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg-elevated)", cursor: "pointer", marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 7 }}>
              {dark ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
              {dark ? "Light Mode" : "Dark Mode"}
            </span>
            {/* Toggle pill */}
            <div style={{ width: 32, height: 18, borderRadius: 9, background: dark ? "#047857" : "#e5e7eb", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: dark ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#ffffff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </button>

          {/* User card */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 12px", borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#047857", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
              {user ? (user.name || user.email || "U").slice(0, 2).toUpperCase() : "IN"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "Investor"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "Inter, sans-serif" }}>PRO PLAN</div>
            </div>

          </div>
        </div>
      </div>
    </aside>
  );
}
