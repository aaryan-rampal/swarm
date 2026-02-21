import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const API_BASE = "http://localhost:8000";
const EVALS_STORAGE_KEY = "swarm-evals";
const JUDGE_RESULTS_KEY = "swarm-judge-results";

export interface JudgeScores {
  correctness: number;
  quality: number;
  reasoning: number;
  usability: number;
  overall: number;
}

export interface JudgeModelResult {
  model_id: string;
  scores: JudgeScores;
  answers: Record<string, string>;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  judge_model: string;
}

export interface JudgeSweepResult {
  models: Record<string, JudgeModelResult>;
  ranking: string[];
  best_model: string | null;
}

export interface EvalEntry {
  id: string;
  prompt: string;
  timestamp: number;
  judgeResult?: JudgeSweepResult;
}

function loadEvals(): EvalEntry[] {
  try {
    const raw = localStorage.getItem(EVALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is EvalEntry =>
        e && typeof e.id === "string" && typeof e.prompt === "string" && typeof e.timestamp === "number"
    );
  } catch {
    return [];
  }
}

function saveEvals(evals: EvalEntry[]) {
  try {
    localStorage.setItem(EVALS_STORAGE_KEY, JSON.stringify(evals));
  } catch {
    // ignore
  }
}

function loadJudgeResult(): JudgeSweepResult | null {
  try {
    const raw = localStorage.getItem(JUDGE_RESULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JudgeSweepResult;
  } catch {
    return null;
  }
}

function saveJudgeResult(result: JudgeSweepResult | null) {
  try {
    if (result) {
      localStorage.setItem(JUDGE_RESULTS_KEY, JSON.stringify(result));
    } else {
      localStorage.removeItem(JUDGE_RESULTS_KEY);
    }
  } catch {
    // ignore
  }
}

export async function fetchJudgeSweep(): Promise<JudgeSweepResult> {
  const res = await fetch(`${API_BASE}/api/runs/judge`, { method: "POST" });
  if (!res.ok) throw new Error(`Judge API returned ${res.status}`);
  return res.json();
}

interface AppState {
  userPrompt: string;
  setUserPrompt: (p: string) => void;
  evals: EvalEntry[];
  addEval: (prompt: string, judgeResult?: JudgeSweepResult) => void;
  judgeResult: JudgeSweepResult | null;
  setJudgeResult: (r: JudgeSweepResult | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  runId: string | null;
  setRunId: (id: string | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userPrompt, setUserPrompt] = useState("");
  const [evals, setEvals] = useState<EvalEntry[]>(loadEvals);
  const [judgeResult, setJudgeResult] = useState<JudgeSweepResult | null>(loadJudgeResult);

  useEffect(() => {
    saveEvals(evals);
  }, [evals]);

  useEffect(() => {
    saveJudgeResult(judgeResult);
  }, [judgeResult]);

  const addEval = (prompt: string, jr?: JudgeSweepResult) => {
    const entry: EvalEntry = {
      id: crypto.randomUUID(),
      prompt,
      timestamp: Date.now(),
      judgeResult: jr,
    };
    setEvals((prev) => [entry, ...prev]);
  };

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        userPrompt,
        setUserPrompt,
        evals,
        addEval,
        judgeResult,
        setJudgeResult,
        sessionId,
        setSessionId,
        runId,
        setRunId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
