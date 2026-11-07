# Plumbline

**Pre-publication brand governance that cites its sources, explains every finding and leaves the final call to people.**

[![Live demo](https://img.shields.io/badge/live%20demo-plumbline--iskh.onrender.com-0E7C86)](https://plumbline-iskh.onrender.com)
![Tests](https://img.shields.io/badge/tests-20%20passing-2E8B6A)
![License](https://img.shields.io/badge/license-MIT-E8A33D)

Built by **Team Alt+Tab** (Vinayak Singh, Rishabh Ahuja) for **CodeNexus India 2026, Round 2: The Build**. Problem statement by Inkloom AI.

> **Live product:** https://plumbline-iskh.onrender.com
> No sign-in needed. Pick a demo account on the first screen.
> The free host sleeps when idle, so the first load can take up to a minute.

---

## The problem

Organisations publish through employees, agencies and AI tools at the same time. The approved guidelines, facts and claims sit in static documents that nobody checks content against, so off-brand wording, outdated facts and unsupported promises go live before anyone notices.

## What Plumbline does

A creator submits a draft. Plumbline checks it against the organisation's approved **guidelines, facts and terminology** and returns findings that show:

- the **exact words** in question,
- the **reason**,
- the **source** it relies on (a guideline clause or an approved fact),
- a **minimal fix** that keeps the creator's meaning.

The creator accepts, edits or disputes each finding. A reviewer approves or requests changes, and a manager signs off. **Nothing is changed or approved without a human decision.**

The key rule: **no source, no verdict.** A finding the system cannot trace to an approved source is never shown as a violation.

![Dashboard](docs/screenshots/01-dashboard.jpg)

## Try it in two minutes

The demo workspace is a fictional skincare brand called **Lumora**. Every guideline, fact and sample draft is invented.

1. Open the [live product](https://plumbline-iskh.onrender.com) and sign in as **Priya Nair** (creator).
2. Open **Instagram caption: Glow Serum launch**. Eight findings appear.
3. Click **Accept fix** on a few. The text changes, a new version is saved and the check re-runs.
4. Click **Dispute…** on one and write a reason.
5. Click **Send to reviewer** (enabled once the high-severity findings are handled).
6. **Switch account** to **Arjun Mehta** (reviewer), open the item and **Approve**.
7. **Switch account** to **Meera Kapoor** (manager), **Sign off**, then download the package.

Other samples: a product page with unsupported claims, a confidential email (the AI judge is skipped and personal data is flagged), and an already-clean newsletter.

| Account | Role | Can |
| --- | --- | --- |
| Priya Nair | Creator | Submit drafts, accept / edit / dispute, send to reviewer |
| Arjun Mehta | Reviewer | Approve or request changes |
| Meera Kapoor | Manager | Everything a reviewer can, plus sign-off and the knowledge base |
| Sam Rao | Admin | Same as manager |

## Screenshots

| Review screen | Claim findings with sources |
| --- | --- |
| ![Review](docs/screenshots/02-review.jpg) | ![Claims](docs/screenshots/03-claims.jpg) |

| Reviewer decision | Signed off, package ready |
| --- | --- |
| ![Reviewer](docs/screenshots/04-reviewer.jpg) | ![Signed off](docs/screenshots/05-signed-off.jpg) |

![Knowledge base](docs/screenshots/06-knowledge-base.jpg)

## Features (working now)

| Area | What it does |
| --- | --- |
| Knowledge base | 18 guideline clauses, 8 approved facts (owner, source, **expiry date**), 7 term rules, confidential terms. Import guidelines from pasted text or `.docx` / `.pdf` / `.txt` |
| Intake | Paste text or upload `.docx`, `.pdf`, `.txt` (up to 5 MB), with a sensitivity label: public, internal, confidential |
| Rule engine | Preferred and avoided terms, brand-name casing, ALL CAPS and stacked "!", missing offer disclaimer ("T&C apply"), emails, phone numbers and unreleased names, long sentences, guideline-gap detection |
| **Claim Ledger** | Splits text into claims, matches each to an approved fact, and flags **unsupported**, **overstated** (absolute words, rankings, endorsements, faster or bigger numbers) and **expired** claims. Matching claims are listed as verified |
| **Citation verifier** | Every finding must cite a clause or fact that exists, quote text that is really in it, point at a span that matches the content, and propose a fix that adds no new numbers. Anything else is dropped and logged |
| Explained findings | Severity, exact span, reason, sources, confidence, suggested fix shown as a diff |
| Human decisions | Accept fix (new version, re-check), edit text, dispute with a reason |
| Workflow | Roles, five states (draft, in review, changes requested, approved, ready to publish), content locking, comments, version history, append-only audit trail |
| Confidentiality guard | Confidential content never reaches the AI judge. Otherwise emails, phones and confidential terms are redacted before any external call |
| AI judge (optional) | Gemini reviews tone using **only retrieved guideline text**, and its output goes through the same verifier. Off unless `GEMINI_API_KEY` is set (off in the live build) |
| Package export | Download the signed-off package as Markdown or JSON: final text, approvals, disputes, AI-use disclosure, audit trail |

## How it works

```
content ─► segment ─► Rule engine ───────────┐
                  ├─► Claim Ledger ──────────┤
                  └─► (optional) AI judge ───┴─► Citation verifier ─► explained findings ─► human decision
                       evidence-only prompt        drops anything it cannot trace
```

![Architecture](docs/architecture.png)

**Claim Ledger.** Each clause that makes a claim is matched to the best approved fact. If no fact matches, it is *unsupported*. If the fact has expired, it is *expired*. Otherwise the claim is compared with the fact (absolute words, rankings, endorsements, numbers and timeframes) and is either *overstated* or *verified*.

![Claim Ledger](docs/claim-ledger.png)

### Main technical decisions

- **Deterministic checks first, AI second.** Findings are repeatable and explainable, and the product works with no API key.
- **A verifier between every engine and the user.** One fabricated citation would destroy a reviewer's trust.
- **Role rules live in the workflow functions,** so the API, tests and seed data all follow the same rules.
- **One container** serves the API and the built client: one deployment, one URL.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js 22, Express, TypeScript (run with `tsx`) |
| Data | JSON file store, seeded with the demo workspace |
| Parsing | `mammoth` (.docx), `pdf-parse` (.pdf) |
| AI (optional) | Google Gemini API, evidence-only prompt, strict JSON |
| Tests | Vitest, Supertest |
| Hosting | Docker on Render |

## Run it locally

Requires **Node 20 or newer**.

```bash
npm install
npm run build      # installs and builds the client
npm start          # http://localhost:8080
```

Development with hot reload (two terminals):

```bash
npm run dev:server   # API on :8080
npm run dev:client   # app on http://localhost:5173
```

### Tests

```bash
npm test             # 20 tests: engines, verifier, AI mock, full API workflow
npm run typecheck
```

### Optional: switch the AI judge on

```bash
cp .env.example .env          # then set GEMINI_API_KEY
GEMINI_API_KEY=your-key npm start
```

Without a key, the header shows "AI judge: off" and everything else works.

## Deploy

The repo includes a `Dockerfile` (one container serving API and client) and a `render.yaml`.

On Render: **New → Web Service**, pick this repo, **Language: Docker**, **Instance type: Free**, **Health check path: `/api/health`**. If the project files sit in a sub-folder of your repo, set **Root Directory** to that folder. No environment variables are required.

Data is kept in `data/db.json` and re-seeded if the file is missing. On hosts with an ephemeral disk the demo data resets on restart; managers can also use **Reset demo data** in the app.

## API overview

| Area | Endpoints |
| --- | --- |
| Session | `GET /api/config` · `GET /api/users` · `GET /api/me` (account sent as an `x-user-id` header) |
| Content | `POST /api/docs` (text or file) · `POST /api/docs/sample/:key` · `GET /api/docs` · `GET /api/docs/:id` · `POST /api/docs/:id/text` · `POST /api/docs/:id/recheck` |
| Findings | `POST /api/docs/:id/findings/:fid/accept` · `/dispute` · `/undispute` |
| Workflow | `POST /api/docs/:id/submit` · `/decision` · `/signoff` · `/comments` · `GET /api/docs/:id/package` (`?format=md`) |
| Knowledge base | `GET /api/kb` · `POST /api/kb/clauses` · `/import` · `/facts` · `/terms` · `PUT /api/kb/facts/:id` · `PUT /api/kb/workspace` |
| Operations | `GET /api/health` · `POST /api/demo/reset` (manager only) |

## Project structure

```
server/src/
  app.ts            REST routes, role checks
  docs.ts           workflow rules: states, versions, decisions, audit, package
  review.ts         orchestrates the engines, merges and de-duplicates findings
  engines/
    rules.ts        terminology, brand name, tone, disclosures, personal data, clarity
    claims.ts       Claim Ledger
    verifier.ts     citation verifier gate
    ai.ts           optional Gemini judge (evidence-only prompt, strict JSON)
    redact.ts       redaction before any AI call
    retrieval.ts    small TF-IDF index
  seed.ts           demo workspace (Lumora), users, sample drafts
  store.ts          JSON store
server/test/        engine tests and full API workflow tests
client/src/         React app (pages, components, API layer)
```

## Changes from the Round 1 plan

| Planned | Built | Why |
| --- | --- | --- |
| Firebase Auth | Demo account picker, same four roles, enforced on the server | Judges can use it without credentials |
| Firestore + Cloud Storage | JSON file store | One workspace and a demo do not need a managed database |
| Cloud Run | Docker on Render | Portable and simple to reach |
| Embeddings | Keyword + TF-IDF matching | Deterministic and easy to test |
| AI judge as main reviewer | Rules and Claim Ledger carry the core; Gemini optional | Works with no key or quota |

Details: [`CHANGES_FROM_PLAN.md`](CHANGES_FROM_PLAN.md).

## Known limits

- Sign-in is a demo picker, so there is no per-person security yet.
- The Gemini judge is not active in the live build and is tested only with a mock provider.
- Claim matching is keyword-based: a fact needs good match words to be found.
- Storage is a single JSON file; demo data resets if the host restarts.
- Scanned PDFs without selectable text are not read (no OCR).
- No image or visual checks yet.

## Round 3 roadmap

1. **Visual and accessibility review for images:** brand palette match, WCAG AA contrast, missing alt text.
2. **Governance insights and guideline-gap detector:** recurring issues, clauses creators keep disputing, claims no approved fact covers, facts about to expire.
3. **Confidentiality policies and exportable audit pack:** workspace redaction policies, an enforced no-external-AI mode, a signed PDF / JSON audit pack with the AI-use disclosure.

## Team

| Member | Role |
| --- | --- |
| **Vinayak Singh** (team leader) | Backend, AI and data lead; deployment |
| **Rishabh Ahuja** | Frontend, workflow and UX lead |

Who did what is shown in the commit history.

## AI assistance and third-party material

- Most of the code, tests and documentation in this repository were generated with an AI assistant (**Claude, by Anthropic**) from the Round 1 plan and the team leader's instructions. The team reviewed it, ran the tests, deployed it and tested it end to end.
- Plumbline can call the **Gemini API** when a key is configured. This is shown in the app header and in each review's "AI use & verification" tab. It is off in the live build.
- Open-source libraries and their licences are in [`THIRD_PARTY.md`](THIRD_PARTY.md). No templates or boilerplate repositories were used.
- All demo data is fictional. No real personal or confidential data is used.

## Licence

MIT. See [`LICENSE`](LICENSE).
