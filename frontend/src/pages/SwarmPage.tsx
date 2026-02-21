import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Eye, RotateCcw } from "lucide-react";
import { useApp, fetchJudgeSweep } from "../store";

const STORAGE_KEY = "swarm-eval-status";

function loadPersistedStatus(): {
  progresses: Record<string, number>;
  allDone: boolean;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { progresses?: Record<string, number>; allDone?: boolean };
    if (!parsed.progresses || typeof parsed.allDone !== "boolean") return null;
    return { progresses: parsed.progresses, allDone: parsed.allDone };
  } catch {
    return null;
  }
}

function savePersistedStatus(progresses: Record<string, number>, allDone: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ progresses, allDone }));
  } catch {
    // ignore quota / privacy errors
  }
}

function clearPersistedStatus() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  color: string;
  speed: number; // ms to complete (simulated)
  streamContent: string;
}

const MODELS: ModelConfig[] = [
  {
    id: "gpt-codex",
    name: "GPT-Codex",
    provider: "OpenAI",
    color: "#10b981",
    speed: 14000,
    streamContent: `## Email Triage Report

After analyzing 47 emails in your inbox, I've identified the top 3 most important ones:

### 1. Critical: Q4 Revenue Review - Action Required
**From**: Sarah Chen (VP of Sales)
**Subject**: Q4 Revenue Review Meeting - Prep Materials Needed by EOD

**Why important**: Direct request from VP requiring immediate action with end-of-day deadline.

**Action items**:
- Prepare Q4 revenue summary slides
- Include YoY comparison data
- Send to Sarah by 5:00 PM EST

### 2. High: Production Incident - Database Latency
**From**: DevOps Alert System
**Subject**: [P1] Production database latency spike detected

**Why important**: Production system issue affecting customer-facing services.

**Action items**:
- Review latency metrics dashboard
- Coordinate with backend team
- Prepare incident response if needed

### 3. Medium: New Client Onboarding
**From**: Michael Torres (Account Manager)
**Subject**: Acme Corp onboarding kickoff - Your input needed

**Why important**: New enterprise client worth $2.4M ARR.

**Action items**:
- Review technical requirements doc
- Provide feasibility assessment
- Join kickoff call Thursday 2PM`,
  },
  {
    id: "claude-opus",
    name: "Claude Opus",
    provider: "Anthropic",
    color: "#f97316",
    speed: 16000,
    streamContent: `I've carefully reviewed all 47 emails in your inbox. Here are the 3 that demand your attention most urgently:

**1. Q4 Revenue Review - Prep Materials (CRITICAL)**

Sarah Chen, your VP of Sales, needs revenue summary slides by end of day. This is a direct ask from leadership with a hard deadline — I'd prioritize this first.

Key actions:
• Pull Q4 revenue numbers and create comparison slides
• Include year-over-year trends
• Email to Sarah before 5 PM EST

**2. Production Database Alert (HIGH)**

Your monitoring system flagged a P1 latency spike in production. While this might resolve on its own, the customer impact makes it worth investigating now.

Key actions:
• Check the latency dashboard immediately
• Loop in the backend team if numbers are still elevated
• Document any findings for the incident log

**3. Acme Corp Onboarding (MEDIUM)**

Michael Torres needs your technical input for a new $2.4M enterprise client. Not urgent today, but responding within 24 hours shows the account team you're engaged.

Key actions:
• Skim the technical requirements (10 min read)
• Flag any blockers or concerns
• Confirm your attendance at Thursday's kickoff

Everything else in your inbox is either FYI-only or can wait until next week.`,
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "Google",
    color: "#3b82f6",
    speed: 11000,
    streamContent: `# Email Priority Analysis

## Summary
Scanned 47 emails. Identified 3 requiring immediate attention.

## Priority Emails

### [P0] Q4 Revenue Review
- **Sender**: Sarah Chen, VP Sales
- **Deadline**: Today EOD
- **Type**: Action Required
- **Impact**: High — executive visibility
- **Tasks**: Prepare revenue slides with YoY data, submit by 5 PM

### [P1] Production Latency Alert
- **Sender**: DevOps Monitoring
- **Severity**: P1
- **Type**: Incident
- **Impact**: High — customer-facing degradation
- **Tasks**: Check metrics, coordinate response, escalate if needed

### [P2] Enterprise Client Onboarding
- **Sender**: Michael Torres, Account Mgmt
- **Type**: Collaboration Request
- **Impact**: Medium — $2.4M ARR opportunity
- **Tasks**: Review requirements, provide technical assessment, RSVP for Thursday

## Classification Stats
- Critical: 1 | High: 1 | Medium: 1
- Remaining: 12 informational, 8 newsletters, 22 low-priority`,
  },
  {
    id: "kimi-25",
    name: "Kimi 2.5",
    provider: "Moonshot",
    color: "#a855f7",
    speed: 9000,
    streamContent: `Here are your top 3 important emails:

**1. Q4 Revenue Review (URGENT)**
From: Sarah Chen (VP Sales)
→ She needs revenue slides by end of day
→ Include Q4 numbers + year-over-year comparison
→ Priority: CRITICAL

**2. Production Alert - DB Latency**
From: DevOps System
→ P1 latency spike in production database
→ May affect customer experience
→ Check dashboard and coordinate with team
→ Priority: HIGH

**3. Acme Corp Onboarding**
From: Michael Torres (Account Manager)
→ New $2.4M client needs technical review
→ Kickoff meeting Thursday at 2 PM
→ Priority: MEDIUM

Summary: 3 actionable / 44 can wait`,
  },
];

function SwarmParticles({
  color,
  isActive,
  progress,
}: {
  color: string;
  isActive: boolean;
  progress: number;
}) {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      radius: 28 + Math.random() * 55,
      duration: 1.8 + Math.random() * 4,
      delay: Math.random() * -6,
      size: 2 + Math.random() * 3.5,
      opacity: 0.25 + Math.random() * 0.55,
      reverse: Math.random() > 0.5,
      pulseSpeed: 1.5 + Math.random() * 3,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`swarm-particle ${p.reverse ? "reverse" : ""}`}
          style={
            {
              "--orbit-duration": `${p.duration}s`,
              "--radius": `${p.radius}px`,
              "--pulse-duration": `${p.pulseSpeed}s`,
              width: p.size,
              height: p.size,
              background: color,
              boxShadow: `0 0 ${p.size * 3}px ${color}`,
              opacity: isActive ? p.opacity * (0.5 + progress * 0.005) : 0.08,
              animationPlayState: isActive ? "running" : "paused",
              animationDelay: `${p.delay}s`,
              transition: "opacity 0.5s ease",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ProgressRing({
  progress,
  color,
  size = 100,
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-arena-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring-circle"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

function StreamingModal({
  model,
  onClose,
  progress,
}: {
  model: ModelConfig;
  onClose: () => void;
  progress: number;
}) {
  const [displayedChars, setDisplayedChars] = useState(0);

  useEffect(() => {
    const totalChars = model.streamContent.length;
    const visibleChars = Math.floor((progress / 100) * totalChars);
    setDisplayedChars(visibleChars);
  }, [progress, model.streamContent.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-arena-surface border border-arena-border overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-arena-border">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: model.color, boxShadow: `0 0 8px ${model.color}` }}
            />
            <span className="font-semibold text-arena-text">{model.name}</span>
            <span className="text-xs text-arena-muted">{model.provider}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-arena-muted">
              {Math.round(progress)}%
            </span>
            <button onClick={onClose} className="text-arena-muted hover:text-arena-text transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <pre className="font-mono text-sm text-arena-text/80 whitespace-pre-wrap leading-relaxed">
            {model.streamContent.slice(0, displayedChars)}
            {progress < 100 && (
              <span className="inline-block w-2 h-4 bg-arena-accent/80 animate-pulse ml-0.5 align-middle" />
            )}
          </pre>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function SwarmPage() {
  const navigate = useNavigate();
  const { userPrompt, addEval, setJudgeResult } = useApp();
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [progresses, setProgresses] = useState<Record<string, number>>(() => {
    const persisted = loadPersistedStatus();
    if (persisted?.allDone) return persisted.progresses;
    const initial: Record<string, number> = {};
    MODELS.forEach((m) => (initial[m.id] = persisted?.progresses[m.id] ?? 0));
    return initial;
  });
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [allDone, setAllDone] = useState(() => loadPersistedStatus()?.allDone ?? false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    const persisted = loadPersistedStatus();
    if (persisted?.allDone) return; // already complete, no intervals needed

    const initial: Record<string, number> = {};
    MODELS.forEach((m) => (initial[m.id] = progresses[m.id] ?? 0));
    const hasProgress = Object.values(initial).some((v) => v > 0);
    if (!hasProgress) {
      MODELS.forEach((m) => (initial[m.id] = 0));
      setProgresses(initial);
    }

    const intervals = MODELS.map((model) => {
      const tickMs = 100;
      const increment = (tickMs / model.speed) * 100;
      return setInterval(() => {
        setProgresses((prev) => {
          const current = prev[model.id] ?? 0;
          if (current >= 100) return prev;
          return { ...prev, [model.id]: Math.min(100, current + increment + Math.random() * 0.3) };
        });
      }, tickMs);
    });

    return () => intervals.forEach(clearInterval);
  }, [runKey]);

  useEffect(() => {
    const done = MODELS.every((m) => (progresses[m.id] ?? 0) >= 100);
    if (done && !allDone) {
      setAllDone(true);
      setJudging(true);
      setJudgeError(null);
      fetchJudgeSweep()
        .then((result) => {
          setJudgeResult(result);
          addEval(userPrompt || "Email triage summary", result);
        })
        .catch((err) => {
          console.error("Judge sweep failed:", err);
          setJudgeError(String(err));
          addEval(userPrompt || "Email triage summary");
        })
        .finally(() => setJudging(false));
    }
  }, [progresses, allDone, userPrompt, addEval, setJudgeResult]);

  useEffect(() => {
    savePersistedStatus(progresses, allDone);
  }, [progresses, allDone]);

  const handleModelClick = useCallback((model: ModelConfig) => {
    setSelectedModel(model);
  }, []);

  const handleNewRun = useCallback(() => {
    clearPersistedStatus();
    const initial: Record<string, number> = {};
    MODELS.forEach((m) => (initial[m.id] = 0));
    setProgresses(initial);
    setAllDone(false);
    setRunKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 border-b border-arena-border/50 bg-arena-surface/40 shrink-0">
        <div className="flex items-center justify-between text-xs text-arena-muted">
          <span>
            {judging
              ? "Judging responses with Gemini 2.5 Flash..."
              : judgeError
                ? "Judge failed — using cached scores"
                : `${MODELS.filter((m) => (progresses[m.id] ?? 0) >= 100).length}/${MODELS.length} models complete`}
          </span>
          <div className="flex items-center gap-4">
            <span>400 total evaluations</span>
            {allDone && !judging && (
              <>
                <motion.button
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={handleNewRun}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-arena-muted hover:text-arena-text hover:bg-arena-border/30 text-sm font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  New Run
                </motion.button>
                <motion.button
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => navigate("/results")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-arena-text text-white text-sm font-medium hover:bg-arena-text/90 transition-colors cursor-pointer"
                >
                  View Results
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </>
            )}
          </div>
        </div>
        <div className="mt-2 h-1 rounded-full bg-arena-border overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-arena-accent to-arena-blue"
            style={{
              width: `${(MODELS.reduce((sum, m) => sum + (progresses[m.id] ?? 0), 0) / (MODELS.length * 100)) * 100}%`,
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Model Grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {MODELS.map((model, i) => {
            const progress = progresses[model.id] ?? 0;
            const isDone = progress >= 100;

            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => handleModelClick(model)}
                className="relative rounded-2xl bg-arena-card border border-arena-border overflow-hidden cursor-pointer hover:border-arena-border group"
                style={{
                  borderColor: isDone ? `${model.color}33` : undefined,
                }}
              >
                {/* Swarm area */}
                <div className="relative h-52 flex items-center justify-center">
                  <SwarmParticles
                    color={model.color}
                    isActive={!isDone}
                    progress={progress}
                  />
                  <ProgressRing progress={progress} color={model.color} size={110} />
                  <div className="relative z-10 text-center">
                    <div
                      className="text-3xl font-bold font-mono"
                      style={{ color: model.color }}
                    >
                      {Math.round(progress)}%
                    </div>
                    {isDone && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="mt-1 text-xs font-medium"
                        style={{ color: model.color }}
                      >
                        Complete
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="px-5 pb-4 pt-2 border-t border-arena-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: model.color,
                            boxShadow: `0 0 6px ${model.color}`,
                          }}
                        />
                        <span className="font-semibold text-arena-text text-sm">
                          {model.name}
                        </span>
                      </div>
                      <span className="text-xs text-arena-muted mt-0.5 block ml-4.5">
                        {model.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-arena-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-3.5 h-3.5" />
                      <span>View output</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Streaming Modal */}
      <AnimatePresence>
        {selectedModel && (
          <StreamingModal
            model={selectedModel}
            progress={progresses[selectedModel.id] ?? 0}
            onClose={() => setSelectedModel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
