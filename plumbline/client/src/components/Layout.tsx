import { NavLink, Link } from "react-router-dom";
import { ReactNode } from "react";
import { useApp } from "../ctx";
import { api } from "../api";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M11 1v13" stroke={light ? "#fff" : "#14213D"} strokeWidth="1.8" /><path d="M11 12l5 6-5 7-5-7z" fill="#E8A33D" stroke={light ? "#fff" : "#14213D"} strokeWidth="1.2" /></svg>
      <span className={`font-head text-lg font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}>Plumbline</span>
    </span>
  );
}

const roleLabel: Record<string, string> = { creator: "Creator", reviewer: "Reviewer", manager: "Manager", admin: "Admin" };

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, config, toast } = useApp();
  const nav = "rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-white/10";
  const lead = user!.role === "manager" || user!.role === "admin";
  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" aria-label="Plumbline home"><Logo light /></Link>
          <nav className="flex gap-1" aria-label="Main">
            <NavLink to="/" end className={({ isActive }) => `${nav} ${isActive ? "bg-white/15" : ""}`}>Content</NavLink>
            {user!.role !== "reviewer" && <NavLink to="/new" className={({ isActive }) => `${nav} ${isActive ? "bg-white/15" : ""}`}>Check new content</NavLink>}
            <NavLink to="/knowledge" className={({ isActive }) => `${nav} ${isActive ? "bg-white/15" : ""}`}>Knowledge base</NavLink>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <span title={config?.aiProvider === "off" ? "No AI key configured: rules, Claim Ledger and the citation verifier run. Add GEMINI_API_KEY to switch the AI judge on." : "AI judge is on; confidential documents never reach it."}
              className="rounded-full border border-white/25 px-2.5 py-0.5 text-xs">AI judge: {config?.aiProvider === "off" ? "off" : config?.model || "on"}</span>
            <span className="text-white/90"><b>{user!.name}</b> <span className="text-white/60">· {roleLabel[user!.role]}</span></span>
            {lead && <button className="text-xs text-white/70 underline hover:text-white" onClick={async () => { if (confirm("Reset all demo data to the starting state?")) { await api.post("/api/demo/reset"); toast("Demo data reset."); location.assign("/"); } }}>Reset demo data</button>}
            <button className="btn btn-ghost !py-1 !text-xs" onClick={logout}>Switch account</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink/50">Plumbline · Team Alt+Tab · Demo workspace uses a fictional brand (Lumora). Plumbline suggests; people decide.</footer>
    </div>
  );
}
