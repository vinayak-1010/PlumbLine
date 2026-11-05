import type { Finding, KB } from "../types";
import { norm } from "../textutil";
import { extractNumbers } from "./claims";

export interface Dropped { reason: string; quote: string }

function numbersOf(s: string): Set<string> {
  return new Set(extractNumbers(s).map((n) => String(n.value)).concat((s.match(/\d+(?:\.\d+)?/g) || [])));
}

/**
 * Citation verifier gate. A finding is only shown if:
 *  1. its span is inside the content and matches the quoted text,
 *  2. every cited clause/fact exists in the workspace library,
 *  3. the quoted source snippet really occurs in that clause/fact,
 *  4. the suggested fix does not introduce numbers that neither the original text nor the cited sources contain.
 */
export function verify(findings: Finding[], text: string, kb: KB): { kept: Finding[]; dropped: Dropped[] } {
  const kept: Finding[] = [];
  const dropped: Dropped[] = [];
  for (const f of findings) {
    const fail = (reason: string) => dropped.push({ reason, quote: f.quote });
    if (!(f.start >= 0 && f.end <= text.length && f.start < f.end) || text.slice(f.start, f.end) !== f.quote) { fail("span does not match the content"); continue; }
    if (!f.citations.length) { fail("no citation"); continue; }
    let ok = true;
    const sources: string[] = [];
    for (const c of f.citations) {
      const src = c.kind === "clause" ? kb.clauses.find((x) => x.id === c.id)?.text : kb.facts.find((x) => x.id === c.id)?.statement;
      if (!src) { fail(`cited ${c.kind} ${c.id} does not exist`); ok = false; break; }
      if (!norm(src).includes(norm(c.text))) { fail(`quoted text not found in ${c.id}`); ok = false; break; }
      sources.push(src);
    }
    if (!ok) continue;
    if (f.suggestion && f.suggestion.replacement) {
      const allowed = numbersOf([f.quote, ...sources].join(" "));
      const extra = [...numbersOf(f.suggestion.replacement)].filter((n) => !allowed.has(n));
      if (extra.length) { fail(`suggestion introduces unsupported numbers (${extra.join(", ")})`); continue; }
      if (f.suggestion.replacement.length > f.quote.length * 3 + 60) { fail("suggestion rewrites too much"); continue; }
    }
    f.verified = true;
    if (f.confidence < 0.6) f.needsHuman = true;
    kept.push(f);
  }
  return { kept, dropped };
}
