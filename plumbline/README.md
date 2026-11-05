# Plumbline

**Pre-publication brand governance that cites its sources, explains every finding and leaves the final call to people.**

Built by **Team Alt+Tab** (Vinayak Singh, Rishabh Ahuja) for CodeNexus India 2026, Round 2: The Build (problem statement by Inkloom AI).

A creator submits a draft. Plumbline checks it against the organisation's approved **guidelines, facts and terminology**, shows each issue with the exact words, the reason, the source it relies on and a minimal fix, and routes the result through a **creator → reviewer → manager** approval workflow. Nothing is changed or approved without a human decision.

## Try it

Open the app and pick a demo account. No password is needed.

1. **Priya (creator)**: choose *Instagram caption: Glow Serum launch*. Read the findings, accept fixes or dispute with a reason, then *Send to reviewer*.
2. **Arjun (reviewer)**: open the item, check the evidence, *Approve* (or *Request changes*).
3. **Meera (manager)**: *Sign off*, then download the publish-ready package (final text, approvals, disputes, AI-use disclosure, audit trail).

The demo workspace is a fictional skincare brand, **Lumora**. All guidelines, facts and sample drafts are invented.

## What works in this build (Round 2)

| Area | What it does |
| --- | --- |
| Knowledge base | Guidelines as numbered clauses (import from paste, .docx, .pdf, .txt), approved facts with owner, source and **expiry date**, terminology rules, confidential terms |
| Intake | Paste text or upload .docx / .pdf / .txt (up to 5 MB), channel and **sensitivity label** |
| Rule engine | Preferred/avoided terms, brand-name casing, ALL CAPS and stacked "!", missing offer disclosures ("T&C apply"), emails/phone numbers/unreleased names, over-long sentences, guideline-gap detection |
| **Claim Ledger** | Splits text into claims, matches each to an approved fact, and flags **unsupported**, **overstated** (absolute words, rankings, endorsements, faster or bigger numbers) and **expired** claims. Claims that match are listed as verified |
| **Citation verifier** | Every finding must cite a clause or fact that exists, quote text that is really in it, point at a span that matches the content, and propose a fix that adds no new numbers. Anything else is dropped and logged |
| Explained findings | Severity, exact span, reason, sources, confidence, minimal-edit suggestion shown as a diff |
| Human decisions | Accept fix (creates a new version and re-checks), edit text, dispute with a reason |
| Workflow | Roles (creator, reviewer, manager, admin), states (draft → in review → approved → ready to publish, with *changes requested*), locking, threaded comments, version history, append-only audit trail |
| Confidentiality | Confidential documents never reach the AI judge. Otherwise emails, phone numbers and confidential terms are redacted before any external call |
| AI judge (optional) | Gemini reviews tone and voice using **only retrieved evidence**; its output goes through the same citation verifier. Off unless `GEMINI_API_KEY` is set |
| Package | Download the signed-off package as Markdown or JSON |

## How it works

```
content ─► segment ─► Rule engine ───────────┐
                  ├─► Claim Ledger ──────────┤
                  └─► (optional) AI judge ───┴─► Citation verifier ─► explained findings ─► human decision
                       evidence-only prompt        drops anything it cannot trace
```

- `server/src/engines/rules.ts`: deterministic checks, each tied to a guideline clause.
- `server/src/engines/claims.ts`: Claim Ledger (claim detection, fact matching, number and wording comparison, expiry).
- `server/src/engines/verifier.ts`: the verification gate.
- `server/src/engines/ai.ts`: optional Gemini judge, evidence-only prompt, strict JSON, redaction first.
- `server/src/engines/redact.ts`, `retrieval.ts`: redaction and a small TF-IDF index.
- `server/src/docs.ts`: workflow rules (who can do what in which state), versions, audit.
- `server/src/app.ts`: REST API. `client/`: React + Vite + TypeScript + Tailwind.

## Run locally

Requires Node 20 or newer.

```bash
npm install
npm run build        # installs and builds the client
npm start            # http://localhost:8080
```

Development with hot reload: `npm run dev:server` in one terminal and `npm run dev:client` in another (http://localhost:5173).

Tests (engines and the full API workflow): `npm test`. Type check: `npm run typecheck`.

### Optional: switch the AI judge on

```bash
cp .env.example .env        # then set GEMINI_API_KEY
GEMINI_API_KEY=your-key npm start
```

## Deploy

The repo contains a `Dockerfile` (single container that serves the API and the built client) and a `render.yaml`. Any container host works. Set `GEMINI_API_KEY` only if you want the AI judge. The health check is `/api/health`.

Data is stored in `data/db.json` and re-seeded with the Lumora demo if the file is missing. On hosts with an ephemeral disk the demo data resets on restart; the workflow still works. Managers can also use *Reset demo data* in the app.

## Known limitations (honest list)

- Sign-in is a **demo account picker**, so judges can use the product without credentials. Real authentication (Firebase Auth with the same roles) is planned.
- Storage is a JSON file, not Firestore (see `CHANGES_FROM_PLAN.md`). Fine for one workspace and a demo, not for scale.
- Fact matching is lexical (keywords plus TF-IDF), so a fact needs good match words. Embedding-based retrieval is planned.
- Images and visual/accessibility checks, the insights dashboard and the exportable audit pack are the **three Round 3 improvements** and are not in this build.
- The Gemini path is covered by a mock provider in tests; run it with your own key to see live results.

## AI assistance and third-party material (disclosure)

- Code, tests and documentation in this repository were written with the help of an AI assistant (Claude by Anthropic) and reviewed and run by the team.
- Plumbline can call the Gemini API (Google) when a key is configured. This is shown in the app header and in each review's "AI use & verification" tab.
- Open-source libraries and licences are listed in `THIRD_PARTY.md`.
- No product code existed before the Round 2 build window opened.

## Licence

MIT. See `LICENSE`.
