# Changes from the Round 1 plan

| Round 1 plan | What we built in Round 2 | Why |
| --- | --- | --- |
| Firebase Auth with role claims | Demo account picker with the same four roles, enforced in the API | Judges must open the product without credentials. Real auth is planned |
| Cloud Firestore and Cloud Storage | A JSON file store, seeded on first start | One workspace and a demo do not need a managed database, and it removes a failure point. A database adapter is planned |
| Cloud Run | Docker container for any host, Cloud Run compatible | Keeps deployment portable |
| Embeddings in the retrieval step | TF-IDF plus keyword matching | Deterministic, free of API limits, easy to test. Embeddings stay on the roadmap |
| Gemini as the AI judge | Gemini is optional and verifier-gated. Rules and the Claim Ledger carry the core checks | The product must work reliably with no key and no quota. The AI adds tone and voice findings on top |
| AI-judged tone for everything | Tone and voice are partly deterministic (capitals, exclamation marks, hype words) | More reliable and explainable, with every finding tied to a clause |
| Text, DOCX, PDF in MVP | Delivered as planned | |
| Confidentiality guard as core in Round 2 | Delivered: sensitivity labels, redaction before AI calls, confidential documents never sent | Configurable policies and the exportable audit pack remain Round 3 |
| Image checks | Not in this build | Planned Round 3 improvement 1 |
| Governance insights | Not in this build | Planned Round 3 improvement 2 |

## Three improvements for Round 3

1. **Visual and accessibility review for images.** Upload an image or design; check palette against the brand, WCAG AA text contrast, missing alt text and logo clear-space, with findings that cite the accessibility and visual guidelines.
2. **Governance insights and guideline-gap detector.** Aggregate findings, disputes and overrides to show recurring mistakes, clauses creators keep disputing, claims that no approved fact covers, and facts about to expire, each with a drafted clarification.
3. **Confidentiality policies and the exportable audit pack.** Per-workspace redaction policies, an enforced no-external-AI mode, and a signed PDF/JSON audit pack that includes the AI-use disclosure for every review.
