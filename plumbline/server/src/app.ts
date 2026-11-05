import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import type { Doc, User } from "./types";
import { SAMPLES } from "./seed";
import { getDb, loadDb, resetDb, save, findDoc } from "./store";
import {
  HttpError, acceptFinding, addComment, addVersion, audit, buildPackage, currentText, decide, disputeFinding, newDoc, packageMarkdown,
  reviewDoc, signOff, submit, undoDispute, unresolvedHigh,
} from "./docs";
import { aiConfig } from "./engines/ai";
import { fileToText } from "./parse";
import { splitIntoClauses } from "./kbimport";
import { uid } from "./textutil";

type Req = Request & { user?: User };
const wrap = (fn: (req: Req, res: Response) => Promise<any> | any) => (req: Req, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function summary(d: Doc) {
  const r = d.review;
  return {
    id: d.id, title: d.title, channel: d.channel, sensitivity: d.sensitivity, status: d.status, createdBy: d.createdBy, createdAt: d.createdAt,
    updatedAt: d.updatedAt, version: d.current,
    findings: r ? r.findings.length : 0, high: r ? r.findings.filter((f) => f.severity === "high").length : 0,
    unresolvedHigh: unresolvedHigh(d).length, comments: d.comments.length,
  };
}

export function createApp() {
  loadDb();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.get("/api/config", (_req, res) => {
    const c = aiConfig();
    res.json({ aiProvider: c.provider, model: c.model || null, samples: Object.entries(SAMPLES).map(([key, s]) => ({ key, title: s.title, blurb: s.blurb, channel: s.channel, sensitivity: s.sensitivity })) });
  });
  app.get("/api/users", (_req, res) => res.json(getDb().users));

  // Demo authentication: pick an account. (Planned: Firebase Auth with the same role model.)
  app.use("/api", (req: Req, res, next) => {
    if (req.path === "/health" || req.path === "/config" || req.path === "/users") return next();
    const u = getDb().users.find((x) => x.id === req.header("x-user-id"));
    if (!u) return res.status(401).json({ error: "Choose a demo account to continue." });
    req.user = u;
    next();
  });
  const lead = (u: User) => u.role === "manager" || u.role === "admin";
  const canSee = (u: User, d: Doc) => u.role !== "creator" || d.createdBy === u.id;
  const getDoc = (req: Req): Doc => {
    const d = findDoc(String(req.params.id));
    if (!d || !canSee(req.user!, d)) throw new HttpError(404, "Content not found.");
    return d;
  };
  const full = (d: Doc, u: User) => ({ ...d, text: currentText(d), unresolvedHigh: unresolvedHigh(d).map((f) => f.id), creatorName: getDb().users.find((x) => x.id === d.createdBy)?.name });

  app.get("/api/me", (req: Req, res) => res.json(req.user));

  // ---- Documents
  app.get("/api/docs", (req: Req, res) => {
    const list = getDb().docs.filter((d) => canSee(req.user!, d)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json(list.map((d) => ({ ...summary(d), creatorName: getDb().users.find((x) => x.id === d.createdBy)?.name })));
  });

  app.post("/api/docs", upload.single("file"), wrap(async (req, res) => {
    const u = req.user!;
    if (u.role === "reviewer") throw new HttpError(403, "Reviewers review content; sign in as a creator or manager to submit a draft.");
    let text = String(req.body.text || "");
    if (req.file) text = await fileToText(req.file);
    const doc = newDoc(u, { title: req.body.title || req.file?.originalname || "Untitled content", channel: req.body.channel, sensitivity: req.body.sensitivity, text });
    await reviewDoc(doc, getDb().kb, u);
    getDb().docs.push(doc); save();
    res.status(201).json(full(doc, u));
  }));

  app.post("/api/docs/sample/:key", wrap(async (req, res) => {
    const u = req.user!;
    const s = SAMPLES[String(req.params.key)];
    if (!s) throw new HttpError(404, "Unknown sample.");
    if (u.role === "reviewer") throw new HttpError(403, "Sign in as a creator or manager to create a draft.");
    const doc = newDoc(u, { title: s.title, channel: s.channel, sensitivity: s.sensitivity, text: s.text });
    await reviewDoc(doc, getDb().kb, u);
    getDb().docs.push(doc); save();
    res.status(201).json(full(doc, u));
  }));

  app.get("/api/docs/:id", (req: Req, res) => res.json(full(getDoc(req), req.user!)));

  app.post("/api/docs/:id/text", wrap(async (req, res) => {
    const d = getDoc(req);
    const changed = addVersion(d, req.user!, String(req.body.text || ""), String(req.body.note || "Edited by hand"));
    if (changed) await reviewDoc(d, getDb().kb, req.user!);
    save(); res.json(full(d, req.user!));
  }));

  app.post("/api/docs/:id/recheck", wrap(async (req, res) => {
    const d = getDoc(req);
    await reviewDoc(d, getDb().kb, req.user!);
    save(); res.json(full(d, req.user!));
  }));

  app.post("/api/docs/:id/findings/:fid/accept", wrap(async (req, res) => {
    const d = getDoc(req);
    acceptFinding(d, req.user!, String(req.params.fid));
    await reviewDoc(d, getDb().kb, req.user!);
    save(); res.json(full(d, req.user!));
  }));

  app.post("/api/docs/:id/findings/:fid/dispute", wrap((req, res) => {
    const d = getDoc(req);
    disputeFinding(d, req.user!, String(req.params.fid), String(req.body.reason || ""));
    save(); res.json(full(d, req.user!));
  }));

  app.post("/api/docs/:id/findings/:fid/undispute", wrap((req, res) => {
    const d = getDoc(req);
    undoDispute(d, req.user!, String(req.params.fid));
    save(); res.json(full(d, req.user!));
  }));

  app.post("/api/docs/:id/submit", wrap((req, res) => { const d = getDoc(req); submit(d, req.user!); save(); res.json(full(d, req.user!)); }));
  app.post("/api/docs/:id/decision", wrap((req, res) => {
    const d = getDoc(req);
    decide(d, req.user!, req.body.decision === "approve" ? "approve" : "changes", String(req.body.comment || ""));
    save(); res.json(full(d, req.user!));
  }));
  app.post("/api/docs/:id/signoff", wrap((req, res) => { const d = getDoc(req); signOff(d, req.user!); save(); res.json(full(d, req.user!)); }));
  app.post("/api/docs/:id/comments", wrap((req, res) => {
    const d = getDoc(req); addComment(d, req.user!, String(req.body.text || ""), req.body.findingId); save(); res.json(full(d, req.user!));
  }));
  app.get("/api/docs/:id/package", wrap((req, res) => {
    const d = getDoc(req);
    if (d.status !== "ready_to_publish") throw new HttpError(409, "The package is available once a manager has signed off.");
    if (req.query.format === "md") { res.type("text/markdown").send(packageMarkdown(d)); return; }
    res.json(buildPackage(d));
  }));

  // ---- Knowledge base
  app.get("/api/kb", (_req, res) => res.json(getDb().kb));
  const needLead = (req: Req) => { if (!lead(req.user!)) throw new HttpError(403, "Only a manager can change the knowledge base."); };

  app.post("/api/kb/clauses", wrap((req, res) => {
    needLead(req);
    const { section, title, text, category } = req.body;
    if (!text || String(text).trim().length < 10) throw new HttpError(400, "Guideline text is too short.");
    const kb = getDb().kb;
    const c = { id: `G-U${kb.clauses.filter((x) => x.id.startsWith("G-U")).length + 1}`, section: section || "Custom", title: title || String(text).slice(0, 40), text: String(text).trim(), category: category || "general" };
    kb.clauses.push(c); save(); res.status(201).json(c);
  }));
  app.delete("/api/kb/clauses/:id", wrap((req, res) => { needLead(req); const kb = getDb().kb; kb.clauses = kb.clauses.filter((c) => c.id !== String(req.params.id)); save(); res.json({ ok: true }); }));
  app.post("/api/kb/import", upload.single("file"), wrap(async (req, res) => {
    needLead(req);
    const text = req.file ? await fileToText(req.file) : String(req.body.text || "");
    const kb = getDb().kb;
    const added = splitIntoClauses(text, kb.clauses);
    if (!added.length) throw new HttpError(422, "No guideline paragraphs found. Use paragraphs or numbered points of at least a sentence.");
    kb.clauses.push(...added); save(); res.status(201).json({ added: added.length, clauses: added });
  }));
  app.post("/api/kb/facts", wrap((req, res) => {
    needLead(req);
    const { statement, keywords, owner, source, expires, safeWording } = req.body;
    if (!statement || String(statement).trim().length < 10) throw new HttpError(400, "Write the fact as a full sentence.");
    const kb = getDb().kb;
    const kw = (Array.isArray(keywords) ? keywords : String(keywords || "").split(",")).map((k: string) => k.trim()).filter(Boolean);
    const f = { id: `F-U${kb.facts.filter((x) => x.id.startsWith("F-U")).length + 1}`, statement: String(statement).trim(), keywords: kw.length ? kw : [String(statement).split(" ").slice(0, 3).join(" ")],
      safeWording: safeWording || undefined, owner: owner || req.user!.name, source: source || "Added in app", expires: expires || null };
    kb.facts.push(f); save(); res.status(201).json(f);
  }));
  app.put("/api/kb/facts/:id", wrap((req, res) => {
    needLead(req);
    const f = getDb().kb.facts.find((x) => x.id === String(req.params.id));
    if (!f) throw new HttpError(404, "Fact not found.");
    if (req.body.expires !== undefined) f.expires = req.body.expires || null;
    if (req.body.statement) f.statement = String(req.body.statement);
    if (req.body.owner) f.owner = String(req.body.owner);
    save(); res.json(f);
  }));
  app.delete("/api/kb/facts/:id", wrap((req, res) => { needLead(req); const kb = getDb().kb; kb.facts = kb.facts.filter((f) => f.id !== String(req.params.id)); save(); res.json({ ok: true }); }));
  app.post("/api/kb/terms", wrap((req, res) => {
    needLead(req);
    const { preferred, avoid, clauseId } = req.body;
    const av = (Array.isArray(avoid) ? avoid : String(avoid || "").split(",")).map((a: string) => a.trim()).filter(Boolean);
    const kb = getDb().kb;
    if (!preferred || !av.length) throw new HttpError(400, "Give the preferred term and at least one term to avoid.");
    const clause = kb.clauses.find((c) => c.id === clauseId);
    if (!clause) throw new HttpError(400, "Link the term to an existing guideline clause (it is the citation shown to creators).");
    const t = { id: uid("T-"), preferred: String(preferred).trim(), avoid: av, clauseId };
    kb.terms.push(t); save(); res.status(201).json(t);
  }));
  app.delete("/api/kb/terms/:id", wrap((req, res) => { needLead(req); const kb = getDb().kb; kb.terms = kb.terms.filter((t) => t.id !== String(req.params.id)); save(); res.json({ ok: true }); }));
  app.put("/api/kb/workspace", wrap((req, res) => {
    needLead(req);
    const ws = getDb().kb.workspace;
    if (Array.isArray(req.body.confidentialTerms)) ws.confidentialTerms = req.body.confidentialTerms.map((x: string) => String(x).trim()).filter(Boolean);
    save(); res.json(ws);
  }));

  app.post("/api/demo/reset", wrap((req, res) => { needLead(req); resetDb(); res.json({ ok: true }); }));

  // ---- Static client
  const dist = path.resolve(process.env.CLIENT_DIST || "client/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is larger than 5 MB." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });
  return app;
}
