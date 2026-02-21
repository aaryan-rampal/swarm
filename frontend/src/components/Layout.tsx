import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { useApp } from "../store";

function formatEvalDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

function truncatePrompt(prompt: string, maxLen = 36) {
  const t = prompt.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "…";
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { evals } = useApp();

  return (
    <div className="flex h-screen bg-arena-bg">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-arena-border shrink-0">
        {/* Logo */}
        <div className="px-4 pt-4 pb-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 cursor-pointer"
          >
            <img
              src="/swarm.png"
              alt="Swarm"
              className="w-11 h-11 rounded-lg object-cover shrink-0"
            />
            <span
              className="text-xl text-arena-text"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}
            >
              Swarm
            </span>
          </button>
        </div>

        {/* New evaluation */}
        <div className="px-3">
          <button
            onClick={() => navigate("/")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              location.pathname === "/"
                ? "text-arena-text bg-arena-card/70"
                : "text-arena-muted hover:text-arena-text hover:bg-arena-card/50"
            }`}
          >
            <Plus className="w-4 h-4" />
            New evaluation
          </button>
        </div>

        {/* Previous evals */}
        {evals.length > 0 && (
          <div className="px-3 pt-2 flex-1 overflow-y-auto min-h-0">
            <div className="text-[11px] font-medium text-arena-muted uppercase tracking-wider px-3 mb-2">
              Previous evals
            </div>
            <div className="space-y-0.5">
              {evals.map((e) => (
                <button
                  key={e.id}
                  onClick={() => navigate("/results")}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors cursor-pointer ${
                    location.pathname === "/results"
                      ? "text-arena-text bg-arena-card/70"
                      : "text-arena-muted hover:text-arena-text hover:bg-arena-card/50"
                  }`}
                >
                  <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{truncatePrompt(e.prompt)}</div>
                    <div className="text-[11px] text-arena-muted/80 mt-0.5">{formatEvalDate(e.timestamp)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={evals.length > 0 ? "shrink-0" : "flex-1"} />

        {/* Minimal footer */}
        <div className="px-5 py-4 text-[11px] text-arena-muted/60">
          swarm v0.1
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
