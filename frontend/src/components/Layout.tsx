import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-arena-bg">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-arena-border shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <img
              src="/swarm.png"
              alt="Swarm"
              className="w-7 h-7 rounded-md object-cover"
            />
            <span
              className="text-lg text-arena-text"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}
            >
              Swarm
            </span>
          </button>
        </div>

        {/* New chat */}
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

        <div className="flex-1" />

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
