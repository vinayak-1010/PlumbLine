import type { Clause } from "./types";

const CATS: [RegExp, Clause["category"]][] = [
  [/tone|voice|friendly|shout|caps|exclamation/i, "voice"], [/term|word|say |never use|do not use|avoid/i, "terminology"],
  [/claim|guarantee|proven|evidence|fact/i, "claims"], [/alt text|contrast|accessib|wcag/i, "accessibility"],
  [/confiden|personal|private|email|phone/i, "privacy"], [/offer|discount|legal|terms|disclaimer/i, "legal"], [/sentence|clear|plain/i, "clarity"],
];

/** Split imported guideline text into numbered clauses (one per paragraph or bullet). */
export function splitIntoClauses(text: string, existing: Clause[]): Clause[] {
  const lines = text.replace(/\r/g, "").split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[-•*])\s)/).map((p) => p.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim()).filter((p) => p.length >= 25);
  const n0 = existing.filter((c) => c.id.startsWith("G-I")).length;
  return lines.slice(0, 60).map((p, i) => {
    const cat = CATS.find(([re]) => re.test(p))?.[1] || "general";
    const title = p.split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:]$/, "");
    return { id: `G-I${n0 + i + 1}`, section: "Imported", title, text: p.replace(/\s+/g, " "), category: cat };
  });
}
