import { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import LandingPage from "./components/LandingPage.jsx";
import ChatUI from "./components/ChatUI.jsx";
import OpportunityRadar from "./components/OpportunityRadar.jsx";
import ChartIntelligence from "./components/ChartIntelligence.jsx";
import Portfolio from "./components/Portfolio.jsx";
import NewsRAG from "./components/NewsRAG.jsx";
import VideoEngine from "./components/VideoEngine.jsx";

const VIEWS = {
  home:      LandingPage,
  chat:      ChatUI,
  radar:     OpportunityRadar,
  chart:     ChartIntelligence,
  portfolio: Portfolio,
  news:      NewsRAG,
  video:     VideoEngine,
};

export default function App() {
  const [view, setView] = useState("home");

  const View = VIEWS[view] || LandingPage;

  return (
    <div className="app-shell">
      <Sidebar active={view} onNav={setView} />
      <main className="main-content">
        <View onNav={setView} />
      </main>
    </div>
  );
}
