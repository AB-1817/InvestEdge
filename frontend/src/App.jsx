import { useState, Component, createContext, useContext, useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ChatUI from "./components/ChatUI.jsx";
import StocksAnalysis from "./components/StocksAnalysis.jsx";
import OpportunityRadarNew from "./components/OpportunityRadarNew.jsx";
import ChartIntelligence from "./components/ChartIntelligence.jsx";
import Portfolio from "./components/Portfolio.jsx";
import NewsRAG from "./components/NewsRAG.jsx";
import VideoEngine from "./components/VideoEngine.jsx";
import EarningsPredictor from "./components/EarningsPredictor.jsx";
import MarketRegime from "./components/MarketRegime.jsx";
import BacktestEngine from "./components/BacktestEngine.jsx";
import SignalTrackRecord from "./components/SignalTrackRecord.jsx";

export const ThemeContext = createContext({ dark: false, toggle: () => {} });

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", height: "100vh", padding: 32, textAlign: "center",
          background: "var(--bg-base)", color: "var(--text-primary)"
        }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: 480 }}>{this.state.error.toString()}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#047857", color: "#fff", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEWS = {
  home:      Dashboard,
  chat:      ChatUI,
  stocks:    StocksAnalysis,
  radar:     OpportunityRadarNew,
  chart:     ChartIntelligence,
  portfolio: Portfolio,
  news:      NewsRAG,
  video:     VideoEngine,
  earnings:  EarningsPredictor,
  regime:    MarketRegime,
  backtest:  BacktestEngine,
  trackrecord: SignalTrackRecord,
};

export default function App() {
  const [view, setView] = useState("home");
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const user = { name: "Investor", email: "investor@investedge.in" };
  const View = VIEWS[view] || Dashboard;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      <div className="app-shell">
        <Sidebar 
          active={view} 
          onNav={setView} 
          user={user}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
        />
        <main className="main-content">
          <ErrorBoundary key={view}>
            <View onNav={setView} />
          </ErrorBoundary>
        </main>
      </div>
    </ThemeContext.Provider>
  );
}
