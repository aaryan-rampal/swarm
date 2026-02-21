import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, Eye, Loader2 } from "lucide-react";
import { X, ArrowRight, Eye, RotateCcw } from "lucide-react";
import { useApp } from "../store";

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
}

interface ModelState {
  config: ModelConfig;
  status: "pending" | "running" | "completed" | "error";
  streamContent: string;
  completedReps: number;
  totalReps: number;
  activeRep: boolean;
}

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
  progress,
  onClose,
}: {
  model: ModelState;
  progress: number;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [model.streamContent]);

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
              style={{ background: model.config.color, boxShadow: `0 0 8px ${model.config.color}` }}
            />
            <span className="font-semibold text-arena-text">{model.config.name}</span>
            <span className="text-xs text-arena-muted">{model.config.provider}</span>
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
        <pre
          ref={contentRef}
          className="flex-1 overflow-y-auto p-5 font-mono text-sm text-arena-text/80 whitespace-pre-wrap leading-relaxed"
        >
          {model.streamContent || (
            <span className="text-arena-muted italic">Waiting for output...</span>
          )}
          {model.status !== "completed" && model.status !== "error" && (
            <span className="inline-block w-2 h-4 bg-arena-accent/80 animate-pulse ml-0.5 align-middle" />
          )}
        </pre>
      </motion.div>
    </motion.div>
  );
}

export default function SwarmPage() {
  const navigate = useNavigate();
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>({});
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const models = useMemo(
    () => Object.values(modelStates).map((s) => s.config),
    [modelStates],
  );

  useEffect(() => {
    let cancelled = false;

    async function startSwarm() {
      try {
        const res = await fetch("/api/runs/start", { method: "POST" });
        if (!res.ok) throw new Error(`Start failed: ${res.status}`);
        const data = await res.json();
        const runId: string = data.run_id;
        const modelsFromApi: ModelConfig[] = data.models;

        if (cancelled) return;

        const initial: Record<string, ModelState> = {};
        for (const m of modelsFromApi) {
          initial[m.id] = {
            config: m,
            status: "pending",
            streamContent: "",
            completedReps: 0,
            totalReps: 5,
            activeRep: false,
          };
        }
        setModelStates(initial);
        setLoading(false);

        const es = new EventSource(`/api/runs/${runId}/stream`);
        eventSourceRef.current = es;

        es.addEventListener("model_run_started", (e) => {
          const payload = JSON.parse(e.data);
          const modelId: string = payload.model_id;
          setModelStates((prev) => {
            const ms = prev[modelId];
            if (!ms) return prev;
            return { ...prev, [modelId]: { ...ms, status: "running", activeRep: true } };
          });
        });

        es.addEventListener("narration_delta", (e) => {
          const payload = JSON.parse(e.data);
          const modelId: string = payload.model_id;
          const repIndex: number = payload.rep_index;
          if (repIndex !== 0) return;
          const delta: string = payload.content_delta || payload.content || "";
          setModelStates((prev) => {
            const ms = prev[modelId];
            if (!ms) return prev;
            return { ...prev, [modelId]: { ...ms, streamContent: ms.streamContent + delta } };
          });
        });

        es.addEventListener("model_run_completed", (e) => {
          const payload = JSON.parse(e.data);
          const modelId: string = payload.model_id;
          setModelStates((prev) => {
            const ms = prev[modelId];
            if (!ms) return prev;
            const completedReps = ms.completedReps + 1;
            const done = completedReps >= ms.totalReps;
            return {
              ...prev,
              [modelId]: {
                ...ms,
                completedReps,
                activeRep: !done,
                status: done ? "completed" : ms.status,
              },
            };
          });
        });

        es.addEventListener("model_run_error", (e) => {
          const payload = JSON.parse(e.data);
          const modelId: string = payload.model_id;
          setModelStates((prev) => {
            const ms = prev[modelId];
            if (!ms) return prev;
            const completedReps = ms.completedReps + 1;
            const done = completedReps >= ms.totalReps;
            return {
              ...prev,
              [modelId]: {
                ...ms,
                completedReps,
                activeRep: !done,
                status: done ? "error" : ms.status,
              },
            };
          });
        });

        es.addEventListener("run_completed", () => {
          setAllDone(true);
          es.close();
        });

        es.onerror = () => {
          setAllDone(true);
          es.close();
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start swarm");
          setLoading(false);
        }
      }
    }

    startSwarm();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, []);

  const getProgress = useCallback(
    (ms: ModelState): number => {
      const base = (ms.completedReps / ms.totalReps) * 100;
      if (ms.activeRep && ms.status === "running") {
        return Math.min(99, base + (1 / ms.totalReps) * 50);
      }
      return base;
    },
    [],
  );

  const overallProgress = useMemo(() => {
    const vals = Object.values(modelStates);
    if (vals.length === 0) return 0;
    return vals.reduce((sum, ms) => sum + getProgress(ms), 0) / (vals.length * 100) * 100;
  }, [modelStates, getProgress]);

  const completedCount = useMemo(
    () => Object.values(modelStates).filter((ms) => ms.status === "completed" || ms.status === "error").length,
    [modelStates],
  );

  const totalEvals = useMemo(() => {
    const vals = Object.values(modelStates);
    if (vals.length === 0) return 0;
    return vals.length * (vals[0]?.totalReps ?? 5);
  }, [modelStates]);

  const handleModelClick = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-arena-muted">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Starting swarm...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-arena-surface border border-arena-border text-arena-text text-sm hover:bg-arena-card transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const selectedModel = selectedModelId ? modelStates[selectedModelId] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 border-b border-arena-border/50 bg-arena-surface/40 shrink-0">
        <div className="flex items-center justify-between text-xs text-arena-muted">
          <span>
            {completedCount}/{models.length} models complete
          </span>
          <div className="flex items-center gap-4">
            <span>{totalEvals} total evaluations</span>
            {allDone && (
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
            style={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Model Grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.values(modelStates).map((ms, i) => {
            const progress = getProgress(ms);
            const isDone = ms.status === "completed" || ms.status === "error";

            return (
              <motion.div
                key={ms.config.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => handleModelClick(ms.config.id)}
                className="relative rounded-2xl bg-arena-card border border-arena-border overflow-hidden cursor-pointer hover:border-arena-border group"
                style={{
                  borderColor: isDone ? `${ms.config.color}33` : undefined,
                }}
              >
                {/* Swarm area */}
                <div className="relative h-52 flex items-center justify-center">
                  <SwarmParticles
                    color={ms.config.color}
                    isActive={!isDone}
                    progress={progress}
                  />
                  <ProgressRing progress={progress} color={ms.config.color} size={110} />
                  <div className="relative z-10 text-center">
                    <div
                      className="text-3xl font-bold font-mono"
                      style={{ color: ms.config.color }}
                    >
                      {Math.round(progress)}%
                    </div>
                    {isDone && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="mt-1 text-xs font-medium"
                        style={{ color: ms.config.color }}
                      >
                        {ms.status === "completed" ? "Complete" : "Error"}
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
                            background: ms.config.color,
                            boxShadow: `0 0 6px ${ms.config.color}`,
                          }}
                        />
                        <span className="font-semibold text-arena-text text-sm">
                          {ms.config.name}
                        </span>
                      </div>
                      <span className="text-xs text-arena-muted mt-0.5 block ml-4.5">
                        {ms.config.provider}
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
            progress={getProgress(selectedModel)}
            onClose={() => setSelectedModelId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
