export type Role = "creator" | "reviewer" | "manager" | "admin";
export type Severity = "high" | "medium" | "low";
export type Status = "draft" | "in_review" | "changes_requested" | "approved" | "ready_to_publish";
export interface User { id: string; name: string; role: Role; title: string }
export interface Citation { kind: "clause" | "fact"; id: string; title: string; text: string; expires?: string | null }
export interface Finding {
  id: string; fingerprint: string; type: string; severity: Severity; origin: "rule" | "ledger" | "ai";
  start: number; end: number; quote: string; why: string; citations: Citation[];
  suggestion: { replacement: string; rationale: string } | null; confidence: number; verified: boolean; needsHuman: boolean;
  decision?: { action: "disputed"; reason: string; by: string; at: string };
}
export interface ReviewMeta { engines: string[]; aiUsed: boolean; aiNote: string; model: string | null; segmentsSent: number; redactions: number; dropped: { reason: string; quote: string }[]; merged: number; ms: number; ranAt: string }
export interface Review { findings: Finding[]; gaps: { id: string; quote: string; note: string }[]; verifiedClaims: { quote: string; factId: string }[]; meta: ReviewMeta }
export interface DocFull {
  id: string; title: string; channel: string; sensitivity: "public" | "internal" | "confidential"; status: Status; createdBy: string; creatorName: string;
  createdAt: string; updatedAt: string; versions: { n: number; text: string; by: string; at: string; note: string }[]; current: number; text: string;
  review: Review | null; comments: { id: string; by: string; role: Role; text: string; at: string }[];
  audit: { at: string; actor: string; role: string; action: string; detail: string }[]; unresolvedHigh: string[]; reviewerNote?: string;
}
export interface DocRow { id: string; title: string; channel: string; sensitivity: string; status: Status; createdBy: string; creatorName: string; updatedAt: string; version: number; findings: number; high: number; unresolvedHigh: number; comments: number }
export interface Clause { id: string; section: string; title: string; text: string; category: string }
export interface Fact { id: string; statement: string; keywords: string[]; safeWording?: string; owner: string; source: string; expires: string | null }
export interface Term { id: string; preferred: string; avoid: string[]; clauseId: string }
export interface KB { clauses: Clause[]; facts: Fact[]; terms: Term[]; workspace: { name: string; brand: string; confidentialTerms: string[] } }
export interface Config { aiProvider: "off" | "gemini" | "mock"; model: string | null; samples: { key: string; title: string; blurb: string; channel: string; sensitivity: string }[] }
