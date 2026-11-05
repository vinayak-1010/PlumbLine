import type { KB } from "../types";
import { escapeRe } from "../textutil";

export interface Redaction { token: string; original: string }

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,11}\d/g;

/** Replace emails, phone numbers and workspace-confidential terms with tokens before any external AI call. */
export function redact(text: string, kb: KB): { text: string; map: Redaction[]; count: number } {
  type M = { s: number; e: number; kind: string; v: string };
  const ms: M[] = [];
  let m: RegExpExecArray | null;
  const em = new RegExp(EMAIL.source, "gi");
  while ((m = em.exec(text))) ms.push({ s: m.index, e: m.index + m[0].length, kind: "EMAIL", v: m[0] });
  const ph = new RegExp(PHONE.source, "g");
  while ((m = ph.exec(text))) {
    const q = m[0].trim();
    if (q.replace(/\D/g, "").length >= 10) ms.push({ s: m.index + m[0].indexOf(q), e: m.index + m[0].indexOf(q) + q.length, kind: "PHONE", v: q });
  }
  for (const t of kb.workspace.confidentialTerms) {
    const re = new RegExp(`(?<![\\w-])${escapeRe(t)}(?![\\w-])`, "gi");
    while ((m = re.exec(text))) ms.push({ s: m.index, e: m.index + m[0].length, kind: "CONF", v: m[0] });
  }
  ms.sort((a, b) => a.s - b.s || b.e - a.e);
  const kept: M[] = [];
  for (const x of ms) if (!kept.length || x.s >= kept[kept.length - 1].e) kept.push(x);
  let out = "";
  let pos = 0;
  const map: Redaction[] = [];
  const counters: Record<string, number> = {};
  for (const x of kept) {
    counters[x.kind] = (counters[x.kind] || 0) + 1;
    const token = `[${x.kind}_${counters[x.kind]}]`;
    out += text.slice(pos, x.s) + token;
    map.push({ token, original: x.v });
    pos = x.e;
  }
  out += text.slice(pos);
  return { text: out, map, count: kept.length };
}

export function unredact(s: string, map: Redaction[]): string {
  let out = s;
  for (const r of map) out = out.split(r.token).join(r.original);
  return out;
}
