import type { Citation, Fact, Finding, KB, VerifiedClaim } from "../types";
import { fp, splitSentences, stem, tokens, uid } from "../textutil";
import { clauseCitation } from "./rules";

export interface Num { value: number; unit: string; raw: string; idx: number }

const TIME_H: Record<string, number> = { hour: 1, hr: 1, day: 24, week: 168, month: 720 };

/** Extract numbers that carry a unit or currency, normalising time to hours. */
export function extractNumbers(s: string): Num[] {
  const out: Num[] = [];
  const re = /(₹|\$|rs\.?\s?)?\s?(\d+(?:[.,]\d+)?)\s?(%|percent\b|hours?\b|hrs?\b|days?\b|weeks?\b|months?\b|ml\b|mg\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const cur = m[1];
    const unitRaw = (m[3] || "").toLowerCase();
    if (!cur && !unitRaw) continue;
    if (s[m.index - 1] === "#") continue; // "#1" is a ranking, not a quantity
    const num = parseFloat(m[2].replace(",", ""));
    let unit = "";
    let value = num;
    if (cur) unit = "inr";
    else if (unitRaw === "%" || unitRaw === "percent") unit = "pct";
    else if (unitRaw === "ml" || unitRaw === "mg") unit = unitRaw;
    else {
      const k = unitRaw.replace(/s$/, "");
      if (TIME_H[k]) { unit = "time"; value = num * TIME_H[k]; }
    }
    if (!unit) continue;
    const idx = m.index + (m[0].length - m[0].trimStart().length);
    out.push({ value, unit, raw: m[0].trim(), idx });
  }
  return out;
}

interface Trigger { kind: "rank" | "absolute" | "authority" | "number" | "free"; idx: number; text: string }

const RANK = /#\s?1\b|\bnumber\s+one\b|\b(?:best|leading|fastest|safest|strongest|unbeatable|world'?s\s+\w+)\b|\bmost\s+(?:effective|trusted|loved|popular|powerful|advanced)\b/gi;
const ABSOLUTE = /\bguarantee[sd]?\b|\b100\s?%|\balways\b|\bnever\b|\bproven\b|\binstant(?:ly)?\b|\bmiracle\b|\bcures?\b|\brisk-free\b|\bpermanent(?:ly)?\b|\bno side effects\b/gi;
const AUTH = /\bdermatolog\w*|\bdoctors?\b|\bclinically\b|\bscientifically\b|\baward[- ]winning\b|\bawards?\b|\bcertified\b|\brecommended\b|\bapproved\b|\bendorsed\b|\btested\b|\bvegan\b|\bcruelty[- ]free\b/gi;
const FREE = /(?<![-\w])free\b(?!-)/gi;

function findTriggers(s: string): Trigger[] {
  const out: Trigger[] = [];
  const run = (re: RegExp, kind: Trigger["kind"]) => {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(s))) out.push({ kind, idx: m.index, text: m[0] });
  };
  run(RANK, "rank"); run(ABSOLUTE, "absolute"); run(AUTH, "authority"); run(FREE, "free");
  for (const n of extractNumbers(s)) out.push({ kind: "number", idx: n.idx, text: n.raw });
  return out.sort((a, b) => a.idx - b.idx);
}

/** Split a sentence into clauses so "X guarantees A and is the #1 B" is judged claim by claim. */
function splitClauses(sentence: string, offset: number): { start: number; end: number; text: string }[] {
  const re = /,\s+|;\s+|\s+but\s+|\s+[—–]\s+|\s+and\s+(?=(?:is|are|has|have|will|can|gives|offers|provides|makes|works|removes)\b)/gi;
  const cuts: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) cuts.push([m.index, m.index + m[0].length]);
  const parts: { start: number; end: number; text: string }[] = [];
  let pos = 0;
  const push = (a: number, b: number) => {
    let end = b;
    while (end > a && /[\s.!?]/.test(sentence[end - 1])) end--;
    if (end > a) parts.push({ start: offset + a, end: offset + end, text: sentence.slice(a, end) });
  };
  for (const [a, b] of cuts) { push(pos, a); pos = b; }
  push(pos, sentence.length);
  return parts;
}

function keywordHit(keyword: string, set: Set<string>): number {
  const toks = tokens(keyword);
  if (!toks.length) return 0;
  return toks.every((t) => set.has(t)) ? 1 + (toks.length - 1) * 0.5 : 0;
}

export function matchFact(clause: string, facts: Fact[]): { fact: Fact; score: number } | null {
  const set = new Set(tokens(clause));
  const nums = extractNumbers(clause);
  let best: { fact: Fact; score: number } | null = null;
  for (const f of facts) {
    let hits = 0;
    for (const k of f.keywords) hits += keywordHit(k, set);
    if (hits === 0) continue;
    const ft = new Set(tokens(f.statement));
    let overlap = 0;
    for (const t of set) if (ft.has(t)) overlap++;
    let score = hits + overlap / Math.max(ft.size, 1);
    const fn = extractNumbers(f.statement);
    for (const n of nums) {
      for (const x of fn) if (x.unit === n.unit) { score += 0.8; if (x.value === n.value) score += 0.7; break; }
    }
    if (!best || score > best.score) best = { fact: f, score };
  }
  return best;
}

const VERB_START = /^(?:guarantee[sd]?|promises?|delivers?|gives?|provides?|removes?|erases?|cures?|is|are|has|have|will|makes?|works?|shows?)\b/i;

function factCitation(f: Fact): Citation {
  return { kind: "fact", id: f.id, title: `${f.id} · ${f.source}`, text: f.statement, expires: f.expires };
}

function mkFinding(p: Partial<Finding> & Pick<Finding, "type" | "start" | "end" | "quote" | "why" | "citations">): Finding {
  return { id: uid("f-"), fingerprint: fp(p.type, p.quote), severity: "high", origin: "ledger", suggestion: null,
    confidence: 0.9, verified: false, needsHuman: false, ...p } as Finding;
}

export function runClaims(text: string, kb: KB, today: string): { findings: Finding[]; verified: VerifiedClaim[] } {
  const findings: Finding[] = [];
  const verified: VerifiedClaim[] = [];
  for (const s of splitSentences(text)) {
    for (const cl of splitClauses(s.text, s.start)) {
      const trig = findTriggers(cl.text);
      if (!trig.length) continue;
      const first = trig[0];
      const spanStart = cl.start + first.idx;
      const spanText = text.slice(spanStart, cl.end);
      const hasAbs = trig.some((t) => t.kind === "absolute" && /guarantee|100|cure|miracle|instant/i.test(t.text));
      const hasRank = trig.some((t) => t.kind === "rank");
      const match = matchFact(cl.text, kb.facts);

      // No approved fact: unsupported
      if (!match) {
        const cites = [clauseCitation(kb, "G-4.1")];
        if (hasAbs) cites.push(clauseCitation(kb, "G-4.3"));
        if (hasRank) cites.push(clauseCitation(kb, "G-4.4"));
        const citations = cites.filter(Boolean) as Citation[];
        if (!citations.length) continue;
        findings.push(mkFinding({
          type: "claim_unsupported", start: cl.start, end: cl.end, quote: cl.text, citations,
          why: `No approved fact supports “${cl.text}”. ${citations[0].title}: a claim without an approved fact must not be published. Remove it, reword it, or ask the fact owner to add evidence.`,
          suggestion: null, confidence: 0.88,
        }));
        continue;
      }

      const f = match.fact;
      // Expired fact
      if (f.expires && f.expires < today) {
        const c = clauseCitation(kb, "G-4.5");
        if (!c) continue;
        findings.push(mkFinding({
          type: "claim_expired", start: cl.start, end: cl.end, quote: cl.text, citations: [factCitation(f), c],
          why: `This claim relies on ${f.id} (“${f.statement}”), which expired on ${f.expires}. ${c.title}: do not use it until ${f.owner} renews it.`,
          suggestion: null, confidence: 0.96,
        }));
        continue;
      }

      // Compare the claim with the approved fact
      const reasons: string[] = [];
      let onlyNumbers = true;
      const factToks = new Set(tokens(f.statement));
      const factLow = f.statement.toLowerCase();
      for (const t of trig) {
        if (t.kind === "absolute" && !factLow.includes(t.text.toLowerCase())) { reasons.push(`uses the absolute wording “${t.text}”`); onlyNumbers = false; }
        if (t.kind === "rank" && !factLow.includes(t.text.toLowerCase())) { reasons.push(`makes a ranking (“${t.text}”) the fact does not contain`); onlyNumbers = false; }
        if (t.kind === "authority") {
          const toks = tokens(t.text);
          if (!toks.every((x) => factToks.has(x))) { reasons.push(`adds “${t.text}”, which the fact does not say`); onlyNumbers = false; }
        }
      }
      const cn = extractNumbers(cl.text);
      const fn = extractNumbers(f.statement);
      const numFix: { raw: string; to: string }[] = [];
      for (const n of cn) {
        const fu = fn.filter((x) => x.unit === n.unit);
        if (!fu.length) continue;
        if (n.unit === "time") {
          const min = Math.min(...fu.map((x) => x.value));
          if (n.value < min) { reasons.push(`claims a faster timeframe (“${n.raw}”) than the approved ${fu[0].raw}`); onlyNumbers = false; }
        } else if (!fu.some((x) => x.value === n.value)) {
          reasons.push(`says “${n.raw}” but the approved figure is ${fu.map((x) => x.raw).join(" / ")}`);
          if (fu.length === 1) numFix.push({ raw: n.raw, to: fu[0].raw });
          else onlyNumbers = false;
        }
      }

      if (!reasons.length) { verified.push({ quote: cl.text, factId: f.id, start: cl.start, end: cl.end }); continue; }

      const cites: (Citation | null)[] = [factCitation(f)];
      cites.push(hasAbs ? clauseCitation(kb, "G-4.3") : hasRank || trig.some((t) => t.kind === "authority") ? clauseCitation(kb, "G-4.4") : clauseCitation(kb, "G-4.2"));
      let replacement: string | null = null;
      if (onlyNumbers && numFix.length && cn.length === numFix.length) {
        replacement = spanText;
        for (const nf of numFix) replacement = replacement.replace(nf.raw, nf.to);
      } else if (VERB_START.test(spanText) && f.safeVerb) replacement = f.safeVerb;
      else if (f.safeWording) replacement = /^[A-Z]/.test(spanText) ? f.safeWording[0].toUpperCase() + f.safeWording.slice(1) : f.safeWording;

      findings.push(mkFinding({
        type: "claim_overstated", start: spanStart, end: cl.end, quote: spanText,
        citations: cites.filter(Boolean) as Citation[],
        why: `“${spanText}” goes further than approved fact ${f.id}: “${f.statement}” Problems: ${reasons.join("; ")}.`,
        suggestion: replacement ? { replacement, rationale: `Reworded to match ${f.id} (${f.source}).` } : null,
        confidence: 0.9,
      }));
    }
  }
  return { findings, verified };
}

export { stem };
