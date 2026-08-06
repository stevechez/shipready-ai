# MVP_SCOPE.md — ShipReady AI

V1 = **Phase 1: the Repository Auditor**. The bar for "in scope" is: *does it serve the core loop —
scan → evidence-backed findings → deterministic verdict → clear report — for the primary persona
(freelance AI developer on a Next.js/Supabase app)?* Everything else waits.

## 1. In scope (V1 ships this)

### The deterministic core (the moat)
- `@shipready/schema`, `@shipready/engine`, `@shipready/cli` as published packages.
- File scanner: gitignore-aware discovery, classification, framework detection (Next.js, Supabase,
  package manager), TS AST, SQL/migration parsing, config + `.env` parsing, lockfile dependency graph.
- Rule catalog across all categories at the depth in AUDIT_ENGINE.md (RLS, Supabase, secrets, auth,
  authz, API validation, DB, dependencies, TypeScript, a11y baseline, perf baseline, architecture,
  config). Every rule: evidence + severity + confidence + catalog metadata + remediation template +
  golden fixtures + docs page.
- The one consent-gated execution: running the **user's own `tsc`** for the compile check (CLI only).
- Deterministic local scoring + gate; server-side authoritative recompute; full explainability.

### CLI
- `npx shipready scan` → offline HTML + JSON report, no account required (the activation moment).
- Client-side redaction of secrets before anything leaves memory.
- `shipready login`, `scan --upload` / `push` to the cloud; CI-friendly exit codes.

### Cloud (Next.js on Vercel + Supabase)
- Human auth (magic link + GitHub OAuth), organizations, roles (owner/admin/member/viewer), memberships.
- API tokens (hashed, shown once, revocable).
- `/api/v1`: ingest (`POST /v1/scans` with server recompute), fetch scan, project history, catalog.
- Multi-tenant data with RLS `enable`+`force`, immutable scans/findings, audit log.
- Report view (exec summary + score breakdown + findings + appendix), trend line (≥2 scans), finding
  triage (status + false-positive reporting).
- AI enrichment (explanation/remediation/prioritization/exec-summary prose) — validated, grounded,
  strictly off the verdict path, degrades gracefully.
- PDF export + unguessable expiring public share links (with "hide code snippets" option).

### Non-functional
- Rate limits + per-org quotas, size caps, uniform error envelope.
- Secret-scrubbing logs, structured telemetry, alerting, retention cron, incident runbooks.
- Vercel Firewall/BotID at the edge.
- Dark mode, WCAG 2.2 AA on core screens.
- CI: lint, typecheck, tests, golden corpus, `pnpm audit`, Supabase advisors, **ShipReady scanning
  ShipReady**.
- Public docs site with a page per rule (`docsUrl` targets), OpenAPI for `/v1`.

## 2. Explicitly excluded from V1 (deliberate, deferred)

| Excluded | Why deferred | Phase |
|---|---|---|
| **GitHub App / server-side repo connect** | V1 is CLI-first; the App is additive and needs its own security review | 2 |
| **Signed attestation for verifiable/public "Ready" badges** | Scores are self-serving in V1 (self-defeating to fake for your own dashboard); external verifiability needs a signing design | 2 |
| **Sandboxed dynamic checks** (run migrations against ephemeral PG, boot app, runtime RLS proof) | Breaks pure determinism; needs sandbox infra; V1 asserts *presence/shape*, not runtime behavior | 4 |
| **Billing / paid plans** | Prove value first; plan-gating stubbed, Stripe integration later | 2 |
| **AI remediation that writes PRs/diffs** | Higher risk; must stay human-approved; core value doesn't depend on it | 3 |
| **Spec / PRD / Database / Migration generators** | Adjacent product surface, not the auditor's core loop | 3 |
| **Continuous monitoring / deployment-readiness gates / webhooks** | Depend on the GitHub App + team features | 2–4 |
| **Feedback widget** | Nice-to-have, not core | 3 |
| **SSO/SCIM, policy-as-code, compliance mappings (SOC2/ISO), custom retention** | Enterprise; premature before product-market fit | 4 |
| **Rule packs / third-party plugins** | Trust + sandboxing implications; engine is designed to allow it later | 3 |
| **Multi-framework breadth** (beyond Next.js/Supabase — e.g. SvelteKit, Nuxt, RN, non-Supabase DBs) | Rule precision is the product; nail one dominant stack first | 3+ |
| **i18n / localization** | English-only V1; copy centralized to allow it later | later |
| **Mobile app / IDE extension** | CLI + web cover the need in V1 | later |

## 3. Scope guardrails (how we resist creep)

- **Determinism is non-negotiable.** Any feature that would put AI or nondeterminism on the verdict path
  is out, regardless of demand.
- **Precision beats breadth.** We would rather ship fewer rules at ≥95% precision than many noisy ones.
  New rules must clear the golden-corpus bar.
- **No source custody in V1.** Any feature requiring us to hold customer source (hosted sandbox) is
  Phase 2+ by definition.
- **The core loop must work with the AI layer fully down.** If a proposed feature breaks that property,
  it's redesigned or deferred.

## 4. V1 "done" definition

V1 is done when a freelance developer can, on a real Next.js/Supabase repo:
1. run `npx shipready scan` and get an accurate, evidence-backed report in under a minute offline;
2. create an account and upload to get AI explanations, remediation, history, and a shareable
   professional PDF;
3. trust the verdict — because every finding cites evidence, the score shows its arithmetic, and our own
   repo passes our own audit.
