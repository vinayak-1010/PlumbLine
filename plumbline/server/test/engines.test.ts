import { describe, it, expect, beforeAll } from "vitest";
import { seedKB, SAMPLES } from "../src/seed";
import { reviewSync, runReview } from "../src/review";
import { redact } from "../src/engines/redact";
import { verify } from "../src/engines/verifier";

const kb = seedKB();
const TODAY = "2026-11-04";
const types = (t: string) => reviewSync(t, kb, TODAY).findings.map((f) => f.type);

describe("rule engine and Claim Ledger", () => {
  it("flags the planted issues in the caption sample", () => {
    const r = reviewSync(SAMPLES.caption.text, kb, TODAY);
    const by = (t: string) => r.findings.filter((f) => f.type === t);
    expect(by("brand_name")).toHaveLength(1);
    expect(by("terminology")[0].quote).toBe("cheap");
    expect(by("claim_overstated").map((f) => f.citations[0].id).sort()).toEqual(["F-017", "F-021", "F-024"]);
    expect(by("claim_expired")[0].citations[0].id).toBe("F-033");
    expect(by("disclosure")).toHaveLength(1);
    expect(by("tone")).toHaveLength(1);
    expect(r.verifiedClaims.map((v) => v.factId)).toContain("F-044");
  });

  it("marks claims with no approved fact as unsupported, with no invented fix", () => {
    const f = reviewSync("Our serum is clinically proven to remove all wrinkles.", kb, TODAY).findings;
    expect(f[0].type).toBe("claim_unsupported");
    expect(f[0].suggestion).toBeNull();
    expect(f[0].citations[0].id).toBe("G-4.1");
  });

  it("catches a wrong number and proposes the approved one", () => {
    const f = reviewSync("Free shipping on orders above ₹499.", kb, TODAY).findings[0];
    expect(f.type).toBe("claim_overstated");
    expect(f.suggestion!.replacement).toBe("Free shipping on orders above ₹999");
  });

  it("passes claims that match approved facts exactly", () => {
    const r = reviewSync(SAMPLES.clean.text, kb, TODAY);
    expect(r.findings).toHaveLength(0);
    expect(r.verifiedClaims.length).toBeGreaterThanOrEqual(2);
  });

  it("treats a fact as expired only after its expiry date", () => {
    const text = "Lumora Glow Serum is vegan and cruelty-free.";
    expect(types(text)).toContain("claim_expired");
    const early = reviewSync(text, kb, "2026-10-01");
    expect(early.findings.map((f) => f.type)).not.toContain("claim_expired");
    expect(early.verifiedClaims[0].factId).toBe("F-033");
  });

  it("flags personal and unreleased data as high severity", () => {
    const f = reviewSync(SAMPLES.internal.text, kb, TODAY).findings.filter((x) => x.type === "confidential");
    expect(f.map((x) => x.quote)).toEqual(["Project Aurora", "priya.sharma@lumora-example.com", "98765 43210"]);
    expect(f.every((x) => x.severity === "high")).toBe(true);
  });

  it("every returned finding is verified and every span matches its quote", () => {
    for (const s of Object.values(SAMPLES)) {
      const r = reviewSync(s.text, kb, TODAY);
      for (const f of r.findings) {
        expect(f.verified).toBe(true);
        expect(s.text.slice(f.start, f.end)).toBe(f.quote);
        expect(f.citations.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("citation verifier", () => {
  it("drops a finding that cites a clause that does not exist", () => {
    const text = "This is amazing.";
    const bad: any = { id: "x", fingerprint: "x", type: "ai_tone", severity: "low", origin: "ai", start: 8, end: 15, quote: "amazing", why: "", citations: [{ kind: "clause", id: "G-9.9", title: "", text: "invented" }], suggestion: null, confidence: 0.9, verified: false, needsHuman: false };
    const r = verify([bad], text, kb);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/does not exist/);
  });
  it("drops a finding whose quoted source text is not in the clause", () => {
    const text = "This is amazing.";
    const bad: any = { id: "x", fingerprint: "x", type: "ai_tone", severity: "low", origin: "ai", start: 8, end: 15, quote: "amazing", why: "", citations: [{ kind: "clause", id: "G-1.1", title: "", text: "never say amazing" }], suggestion: null, confidence: 0.9, verified: false, needsHuman: false };
    expect(verify([bad], text, kb).dropped[0].reason).toMatch(/not found/);
  });
  it("drops a suggestion that introduces new numbers", () => {
    const text = "Results are fast.";
    const bad: any = { id: "x", fingerprint: "x", type: "ai_tone", severity: "low", origin: "ai", start: 0, end: 7, quote: "Results", why: "", citations: [{ kind: "clause", id: "G-1.1", title: "", text: "warm, clear and confident" }], suggestion: { replacement: "Results in 3 days", rationale: "" }, confidence: 0.9, verified: false, needsHuman: false };
    expect(verify([bad], text, kb).dropped[0].reason).toMatch(/numbers/);
  });
});

describe("AI judge (mock provider) and confidentiality guard", () => {
  beforeAll(() => { process.env.AI_PROVIDER = "mock"; });
  it("keeps a grounded AI finding and drops a fabricated citation", async () => {
    const r = await runReview("Our amazing serum is lovely.", kb, { sensitivity: "public", today: TODAY });
    const ai = r.findings.filter((f) => f.origin === "ai");
    expect(ai).toHaveLength(1);
    expect(ai[0].verified).toBe(true);
    expect(r.meta.dropped.some((d) => /G-9.9/.test(d.reason))).toBe(true);
    expect(r.meta.aiUsed).toBe(true);
  });
  it("never sends confidential documents to the AI judge", async () => {
    const r = await runReview("Project Aurora is amazing.", kb, { sensitivity: "confidential", today: TODAY });
    expect(r.meta.aiUsed).toBe(false);
    expect(r.meta.aiNote).toMatch(/confidential/);
    expect(r.findings.some((f) => f.origin === "ai")).toBe(false);
  });
  it("redacts emails, phones and confidential terms before any external call", () => {
    const r = redact(SAMPLES.internal.text, kb);
    expect(r.count).toBe(3);
    expect(r.text).not.toMatch(/@|Aurora|98765/);
    expect(r.text).toContain("[EMAIL_1]");
  });
});
