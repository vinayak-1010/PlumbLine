import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadText } from "../api";
import { useApp } from "../ctx";
import { StatusPill, fmt, sevStyle, typeLabel } from "../components/ui";
import type { DocFull, Finding } from "../types";

export default function Review() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const [doc, setDoc] = useState<DocFull | null>(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState("");
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [disputeFor, setDisputeFor] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState("");
  const [tab, setTab] = useState<"comments" | "versions" | "audit" | "ai">("comments");
  const [busy, setBusy] = useState("");
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => { api.get<DocFull>(`/api/docs/${id}`).then(setDoc).catch((e) => setErr(e.message)); }, [id]);

  const lead = user!.role === "manager" || user!.role === "admin";
  const owner = doc?.createdBy === user!.id;
  const editable = !!doc && ["draft", "changes_requested"].includes(doc.status) && (owner || lead);
  const canReview = !!doc && (user!.role === "reviewer" || lead) && doc.status === "in_review";
  const canSend = !!doc && (user!.role === "reviewer" || lead) && doc.status === "approved";
  const canSign = !!doc && lead && doc.status === "approved";

  async function act<T = DocFull>(key: string, fn: () => Promise<T>, ok?: string) {
    setBusy(key);
    try { const d: any = await fn(); if (d && d.id) setDoc(d); if (ok) toast(ok); return true; }
    catch (e: any) { toast(e.message, "err"); return false; }
    finally { setBusy(""); }
  }

  const findings: Finding[] = doc?.review?.findings || [];
  const numbered = useMemo(() => findings.map((f, i) => ({ f, n: i + 1 })), [doc]);
  const shown = numbered.filter(({ f }) => filter === "all" || f.severity === filter);

  const segments = useMemo(() => {
    if (!doc) return [];
    const marks = numbered.filter(({ f }) => f.type !== "clarity").sort((a, b) => a.f.start - b.f.start);
    const out: { text: string; item?: { f: Finding; n: number } }[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.f.start < pos) continue;
      if (m.f.start > pos) out.push({ text: doc.text.slice(pos, m.f.start) });
      out.push({ text: doc.text.slice(m.f.start, m.f.end), item: m });
      pos = m.f.end;
    }
    if (pos < doc.text.length) out.push({ text: doc.text.slice(pos) });
    return out;
  }, [doc, numbered]);

  if (err) return <div className="card p-6">{err} <Link className="font-semibold text-teal underline" to="/">Back to content</Link></div>;
  if (!doc) return <p className="text-ink/60">Loading…</p>;

  const open = doc.unresolvedHigh.length;
  const next = (() => {
    if (doc.status === "draft" || doc.status === "changes_requested") {
      if (!(owner || lead)) return "This draft belongs to its creator. You can read it and leave a comment.";
      const pre = doc.status === "changes_requested" && doc.reviewerNote ? `Reviewer asked: “${doc.reviewerNote}”. ` : "";
      return open ? `${pre}Next step: ${open} high-severity finding${open > 1 ? "s" : ""} still need a decision. Accept the fix, edit the text, or dispute with a reason.` : `${pre}Next step: all high-severity findings are handled. Send it to the reviewer.`;
    }
    if (doc.status === "in_review") return canReview ? "Your turn: check the findings, disputes and evidence below, then approve or request changes." : "Waiting for a reviewer. The content is locked while it is in review.";
    if (doc.status === "approved") return lead ? "The reviewer approved this version. Sign it off to lock it as publish-ready." : "Approved by the reviewer. Waiting for the manager to sign off.";
    return "Signed off and locked. Download the publish-ready package below.";
  })();

  function jump(fid: string) {
    setActive(fid);
    cardRefs.current[fid]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-sm font-semibold text-teal underline">← All content</Link>
          <h1 className="font-head text-2xl font-bold leading-tight">{doc.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70"><StatusPill s={doc.status} /><span>{doc.channel}</span><span>·</span><span className="capitalize">{doc.sensitivity}</span><span>·</span><span>v{doc.current}</span><span>·</span><span>by {doc.creatorName}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && !editing && <button className="btn btn-ghost" onClick={() => { setEditText(doc.text); setEditing(true); }}>Edit text</button>}
          {editable && <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("re", () => api.post<DocFull>(`/api/docs/${doc.id}/recheck`), "Check re-run.")}>{busy === "re" ? "Checking…" : "Re-run check"}</button>}
          {editable && <button className="btn btn-teal" disabled={!!busy || open > 0} title={open ? "Resolve the high-severity findings first" : ""} onClick={() => act("sub", () => api.post<DocFull>(`/api/docs/${doc.id}/submit`), "Sent to the reviewer.")}>Send to reviewer</button>}
          {canSign && <button className="btn btn-green" disabled={!!busy} onClick={() => act("sign", () => api.post<DocFull>(`/api/docs/${doc.id}/signoff`), "Signed off. Package ready.")}>Sign off</button>}
        </div>
      </div>

      <div role="note" className={`rounded-lg border-l-4 p-3 text-sm ${doc.status === "ready_to_publish" ? "border-moss bg-moss-light" : "border-amber bg-amber-light"}`}>{next}</div>

      {doc.status === "ready_to_publish" && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div className="grow"><div className="font-head font-semibold">Publish-ready package</div><div className="text-sm text-ink/70">Final text, approvals, disputes, AI-use disclosure and the full audit trail.</div></div>
          <button className="btn btn-primary" onClick={() => downloadText(`/api/docs/${doc.id}/package?format=md`, `${doc.title.replace(/\W+/g, "-")}-package.md`)}>Download (Markdown)</button>
          <button className="btn btn-ghost" onClick={() => downloadText(`/api/docs/${doc.id}/package`, `${doc.title.replace(/\W+/g, "-")}-package.json`)}>Download (JSON)</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Content */}
        <section className="card p-4 lg:sticky lg:top-4 lg:self-start" aria-label="Content">
          <div className="mb-2 flex items-center justify-between"><h2 className="label !mb-0">Content (version {doc.current})</h2>
            <div className="flex gap-2 text-xs"><span className="rounded bg-rose-light px-2 py-0.5">high</span><span className="rounded bg-amber-light px-2 py-0.5">medium</span><span className="rounded bg-teal-light px-2 py-0.5">low</span></div></div>
          {editing ? (
            <div className="space-y-2">
              <textarea className="input min-h-[220px] font-body" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit content" />
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={!!busy} onClick={async () => { if (await act("save", () => api.post<DocFull>(`/api/docs/${doc.id}/text`, { text: editText, note: "Edited by hand" }), "Saved as a new version and re-checked.")) setEditing(false); }}>{busy === "save" ? "Checking…" : "Save and re-check"}</button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap rounded-lg bg-paper p-4 text-[17px] leading-8">
              {segments.map((s, i) => s.item ? (
                <mark key={i} id={`m-${s.item.f.id}`} onClick={() => jump(s.item!.f.id)} tabIndex={0} role="button"
                  onKeyDown={(e) => { if (e.key === "Enter") jump(s.item!.f.id); }}
                  className={`cursor-pointer rounded-sm border-b-2 px-0.5 ${s.item.f.decision ? "border-dashed border-ink/40 bg-mist text-ink/70" : sevStyle[s.item.f.severity].mark} ${active === s.item.f.id ? "ring-2 ring-ink" : ""}`}>
                  {s.text}<sup className="ml-0.5 rounded-full bg-ink px-1 text-[10px] font-bold text-white">{s.item.n}</sup>
                </mark>
              ) : <span key={i}>{s.text}</span>)}
            </p>
          )}
          {doc.review && doc.review.verifiedClaims.length > 0 && (
            <details className="mt-3 rounded-lg border border-moss/40 bg-moss-light/50 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-moss">{doc.review.verifiedClaims.length} claim{doc.review.verifiedClaims.length > 1 ? "s" : ""} verified against approved facts</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{doc.review.verifiedClaims.map((v, i) => <li key={i}>“{v.quote}” matches <b>{v.factId}</b></li>)}</ul>
            </details>
          )}
          {doc.review && doc.review.gaps.length > 0 && (
            <div className="mt-3 rounded-lg border border-teal/40 bg-teal-light/60 p-3 text-sm"><b className="text-teal">Guideline gaps</b> (issues no rule covers)
              <ul className="mt-1 list-disc pl-5">{doc.review.gaps.map((g) => <li key={g.id}>{g.note}</li>)}</ul></div>
          )}
        </section>

        {/* Findings */}
        <section aria-label="Findings">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-head text-lg font-semibold">{findings.length} finding{findings.length === 1 ? "" : "s"}</h2>
            <div className="flex gap-1 text-xs">
              {(["all", "high", "medium", "low"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-2.5 py-1 font-semibold capitalize ${filter === f ? "border-ink bg-ink text-white" : "border-ink/25 bg-white"}`}>{f}</button>)}
            </div>
          </div>
          {findings.length === 0 && <div className="card p-5 text-sm"><b className="text-moss">No issues found.</b> Every claim in this version matches the approved facts and every guideline check passed.</div>}
          <div className="space-y-3">
            {shown.map(({ f, n }) => {
              const sv = sevStyle[f.severity];
              return (
                <article key={f.id} ref={(el) => { cardRefs.current[f.id] = el; }} onMouseEnter={() => setActive(f.id)}
                  className={`card border-l-4 p-3 text-sm ${sv.border} ${active === f.id ? "ring-2 ring-ink/40" : ""} ${f.decision ? "opacity-80" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{n}</span>
                    <b>{typeLabel[f.type] || f.type}</b>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${sv.chip}`}>{sv.label}</span>
                    {f.verified && <span className="rounded bg-moss-light px-1.5 py-0.5 text-[11px] font-bold text-moss">Citation verified</span>}
                    {f.origin === "ai" && <span className="rounded bg-mist px-1.5 py-0.5 text-[11px] font-bold">AI judge · {Math.round(f.confidence * 100)}%</span>}
                    {f.needsHuman && <span className="rounded bg-amber-light px-1.5 py-0.5 text-[11px] font-bold">Needs human judgement</span>}
                  </div>
                  <p className="mt-2 rounded bg-paper px-2 py-1 italic">“{f.quote.length > 140 ? f.quote.slice(0, 140) + "…" : f.quote}”</p>
                  <p className="mt-2"><b>Why:</b> {f.why}</p>
                  <div className="mt-2 space-y-1">
                    {f.citations.map((c) => (
                      <div key={c.id} className="rounded border border-teal/30 bg-teal-light/50 px-2 py-1 text-xs">
                        <b className="text-teal">Source · {c.kind === "fact" ? "Approved fact" : "Guideline"} {c.id}</b> <span className="text-ink/60">{c.kind === "clause" ? c.title : c.title.split(" · ")[1]}</span>
                        <div className="text-ink/80">{c.text}</div>
                        {c.kind === "fact" && c.expires && <div className="text-ink/60">Valid until {c.expires}</div>}
                      </div>
                    ))}
                  </div>
                  {f.suggestion ? (
                    <div className="mt-2 rounded border border-moss/40 bg-moss-light/50 px-2 py-1.5">
                      <div className="text-xs font-bold uppercase text-moss">Suggested fix (keeps your meaning)</div>
                      <div><del className="text-rose">{f.quote.length > 90 ? f.quote.slice(0, 90) + "…" : f.quote}</del> <span aria-hidden>→</span> <ins className="font-semibold text-moss no-underline">{f.suggestion.replacement || "(remove)"}</ins></div>
                      <div className="text-xs text-ink/60">{f.suggestion.rationale}</div>
                    </div>
                  ) : f.type !== "clarity" && <p className="mt-2 text-xs text-ink/60">No safe automatic fix: edit the text yourself, or dispute this finding with a reason.</p>}
                  {f.decision && (
                    <div className="mt-2 rounded border border-ink/20 bg-mist px-2 py-1.5 text-xs"><b>Disputed by {f.decision.by}:</b> {f.decision.reason}
                      {editable && <button className="ml-2 font-semibold text-teal underline" onClick={() => act("u" + f.id, () => api.post<DocFull>(`/api/docs/${doc.id}/findings/${f.id}/undispute`))}>Withdraw dispute</button>}
                    </div>
                  )}
                  {editable && !f.decision && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.suggestion && <button className="btn btn-green !py-1.5" disabled={!!busy} onClick={() => act("a" + f.id, () => api.post<DocFull>(`/api/docs/${doc.id}/findings/${f.id}/accept`), "Fix applied. New version created and re-checked.")}>{busy === "a" + f.id ? "Applying…" : "Accept fix"}</button>}
                      <button className="btn btn-ghost !py-1.5" onClick={() => { setEditText(doc.text); setEditing(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit text myself</button>
                      <button className="btn btn-danger !py-1.5" onClick={() => { setDisputeFor(disputeFor === f.id ? "" : f.id); setReason(""); }}>Dispute…</button>
                    </div>
                  )}
                  {disputeFor === f.id && (
                    <div className="mt-2 space-y-2">
                      <label className="label" htmlFor={`r-${f.id}`}>Why is this finding wrong or acceptable?</label>
                      <textarea id={`r-${f.id}`} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Legal approved this wording on 3 Nov." />
                      <div className="flex gap-2"><button className="btn btn-primary !py-1.5" onClick={async () => { if (await act("d" + f.id, () => api.post<DocFull>(`/api/docs/${doc.id}/findings/${f.id}/dispute`, { reason }), "Dispute recorded for the reviewer.")) setDisputeFor(""); }}>Record dispute</button>
                        <button className="btn btn-ghost !py-1.5" onClick={() => setDisputeFor("")}>Cancel</button></div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {(canReview || (canSend && !canReview)) && (
        <section className="card p-4" aria-label="Review decision">
          <h2 className="font-head text-lg font-semibold">{canReview ? "Your decision" : "Send back for changes?"}</h2>
          <label className="label mt-2" htmlFor="dc">Comment (required when requesting changes)</label>
          <textarea id="dc" className="input" rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="What should the creator know?" />
          <div className="mt-3 flex flex-wrap gap-2">
            {canReview && <button className="btn btn-green" disabled={!!busy} onClick={() => act("ap", () => api.post<DocFull>(`/api/docs/${doc.id}/decision`, { decision: "approve", comment: decision }), "Approved.")}>Approve</button>}
            <button className="btn btn-danger" disabled={!!busy} onClick={() => act("ch", () => api.post<DocFull>(`/api/docs/${doc.id}/decision`, { decision: "changes", comment: decision }), "Sent back to the creator.")}>Request changes</button>
          </div>
        </section>
      )}

      <section className="card" aria-label="Details">
        <div role="tablist" className="flex flex-wrap gap-1 border-b border-ink/10 p-2">
          {([["comments", `Comments (${doc.comments.length})`], ["versions", `Versions (${doc.versions.length})`], ["audit", "Audit trail"], ["ai", "AI use & verification"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-ink text-white" : "hover:bg-mist"}`}>{l}</button>
          ))}
        </div>
        <div className="p-4 text-sm">
          {tab === "comments" && (
            <div className="space-y-3">
              {doc.comments.length === 0 && <p className="text-ink/60">No comments yet.</p>}
              {doc.comments.map((c) => <div key={c.id} className="rounded-lg bg-mist p-3"><b>{c.by}</b> <span className="text-xs capitalize text-ink/60">· {c.role} · {fmt(c.at)}</span><div>{c.text}</div></div>)}
              <div className="flex gap-2"><input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" />
                <button className="btn btn-primary" onClick={async () => { if (comment.trim() && await act("cm", () => api.post<DocFull>(`/api/docs/${doc.id}/comments`, { text: comment }))) setComment(""); }}>Post</button></div>
            </div>
          )}
          {tab === "versions" && (
            <ol className="space-y-2">{[...doc.versions].reverse().map((v) => (
              <li key={v.n} className="rounded-lg bg-mist p-3"><b>v{v.n}</b> · {v.note} <span className="text-xs text-ink/60">· {v.by} · {fmt(v.at)}</span>
                <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-teal">Show text</summary><p className="mt-1 whitespace-pre-wrap">{v.text}</p></details></li>
            ))}</ol>
          )}
          {tab === "audit" && (
            <ul className="space-y-1">{[...doc.audit].reverse().map((a, i) => <li key={i} className="border-b border-ink/10 pb-1"><span className="text-xs text-ink/55">{fmt(a.at)}</span> · <b>{a.actor}</b> <span className="text-xs capitalize text-ink/60">({a.role})</span> · <code className="text-xs">{a.action}</code> {a.detail}</li>)}</ul>
          )}
          {tab === "ai" && doc.review && (
            <div className="space-y-2">
              <p><b>Engines run on v{doc.current}:</b> {doc.review.meta.engines.join(" → ")}</p>
              <p><b>AI judge:</b> {doc.review.meta.aiNote}</p>
              {doc.review.meta.aiUsed && <p>Segments sent: {doc.review.meta.segmentsSent}. Items redacted before sending: {doc.review.meta.redactions}.</p>}
              <p><b>Citation verifier:</b> every finding shown here passed four checks (clause or fact exists, quoted source text found, span matches the content, suggestion adds no new numbers). {doc.review.meta.dropped.length} candidate finding(s) were rejected and {doc.review.meta.merged} overlapping one(s) merged.</p>
              {doc.review.meta.dropped.length > 0 && <ul className="list-disc pl-5">{doc.review.meta.dropped.map((d, i) => <li key={i}>“{d.quote}”: {d.reason}</li>)}</ul>}
              <p className="text-xs text-ink/60">Review took {doc.review.meta.ms} ms · {fmt(doc.review.meta.ranAt)}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
