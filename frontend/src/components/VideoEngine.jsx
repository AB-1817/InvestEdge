import { useState, useEffect, useRef } from "react";

const BACKEND = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VIDEO_TYPES = [
  { id: "market-wrap",     label: "Daily Market Wrap",  icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>, endpoint: "/api/video/market-wrap",     color: "#047857" },
  { id: "race-chart",      label: "Race Chart",         icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, endpoint: "/api/video/race-chart",      color: "#7c3aed" },
  { id: "sector-rotation", label: "Sector Rotation",    icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>, endpoint: "/api/video/sector-rotation", color: "#ea580c" },
  { id: "fii-dii",         label: "FII/DII Flows",      icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, endpoint: "/api/video/fii-dii",         color: "#0369a1" },
  { id: "ipo-tracker",     label: "IPO Tracker",        icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, endpoint: "/api/video/ipo-tracker",     color: "#dc2626" },
];

const SCHEDULE = [
  { time: "09:30 AM", type: "market-wrap",     status: "completed" },
  { time: "12:00 PM", type: "sector-rotation", status: "completed" },
  { time: "03:30 PM", type: "fii-dii",         status: "pending" },
  { time: "04:00 PM", type: "race-chart",      status: "pending" },
  { time: "05:00 PM", type: "ipo-tracker",     status: "pending" },
];

// ─── Canvas Renderers ─────────────────────────────────────────────────────────

function renderMarketWrap(ctx, W, H, data, frame) {
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.title || "Daily Market Wrap", W / 2, 50);

  // Indices
  const indices = data.indices || [];
  let y = 100;
  ctx.textAlign = "left";
  ctx.font = "16px Inter, sans-serif";
  indices.forEach((idx, i) => {
    const color = idx.change >= 0 ? "#22c55e" : "#ef4444";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(idx.name, 40, y);
    ctx.fillStyle = color;
    ctx.fillText(`${idx.value.toLocaleString()} (${idx.change > 0 ? "+" : ""}${idx.change.toFixed(2)}%)`, 200, y);
    y += 30;
  });

  // Gainers
  y += 20;
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.fillText("TOP GAINERS", 40, y);
  y += 25;
  ctx.font = "13px Inter, sans-serif";
  (data.gainers || []).slice(0, 3).forEach(g => {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${g.symbol}: +${g.change.toFixed(2)}%`, 40, y);
    y += 22;
  });

  // Losers
  y += 15;
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.fillText("TOP LOSERS", 40, y);
  y += 25;
  ctx.font = "13px Inter, sans-serif";
  (data.losers || []).slice(0, 3).forEach(l => {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${l.symbol}: ${l.change.toFixed(2)}%`, 40, y);
    y += 22;
  });

  // Animated wave
  ctx.strokeStyle = "rgba(4,120,87,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < W; x += 2) {
    const y = H - 40 + Math.sin(x * 0.05 + frame * 0.05) * 15;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function renderRaceChart(ctx, W, H, data, frame) {
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.title || "YTD Performance Race", W / 2, 40);

  const series = data.series || [];
  const barH = 28;
  const startY = 80;
  const maxPct = Math.max(...series.map(s => Math.abs(s.current_pct)), 10);

  series.slice(0, 10).forEach((s, i) => {
    const y = startY + i * (barH + 8);
    const barW = (Math.abs(s.current_pct) / maxPct) * (W - 240);
    const color = s.current_pct >= 0 ? "#22c55e" : "#ef4444";

    ctx.fillStyle = "#ffffff";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${i + 1}. ${s.name}`, 20, y + 18);

    ctx.fillStyle = color;
    ctx.fillRect(180, y, barW, barH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${s.current_pct > 0 ? "+" : ""}${s.current_pct.toFixed(1)}%`, W - 20, y + 18);
  });
}

function renderSectorRotation(ctx, W, H, data, frame) {
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Sector Rotation Map", W / 2, 40);

  const sectors = data.sectors || [];
  const gridCols = 3;
  const cellW = (W - 80) / gridCols;
  const cellH = 60;
  let x = 40, y = 80;

  sectors.slice(0, 9).forEach((sec, i) => {
    const color = sec.change_1d >= 0 ? "#22c55e" : "#ef4444";
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x, y, cellW - 10, cellH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(sec.sector, x + 10, y + 22);

    ctx.fillStyle = color;
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.fillText(`${sec.change_1d > 0 ? "+" : ""}${sec.change_1d.toFixed(2)}%`, x + 10, y + 45);

    x += cellW;
    if ((i + 1) % gridCols === 0) {
      x = 40;
      y += cellH + 10;
    }
  });
}

function renderFiiDii(ctx, W, H, data, frame) {
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FII / DII Flow Tracker", W / 2, 40);

  const flows = data.flows || [];
  
  // Debug: show data count
  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px Inter, sans-serif";
  ctx.fillText(`Data points: ${flows.length}`, W / 2, 60);

  if (flows.length === 0) {
    ctx.fillStyle = "#ef4444";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText("No flow data available", W / 2, H / 2);
    return;
  }

  const barW = 40;
  const startX = 60;
  const baseY = H - 100;
  const maxVal = Math.max(...flows.map(f => Math.max(Math.abs(f.fii_net), Math.abs(f.dii_net))), 1);
  const MIN_BAR = 4;

  // Zero baseline
  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX - 10, baseY);
  ctx.lineTo(startX + flows.length * (barW + 8) + 10, baseY);
  ctx.stroke();

  flows.slice(0, 10).forEach((f, i) => {
    const x = startX + i * (barW + 8);

    // FII bar
    const fiiH = Math.max((Math.abs(f.fii_net) / maxVal) * 120, MIN_BAR);
    ctx.fillStyle = f.fii_net >= 0 ? "#22c55e" : "#ef4444";
    ctx.fillRect(x, baseY - fiiH, barW / 2 - 2, fiiH);

    // FII value label
    ctx.fillStyle = "#ffffff";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.fii_net === 0 ? "0" : (f.fii_net > 0 ? "+" : "") + f.fii_net.toFixed(0), x + barW / 4 - 1, baseY - fiiH - 4);

    // DII bar
    const diiH = Math.max((Math.abs(f.dii_net) / maxVal) * 120, MIN_BAR);
    ctx.fillStyle = f.dii_net >= 0 ? "#3b82f6" : "#f97316";
    ctx.fillRect(x + barW / 2, baseY - diiH, barW / 2 - 2, diiH);

    // DII value label
    ctx.fillStyle = "#ffffff";
    ctx.fillText(f.dii_net === 0 ? "0" : (f.dii_net > 0 ? "+" : "") + f.dii_net.toFixed(0), x + barW * 3 / 4, baseY - diiH - 4);

    // Date label
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "center";
    ctx.fillText(f.date ? f.date.slice(5) : "", x + barW / 2, baseY + 15);
  });

  // Legend
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(40, 70, 12, 12);
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("FII", 58, 80);

  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(100, 70, 12, 12);
  ctx.fillText("DII", 118, 80);
}

function renderIpoTracker(ctx, W, H, data, frame) {
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("IPO Tracker — Live", W / 2, 40);

  const ipos = data.ipos || [];
  let y = 80;

  ctx.textAlign = "left";
  ipos.slice(0, 6).forEach((ipo, i) => {
    const statusColor = ipo.status === "Open" ? "#22c55e" : ipo.status === "Listed" ? "#3b82f6" : "#9ca3af";
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Inter, sans-serif";
    ctx.fillText(ipo.name.slice(0, 30), 40, y);

    ctx.fillStyle = statusColor;
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(ipo.status, 40, y + 18);

    if (ipo.listing_gain !== null && ipo.listing_gain !== undefined) {
      const gainColor = ipo.listing_gain >= 0 ? "#22c55e" : "#ef4444";
      ctx.fillStyle = gainColor;
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${ipo.listing_gain > 0 ? "+" : ""}${ipo.listing_gain.toFixed(1)}%`, W - 40, y + 10);
      ctx.textAlign = "left";
    }

    y += 50;
  });

  // Summary
  const summary = data.summary || {};
  y = H - 60;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px Inter, sans-serif";
  ctx.fillText(`Open: ${summary.open || 0} | Upcoming: ${summary.upcoming || 0} | Avg Gain: ${summary.avg_listing_gain || 0}%`, 40, y);
}

const RENDERERS = {
  "market-wrap":     renderMarketWrap,
  "race-chart":      renderRaceChart,
  "sector-rotation": renderSectorRotation,
  "fii-dii":         renderFiiDii,
  "ipo-tracker":     renderIpoTracker,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoEngine() {
  const [activeType, setActiveType]   = useState(null);
  const [videoData, setVideoData]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [playing, setPlaying]         = useState(false);
  const [recording, setRecording]     = useState(false);
  const [recorded, setRecorded]       = useState(null);

  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const frameRef    = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const synthRef    = useRef(window.speechSynthesis);

  // Fetch video data
  async function fetchVideo(type) {
    setLoading(true);
    setError(null);
    setVideoData(null);
    setRecorded(null);
    setPlaying(false);
    setActiveType(type.id);

    try {
      const res = await fetch(`${BACKEND}${type.endpoint}`);
      if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`);
      const data = await res.json();
      console.log('Video data received:', data);
      setVideoData({ ...data, typeId: type.id });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Canvas animation loop
  useEffect(() => {
    if (!videoData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const renderer = RENDERERS[videoData.typeId];

    function animate() {
      frameRef.current += 1;
      if (renderer) renderer(ctx, canvas.width, canvas.height, videoData, frameRef.current);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoData]);

  // Play with TTS
  function startPlayback(withRecord = false) {
    if (!videoData?.script) return;
    const synth = synthRef.current;
    synth.cancel();

    const utt = new SpeechSynthesisUtterance(videoData.script);
    utt.rate  = 0.92;
    utt.pitch = 1.0;
    utt.lang  = "en-IN";

    const voices = synth.getVoices();
    const preferred = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Microsoft"))) || voices[0];
    if (preferred) utt.voice = preferred;

    utt.onend = () => {
      setPlaying(false);
      if (withRecord) stopRecording();
    };

    setPlaying(true);
    if (withRecord) startRecording();
    synth.speak(utt);
  }

  function stopPlayback() {
    synthRef.current.cancel();
    setPlaying(false);
    if (recording) stopRecording();
  }

  function startRecording() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    chunksRef.current = [];
    const stream = canvas.captureStream(30);

    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecorded(URL.createObjectURL(blob));
        setRecording(false);
      };
      rec.start(100);
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error("MediaRecorder error:", e);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function downloadVideo() {
    if (!recorded) return;
    const a = document.createElement("a");
    a.href = recorded;
    a.download = `${activeType || "video"}-${Date.now()}.webm`;
    a.click();
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-base)", fontFamily: "Inter, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", padding: "20px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Video Engine</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
          Auto-generate 30–90s market videos — zero human editing
        </p>
      </div>

      <div style={{ padding: "24px 32px" }}>

        {/* Pipeline Stages */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Production Pipeline</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {[
              { label: "INGEST", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>, active: true },
              { label: "ANALYZE", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, active: true },
              { label: "SCRIPTING", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>, active: true },
              { label: "VOICEOVER", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>, active: false },
              { label: "VISUALS", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m6-12h-6m6 6h-6M7.05 7.05l4.24 4.24m0 0l4.24 4.24m-4.24-4.24l-4.24 4.24m4.24-4.24L7.05 7.05"/></svg>, active: false },
              { label: "PUBLISH", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>, active: false },
            ].map((stage, i) => (
              <div key={i} style={{
                background: "var(--bg-elevated)",
                borderRadius: 12,
                border: "2px solid",
                borderColor: stage.active ? "#047857" : "var(--border)",
                borderBottom: stage.active ? "4px solid #047857" : "4px solid var(--border)",
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s",
              }}>
                <div style={{ color: stage.active ? "#047857" : "var(--text-muted)", opacity: stage.active ? 1 : 0.5 }}>{stage.icon}</div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: stage.active ? "#047857" : "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  textAlign: "center",
                }}>
                  {stage.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Automated Schedule */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Automated Broadcasting Schedule</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {SCHEDULE.map((s, i) => {
              const vt = VIDEO_TYPES.find(v => v.id === s.type);
              const isCompleted = s.status === "completed";
              return (
                <div key={i} style={{
                  background: "var(--bg-elevated)",
                  borderRadius: 12,
                  border: "2px solid",
                  borderColor: isCompleted ? "#047857" : "var(--border)",
                  borderLeft: isCompleted ? "4px solid #047857" : "4px solid var(--border)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{s.time}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{vt?.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Chart patterns & Breakouts</div>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: isCompleted ? "#f0fdf4" : "#f3f4f6",
                    color: isCompleted ? "#047857" : "var(--text-muted)",
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    {isCompleted ? "● Completed" : "○ Queued"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* On-Demand Generation */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>On-Demand Generation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {VIDEO_TYPES.map(vt => (
              <button
                key={vt.id}
                onClick={() => fetchVideo(vt)}
                disabled={loading}
                style={{
                  padding: "16px", borderRadius: 12, border: "2px solid",
                  borderColor: activeType === vt.id ? vt.color : "var(--border)",
                  background: activeType === vt.id ? `${vt.color}10` : "var(--bg-elevated)",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ color: activeType === vt.id ? vt.color : "var(--text-muted)" }}>{vt.icon}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textAlign: "center" }}>{vt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: 13, marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {error}
          </div>
        )}

        {/* Canvas + Controls */}
        {videoData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
            {/* Canvas */}
            <div style={{ background: "#0a0f1e", borderRadius: 16, overflow: "hidden", aspectRatio: "16/9" }}>
              <canvas ref={canvasRef} width={800} height={450} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>

            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "var(--bg-elevated)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Playback</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <button
                    onClick={() => playing ? stopPlayback() : startPlayback(false)}
                    style={{
                      padding: "10px", borderRadius: 8, border: "none",
                      background: playing ? "#fef2f2" : "#f0fdf4",
                      color: playing ? "#dc2626" : "#047857",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {playing ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                        Stop
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Play
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => playing ? stopPlayback() : startPlayback(true)}
                    disabled={playing}
                    style={{
                      padding: "10px", borderRadius: 8, border: "none",
                      background: recording ? "#fef2f2" : "#eff6ff",
                      color: recording ? "#dc2626" : "#1d4ed8",
                      fontSize: 13, fontWeight: 600, cursor: playing ? "not-allowed" : "pointer",
                      opacity: playing && !recording ? 0.5 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={recording ? "#dc2626" : "#1d4ed8"}><circle cx="12" cy="12" r="10"/></svg>
                    {recording ? "Recording…" : "Record"}
                  </button>
                </div>
                <button
                  onClick={downloadVideo}
                  disabled={!recorded}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 8, border: "none",
                    background: recorded ? "#faf5ff" : "#f3f4f6",
                    color: recorded ? "#7c3aed" : "#9ca3af",
                    fontSize: 13, fontWeight: 600, cursor: recorded ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                {recorded && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 11, color: "#047857", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Video ready! Click Download.
                  </div>
                )}
              </div>

              {videoData.script && (
                <div style={{ background: "var(--bg-elevated)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>Script</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, maxHeight: 200, overflowY: "auto", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: 8 }}>
                    {videoData.script}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ background: "var(--bg-elevated)", borderRadius: 12, border: "1px solid var(--border)", padding: 60, textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "#047857", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Generating video data…</div>
          </div>
        )}

        {/* Recent Recaps */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Recent Recaps</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {VIDEO_TYPES.slice(0, 3).map(vt => (
              <div key={vt.id} style={{ background: "var(--bg-elevated)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{vt.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>2 hours ago</div>
                  </div>
                </div>
                <button
                  onClick={() => fetchVideo(vt)}
                  style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: "none",
                    background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Regenerate
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
