import type { Finding, Gap, KB, ReviewResult, Sensitivity } from "./types";
import { runRules } from "./engines/rules";
import { runClaims } from "./engines/claims";
import { verify } from "./engines/verifier";
import { aiConfig, aiJudge } from "./engines/ai";

const SEV = { high: 3, medium: 2, low: 1 } as const;
const ORIGIN = { ledger: 3, rule: 2, ai: 1 } as const;

/** Keep the strongest finding when spans overlap. Sentence-level clarity notes are exempt. */
function dedupe(findings: Finding[]): { kept: Finding[]; merged: number } {
  const order = [...findings].sort((a, b) => SEV[b.severity] - SEV[a.severity] || ORIGIN[b.origin] - ORIGIN[a.origin] || (b.end - b.start) - (a.end - a.start));
  const kept: Finding[] = [];
  let merged = 0;
  for (const f of order) {
    if (f.type === "clarity") { kept.push(f); continue; }
    if (kept.some((k) => k.type !== "clarity" && f.start < k.end && k.start < f.end)) { merged++; continue; }
    kept.push(f);
  }
  return { kept: kept.sort((a, b) => a.start - b.start || b.end - a.end), merged };
}

function base(text: string, kb: KB, today: string) {
  const r = runRules(text, kb);
  const c = runClaims(text, kb, today);
  return { findings: [...r.findings, ...c.findings], gaps: r.gaps as Gap[], verified: c.verified };
}

export function reviewSync(text: string, kb: KB, today = new Date().toISOString().slice(0, 10)): ReviewResult {
  const t0 = Date.now();
  const b = base(text, kb, today);
  const v = verify(b.findings, text, kb);
  const d = dedupe(v.kept);
  return {
    findings: d.kept, gaps: b.gaps, verifiedClaims: b.verified,
    meta: { engines: ["Rule engine", "Claim Ledger", "Citation verifier"], aiUsed: false, aiNote: "AI judge not used.", model: null, segmentsSent: 0, redactions: 0,
      dropped: v.dropped, merged: d.merged, ms: Date.now() - t0, ranAt: new Date().toISOString() },
  };
}

export async function runReview(text: string, kb: KB, opts: { sensitivity: Sensitivity; today?: string }): Promise<ReviewResult> {
  const t0 = Date.now();
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const b = base(text, kb, today);
  const cfg = aiConfig();
  let aiFindings: Finding[] = [];
  let note = "";
  let used = false;
  let sent = 0;
  let reds = 0;
  if (opts.sensitivity === "confidential") note = "AI judge skipped: this document is labelled confidential, so no content left the system.";
  else if (cfg.provider === "off") note = "AI judge is off (no API key configured). Rules, Claim Ledger and the citation verifier ran.";
  else {
    const r = await aiJudge(text, kb, b.findings, cfg);
    aiFindings = r.findings; note = r.note; sent = r.segmentsSent; reds = r.redactions;
    used = !r.note.startsWith("AI judge unavailable");
  }
  const v = verify([...b.findings, ...aiFindings], text, kb);
  const d = dedupe(v.kept);
  const engines = ["Rule engine", "Claim Ledger", ...(used ? [`AI judge (${cfg.model})`] : []), "Citation verifier"];
  return {
    findings: d.kept, gaps: b.gaps, verifiedClaims: b.verified,
    meta: { engines, aiUsed: used, aiNote: note, model: used ? cfg.model : null, segmentsSent: sent, redactions: reds,
      dropped: v.dropped, merged: d.merged, ms: Date.now() - t0, ranAt: new Date().toISOString() },
  };
}
