import { useState, useEffect, useRef, useCallback } from "react";

export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    view: "home",
    targetSelector: "[data-onboarding-nav='home']",
    badge: "GETTING STARTED",
    title: "Welcome to InvestEdge",
    description: "Your AI-powered financial intelligence workspace for researching, analyzing, and validating Indian equity opportunities.",
  },
  {
    id: "dashboard",
    view: "home",
    targetSelector: "[data-onboarding-nav='home']",
    badge: "OVERVIEW",
    title: "Your Market Dashboard",
    description: "Get a real-time overview of Indian equity indices (Nifty 50, Sensex), portfolio highlights, quick technical screeners, and live market sentiment.",
  },
  {
    id: "stocks",
    view: "stocks",
    targetSelector: "[data-onboarding-nav='stocks']",
    badge: "STOCK ANALYSIS",
    title: "Explore a Stock",
    description: "Search any NSE/BSE ticker for interactive price action charts, technical overlays (RSI, EMA 20/50, MACD), fundamental metrics, and AI intelligence summaries.",
  },
  {
    id: "radar",
    view: "radar",
    targetSelector: "[data-onboarding-nav='radar']",
    badge: "INSTITUTIONAL RADAR",
    title: "Find Market Opportunities",
    description: "Scan institutional bulk deals, insider trading movements, quarterly result surprises, and SEBI regulatory filings in real time.",
  },
  {
    id: "chat",
    view: "chat",
    targetSelector: "[data-onboarding-nav='chat']",
    badge: "AI ASSISTANT",
    title: "Ask Market Brain",
    description: "Interact with our conversational AI assistant to trigger technical pattern scans, fundamental valuations, and portfolio health diagnostics.",
  },
  {
    id: "backtest",
    view: "backtest",
    targetSelector: "[data-onboarding-nav='backtest']",
    badge: "QUANT BACKTESTER",
    title: "Validate Strategies",
    description: "Backtest quantitative trading models (RSI Oversold, Golden Cross, MACD) against historical data with realistic transaction cost & slippage modeling.",
  },
  {
    id: "trackrecord",
    view: "trackrecord",
    targetSelector: "[data-onboarding-nav='trackrecord']",
    badge: "TRANSPARENCY LEDGER",
    title: "Measure Signal Performance",
    description: "Review the live immutable signal ledger, win rate %, Nifty 50 alpha, and verifiable outcome tracking for complete analytical transparency.",
  },
  {
    id: "earnings",
    view: "earnings",
    targetSelector: "[data-onboarding-nav='earnings']",
    badge: "EVENT STUDY",
    title: "Study Earnings Reactions",
    description: "Analyze historical quarterly earnings surprises and post-earnings price reactions to evaluate pricing expectations ahead of corporate results.",
  },
  {
    id: "portfolio",
    view: "portfolio",
    targetSelector: "[data-onboarding-nav='portfolio']",
    badge: "PORTFOLIO RISK",
    title: "Review Portfolio Risk",
    description: "Receive automated portfolio health scoring, concentration risk analysis, and individual holding technical & fundamental recommendations.",
  },
  {
    id: "complete",
    view: "home",
    targetSelector: null,
    badge: "TOUR COMPLETE",
    title: "You're Ready to Explore",
    description: "You're all set! Navigate freely across InvestEdge tools to enhance your equity research and trading workflow.",
  },
];

const LOCAL_STORAGE_KEY = "investedge_onboarding_completed";

/**
 * Intelligent helper to determine if a target DOM element is an interactive control.
 * Prevents accidental tour advancement when the user clicks buttons, inputs, links, tabs, or dropdowns.
 */
const isInteractiveControl = (el) => {
  if (!el || el === document.body || el === document.documentElement) return false;

  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  if (["button", "a", "input", "textarea", "select", "option", "label", "summary", "details"].includes(tag)) {
    return true;
  }

  const role = el.getAttribute ? el.getAttribute("role") : null;
  if (role === "button" || role === "link" || role === "tab" || role === "menuitem") {
    return true;
  }

  if (el.style && el.style.cursor === "pointer") {
    return true;
  }

  try {
    const compStyle = window.getComputedStyle(el);
    if (compStyle && compStyle.cursor === "pointer") {
      return true;
    }
  } catch (err) {}

  return el.parentElement ? isInteractiveControl(el.parentElement) : false;
};

export default function OnboardingGuide({ currentView, onNav, isManualStart, onManualClose }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  const cardRef = useRef(null);
  const retryTimerRef = useRef(null);

  // Check initial first-time status or manual start trigger
  useEffect(() => {
    if (isManualStart) {
      setStepIndex(0);
      setActive(true);
      return;
    }

    const completed = localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
    if (!completed) {
      setActive(true);
      setStepIndex(0);
    }
  }, [isManualStart]);

  // Expose safe dev window helper
  useEffect(() => {
    window.resetInvestEdgeOnboarding = () => {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setStepIndex(0);
      setActive(true);
    };
    window.startInvestEdgeOnboarding = () => {
      setStepIndex(0);
      setActive(true);
    };
  }, []);

  const currentStep = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0];

  // Navigate to required view for step
  useEffect(() => {
    if (!active) return;
    if (currentStep.view && currentStep.view !== currentView) {
      onNav(currentStep.view);
    }
  }, [active, stepIndex, currentStep.view, currentView, onNav]);

  // Locate target DOM node and calculate positions
  const updateTargetAndCardPosition = useCallback(() => {
    if (!active) return;

    const selector = currentStep.targetSelector;
    if (!selector) {
      // Step 10 complete step has no target
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setTargetRect(null);
      setCardPos({
        top: Math.max(20, vh / 2 - 110),
        left: Math.max(16, vw / 2 - 180),
        width: Math.min(360, vw - 32),
      });
      return;
    }

    let attempts = 0;

    const findNode = () => {
      const el = document.querySelector(selector) || document.querySelector("[data-onboarding-nav='home']");
      if (el) {
        // Scroll into view if needed
        try {
          el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        } catch (err) {
          el.scrollIntoView();
        }

        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });

        // Compute floating card position
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setViewportWidth(vw);

        const cardW = Math.min(360, vw - 32);
        const cardH = 220;

        if (vw < 768) {
          // Mobile placement
          setCardPos({
            top: Math.max(16, vh - cardH - 24),
            left: 16,
            width: cardW,
          });
        } else {
          // Desktop positioning (Right -> Left -> Below -> Above)
          let top = rect.top + (rect.height - cardH) / 2;
          let left = rect.right + 16;

          // If clipping right, place left
          if (left + cardW > vw - 16) {
            left = rect.left - cardW - 16;
          }
          // If clipping left, place below
          if (left < 16) {
            left = rect.left + (rect.width - cardW) / 2;
            top = rect.bottom + 16;
          }
          // If clipping bottom, place above
          if (top + cardH > vh - 16) {
            top = rect.top - cardH - 16;
          }

          // Clamp within safe viewport padding
          left = Math.max(16, Math.min(left, vw - cardW - 16));
          top = Math.max(16, Math.min(top, vh - cardH - 16));

          setCardPos({ top, left, width: cardW });
        }
      } else if (attempts < 8) {
        attempts++;
        retryTimerRef.current = setTimeout(findNode, 80);
      } else {
        // Fallback to centered card if target not found
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setTargetRect(null);
        setCardPos({
          top: Math.max(20, vh / 2 - 110),
          left: Math.max(16, vw / 2 - 180),
          width: Math.min(360, vw - 32),
        });
      }
    };

    findNode();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [active, stepIndex, currentStep]);

  useEffect(() => {
    updateTargetAndCardPosition();

    const handleResizeOrScroll = () => {
      updateTargetAndCardPosition();
    };

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [updateTargetAndCardPosition]);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(LOCAL_STORAGE_KEY, "true");
    if (onManualClose) onManualClose();
  }, [onManualClose]);

  const nextStep = useCallback(() => {
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
    } else {
      dismiss();
    }
  }, [stepIndex, dismiss]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  }, [stepIndex]);

  // Click-anywhere progression listener with intelligent interactive control exclusion
  useEffect(() => {
    if (!active) return;

    const handleGlobalClick = (e) => {
      // 1. Exclude clicks inside the onboarding guide card itself
      if (cardRef.current && cardRef.current.contains(e.target)) {
        return;
      }

      // 2. Exclude clicks on actual application controls (buttons, links, inputs, tabs, dropdowns, etc.)
      if (isInteractiveControl(e.target)) {
        return;
      }

      // 3. Otherwise (clicking empty page space / layout background) -> advance tour
      nextStep();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        dismiss();
      }
    };

    window.addEventListener("click", handleGlobalClick, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("click", handleGlobalClick, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, nextStep, dismiss]);

  if (!active) return null;

  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  return (
    <>
      {/* Soft Backdrop - Non-blocking overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.45)",
          zIndex: 9990,
          pointerEvents: "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Spotlight Ring wrapping ONLY the active sidebar nav option */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.top - 2,
            left: targetRect.left - 2,
            width: targetRect.width + 4,
            height: targetRect.height + 4,
            borderRadius: 10,
            border: "2px solid #047857",
            boxShadow: "0 0 0 3px rgba(4, 120, 87, 0.25), 0 0 16px rgba(4, 120, 87, 0.3)",
            zIndex: 9995,
            pointerEvents: "none",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      )}

      {/* Floating Onboarding Card */}
      <div
        ref={cardRef}
        style={{
          position: "fixed",
          top: cardPos.top,
          left: cardPos.left,
          width: cardPos.width,
          zIndex: 9999,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08)",
          padding: "18px 20px",
          color: "var(--text-primary)",
          fontFamily: "Inter, sans-serif",
          transition: "top 0.25s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Header Tag Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#047857",
                background: "rgba(4, 120, 87, 0.12)",
                padding: "3px 8px",
                borderRadius: 4,
                fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.06em",
              }}
            >
              {currentStep.badge}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {stepIndex + 1} / {ONBOARDING_STEPS.length}
            </span>
          </div>

          <button
            onClick={dismiss}
            aria-label="Close onboarding guide"
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              transition: "all 0.15s ease",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step Title */}
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          {currentStep.title}
        </h3>

        {/* Step Description */}
        <p
          style={{
            fontSize: 12.5,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            marginBottom: 16,
          }}
        >
          {currentStep.description}
        </p>

        {/* Bottom Actions Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#047857",
                display: "inline-block",
              }}
            />
            {viewportWidth >= 768 ? "Click empty space to advance" : "Tap empty space to advance"}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {stepIndex > 0 && (
              <button
                onClick={prevStep}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={nextStep}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: "#047857",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(4, 120, 87, 0.25)",
              }}
            >
              {isLast ? "Got it!" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
