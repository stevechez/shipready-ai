# BACKLOG.md — ShipReady AI

Prioritized feature backlog beyond V1. Scoring: **Impact** (value to users/business), **Complexity**
(build effort/risk to determinism), **Risk** (what could go wrong) — each Low/Med/High. Priority tiers
group by "do next" order given the V1 foundation.

Legend: Impact ↑ good, Complexity ↑ costly, Risk ↑ dangerous.

## P1 — Immediately after V1 (Phase 2: Team & CI)

| # | Feature | Impact | Complexity | Risk | Notes |
|---|---|---|---|---|---|
| 1 | **GitHub App (read-only) + push-triggered scans** | High | High | Med | The obvious growth lever; still never executes/holds source beyond a scan. Needs OAuth + webhook signing + its own threat review. |
| 2 | **CI gate GitHub Action** | High | Low | Low | `shipready scan` in a workflow, fail on tier/score regression. Small once the CLI exists; huge for agency adoption. |
| 3 | **Signed attestation for verifiable badges** | High | Med | Med | Makes "Ready" a claim others can trust. CLI-authenticated signing key; server-verified; public badge endpoint. Closes the tamper gap honestly. |
| 4 | **Billing & plans (Stripe via Marketplace)** | High | Med | Low | Monetization; plan-gates already stubbed in V1. |
| 5 | **Webhooks (scan.completed / regressed, Slack)** | Med | Med | Low | Spec already frozen in API.md §7; unlocks team workflows. |
| 6 | **Trend/regression alerts + weekly digest** | Med | Low | Low | Retention job + email; drives repeat engagement (North Star). |
| 7 | **Project-scoped tokens + finer RBAC** | Med | Low | Low | Enterprise hygiene; small extension of the token model. |

## P2 — Phase 3: Remediation & Generators

| # | Feature | Impact | Complexity | Risk | Notes |
|---|---|---|---|---|---|
| 8 | **AI remediation → draft PRs/diffs (human-approved)** | High | High | High | Big value, but must stay off the verdict path and always human-gated; needs the GitHub App and careful diff safety. |
| 9 | **Rule packs / signed third-party plugins** | Med | High | High | Engine already isolates rules; needs signing + sandboxing + a trust model. Powerful for enterprise-specific policies. |
| 10 | **Framework breadth: SvelteKit/Nuxt/Remix, non-Supabase Postgres, Prisma** | High | High | Med | Expands TAM but each stack is a precision investment; do one at a time, gated on golden corpus. |
| 11 | **Spec / PRD generator** | Med | Med | Med | Adjacent surface; reuses AI infra; watch scope (not the auditor). |
| 12 | **Database / Migration generator** | Med | High | Med | Natural given our SQL understanding; risk of overreach. |
| 13 | **Feedback widget** | Low | Low | Low | Product signal capture. |
| 14 | **In-editor / IDE surfacing of findings** | Med | Med | Low | Meet developers where they are; CLI JSON already supports it. |

## P3 — Phase 4: Continuous & Enterprise

| # | Feature | Impact | Complexity | Risk | Notes |
|---|---|---|---|---|---|
| 15 | **Continuous monitoring + deployment-readiness gates** | High | High | Med | Recurring value; depends on GitHub App + webhooks + budgets. |
| 16 | **Sandboxed dynamic checks (opt-in)** | Med | High | High | Real migration apply, runtime RLS proof, boot-and-probe. Breaks pure determinism → must be a clearly separated, opt-in "dynamic" report section with its own confidence semantics. |
| 17 | **SSO/SCIM, org provisioning** | High (enterprise) | Med | Low | Table stakes for enterprise. |
| 18 | **Policy-as-code (custom org rules/thresholds)** | High (enterprise) | High | Med | Let orgs define their own gate + weights; builds on catalog versioning. |
| 19 | **Compliance mappings (SOC2/ISO/OWASP ASVS) + evidence export** | High (enterprise) | Med | Med | Map findings → controls; leverage immutable audit trail. |
| 20 | **Configurable retention / data residency** | Med | Med | Low | Enterprise + privacy. |
| 21 | **Industry benchmarking / percentiles** | Med | Med | High | Needs a trusted corpus; risk of misleading comparisons — only with rigor. |

## P4 — Opportunistic / research

| # | Feature | Impact | Complexity | Risk | Notes |
|---|---|---|---|---|---|
| 22 | **Public rule catalog site / SEO content** | Med | Low | Low | Each rule page is marketing + docs; compounding inbound. |
| 23 | **VS Code / JetBrains extension** | Med | Med | Low | Deeper dev loop. |
| 24 | **Localization (i18n)** | Low | Med | Low | Copy already centralized. |
| 25 | **Auto-fix for the safest rules (e.g. add RLS enable + policy skeleton)** | Med | Med | High | Subset of remediation; only for rules where a fix is mechanically safe + human-confirmed. |
| 26 | **Model/prompt eval harness as a product surface** | Low | Med | Low | Internal quality tool; possibly a differentiator to expose. |
| 27 | **Multi-repo / monorepo-aware scanning** | Med | Med | Low | Detect and report per-package within a monorepo. |

## Prioritization rationale

- **P1 is "make the moat compound":** CI + GitHub App + attestation turn a one-shot scan into a habitual,
  trustable gate — and #3 closes the one honest gap V1 admits (client-tamperable scores).
- **P2 adds value without touching determinism:** remediation and generators reuse the AI infra and stay
  human-gated; framework breadth is where TAM grows but must be paced by precision.
- **P3 is where enterprise money is,** and it's deliberately last because it's premature before
  product-market fit and because #16 (dynamic checks) must not be allowed to contaminate the
  deterministic core — it ships as a separated, opt-in surface.
- **Anything that would put AI/nondeterminism on the verdict path, or require holding customer source,
  carries elevated Risk** and is gated accordingly.
