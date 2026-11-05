import type { Citation, Finding, KB } from "../types";
import { fp, norm, splitSentences, uid } from "../textutil";
import { buildIndex } from "./retrieval";
import { redact, unredact } from "./redact";

export interface AIConfig { provider: "off" | "gemini" | "mock"; model: string; key?: string }

export function aiConfig(): AIConfig {
  if (process.env.AI_PROVIDER === "mock") return { provider: "mock", model: "mock-judge" };
  const key = process.env.GEMINI_API_KEY;
  if (key) return { provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", key };
  return { provider: "off", model: "" };
}

interface RawItem { quote: string; whyFlagged: string; evidenceId: string; evidenceQuote: string; suggestedReplacement?: string; severity?: string; confidence?: number }

function buildPrompt(redactedText: string, evidence: { id: string; title: string; text: string }[], skip: string[]): string {
  return [
    "You are a careful brand-governance reviewer. Review the CONTENT for tone, voice and messaging problems ONLY.",
    "Rules you must follow:",
    "- Use ONLY the EVIDENCE below. Every issue must cite one evidence id and copy a short quote (under 25 words) that appears verbatim in that evidence.",
    "- Quote the exact words from the CONTENT that have the issue (verbatim).",
    "- If no evidence supports an issue, do not report it.",
    "- Do not report problems already listed under ALREADY FOUND.",
    "- Suggest a minimal replacement that keeps the writer's meaning. Never add facts, numbers or claims.",
    "- Tokens like [EMAIL_1] are redacted placeholders; leave them alone.",
    'Return ONLY JSON: {"items":[{"quote":"","whyFlagged":"","evidenceId":"","evidenceQuote":"","suggestedReplacement":"","severity":"low|medium|high","confidence":0.0}]}',
    "",
    "EVIDENCE:", ...evidence.map((e) => `[${e.id}] ${e.title}: ${e.text}`),
    "",
    "ALREADY FOUND:", ...(skip.length ? skip.map((s) => `- ${s}`) : ["- none"]),
    "",
    "CONTENT:", redactedText,
  ].join("\n");
}

async function callProvider(cfg: AIConfig, prompt: string, redactedText: string): Promise<string> {
  if (cfg.provider === "mock") {
    // Deterministic stand-in used by tests: one valid finding and one with a fabricated citation.
    const items: RawItem[] = [];
    const m = /\b(amazing|unbelievable)\b/i.exec(redactedText);
    if (m) {
      items.push({ quote: m[0], whyFlagged: "Hype tone that does not match the calm brand voice.", evidenceId: "G-1.1",
        evidenceQuote: "we never shout, and we let the product facts do the persuading", suggestedReplacement: "good", severity: "low", confidence: 0.82 });
      items.push({ quote: m[0], whyFlagged: "Fabricated rule.", evidenceId: "G-9.9", evidenceQuote: "invented", suggestedReplacement: "ok", confidence: 0.9 });
    }
    return JSON.stringify({ items });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.key! },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gemini API returned ${res.status}`);
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function aiJudge(text: string, kb: KB, existing: Finding[], cfg: AIConfig):
  Promise<{ findings: Finding[]; segmentsSent: number; redactions: number; note: string }> {
  const red = redact(text, kb);
  const sentences = splitSentences(red.text);
  const idx = buildIndex(kb);
  const ids = new Map<string, number>();
  for (const s of sentences) for (const r of idx.search(s.text, 4, "clause")) ids.set(r.id, Math.max(ids.get(r.id) || 0, r.score));
  for (const c of kb.clauses) if (c.category === "voice") ids.set(c.id, 1);
  const evidence = [...ids.keys()].map((id) => kb.clauses.find((c) => c.id === id)!).filter(Boolean).slice(0, 10)
    .map((c) => ({ id: c.id, title: c.title, text: c.text }));
  const skip = existing.map((f) => `${f.type}: ${f.quote}`);
  const prompt = buildPrompt(red.text, evidence, skip);
  let raw = "";
  try { raw = await callProvider(cfg, prompt, red.text); }
  catch (e: any) { return { findings: [], segmentsSent: sentences.length, redactions: red.count, note: `AI judge unavailable (${e.message}); rules and Claim Ledger results shown.` }; }
  let items: RawItem[] = [];
  try { items = JSON.parse(raw.replace(/^```json|```$/g, "").trim()).items ?? []; } catch { items = []; }
  const findings: Finding[] = [];
  for (const it of items) {
    if (!it || typeof it.quote !== "string") continue;
    const quote = unredact(it.quote, red.map);
    const start = text.indexOf(quote);
    const cit: Citation = (() => {
      const c = kb.clauses.find((x) => x.id === it.evidenceId);
      return c ? { kind: "clause", id: c.id, title: c.title, text: it.evidenceQuote || "" } : { kind: "clause", id: String(it.evidenceId), title: "unknown", text: it.evidenceQuote || "" };
    })();
    findings.push({
      id: uid("f-"), fingerprint: fp("ai_tone", quote), type: "ai_tone", severity: (["low", "medium", "high"].includes(it.severity || "") ? it.severity : "low") as any,
      origin: "ai", start: start < 0 ? -1 : start, end: start < 0 ? -1 : start + quote.length, quote, why: String(it.whyFlagged || ""),
      citations: [cit], suggestion: it.suggestedReplacement ? { replacement: unredact(String(it.suggestedReplacement), red.map), rationale: "Suggested by the AI judge; verify before accepting." } : null,
      confidence: typeof it.confidence === "number" ? it.confidence : 0.5, verified: false, needsHuman: false,
    });
  }
  return { findings, segmentsSent: sentences.length, redactions: red.count, note: `AI judge (${cfg.model}) reviewed ${sentences.length} segments; ${red.count} item(s) redacted before sending.` };
}
export { norm };
