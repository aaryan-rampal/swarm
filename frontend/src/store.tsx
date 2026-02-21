import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const EVALS_STORAGE_KEY = "swarm-evals";

export interface EvalEntry {
  id: string;
  prompt: string;
  timestamp: number;
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

interface AppState {
  userPrompt: string;
  setUserPrompt: (p: string) => void;
  evals: EvalEntry[];
  addEval: (prompt: string) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  runId: string | null;
  setRunId: (id: string | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userPrompt, setUserPrompt] = useState("");
  const [evals, setEvals] = useState<EvalEntry[]>(loadEvals);

  useEffect(() => {
    saveEvals(evals);
  }, [evals]);

  const addEval = (prompt: string) => {
    const entry: EvalEntry = {
      id: crypto.randomUUID(),
      prompt,
      timestamp: Date.now(),
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
