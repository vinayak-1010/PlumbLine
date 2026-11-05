import type { Finding, Gap, KB, Citation, Clause } from "../types";
import { escapeRe, fp, matchCase, splitSentences, uid } from "../textutil";

export function clauseCitation(kb: KB, id: string): Citation | null {
  const c = kb.clauses.find((x) => x.id === id);
  return c ? { kind: "clause", id: c.id, title: c.title, text: c.text } : null;
}

function mk(partial: Partial<Finding> & Pick<Finding, "type" | "severity" | "start" | "end" | "quote" | "why">): Finding {
  return {
    id: uid("f-"), fingerprint: fp(partial.type, partial.quote), origin: "rule", citations: [], suggestion: null,
    confidence: 0.97, verified: false, needsHuman: false, ...partial,
  } as Finding;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,11}\d/g;

export function runRules(text: string, kb: KB): { findings: Finding[]; gaps: Gap[] } {
  const findings: Finding[] = [];
  const gaps: Gap[] = [];
  const ws = kb.workspace;

  // 1. Terminology (preferred / avoided terms)
  for (const term of kb.terms) {
    for (const bad of term.avoid) {
      const re = new RegExp(`(?<![\\w-])${escapeRe(bad)}(?![\\w-])`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const cit = clauseCitation(kb, term.clauseId);
        if (!cit) continue;
        const repl = matchCase(m[0], term.preferred);
        findings.push(mk({
          type: "terminology", severity: "medium", start: m.index, end: m.index + m[0].length, quote: m[0],
          why: `“${m[0]}” is not an approved term. ${cit.title}: the guideline asks for “${term.preferred}” instead.`,
          citations: [cit], suggestion: { replacement: repl, rationale: `Approved wording per ${cit.id}.` },
        }));
      }
    }
  }

  // 2. Brand name capitalisation
  const brand = ws.brand;
  if (brand) {
    const re = new RegExp(`(?<![\\w-])${escapeRe(brand)}(?![\\w-])`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0] !== brand) {
        const cit = clauseCitation(kb, "G-2.1");
        if (!cit) continue;
        findings.push(mk({
          type: "brand_name", severity: "medium", start: m.index, end: m.index + m[0].length, quote: m[0],
          why: `The brand name is written “${m[0]}”. ${cit.title}: it must appear as “${brand}” in running text.`,
          citations: [cit], suggestion: { replacement: brand, rationale: "Correct brand-name capitalisation." },
        }));
      }
    }
  }

  // 3. Tone: ALL CAPS words and stacked exclamation marks
  const acro = new Set([...ws.acronyms.map((a) => a.toUpperCase()), brand.toUpperCase()]);
  const capsRe = /\b[A-Z]{3,}\b(?:\s+\b[A-Z]{2,}\b)*[!?.]*/g;
  let cm: RegExpExecArray | null;
  const toneCit = clauseCitation(kb, "G-1.2");
  while ((cm = capsRe.exec(text))) {
    const words = cm[0].replace(/[!?.]+$/, "").split(/\s+/);
    if (words.every((w) => acro.has(w))) continue;
    if (!toneCit) continue;
    const cleaned = cm[0].replace(/!{2,}/g, "!");
    const lower = cleaned.charAt(0) + cleaned.slice(1).toLowerCase();
    findings.push(mk({
      type: "tone", severity: "low", start: cm.index, end: cm.index + cm[0].length, quote: cm[0],
      why: `“${cm[0]}” reads as shouting. ${toneCit.title}: avoid ALL CAPS and stacked exclamation marks.`,
      citations: [toneCit], suggestion: { replacement: lower, rationale: "Same message in the brand's calm, confident voice." },
    }));
  }
  const exRe = /!{2,}/g;
  while (toneCit && (cm = exRe.exec(text))) {
    if (findings.some((f) => f.type === "tone" && cm!.index >= f.start && cm!.index < f.end)) continue;
    findings.push(mk({
      type: "tone", severity: "low", start: cm.index, end: cm.index + cm[0].length, quote: cm[0],
      why: `Stacked exclamation marks. ${toneCit.title}: use at most one per post.`,
      citations: [toneCit], suggestion: { replacement: "!", rationale: "One exclamation mark is enough." },
    }));
  }

  // 4. Required disclosures (e.g. offers need "T&C apply")
  for (const d of ws.disclosures) {
    const cit = clauseCitation(kb, d.clauseId);
    if (!cit) continue;
    let re: RegExp;
    try { re = new RegExp(d.trigger, "i"); } catch { continue; }
    const m = re.exec(text);
    if (m && !new RegExp(escapeRe(d.phrase), "i").test(text)) {
      findings.push(mk({
        type: "disclosure", severity: "medium", start: m.index, end: m.index + m[0].length, quote: m[0],
        why: `This mentions an offer but the post does not include “${d.phrase}”. ${cit.title}.`,
        citations: [cit], suggestion: { replacement: `${m[0]} (${d.phrase})`, rationale: `Adds the required “${d.phrase}” disclosure.` },
      }));
    }
  }

  // 5. Confidential or personal data
  const privCit = clauseCitation(kb, "G-7.1");
  if (privCit) {
    const push = (q: string, idx: number, label: string) =>
      findings.push(mk({
        type: "confidential", severity: "high", start: idx, end: idx + q.length, quote: q,
        why: `${label} found in content. ${privCit.title}: this must not be published.`,
        citations: [privCit], suggestion: { replacement: "", rationale: "Remove it, or replace it with a public contact route." },
      }));
    let m: RegExpExecArray | null;
    const emailRe = new RegExp(EMAIL.source, "gi");
    while ((m = emailRe.exec(text))) push(m[0], m.index, "An email address");
    const phoneRe = new RegExp(PHONE.source, "g");
    while ((m = phoneRe.exec(text))) {
      const q = m[0].trim();
      if (q.replace(/\D/g, "").length >= 10) push(q, m.index + m[0].indexOf(q), "A phone number");
    }
    for (const term of ws.confidentialTerms) {
      const re = new RegExp(`(?<![\\w-])${escapeRe(term)}(?![\\w-])`, "gi");
      while ((m = re.exec(text))) push(m[0], m.index, "An unreleased product or project name");
    }
  }

  // 6. Clarity: very long sentences
  const clarity = clauseCitation(kb, "G-5.1");
  if (clarity) {
    for (const s of splitSentences(text)) {
      const words = s.text.split(/\s+/).filter(Boolean).length;
      if (words > 30) {
        findings.push(mk({
          type: "clarity", severity: "low", start: s.start, end: s.end, quote: s.text,
          why: `This sentence has ${words} words. ${clarity.title}: keep sentences under 30 words.`,
          citations: [clarity], suggestion: null, confidence: 0.9,
        }));
      }
    }
  }

  // 7. Guideline gaps: hype words that no guideline covers
  const hype = ["amazing", "unbelievable", "mind-blowing", "next-level", "insane", "ultimate"];
  const covered = (w: string) => kb.terms.some((t) => t.avoid.map((a) => a.toLowerCase()).includes(w)) ||
    kb.clauses.some((c: Clause) => c.text.toLowerCase().includes(w));
  for (const w of hype) {
    const m = new RegExp(`(?<![\\w-])${escapeRe(w)}(?![\\w-])`, "i").exec(text);
    if (m && !covered(w)) {
      gaps.push({ id: uid("g-"), quote: m[0], note: `Hype word “${m[0]}” is used, but no guideline or term covers it. Decide whether to add a rule.` });
    }
  }
  return { findings, gaps };
}
