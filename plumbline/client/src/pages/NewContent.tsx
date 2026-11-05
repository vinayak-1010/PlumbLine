import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../ctx";
import type { DocFull } from "../types";

const sens = [
  ["public", "Public", "Will be published. May be sent to the AI judge after redaction."],
  ["internal", "Internal", "Not for the public yet. May be sent to the AI judge after redaction."],
  ["confidential", "Confidential", "Never leaves the system: the AI judge is skipped, rules and Claim Ledger still run."],
];

export default function NewContent() {
  const { toast } = useApp();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("Instagram");
  const [sensitivity, setSensitivity] = useState("public");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return toast("Paste some text or choose a file first.", "err");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title || file?.name || "Untitled content");
      fd.append("channel", channel); fd.append("sensitivity", sensitivity); fd.append("text", text);
      if (file) fd.append("file", file);
      const d = await api.post<DocFull>("/api/docs", fd);
      nav(`/doc/${d.id}`);
    } catch (err: any) { toast(err.message, "err"); setBusy(false); }
  }
  return (
    <form onSubmit={run} className="mx-auto max-w-3xl space-y-4">
      <div><h1 className="font-head text-2xl font-bold">Check new content</h1><p className="text-sm text-ink/70">Paste your draft or upload a Word, PDF or text file. Plumbline checks it against the workspace guidelines, approved facts and terms.</p></div>
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="t">Title</label><input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali sale caption" /></div>
          <div><label className="label" htmlFor="c">Channel</label>
            <select id="c" className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>{["Instagram", "LinkedIn", "Website", "Email", "Press release", "Other"].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <fieldset>
          <legend className="label">Sensitivity</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {sens.map(([v, l, d]) => (
              <label key={v} className={`cursor-pointer rounded-lg border p-3 text-sm ${sensitivity === v ? "border-teal bg-teal-light" : "border-ink/20 bg-white"}`}>
                <input type="radio" name="s" className="mr-2" checked={sensitivity === v} onChange={() => setSensitivity(v)} /><b>{l}</b><div className="mt-1 text-xs text-ink/70">{d}</div>
              </label>
            ))}
          </div>
        </fieldset>
        <div><label className="label" htmlFor="x">Content</label>
          <textarea id="x" rows={9} className="input font-body" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your caption, page copy or email here…" /></div>
        <div><label className="label" htmlFor="f">…or upload a file (.docx, .pdf, .txt, up to 5 MB)</label>
          <input id="f" type="file" accept=".docx,.pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" /></div>
        <div className="flex items-center gap-3"><button className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Run the check"}</button><span className="text-xs text-ink/60">Takes a moment. You will see every finding with its source.</span></div>
      </div>
    </form>
  );
}
