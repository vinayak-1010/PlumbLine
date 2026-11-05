export type Role = "creator" | "reviewer" | "manager" | "admin";
export type Severity = "high" | "medium" | "low";
export type Sensitivity = "public" | "internal" | "confidential";
export type DocStatus = "draft" | "in_review" | "changes_requested" | "approved" | "ready_to_publish";

export interface User { id: string; name: string; role: Role; title: string }

export interface Clause {
  id: string;            // e.g. "G-4.1"
  section: string;       // e.g. "4. Claims"
  title: string;
  text: string;
  category: "voice" | "terminology" | "claims" | "legal" | "clarity" | "accessibility" | "privacy" | "general";
}

export interface Fact {
  id: string;            // e.g. "F-017"
  statement: string;
  keywords: string[];
  safeWording?: string;  // noun-phrase wording that is safe to publish
  safeVerb?: string;     // verb-phrase variant ("shows visible improvement ...")
  owner: string;
  source: string;
  expires: string | null; // ISO date
}

export interface Term { id: string; preferred: string; avoid: string[]; clauseId: string; note?: string }

export interface Disclosure { id: string; trigger: string; phrase: string; clauseId: string }

export interface Workspace {
  name: string;
  brand: string;
  confidentialTerms: string[];
  disclosures: Disclosure[];
  acronyms: string[];
}

export interface KB { clauses: Clause[]; facts: Fact[]; terms: Term[]; workspace: Workspace }

export type FindingType =
  | "terminology" | "claim_unsupported" | "claim_overstated" | "claim_expired"
  | "brand_name" | "tone" | "clarity" | "disclosure" | "confidential" | "ai_tone";

export interface Citation { kind: "clause" | "fact"; id: string; title: string; text: string; expires?: string | null }

export interface Finding {
  id: string;
  fingerprint: string;
  type: FindingType;
  severity: Severity;
  origin: "rule" | "ledger" | "ai";
  start: number;
  end: number;
  quote: string;
  why: string;
  citations: Citation[];
  suggestion: { replacement: string; rationale: string } | null;
  confidence: number;
  verified: boolean;
  needsHuman: boolean;
  decision?: { action: "disputed"; reason: string; by: string; at: string };
}

export interface Gap { id: string; quote: string; note: string }
export interface VerifiedClaim { quote: string; factId: string; start: number; end: number }

export interface ReviewMeta {
  engines: string[];
  aiUsed: boolean;
  aiNote: string;
  model: string | null;
  segmentsSent: number;
  redactions: number;
  dropped: { reason: string; quote: string }[];
  merged: number;
  ms: number;
  ranAt: string;
}

export interface ReviewResult {
  findings: Finding[];
  gaps: Gap[];
  verifiedClaims: VerifiedClaim[];
  meta: ReviewMeta;
}

export interface Version { n: number; text: string; by: string; at: string; note: string }
export interface Comment { id: string; by: string; role: Role; text: string; at: string; findingId?: string }
export interface AuditEntry { at: string; actor: string; role: Role | "system"; action: string; detail: string }

export interface Doc {
  id: string;
  title: string;
  channel: string;
  sensitivity: Sensitivity;
  status: DocStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versions: Version[];
  current: number;
  review: ReviewResult | null;
  decisions: Record<string, { action: "disputed"; reason: string; by: string; at: string }>;
  comments: Comment[];
  audit: AuditEntry[];
  reviewerNote?: string;
}

export interface DB { users: User[]; kb: KB; docs: Doc[] }
