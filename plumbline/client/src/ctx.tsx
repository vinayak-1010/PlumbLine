import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, setUserId, getUserId } from "./api";
import type { Config, User } from "./types";

interface Ctx { user: User | null; config: Config | null; login: (id: string) => Promise<void>; logout: () => void; toast: (msg: string, kind?: "ok" | "err") => void }
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => { setMsg({ text, kind }); setTimeout(() => setMsg(null), 4500); }, []);
  useEffect(() => {
    (async () => {
      try { setConfig(await api.get<Config>("/api/config")); } catch { /* offline */ }
      if (getUserId()) { try { setUser(await api.get<User>("/api/me")); } catch { setUserId(""); } }
      setReady(true);
    })();
  }, []);
  const login = async (id: string) => { setUserId(id); setUser(await api.get<User>("/api/me")); };
  const logout = () => { setUserId(""); setUser(null); };
  if (!ready) return <div className="p-10 text-center text-ink/60">Loading Plumbline…</div>;
  return (
    <C.Provider value={{ user, config, login, logout, toast }}>
      {children}
      {msg && (
        <div role="status" aria-live="polite" className={`fixed bottom-5 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${msg.kind === "ok" ? "bg-ink text-white" : "bg-rose text-white"}`}>{msg.text}</div>
      )}
    </C.Provider>
  );
}
