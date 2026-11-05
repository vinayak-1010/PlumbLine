import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../ctx";
import type { Clause, Fact, KB, Term } from "../types";

type Tab = "guidelines" | "facts" | "terms" | "workspace";
const today = () => new Date().toISOString().slice(0, 10);

export default function Knowledge() {
  const { user, toast } = useApp();
  const [kb, setKb] = useState<KB | null>(null);
  const [tab, setTab] = useState<Tab>("guidelines");
  const can = user!.role === "manager" || user!.role === "admin";
  const load = () => api.get<KB>("/api/kb").then(setKb).catch((e) => toast(e.message, "err"));
  useEffect(() => { load(); }, []);
  if (!kb) return <p className="text-ink/60">Loading…</p>;
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); await load(); return true; } catch (e: any) { toast(e.message, "err"); return false; } };

  return (
    <div className="space-y-4">
      <div><h1 className="font-head text-2xl font-bold">Knowledge base</h1>
        <p className="text-sm text-ink/70">The single source of truth every check is grounded in. Findings only cite what is stored here. {can ? "You can edit it as a manager." : "Only managers can edit it; you can read everything."}</p></div>
      <div role="tablist" className="flex flex-wrap gap-1">
        {([["guidelines", `Guidelines (${kb.clauses.length})`], ["facts", `Approved facts (${kb.facts.length})`], ["terms", `Terminology (${kb.terms.length})`], ["workspace", "Confidential terms"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? "bg-ink text-white" : "bg-white hover:bg-mist border border-ink/15"}`}>{l}</button>
        ))}
      </div>
      {tab === "guidelines" && <Guidelines kb={kb} can={can} run={run} />}
      {tab === "facts" && <Facts facts={kb.facts} can={can} run={run} />}
      {tab === "terms" && <Terms terms={kb.terms} clauses={kb.clauses} can={can} run={run} />}
      {tab === "workspace" && <Workspace kb={kb} can={can} run={run} />}
    </div>
  );
}

type Run = (fn: () => Promise<any>, ok: string) => Promise<boolean>;

function Guidelines({ kb, can, run }: { kb: KB; can: boolean; run: Run }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const sections = [...new Set(kb.clauses.map((c) => c.section))];
  return (
    <div className="space-y-4">
      {can && (
        <div className="card space-y-2 p-4">
          <h2 className="font-head font-semibold">Import guidelines</h2>
          <p className="text-sm text-ink/70">Paste guideline text (one rule per paragraph or numbered point) or upload a .docx, .pdf or .txt file. Each rule becomes a numbered clause that findings can cite.</p>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Guideline text" placeholder={"1. Never use the word 'gorgeous' in captions.\n\n2. Always mention the product size on product pages."} />
          <div className="flex flex-wrap items-center gap-3"><input type="file" accept=".docx,.pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" aria-label="Guideline file" />
            <button className="btn btn-primary" onClick={async () => {
              const fd = new FormData(); fd.append("text", text); if (file) fd.append("file", file);
              if (await run(() => api.post("/api/kb/import", fd), "Guidelines imported.")) { setText(""); setFile(null); }
            }}>Import as clauses</button></div>
        </div>
      )}
      {sections.map((s) => (
        <section key={s} className="card p-4"><h2 className="font-head font-semibold">{s}</h2>
          <ul className="mt-2 divide-y divide-ink/10">{kb.clauses.filter((c) => c.section === s).map((c: Clause) => (
            <li key={c.id} className="flex items-start gap-3 py-2 text-sm"><code className="mt-0.5 rounded bg-mist px-1.5 py-0.5 text-xs font-bold">{c.id}</code>
              <div className="grow"><b>{c.title}</b><div className="text-ink/80">{c.text}</div></div>
              {can && c.id.startsWith("G-I") || can && c.id.startsWith("G-U") ? <button className="text-xs font-semibold text-rose underline" onClick={() => run(() => api.del(`/api/kb/clauses/${c.id}`), "Clause removed.")}>Remove</button> : null}</li>
          ))}</ul></section>
      ))}
    </div>
  );
}

function Facts({ facts, can, run }: { facts: Fact[]; can: boolean; run: Run }) {
  const [f, setF] = useState({ statement: "", keywords: "", owner: "", source: "", expires: "", safeWording: "" });
  const t = today();
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-mist text-left text-xs uppercase text-ink/60"><tr><th className="p-3">ID</th><th className="p-3">Approved fact</th><th className="p-3">Owner · source</th><th className="p-3">Expires</th>{can && <th className="p-3"></th>}</tr></thead>
          <tbody>{facts.map((x) => {
            const expired = x.expires && x.expires < t;
            return (
              <tr key={x.id} className="border-t border-ink/10 align-top">
                <td className="p-3"><code className="rounded bg-mist px-1.5 py-0.5 text-xs font-bold">{x.id}</code></td>
                <td className="p-3">{x.statement}<div className="mt-1 text-xs text-ink/55">Matches words: {x.keywords.join(", ")}</div></td>
                <td className="p-3 text-ink/80">{x.owner}<div className="text-xs text-ink/55">{x.source}</div></td>
                <td className="p-3">{can ? <input type="date" className="input !w-auto !py-1" value={x.expires || ""} aria-label={`Expiry for ${x.id}`} onChange={(e) => run(() => api.put(`/api/kb/facts/${x.id}`, { expires: e.target.value }), "Expiry updated. Re-run checks to apply.")} /> : (x.expires || "No expiry")}
                  {expired ? <div className="mt-1 inline-block rounded bg-rose-light px-1.5 py-0.5 text-xs font-bold text-rose">Expired: claims using it are flagged</div> : null}</td>
                {can && <td className="p-3">{x.id.startsWith("F-U") && <button className="text-xs font-semibold text-rose underline" onClick={() => run(() => api.del(`/api/kb/facts/${x.id}`), "Fact removed.")}>Remove</button>}</td>}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {can && (
        <div className="card space-y-3 p-4">
          <h2 className="font-head font-semibold">Add an approved fact</h2>
          <div><label className="label" htmlFor="fs">Fact (one full sentence)</label><textarea id="fs" className="input" rows={2} value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} placeholder="Lumora Glow Serum has an SPF of 30 (test report SPF-2026)." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="fk">Words that should match this fact (comma-separated)</label><input id="fk" className="input" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="spf, sun protection" /></div>
            <div><label className="label" htmlFor="fw">Safe wording to suggest (optional)</label><input id="fw" className="input" value={f.safeWording} onChange={(e) => setF({ ...f, safeWording: e.target.value })} placeholder="SPF 30" /></div>
            <div><label className="label" htmlFor="fo">Owner</label><input id="fo" className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></div>
            <div><label className="label" htmlFor="fe">Expiry date (optional)</label><input id="fe" type="date" className="input" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={async () => { if (await run(() => api.post("/api/kb/facts", f), "Fact added.")) setF({ statement: "", keywords: "", owner: "", source: "", expires: "", safeWording: "" }); }}>Add fact</button>
        </div>
      )}
    </div>
  );
}

function Terms({ terms, clauses, can, run }: { terms: Term[]; clauses: Clause[]; can: boolean; run: Run }) {
  const [t, setT] = useState({ preferred: "", avoid: "", clauseId: clauses[0]?.id || "" });
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
        <thead className="bg-mist text-left text-xs uppercase text-ink/60"><tr><th className="p-3">Avoid</th><th className="p-3">Use instead</th><th className="p-3">Guideline</th>{can && <th className="p-3"></th>}</tr></thead>
        <tbody>{terms.map((x) => <tr key={x.id} className="border-t border-ink/10"><td className="p-3 text-rose">{x.avoid.join(", ")}</td><td className="p-3 font-semibold text-moss">{x.preferred}</td><td className="p-3"><code className="rounded bg-mist px-1.5 py-0.5 text-xs font-bold">{x.clauseId}</code></td>
          {can && <td className="p-3"><button className="text-xs font-semibold text-rose underline" onClick={() => run(() => api.del(`/api/kb/terms/${x.id}`), "Term removed.")}>Remove</button></td>}</tr>)}</tbody></table></div>
      {can && (
        <div className="card space-y-3 p-4"><h2 className="font-head font-semibold">Add a term rule</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="ta">Avoid (comma-separated)</label><input id="ta" className="input" value={t.avoid} onChange={(e) => setT({ ...t, avoid: e.target.value })} placeholder="gorgeous" /></div>
            <div><label className="label" htmlFor="tp">Use instead</label><input id="tp" className="input" value={t.preferred} onChange={(e) => setT({ ...t, preferred: e.target.value })} placeholder="lovely" /></div>
            <div><label className="label" htmlFor="tc">Guideline it cites</label><select id="tc" className="input" value={t.clauseId} onChange={(e) => setT({ ...t, clauseId: e.target.value })}>{clauses.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}</select></div>
          </div>
          <button className="btn btn-primary" onClick={async () => { if (await run(() => api.post("/api/kb/terms", t), "Term rule added.")) setT({ ...t, preferred: "", avoid: "" }); }}>Add term rule</button></div>
      )}
    </div>
  );
}

function Workspace({ kb, can, run }: { kb: KB; can: boolean; run: Run }) {
  const [v, setV] = useState(kb.workspace.confidentialTerms.join(", "));
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-head font-semibold">Confidential terms</h2>
      <p className="text-sm text-ink/70">Unreleased product or project names. They are flagged if they appear in content, and redacted before any text could be sent to an AI service. Emails and phone numbers are always detected.</p>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} disabled={!can} aria-label="Confidential terms" />
      {can && <button className="btn btn-primary" onClick={() => run(() => api.put("/api/kb/workspace", { confidentialTerms: v.split(",").map((x) => x.trim()).filter(Boolean) }), "Confidential terms saved.")}>Save</button>}
    </div>
  );
}
