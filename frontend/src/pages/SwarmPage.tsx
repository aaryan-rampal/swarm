import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  X,
  ArrowRight,
  Eye,
  RotateCcw,
  Loader2,
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
} from "lucide-react";

const STORAGE_KEY = "swarm-run-state";

interface PersistedRun {
  modelStates: Record<string, ModelState>;
  allDone: boolean;
}

function loadPersistedRun(): PersistedRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRun;
    if (!parsed.modelStates || typeof parsed.allDone !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedRun(
  modelStates: Record<string, ModelState>,
  allDone: boolean,
) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ modelStates, allDone }));
  } catch {
    /* quota / privacy errors */
  }
}

function clearPersistedRun() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
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
  repContents: Record<number, string>;
  completedReps: number;
  totalReps: number;
  activeRep: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    <svg
      width={size}
      height={size}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
    >
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
  const [currentRep, setCurrentRep] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const content = model.repContents[currentRep] || "";

  const isRepStreaming =
    model.status === "running" && currentRep >= model.completedReps;

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const hasPrev = currentRep > 0;
  const hasNext = currentRep < model.totalReps - 1;

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
              style={{
                background: model.config.color,
                boxShadow: `0 0 8px ${model.config.color}`,
              }}
            />
            <span className="font-semibold text-arena-text">
              {model.config.name}
            </span>
            <span className="text-xs text-arena-muted">
              {model.config.provider}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
              <button
                disabled={!hasPrev}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentRep((r) => r - 1);
                }}
                className="p-1 rounded text-arena-muted hover:text-arena-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-arena-muted min-w-[4.5rem] text-center select-none">
                Rep {currentRep + 1}/{model.totalReps}
              </span>
              <button
                disabled={!hasNext}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentRep((r) => r + 1);
                }}
                className="p-1 rounded text-arena-muted hover:text-arena-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs font-mono text-arena-muted">
              {Math.round(progress)}%
            </span>
            <button
              onClick={onClose}
              className="text-arena-muted hover:text-arena-text transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-5 text-sm text-arena-text/80 leading-relaxed prose prose-invert max-w-none
            [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-arena-text [&_h1]:mt-6 [&_h1]:mb-3
            [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-arena-text [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-arena-border/40
            [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-arena-text/90 [&_h3]:mt-4 [&_h3]:mb-2
            [&_p]:my-2 [&_p]:leading-7
            [&_ul]:my-2 [&_ul]:space-y-0.5 [&_ol]:my-2
            [&_li]:leading-7 [&_li]:my-0
            [&_strong]:text-arena-text [&_strong]:font-semibold
            [&_a]:text-arena-blue [&_a]:underline [&_a]:underline-offset-2
            [&_hr]:border-arena-border/40 [&_hr]:my-4
            [&_blockquote]:border-l-2 [&_blockquote]:border-arena-accent/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-arena-muted
            [&_table]:w-full [&_table]:my-3 [&_table]:text-xs
            [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-arena-border/60 [&_th]:text-arena-text [&_th]:font-medium
            [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-arena-border/30 [&_td]:text-arena-text/70"
        >
          {content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const inline = !match;
                  return inline ? (
                    <code
                      className="bg-arena-border/40 text-arena-accent px-1.5 py-0.5 rounded text-[13px] font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "0.75rem",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: "0.82rem",
                        padding: "1rem 1.25rem",
                        lineHeight: "1.7",
                        margin: "0.75rem 0",
                      }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <span className="text-arena-muted italic">
              Waiting for output...
            </span>
          )}
          {isRepStreaming && (
            <span className="inline-block w-2 h-4 bg-arena-accent/80 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Model Picker
// ---------------------------------------------------------------------------

function ModelPicker({
  onStart,
}: {
  onStart: (selectedIds: string[]) => void;
}) {
  const [allModels, setAllModels] = useState<ModelConfig[]>([]);
  const [defaultIds, setDefaultIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      try {
        const res = await fetch("/api/runs/available-models");
        if (!res.ok) throw new Error(`Failed to load models: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setAllModels(data.models);
        setDefaultIds(data.default_ids);
        setSelectedIds(new Set(data.default_ids as string[]));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load models",
          );
          setLoading(false);
        }
      }
    }
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allModels;
    const q = search.toLowerCase();
    return allModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [allModels, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelConfig[]>();
    for (const m of filtered) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggleModel = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProvider = useCallback(
    (provider: string) => {
      setCollapsedProviders((prev) => {
        const next = new Set(prev);
        if (next.has(provider)) next.delete(provider);
        else next.add(provider);
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((m) => m.id)));
  }, [filtered]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectDefaults = useCallback(() => {
    setSelectedIds(new Set(defaultIds));
  }, [defaultIds]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-arena-muted">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Loading available models...</span>
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-arena-border/50 bg-arena-surface/40 shrink-0">
        <h2 className="text-lg font-semibold text-arena-text mb-1">
          Select Models
        </h2>
        <p className="text-xs text-arena-muted">
          Choose which models to evaluate. {allModels.length} available.
        </p>
      </div>

      {/* Search + quick actions */}
      <div className="px-6 py-3 border-b border-arena-border/30 shrink-0 flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-arena-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-arena-card border border-arena-border text-sm text-arena-text placeholder:text-arena-muted/50 focus:outline-none focus:border-arena-accent/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={selectDefaults}
            className="px-2.5 py-1 rounded-md bg-arena-card border border-arena-border text-arena-muted hover:text-arena-text hover:border-arena-accent/40 transition-colors cursor-pointer"
          >
            Defaults
          </button>
          <button
            onClick={selectAll}
            className="px-2.5 py-1 rounded-md bg-arena-card border border-arena-border text-arena-muted hover:text-arena-text hover:border-arena-accent/40 transition-colors cursor-pointer"
          >
            All
          </button>
          <button
            onClick={selectNone}
            className="px-2.5 py-1 rounded-md bg-arena-card border border-arena-border text-arena-muted hover:text-arena-text hover:border-arena-accent/40 transition-colors cursor-pointer"
          >
            None
          </button>
          <span className="ml-auto text-arena-muted">
            {selectedIds.size} selected
          </span>
        </div>
      </div>

      {/* Model list grouped by provider */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {grouped.map(([provider, models]) => {
          const collapsed = collapsedProviders.has(provider);
          const selectedInGroup = models.filter((m) =>
            selectedIds.has(m.id),
          ).length;

          return (
            <div key={provider} className="mb-3">
              <button
                onClick={() => toggleProvider(provider)}
                className="flex items-center gap-2 w-full text-left py-1.5 cursor-pointer group"
              >
                {collapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-arena-muted" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-arena-muted" />
                )}
                <span className="text-sm font-medium text-arena-text">
                  {provider}
                </span>
                <span className="text-xs text-arena-muted">
                  {selectedInGroup}/{models.length}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5 pl-5.5 pb-2 pt-1">
                      {models.map((m) => {
                        const isSelected = selectedIds.has(m.id);
                        return (
                          <motion.button
                            key={m.id}
                            layout
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleModel(m.id)}
                            className={`
                              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              border transition-all duration-150 cursor-pointer
                              ${
                                isSelected
                                  ? "border-arena-accent/60 bg-arena-accent/10 text-arena-text"
                                  : "border-arena-border bg-arena-card text-arena-muted hover:border-arena-border hover:text-arena-text"
                              }
                            `}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-arena-accent" />
                            )}
                            <span>{m.name}</span>
                            {m.id.endsWith(":free") && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 leading-none">
                                free
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Start button */}
      <div className="px-6 py-4 border-t border-arena-border/50 bg-arena-surface/40 shrink-0">
        <button
          disabled={selectedIds.size === 0}
          onClick={() => onStart([...selectedIds])}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-arena-accent text-white text-sm font-semibold hover:bg-arena-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Play className="w-4 h-4" />
          Start Swarm ({selectedIds.size} model
          {selectedIds.size !== 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SwarmPage
// ---------------------------------------------------------------------------

type Phase = "selecting" | "running" | "done";

export default function SwarmPage() {
  const navigate = useNavigate();

  const persisted = useRef(loadPersistedRun());
  const initialPhase: Phase =
    persisted.current && persisted.current.allDone ? "done" : "selecting";

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [modelStates, setModelStates] = useState<Record<string, ModelState>>(
    () => (persisted.current?.allDone ? persisted.current.modelStates : {}),
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(
    () => persisted.current?.allDone ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const models = useMemo(
    () => Object.values(modelStates).map((s) => s.config),
    [modelStates],
  );

  const startRun = useCallback(async (selectedIds: string[]) => {
    setPhase("running");
    setError(null);

    try {
      const res = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_ids: selectedIds }),
      });
      if (!res.ok) throw new Error(`Start failed: ${res.status}`);
      const data = await res.json();
      const runId: string = data.run_id;
      const modelsFromApi: ModelConfig[] = data.models;

      const initial: Record<string, ModelState> = {};
      for (const m of modelsFromApi) {
        initial[m.id] = {
          config: m,
          status: "pending",
          repContents: {},
          completedReps: 0,
          totalReps: 5,
          activeRep: false,
        };
      }
      setModelStates(initial);

      const es = new EventSource(`/api/runs/${runId}/stream`);
      eventSourceRef.current = es;

      es.addEventListener("model_run_started", (e) => {
        const payload = JSON.parse(e.data);
        const modelId: string = payload.model_id;
        setModelStates((prev) => {
          const ms = prev[modelId];
          if (!ms) return prev;
          return {
            ...prev,
            [modelId]: { ...ms, status: "running", activeRep: true },
          };
        });
      });

      es.addEventListener("narration_delta", (e) => {
        const payload = JSON.parse(e.data);
        const modelId: string = payload.model_id;
        const repIndex: number = payload.rep_index;
        const delta: string =
          payload.content_delta || payload.content || "";
        setModelStates((prev) => {
          const ms = prev[modelId];
          if (!ms) return prev;
          return {
            ...prev,
            [modelId]: {
              ...ms,
              repContents: {
                ...ms.repContents,
                [repIndex]: (ms.repContents[repIndex] || "") + delta,
              },
            },
          };
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
        setPhase("done");
        es.close();
      });

      es.onerror = () => {
        setAllDone(true);
        setPhase("done");
        es.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start swarm");
      setPhase("selecting");
    }
  }, []);

  useEffect(() => {
    if (allDone && Object.keys(modelStates).length > 0) {
      savePersistedRun(modelStates, allDone);
    }
  }, [allDone, modelStates]);

  const getProgress = useCallback((ms: ModelState): number => {
    const base = (ms.completedReps / ms.totalReps) * 100;
    if (ms.activeRep && ms.status === "running") {
      return Math.min(99, base + (1 / ms.totalReps) * 50);
    }
    return base;
  }, []);

  const overallProgress = useMemo(() => {
    const vals = Object.values(modelStates);
    if (vals.length === 0) return 0;
    return (
      (vals.reduce((sum, ms) => sum + getProgress(ms), 0) /
        (vals.length * 100)) *
      100
    );
  }, [modelStates, getProgress]);

  const completedCount = useMemo(
    () =>
      Object.values(modelStates).filter(
        (ms) => ms.status === "completed" || ms.status === "error",
      ).length,
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

  const handleNewRun = useCallback(() => {
    clearPersistedRun();
    eventSourceRef.current?.close();
    setModelStates({});
    setAllDone(false);
    setError(null);
    setSelectedModelId(null);
    setPhase("selecting");
  }, []);

  // ---- Selecting phase ----
  if (phase === "selecting") {
    return (
      <>
        {error && (
          <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}
        <ModelPicker onStart={startRun} />
      </>
    );
  }

  // ---- Running / loading (before first modelStates are set) ----
  if (phase === "running" && Object.keys(modelStates).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-arena-muted">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Starting swarm...</span>
      </div>
    );
  }

  // ---- Running / Done phase ----
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
                  borderColor: isDone
                    ? `${ms.config.color}33`
                    : undefined,
                }}
              >
                <div className="relative h-52 flex items-center justify-center">
                  <SwarmParticles
                    color={ms.config.color}
                    isActive={!isDone}
                    progress={progress}
                  />
                  <ProgressRing
                    progress={progress}
                    color={ms.config.color}
                    size={110}
                  />
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
