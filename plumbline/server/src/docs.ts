import type { Doc, DocStatus, Finding, KB, Role, Sensitivity, User } from "./types";
import { removeSpan, uid } from "./textutil";
import { reviewSync, runReview } from "./review";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const now = () => new Date().toISOString();
const EDITABLE: DocStatus[] = ["draft", "changes_requested"];
const isLead = (u: User) => u.role === "manager" || u.role === "admin";

export function audit(doc: Doc, actor: User | null, action: string, detail = "") {
  doc.audit.push({ at: now(), actor: actor ? actor.name : "Plumbline", role: actor ? actor.role : "system", action, detail });
  doc.updatedAt = now();
}

export function newDoc(user: User, p: { title: string; channel?: string; sensitivity?: Sensitivity; text: string }): Doc {
  if (!p.text || !p.text.trim()) throw new HttpError(400, "Content is empty.");
  if (p.text.length > 20000) throw new HttpError(400, "Content is too long for this demo (20,000 characters max).");
  const doc: Doc = {
    id: uid("d-"), title: (p.title || "Untitled content").slice(0, 120), channel: p.channel || "General",
    sensitivity: (["public", "internal", "confidential"].includes(p.sensitivity as string) ? p.sensitivity : "public") as Sensitivity,
    status: "draft", createdBy: user.id, createdAt: now(), updatedAt: now(),
    versions: [{ n: 1, text: p.text, by: user.name, at: now(), note: "Created" }], current: 1,
    review: null, decisions: {}, comments: [], audit: [],
  };
  audit(doc, user, "created", `Draft v1 created (${doc.channel}, ${doc.sensitivity}).`);
  return doc;
}

export const currentText = (doc: Doc) => doc.versions[doc.current - 1].text;

function attach(doc: Doc, res: Doc["review"]) {
  doc.review = res!;
  for (const f of doc.review!.findings) {
    const d = doc.decisions[f.fingerprint];
    if (d) f.decision = d;
  }
}

export async function reviewDoc(doc: Doc, kb: KB, user: User | null) {
  const res = await runReview(currentText(doc), kb, { sensitivity: doc.sensitivity });
  attach(doc, res);
  const hi = res.findings.filter((f) => f.severity === "high").length;
  audit(doc, null, "review.run", `v${doc.current}: ${res.findings.length} findings (${hi} high), ${res.verifiedClaims.length} claims verified. ${res.meta.aiNote}`);
}

export function reviewDocSync(doc: Doc, kb: KB) {
  attach(doc, reviewSync(currentText(doc), kb));
  audit(doc, null, "review.run", `v${doc.current}: ${doc.review!.findings.length} findings.`);
}

function mustEdit(doc: Doc, user: User) {
  const owner = doc.createdBy === user.id;
  if (!(owner || isLead(user))) throw new HttpError(403, "Only the creator or a manager can change this content.");
  if (!EDITABLE.includes(doc.status)) throw new HttpError(409, "This content is locked while it is in review or approved. Ask the reviewer to request changes first.");
}

export function addVersion(doc: Doc, user: User, text: string, note: string) {
  mustEdit(doc, user);
  if (!text.trim()) throw new HttpError(400, "Content is empty.");
  if (text === currentText(doc)) return false;
  doc.versions.push({ n: doc.versions.length + 1, text, by: user.name, at: now(), note });
  doc.current = doc.versions.length;
  audit(doc, user, "version.created", `v${doc.current}: ${note}`);
  return true;
}

export function findingOf(doc: Doc, fid: string): Finding {
  const f = doc.review?.findings.find((x) => x.id === fid);
  if (!f) throw new HttpError(404, "Finding not found (the content may have been re-checked).");
  return f;
}

export function acceptFinding(doc: Doc, user: User, fid: string) {
  mustEdit(doc, user);
  const f = findingOf(doc, fid);
  if (!f.suggestion) throw new HttpError(400, "This finding has no suggested fix. Edit the text yourself or dispute it.");
  const t = currentText(doc);
  const repl = f.suggestion.replacement;
  const next = repl ? t.slice(0, f.start) + repl + t.slice(f.end) : removeSpan(t, f.start, f.end);
  doc.versions.push({ n: doc.versions.length + 1, text: next, by: user.name, at: now(), note: `Accepted suggestion for “${f.quote.slice(0, 40)}”` });
  doc.current = doc.versions.length;
  audit(doc, user, "finding.accepted", `“${f.quote.slice(0, 60)}” → ${repl ? `“${repl.slice(0, 60)}”` : "(removed)"} [${f.citations.map((c) => c.id).join(", ")}]`);
}

export function disputeFinding(doc: Doc, user: User, fid: string, reason: string) {
  mustEdit(doc, user);
  const f = findingOf(doc, fid);
  if (!reason || reason.trim().length < 5) throw new HttpError(400, "A dispute needs a reason (at least a few words).");
  doc.decisions[f.fingerprint] = { action: "disputed", reason: reason.trim(), by: user.name, at: now() };
  f.decision = doc.decisions[f.fingerprint];
  audit(doc, user, "finding.disputed", `“${f.quote.slice(0, 60)}”: ${reason.trim()}`);
}

export function undoDispute(doc: Doc, user: User, fid: string) {
  mustEdit(doc, user);
  const f = findingOf(doc, fid);
  delete doc.decisions[f.fingerprint];
  delete f.decision;
  audit(doc, user, "finding.dispute_withdrawn", `“${f.quote.slice(0, 60)}”`);
}

export function unresolvedHigh(doc: Doc): Finding[] {
  return (doc.review?.findings || []).filter((f) => f.severity === "high" && !f.decision);
}

export function submit(doc: Doc, user: User) {
  mustEdit(doc, user);
  if (!doc.review) throw new HttpError(409, "Run the check first.");
  const open = unresolvedHigh(doc);
  if (open.length) throw new HttpError(409, `${open.length} high-severity finding(s) still need a decision: accept the fix, edit the text, or dispute with a reason.`);
  doc.status = "in_review";
  audit(doc, user, "submitted", `v${doc.current} sent for human review.`);
}

export function decide(doc: Doc, user: User, decision: "approve" | "changes", comment: string) {
  if (!(user.role === "reviewer" || isLead(user))) throw new HttpError(403, "Only reviewers and managers can review content.");
  if (decision === "approve") {
    if (doc.status !== "in_review") throw new HttpError(409, "Only content that is in review can be approved.");
    doc.status = "approved";
    audit(doc, user, "review.approved", comment || "Approved.");
  } else {
    if (!["in_review", "approved"].includes(doc.status)) throw new HttpError(409, "Nothing to send back at this stage.");
    if (!comment || comment.trim().length < 3) throw new HttpError(400, "Please say what needs to change.");
    doc.status = "changes_requested";
    doc.reviewerNote = comment.trim();
    audit(doc, user, "review.changes_requested", comment.trim());
  }
  if (comment) doc.comments.push({ id: uid("c-"), by: user.name, role: user.role, text: (decision === "approve" ? "Approved: " : "Changes requested: ") + comment, at: now() });
}

export function signOff(doc: Doc, user: User) {
  if (!isLead(user)) throw new HttpError(403, "Only a manager can sign off.");
  if (doc.status !== "approved") throw new HttpError(409, "The reviewer must approve before sign-off.");
  doc.status = "ready_to_publish";
  audit(doc, user, "signed_off", `v${doc.current} locked as publish-ready.`);
}

export function addComment(doc: Doc, user: User, text: string, findingId?: string) {
  if (!text || !text.trim()) throw new HttpError(400, "Comment is empty.");
  doc.comments.push({ id: uid("c-"), by: user.name, role: user.role as Role, text: text.trim().slice(0, 1000), at: now(), findingId });
  audit(doc, user, "comment", text.trim().slice(0, 80));
}

export function buildPackage(doc: Doc) {
  const disputes = Object.entries(doc.decisions).map(([k, v]) => ({ finding: k.split("|")[1], ...v }));
  const signed = [...doc.audit].reverse().find((a) => a.action === "signed_off");
  const approved = [...doc.audit].reverse().find((a) => a.action === "review.approved");
  return {
    title: doc.title, channel: doc.channel, sensitivity: doc.sensitivity, status: doc.status, version: doc.current,
    finalText: currentText(doc),
    approvedBy: approved ? { name: approved.actor, at: approved.at } : null,
    signedOffBy: signed ? { name: signed.actor, at: signed.at } : null,
    openFindingsAtSignOff: (doc.review?.findings || []).map((f) => ({ type: f.type, severity: f.severity, quote: f.quote, citations: f.citations.map((c) => c.id), disputed: !!f.decision })),
    disputes,
    aiDisclosure: doc.review ? { engines: doc.review.meta.engines, aiUsed: doc.review.meta.aiUsed, model: doc.review.meta.model, note: doc.review.meta.aiNote, segmentsSent: doc.review.meta.segmentsSent, itemsRedactedBeforeSending: doc.review.meta.redactions } : null,
    auditTrail: doc.audit,
    generatedAt: now(),
  };
}

export function packageMarkdown(doc: Doc): string {
  const p = buildPackage(doc);
  return [
    `# ${p.title}`, ``, `Channel: ${p.channel} · Sensitivity: ${p.sensitivity} · Version ${p.version} · Status: ${p.status}`, ``,
    `## Final text`, ``, p.finalText, ``,
    `## Approval`, `- Reviewer approval: ${p.approvedBy ? `${p.approvedBy.name} (${p.approvedBy.at})` : "n/a"}`,
    `- Manager sign-off: ${p.signedOffBy ? `${p.signedOffBy.name} (${p.signedOffBy.at})` : "n/a"}`, ``,
    `## Findings still present at sign-off`, ...(p.openFindingsAtSignOff.length ? p.openFindingsAtSignOff.map((f) => `- [${f.severity}] ${f.type}: “${f.quote}” (${f.citations.join(", ")})${f.disputed ? " (disputed)" : ""}`) : ["- none"]), ``,
    `## Disputes`, ...(p.disputes.length ? p.disputes.map((d: any) => `- “${d.finding}”: ${d.reason} (${d.by})`) : ["- none"]), ``,
    `## AI-use disclosure`, p.aiDisclosure ? `- Engines: ${p.aiDisclosure.engines.join(", ")}\n- ${p.aiDisclosure.note}` : "- n/a", ``,
    `## Audit trail`, ...p.auditTrail.map((a) => `- ${a.at} · ${a.actor} (${a.role}) · ${a.action}: ${a.detail}`), ``,
  ].join("\n");
}
