import type { Clause, Fact, KB } from "../types";
import { tokens } from "../textutil";

interface Doc { id: string; kind: "clause" | "fact"; vec: Map<string, number>; norm: number }

/** Small TF-IDF index over a workspace's clauses and facts (a workspace library is a few hundred items at most). */
export function buildIndex(kb: KB) {
  const docs: { id: string; kind: "clause" | "fact"; toks: string[] }[] = [
    ...kb.clauses.map((c) => ({ id: c.id, kind: "clause" as const, toks: tokens(`${c.title} ${c.text}`) })),
    ...kb.facts.map((f) => ({ id: f.id, kind: "fact" as const, toks: tokens(`${f.statement} ${f.keywords.join(" ")}`) })),
  ];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length || 1;
  const idf = (t: string) => Math.log(1 + N / (df.get(t) || 0.5));
  const vecOf = (toks: string[]) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map<string, number>();
    let n = 0;
    for (const [t, c] of tf) { const w = c * idf(t); v.set(t, w); n += w * w; }
    return { v, n: Math.sqrt(n) };
  };
  const index: Doc[] = docs.map((d) => { const { v, n } = vecOf(d.toks); return { id: d.id, kind: d.kind, vec: v, norm: n }; });
  return {
    search(query: string, k = 5, kind?: "clause" | "fact"): { id: string; kind: "clause" | "fact"; score: number }[] {
      const { v, n } = vecOf(tokens(query));
      if (!n) return [];
      const res = index.filter((d) => !kind || d.kind === kind).map((d) => {
        let dot = 0;
        for (const [t, w] of v) { const x = d.vec.get(t); if (x) dot += w * x; }
        return { id: d.id, kind: d.kind, score: d.norm ? dot / (n * d.norm) : 0 };
      });
      return res.filter((r) => r.score > 0.05).sort((a, b) => b.score - a.score).slice(0, k);
    },
  };
}
export type { Clause, Fact };
