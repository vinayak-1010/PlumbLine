export interface Sentence { start: number; end: number; text: string }

/** Split text into sentences, keeping character offsets into the original string. */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;
    const start = i;
    while (i < n) {
      const ch = text[i];
      if (ch === "\n") break;
      if (/[.!?]/.test(ch)) {
        let j = i;
        while (j < n && /[.!?]/.test(text[j])) j++;
        // sentence ends if followed by whitespace/end (so "2.5" and "T&C." inside words are kept)
        if (j >= n || /\s/.test(text[j])) { i = j; break; }
        i = j;
        continue;
      }
      i++;
    }
    let end = i;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) out.push({ start, end, text: text.slice(start, end) });
  }
  return out;
}

export const STOP = new Set(("a an the and or but if of to in on at for with by from as is are was were be been being it its this that these those " +
  "our your their we you they he she i me my us them so than then too very can will just not no do does did has have had into over under about " +
  "all any more most other some such only own same up out again further once here there when where why how both each few").split(" "));

export function stem(tok: string): string {
  let t = tok.toLowerCase();
  if (t.length > 4 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t.length > 7 ? t.slice(0, 7) : t;
}

export function tokens(s: string, keepStop = false): string[] {
  const raw = s.toLowerCase().replace(/[^a-z0-9₹%#\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  return raw.filter((t) => keepStop || !STOP.has(t)).map(stem);
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Preserve the capitalisation style of the original when substituting a replacement. */
export function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  if (original === original.toUpperCase() && /[A-Z]/.test(original) && original.length > 1) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function fp(type: string, quote: string): string {
  return `${type}|${norm(quote)}`;
}

export function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/** Remove a span and tidy the whitespace/punctuation that is left behind. */
export function removeSpan(text: string, start: number, end: number): string {
  let before = text.slice(0, start);
  let after = text.slice(end);
  if (/\s$/.test(before) && /^[\s,.;!?]/.test(after)) before = before.replace(/\s+$/, "");
  if (/[\s]$/.test(before) && /^\s/.test(after)) after = after.replace(/^\s+/, "");
  return (before + after).replace(/ {2,}/g, " ");
}
