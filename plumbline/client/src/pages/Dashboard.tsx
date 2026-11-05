import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../ctx";
import { StatusPill, fmt, Empty } from "../components/ui";
import type { DocFull, DocRow } from "../types";

export default function Dashboard() {
  const { user, config, toast } = useApp();
  const nav = useNavigate();
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get<DocRow[]>("/api/docs").then(setRows).catch((e) => toast(e.message, "err")); }, []);
  const canCreate = user!.role !== "reviewer";
  const todo = (rows || []).filter((r) => (user!.role === "reviewer" && r.status === "in_review") || ((user!.role === "manager" || user!.role === "admin") && (r.status === "in_review" || r.status === "approved")) || (user!.role === "creator" && (r.status === "draft" || r.status === "changes_requested")));

  async function sample(key: string) {
    setBusy(key);
    try { const d = await api.post<DocFull>(`/api/docs/sample/${key}`); nav(`/doc/${d.id}`); }
    catch (e: any) { toast(e.message, "err"); setBusy(""); }
  }
  const steps: Record<string, string[]> = {
    creator: ["Pick a sample draft below (or check your own content).", "Read each finding: the exact words, the reason, the source it cites, and a suggested fix.", "Accept, edit or dispute, then send it to the reviewer."],
    reviewer: ["Open an item marked “In human review”.", "Check the tracked versions, the evidence and any disputes.", "Approve it or request changes with a comment."],
    manager: ["Open an item the reviewer approved.", "Sign it off to lock the version as publish-ready.", "Download the package with the audit trail and AI-use disclosure."],
    admin: ["Open an item the reviewer approved.", "Sign it off to lock the version as publish-ready.", "Manage guidelines and approved facts in the Knowledge base."],
  };
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="font-head text-2xl font-bold">Hello, {user!.name.split(" ")[0]}</h1>
        <p className="text-sm text-ink/70">Signed in as <b>{user!.title}</b>. Here is how to use Plumbline in three steps:</p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {steps[user!.role].map((s, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-mist p-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </section>

      {canCreate && (
        <section>
          <div className="mb-2 flex items-end justify-between"><h2 className="font-head text-lg font-semibold">Try a sample draft</h2><Link to="/new" className="text-sm font-semibold text-teal underline">or check your own content</Link></div>
          <div className="grid gap-3 md:grid-cols-4">
            {(config?.samples || []).map((s) => (
              <button key={s.key} disabled={!!busy} onClick={() => sample(s.key)} className="card p-4 text-left transition hover:border-teal hover:shadow-md disabled:opacity-60">
                <div className="text-xs font-bold uppercase text-ink/50">{s.channel} · {s.sensitivity}</div>
                <div className="mt-1 font-semibold leading-snug">{s.title}</div>
                <div className="mt-1 text-sm text-ink/70">{s.blurb}</div>
                <div className="mt-3 text-sm font-bold text-teal">{busy === s.key ? "Checking…" : "Check this draft →"}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-head text-lg font-semibold">{todo.length ? `Waiting for you (${todo.length})` : "All content"}</h2>
        {rows === null ? <p className="text-ink/60">Loading…</p> : rows.length === 0 ? <Empty>Nothing here yet. Try a sample draft above.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-mist text-left text-xs uppercase text-ink/60"><tr><th className="p-3">Title</th><th className="p-3">Status</th><th className="p-3">Findings</th><th className="p-3">Creator</th><th className="p-3">Updated</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-ink/10 hover:bg-paper">
                    <td className="p-3"><Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/doc/${r.id}`}>{r.title}</Link><div className="text-xs text-ink/55">{r.channel} · {r.sensitivity} · v{r.version}</div></td>
                    <td className="p-3"><StatusPill s={r.status} /></td>
                    <td className="p-3">{r.findings} {r.high ? <span className="text-rose">({r.high} high{r.unresolvedHigh ? `, ${r.unresolvedHigh} open` : ""})</span> : null}</td>
                    <td className="p-3">{r.creatorName}</td>
                    <td className="p-3 text-ink/60">{fmt(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
