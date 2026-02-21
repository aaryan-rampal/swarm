import { createContext, useContext, useState, type ReactNode } from "react";

interface AppState {
  userPrompt: string;
  setUserPrompt: (p: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userPrompt, setUserPrompt] = useState("");

  return (
    <AppContext.Provider value={{ userPrompt, setUserPrompt }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
