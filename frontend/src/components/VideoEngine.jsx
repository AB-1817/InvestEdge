import { useState, useEffect } from "react";

const DAILY_HIGHLIGHTS = [
  { time: "09:15", label: "Market Open", color: "#00d4a0", icon: "🔔" },
  { time: "11:30", label: "Mid-Session Movers", color: "#3b82f6", icon: "📊" },
  { time: "14:00", label: "FII/DII Activity", color: "#f59e0b", icon: "🏦" },
  { time: "15:30", label: "Closing Bell Recap", color: "#7c3aed", icon: "🎬" },
];

const SAMPLE_RECAPS = [
  {
    date: "Today",
    title: "Nifty closes above 22,500 as IT stocks surge",
    views: "14.2K",
    duration: "3:24",
    status: "ready",
    thumb: "📈",
  },
  {
    date: "Yesterday",
    title: "RBI policy surprise — rate cut impact on banking stocks",
    views: "28.7K",
    duration: "4:11",
    status: "ready",
    thumb: "🏦",
  },
  {
    date: "2 days ago",
    title: "Reliance Q4 results: beat or miss? Full breakdown",
    views: "41.5K",
    duration: "5:02",
    status: "ready",
    thumb: "🛢️",
  },
];

function AnimatedBar({ delay = 0, height = 60 }) {
  const [tick, setTick] = useState(0);
  const [bars, setBars] = useState(() => Array.from({ length: 20 }, () => Math.random()));

  useEffect(() => {
    const id = setInterval(() => {
      setBars(prev => prev.map(b => Math.max(0.05, Math.min(1, b + (Math.random() - 0.5) * 0.2))));
      setTick(t => t + 1);
    }, 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          width: 5, flex: 1,
          height: `${b * 100}%`,
          background: i % 3 === 0
            ? "linear-gradient(180deg,#7c3aed,#4f46e5)"
            : i % 3 === 1
            ? "linear-gradient(180deg,#0ea5e9,#3b82f6)"
            : "linear-gradient(180deg,#00d4a0,#059669)",
          borderRadius: "2px 2px 0 0",
          transition: "height 0.5s ease",
          opacity: 0.7 + b * 0.3,
        }} />
      ))}
    </div>
  );
}

export default function VideoEngine() {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [topic, setTopic] = useState("");
  const [done, setDone] = useState(false);

  const STEPS = [
    "Gathering market data…",
    "Generating script with AI…",
    "Rendering visual overlays…",
    "Synthesizing voice narration…",
    "Encoding final video…",
    "Video ready! ✅",
  ];

  function startGenerate() {
    if (!topic.trim()) return;
    setGenerating(true); setDone(false); setProgress(0);
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setProgress(step);
      if (step >= STEPS.length) { clearInterval(iv); setDone(true); }
    }, 900);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px" }}>
      <div className="section-header">
        <div className="section-icon" style={{ background: "#071a0f", border: "1px solid #00d4a030" }}>🎬</div>
        <div>
          <div className="section-title">Video Engine</div>
          <div className="section-sub">The Producer — AI Market Recap Videos</div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        padding: "14px 16px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 10, marginBottom: 28,
        fontSize: 13, color: "#64748b", lineHeight: 1.6,
      }}>
        Generative AI video pipeline powered by <strong style={{ color: "#94a3b8" }}>Veo · HeyGen</strong>.
        Automated daily recap videos with market data overlays, AI narration, and visual charts.
        <span style={{ color: "#00d4a0" }}> Automated Daily · Personalized · Multi-format Output</span>
      </div>

      {/* Pipeline visual */}
      <div style={{
        padding: "20px 24px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 14, marginBottom: 28,
      }}>
        <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
          Generation Pipeline
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", rowGap: 10 }}>
          {[
            { icon: "📡", label: "Live Data", color: "#0ea5e9" },
            { icon: "🧠", label: "LLM Script", color: "#7c3aed" },
            { icon: "🎨", label: "Visual Render", color: "#f97316" },
            { icon: "🎙️", label: "AI Narration", color: "#3b82f6" },
            { icon: "✂️", label: "Video Encode", color: "#10b981" },
            { icon: "🎬", label: "Final Output", color: "#00d4a0" },
          ].map((s, i) => (
            <>
              <div key={s.label} style={{
                padding: "8px 14px", borderRadius: 8,
                background: s.color + "15", border: `1px solid ${s.color}30`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 9.5, color: s.color, fontFamily: "JetBrains Mono, monospace" }}>
                  {s.label}
                </div>
              </div>
              {i < 5 && <span style={{ color: "#1e3a5f", fontSize: 14 }}>→</span>}
            </>
          ))}
        </div>
      </div>

      {/* Daily schedule */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          Automated Schedule
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {DAILY_HIGHLIGHTS.map(h => (
            <div key={h.time} style={{
              padding: "14px 16px", background: "#080e1a",
              border: `1px solid ${h.color}20`, borderRadius: 10,
              borderLeft: `3px solid ${h.color}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{h.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: h.color,
                  fontFamily: "JetBrains Mono, monospace" }}>{h.time}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Inter, sans-serif" }}>{h.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Waveform visualization */}
      <div style={{
        padding: "20px 24px", background: "#080e1a",
        border: "1px solid #0f1e33", borderRadius: 14, marginBottom: 28,
      }}>
        <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
          Live Audio Waveform Preview
        </div>
        <AnimatedBar height={64} />
        <div style={{ marginTop: 8, fontSize: 10, color: "#1e3a5f",
          fontFamily: "JetBrains Mono, monospace" }}>
          AI Narrator · Hinglish · ElevenLabs Voice
        </div>
      </div>

      {/* Generate */}
      <div style={{
        padding: "22px 24px", background: "#080e1a",
        border: "1px solid #00d4a020", borderRadius: 14, marginBottom: 28,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 14,
          fontFamily: "Outfit, sans-serif" }}>
          Generate Custom Recap Video
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input
            className="input"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Topic… 'Nifty50 weekly recap', 'HDFC Bank Q4', 'FII selloff explained'"
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={startGenerate}
            disabled={!topic.trim() || generating}
            style={{ background: "linear-gradient(135deg,#065f46,#00d4a0)", minWidth: 140 }}
          >
            {generating ? "Generating…" : "🎬 Generate"}
          </button>
        </div>

        {/* Progress */}
        {generating && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#00d4a0", fontFamily: "JetBrains Mono, monospace" }}>
                {STEPS[Math.min(progress, STEPS.length - 1)]}
              </div>
              <div style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono, monospace" }}>
                {Math.round((progress / (STEPS.length - 1)) * 100)}%
              </div>
            </div>
            <div style={{ height: 6, background: "#0a1220", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(progress / (STEPS.length - 1)) * 100}%`,
                background: "linear-gradient(90deg,#059669,#00d4a0)",
                borderRadius: 3,
                transition: "width 0.8s ease",
              }} />
            </div>
          </div>
        )}

        {done && (
          <div style={{
            marginTop: 14, padding: "14px 18px",
            background: "#001f12", border: "1px solid #00d4a040", borderRadius: 10,
            color: "#00d4a0", fontSize: 13, fontFamily: "JetBrains Mono, monospace",
          }}>
            ✅ Video generated! Ready to download or share.
          </div>
        )}
      </div>

      {/* Past recaps */}
      <div>
        <div style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          Recent Recaps
        </div>
        {SAMPLE_RECAPS.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "14px 18px", background: "#080e1a",
            border: "1px solid #0f1e33", borderRadius: 12, marginBottom: 8,
            cursor: "pointer", transition: "border-color 0.2s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#1e3a66"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#0f1e33"}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 8,
              background: "#0a1220", border: "1px solid #0f1e33",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, flexShrink: 0,
            }}>{r.thumb}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontFamily: "Inter, sans-serif",
                fontWeight: 500, marginBottom: 4 }}>{r.title}</div>
              <div style={{ display: "flex", gap: 10, fontSize: 10.5, color: "#334155",
                fontFamily: "JetBrains Mono, monospace" }}>
                <span>{r.date}</span>
                <span>· {r.views} views</span>
                <span>· {r.duration}</span>
              </div>
            </div>
            <div style={{
              padding: "4px 10px", borderRadius: 6,
              background: "#001f12", border: "1px solid #00d4a030",
              color: "#00d4a0", fontSize: 10, fontFamily: "JetBrains Mono, monospace",
            }}>▶ PLAY</div>
          </div>
        ))}
      </div>
    </div>
  );
}
