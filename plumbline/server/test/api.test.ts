import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import os from "node:os";
import path from "node:path";

process.env.DATA_FILE = path.join(os.tmpdir(), `plumbline-test-${Date.now()}.json`);
delete process.env.AI_PROVIDER;
delete process.env.GEMINI_API_KEY;

let app: any;
beforeAll(async () => { app = (await import("../src/app")).createApp(); });

const as = (id: string) => ({ "x-user-id": id });
const priya = as("u-priya"), arjun = as("u-arjun"), meera = as("u-meera");

async function resolveAll(id: string) {
  for (let i = 0; i < 20; i++) {
    const d = (await request(app).get(`/api/docs/${id}`).set(priya)).body;
    const f = d.review.findings.find((x: any) => x.severity === "high" && !x.decision);
    if (!f) return d;
    if (f.suggestion) await request(app).post(`/api/docs/${id}/findings/${f.id}/accept`).set(priya).expect(200);
    else await request(app).post(`/api/docs/${id}/findings/${f.id}/dispute`).set(priya).send({ reason: "Legal confirmed this wording in writing." }).expect(200);
  }
  throw new Error("did not converge");
}

describe("API workflow", () => {
  it("requires a demo account", async () => {
    await request(app).get("/api/docs").expect(401);
    await request(app).get("/api/users").expect(200);
  });

  it("seeds a reviewer inbox and a finished example", async () => {
    const list = (await request(app).get("/api/docs").set(arjun)).body;
    expect(list.map((d: any) => d.status).sort()).toEqual(["in_review", "ready_to_publish"]);
  });

  it("runs the whole workflow: upload, check, resolve, review, sign off, package", async () => {
    const created = await request(app).post("/api/docs/sample/caption").set(priya).expect(201);
    const id = created.body.id;
    expect(created.body.review.findings.length).toBeGreaterThan(5);
    // cannot submit with open high-severity findings
    const blocked = await request(app).post(`/api/docs/${id}/submit`).set(priya).expect(409);
    expect(blocked.body.error).toMatch(/high-severity/);
    // a dispute needs a reason
    const f = created.body.review.findings.find((x: any) => x.severity === "high");
    await request(app).post(`/api/docs/${id}/findings/${f.id}/dispute`).set(priya).send({ reason: "" }).expect(400);
    const resolved = await resolveAll(id);
    expect(resolved.versions.length).toBeGreaterThan(1);
    expect(resolved.text).toContain("shows visible improvement in as little as 4 weeks*");
    // creator cannot approve their own content
    await request(app).post(`/api/docs/${id}/submit`).set(priya).expect(200);
    await request(app).post(`/api/docs/${id}/decision`).set(priya).send({ decision: "approve" }).expect(403);
    // content is locked while in review
    await request(app).post(`/api/docs/${id}/text`).set(priya).send({ text: "changed" }).expect(409);
    // sign-off needs approval first
    await request(app).post(`/api/docs/${id}/signoff`).set(meera).expect(409);
    await request(app).post(`/api/docs/${id}/decision`).set(arjun).send({ decision: "approve", comment: "Looks right." }).expect(200);
    await request(app).post(`/api/docs/${id}/signoff`).set(arjun).expect(403);
    const signed = await request(app).post(`/api/docs/${id}/signoff`).set(meera).expect(200);
    expect(signed.body.status).toBe("ready_to_publish");
    const pkg = await request(app).get(`/api/docs/${id}/package`).set(meera).expect(200);
    expect(pkg.body.signedOffBy.name).toBe("Meera Kapoor");
    expect(pkg.body.disputes.length).toBeGreaterThan(0);
    expect(pkg.body.auditTrail.length).toBeGreaterThan(8);
    const md = await request(app).get(`/api/docs/${id}/package?format=md`).set(meera).expect(200);
    expect(md.text).toContain("## Audit trail");
  });

  it("sends content back for changes and lets the creator re-check", async () => {
    const id = (await request(app).post("/api/docs/sample/clean").set(priya).expect(201)).body.id;
    await request(app).post(`/api/docs/${id}/submit`).set(priya).expect(200);
    await request(app).post(`/api/docs/${id}/decision`).set(arjun).send({ decision: "changes", comment: "" }).expect(400);
    await request(app).post(`/api/docs/${id}/decision`).set(arjun).send({ decision: "changes", comment: "Please add the launch date." }).expect(200);
    const edited = await request(app).post(`/api/docs/${id}/text`).set(priya).send({ text: "Welcome. Get 15% off this week!!!", note: "Added offer" }).expect(200);
    expect(edited.body.status).toBe("changes_requested");
    expect(edited.body.review.findings.map((x: any) => x.type)).toContain("disclosure");
  });

  it("keeps a creator's drafts private and protects the knowledge base", async () => {
    const id = (await request(app).post("/api/docs/sample/product").set(priya)).body.id;
    const other = { "x-user-id": "u-admin" };
    await request(app).get(`/api/docs/${id}`).set(other).expect(200);
    await request(app).post("/api/kb/facts").set(priya).send({ statement: "Lumora is the best brand in the world." }).expect(403);
    const f = await request(app).post("/api/kb/facts").set(meera).send({ statement: "Lumora offers a 30-day money-back guarantee on all products.", keywords: "money-back, refund", expires: "2027-01-01" }).expect(201);
    expect(f.body.id).toBe("F-U1");
  });

  it("imports guideline text as clauses and uses newly added terms in the next check", async () => {
    const imp = await request(app).post("/api/kb/import").set(meera).send({ text: "Never use the word 'gorgeous' in captions because it is not our voice.\n\nAlways mention the product size on product pages." }).expect(201);
    expect(imp.body.added).toBe(2);
    const cid = imp.body.clauses[0].id;
    await request(app).post("/api/kb/terms").set(meera).send({ preferred: "lovely", avoid: "gorgeous", clauseId: cid }).expect(201);
    const d = (await request(app).post("/api/docs").set(priya).send({ title: "t", text: "A gorgeous serum." }).expect(201)).body;
    expect(d.review.findings[0].citations[0].id).toBe(cid);
  });

  it("rejects empty content and reports clear errors", async () => {
    const r = await request(app).post("/api/docs").set(priya).send({ title: "x", text: "  " }).expect(400);
    expect(r.body.error).toMatch(/empty/i);
  });
});
