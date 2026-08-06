# SPRINTS.md — ShipReady AI

> **Status note (post-lock):** This sprint sequence predates **ADR-001** (adopt-not-build). The
> engine-building sprints (roughly **S2–S8: bespoke scanner + our own rule engine**) are **superseded** and
> must be re-derived around the provider model: **canonical Finding schema → SARIF normalization pipeline
> (mapping, correlation §4.6, coverage §4.8) → policy engine (§5) → native semantic providers (RLS/SQL,
> deps) + the first wrapped external analyzer (Semgrep) → CLI orchestration + provider sandbox/lockfile.**
> The cloud, ingest/recompute→**policy evaluation**, report, dashboard, hardening, dogfood, and launch
> sprints (**S9–S18**) largely **stand** (read "scoring recompute" as "server-side **policy evaluation**").
> A full re-sprint against `PROVIDER_ARCHITECTURE.md` is a separate planning task and is **not** part of
> this documentation-correction pass.

18 sprints from empty repo to a shippable V1 (Phase 1). Ordering is dependency-driven: the deterministic
core (schema → scanner → rules → scoring → CLI) is built and proven **before** any cloud/AI/UI, because
the core is the product and everything else layers on it.

Each sprint lists **Goal · Key files · Dependencies · Acceptance criteria · Testing · Deliverables · DoD
addendum**. The global Definition of Done (CURSOR_RULES.md §10) applies to every sprint.

Suggested cadence: ~1 week each (adjust to team size). Sprints 1–8 = the engine + CLI (the moat).
Sprints 9–15 = cloud, AI, reports, UI. Sprints 16–18 = hardening, dogfood, launch.

---

## Sprint 0 — Foundations & tooling
- **Goal:** monorepo scaffold, CI, standards enforced from commit #1.
- **Files:** `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `biome.json`, `.changeset/`,
  `.github/workflows/ci.yml`, `packages/config-tsconfig`.
- **Deps:** none.
- **Acceptance:** `pnpm install && pnpm build && pnpm test && pnpm lint` green on an empty monorepo; CI
  runs lint+typecheck+test+`pnpm audit`; dependency-cruiser configured for layering.
- **Testing:** a trivial passing test per package to prove the harness.
- **Deliverables:** reproducible dev environment; CONTRIBUTING with the DoD.
- **DoD:** layering rules encoded (even if packages are stubs).

## Sprint 1 — `@shipready/schema`
- **Goal:** the single source of truth for all types.
- **Files:** `packages/schema/src/{scan,report,api,catalog}.ts`, `index.ts`.
- **Deps:** S0.
- **Acceptance:** Zod schemas + inferred types for `ScanResult`, `Finding`, `Evidence`, `RuleId`,
  `Category`, `Severity`, `Confidence`, catalog metadata, and `/v1` DTOs. No other package defines these.
- **Testing:** schema parse/round-trip tests; invalid payloads rejected with precise errors.
- **Deliverables:** published-shape `@shipready/schema`.
- **DoD:** ≥90% coverage; zero deps beyond Zod.

## Sprint 2 — File scanner: discovery, classification, framework detection
- **Goal:** turn a directory into the non-parsed skeleton of a `ProjectModel`.
- **Files:** `engine/src/scanner/{discover,classify,frameworks,model}.ts`.
- **Deps:** S1.
- **Acceptance:** gitignore-aware walk; file roles/languages assigned; Next.js/Supabase/package-manager
  detected; caps + `truncated`/`skipped` recorded; deterministic ordering.
- **Testing:** golden fixture repos (Next+Supabase, Next-only, empty) → snapshot the skeleton model.
- **Deliverables:** `buildProjectModel` (sans parsers).
- **DoD:** deterministic; large-repo guard tested.

## Sprint 3 — Parsers: TS AST, SQL, config, lockfile
- **Goal:** fully populate `ProjectModel` with parsed facts.
- **Files:** `engine/src/scanner/{ts-program,sql,config,deps}.ts`.
- **Deps:** S2.
- **Acceptance:** TS `Program` from project `tsconfig`; SQL→schema model (tables, RLS enabled, policies
  with predicates, FKs, indexes, DROPs) via `pgsql-ast-parser`; config + `.env`(names, tracked, public)
  parsed; lockfile→dep graph (pnpm/npm/yarn, dup majors, lifecycle scripts). Parse failures →
  `parseErrors`/inconclusive, never assumptions.
- **Testing:** fixtures per parser branch (RLS enabled in a later migration, unparseable SQL, dup majors,
  committed `.env`).
- **Deliverables:** complete `ProjectModel`.
- **DoD:** graceful degradation proven; no throw on malformed input.

## Sprint 4 — Rule registry + evidence + first security rules
- **Goal:** the rule execution model and the highest-value rules.
- **Files:** `engine/src/rules/registry.ts`, `evidence.ts`, `rules/rls/*`, `rules/supabase/*`,
  `rules/security/*`.
- **Deps:** S3.
- **Acceptance:** isolated per-rule execution (throw→`ruleError`); `SR-RLS-001/002/003`, `SR-SUP-001`,
  `SR-SEC-001/002` implemented with evidence + confidence + catalog metadata + remediation templates.
- **Testing:** golden known-good/known-bad per rule; secret marking verified; determinism + ordering.
- **Deliverables:** a runnable (partial) engine producing real findings.
- **DoD:** every rule has fixtures + docs + template; no fabricated findings.

## Sprint 5 — Remaining rule categories
- **Goal:** breadth across the V1 catalog.
- **Files:** `rules/{auth,authz,api,db,deps,typescript,a11y,perf,arch,config}/*`, `catalog/*`.
- **Deps:** S4.
- **Acceptance:** V1 rule set implemented (AUTH/AUTHZ/API/DB/DEP/TS(1&3)/A11Y/PERF/ARCH/CFG per
  AUDIT_ENGINE.md); each with confidence, severity, fixtures, catalog entry, remediation template.
- **Testing:** golden corpus expanded; precision sampled ≥95% on Critical/High fixtures.
- **Deliverables:** complete deterministic catalog (minus the compile check).
- **DoD:** tentative rules correctly marked + dampened.

## Sprint 6 — Local scoring + score explainability
- **Goal:** deterministic reference score + gate.
- **Files:** `engine/src/scoring/*`, `catalog` weights.
- **Deps:** S5.
- **Acceptance:** per-category subscores, weights, applicability/renormalization, confidence damping,
  diminishing returns, gate (tier) exactly per SCORING.md; breakdown data emitted for explainability.
- **Testing:** property tests (monotonicity, gate invariants); the worked example reproduces (~90 +
  Blocked).
- **Deliverables:** `runScan` returns findings + reference score + breakdown.
- **DoD:** arithmetic reproducible by hand from output.

## Sprint 7 — CLI: scan + local report + redaction
- **Goal:** `npx shipready scan` produces a real offline report.
- **Files:** `cli/src/commands/scan.ts`, `redact.ts`, `report-local.ts`, `index.ts`.
- **Deps:** S6.
- **Acceptance:** scans CWD, prints a summary, writes local HTML + JSON; secrets masked before any
  output leaves memory; `shipready.config.ts` (ignores) honored; exit code reflects tier (for CI).
- **Testing:** e2e on fixture repos; redaction test (no raw secret in output); exit-code matrix.
- **Deliverables:** working offline CLI (no account needed) — the activation moment.
- **DoD:** time-to-report < 60s on a typical repo.

## Sprint 8 — CLI: compile check + auth + `push`
- **Goal:** the consent-gated `tsc` check and authenticated upload.
- **Files:** `cli/src/{typecheck,api-client}.ts`, `commands/{login,push,whoami}.ts`.
- **Deps:** S7, and the API (can proceed in parallel with S9; upload lands when S10 exists).
- **Acceptance:** `SR-TS-002` via spawning the user's `tsc` (off with `--no-typecheck`, consent-gated);
  `shipready login` stores a token securely; `scan --upload`/`push result.json` sends to `/v1/scans`.
- **Testing:** compile-check on passing/failing fixtures; token storage; upload happy-path + retry
  (idempotency).
- **Deliverables:** full CLI feature set.
- **DoD:** no execution of the target app; only the user's compiler, by consent.

## Sprint 9 — Cloud foundation: Supabase, schema, RLS, auth
- **Goal:** the tenant-isolated data layer + human auth.
- **Files:** `apps/web/lib/db/*` (Drizzle), `apps/web/supabase/migrations/*`, `apps/web/lib/auth/*`.
- **Deps:** S1 (types); can run parallel to engine sprints.
- **Acceptance:** all tables (DATABASE.md) with RLS `enable`+`force`, `is_org_member`/`is_org_admin`
  helpers, immutability by omission; Supabase Auth (magic link + GitHub OAuth) + sessions via
  `@supabase/ssr`; `get_advisors` clean.
- **Testing:** RLS isolation tests (org A ≠ org B); auth flow; advisor gate in CI.
- **Deliverables:** deployable web shell with auth + DB.
- **DoD:** no table without RLS; no client-trusted `org_id`.

## Sprint 10 — Ingest API + server-side score recompute
- **Goal:** the trust boundary and the authoritative verdict.
- **Files:** `app/api/v1/scans/route.ts`, `lib/scoring/*` (server), `lib/api/*`, `lib/ratelimit/*`.
- **Deps:** S9, S6 (scoring logic shared/mirrored), S1.
- **Acceptance:** `POST /v1/scans` token-auth, Zod-validated, size/finding-capped, idempotent;
  **server recomputes** score/tier from findings against pinned catalog; stores immutable scan +
  normalized findings; local/server delta logged; rate-limited; uniform errors.
- **Testing:** contract tests; tamper test (fabricated localScore ignored); injected `org_id` rejected;
  unknown ruleId → unweighted; oversize → 413.
- **Deliverables:** working ingest; scans visible in DB.
- **DoD:** authoritative score is server-computed, reproducible, reconcilable across versions.

## Sprint 11 — Catalog service + seeding + versioning
- **Goal:** the server's scoring source of truth.
- **Files:** `tooling/seed-catalog.ts`, `app/api/v1/catalog/route.ts`, `lib/db` catalog tables.
- **Deps:** S5/S6 (catalog data), S9.
- **Acceptance:** `rules_catalog` + category weights seeded idempotently; `catalog_version` recorded per
  scan; `GET /v1/catalog` cacheable; unknown-rule handling verified end-to-end.
- **Testing:** seed idempotency; version pinning reproduces historical scores.
- **Deliverables:** versioned catalog powering server scoring + report labels.
- **DoD:** reweight/removal bumps major; additive bumps minor.

## Sprint 12 — Report ViewModel + HTML report (web)
- **Goal:** the centerpiece rendering.
- **Files:** `lib/report/*`, `components/*` (FindingCard, ReadinessGauge, ScoreBreakdown, …),
  `app/p/[project]/scans/[scanId]/*`.
- **Deps:** S10, S11, UI system.
- **Acceptance:** pure ReportVM transform; report screen renders exec summary + score breakdown +
  findings (grouped, filterable, tentative separated + suppressions surfaced) + appendix; evidence
  masked; renders fully **without** AI. Charts follow `dataviz`; light/dark; a11y AA.
- **Testing:** ViewModel unit tests; a11y (axe) on the report; snapshot of deterministic sections.
- **Deliverables:** live, shareable-in-app report.
- **DoD:** report is complete from deterministic data alone.

## Sprint 13 — AI enrichment layer
- **Goal:** explanation/remediation/prioritization, safely.
- **Files:** `lib/ai/*` (prompts, `generateObject` calls via Gateway, validation, grounding, queue).
- **Deps:** S12, S10.
- **Acceptance:** narrow enrichment DTO (no severity/existence/score fields); Zod + grounding validation
  or fallback to template; enrich Critical/High eagerly, others on demand; per-org budget + queue;
  model + prompt_version stored; report shows AI-labeled prose beside evidence.
- **Testing:** golden explanation set (faithfulness, no fabricated identifiers); AI-down renders full
  report; injection-hygiene test; budget/backpressure test.
- **Deliverables:** enriched reports.
- **DoD:** AI provably off the verdict path.

## Sprint 14 — PDF export + sharing
- **Goal:** professional exportable/shareable reports.
- **Files:** `lib/report/pdf.ts` (Playwright print), `app/api/v1/reports/[id]/route.ts`,
  `app/r/[slug]/*`, storage wiring.
- **Deps:** S12 (+13 optional).
- **Acceptance:** PDF = the HTML report printed (one template), stored in Supabase Storage; public share
  slug (unguessable, `expires_at`, `noindex`, revocable) with "hide code snippets" toggle; export job +
  status; footer states catalog/engine version + scoping.
- **Testing:** PDF/web parity check; share link auth/expiry; redaction in shared/exported artifacts.
- **Deliverables:** PDF + shareable link.
- **DoD:** no unredacted evidence in any exported/shared artifact.

## Sprint 15 — Dashboard: orgs, projects, history, trends, tokens, triage
- **Goal:** the surrounding app.
- **Files:** `app/(dashboard)/*`, `components/*` (TrendChart, tables), token/member management, finding
  status controls.
- **Deps:** S9–S14.
- **Acceptance:** org create/switch, member invite/roles (two-layer authz), API token CRUD (plaintext
  once), projects, scan history + trend line (≥2 scans), finding triage (status, false-positive report),
  empty/running/degraded states; audit_log written on sensitive actions.
- **Testing:** authz matrix (viewer can't mutate, member can't manage tokens); trend correctness;
  optimistic status + rollback.
- **Deliverables:** end-to-end usable product.
- **DoD:** every role-gated action enforced server-side.

## Sprint 16 — Hardening: security, rate limits, observability
- **Goal:** production-grade non-functionals.
- **Files:** `lib/ratelimit/*`, logging/telemetry, firewall/BotID config, cron (retention, trend
  rollups), error monitoring.
- **Deps:** S15.
- **Acceptance:** rate limits + quotas live with `429`+headers; secret-scrubbing logs; audit trail
  complete; retention cron; Vercel Firewall/BotID; alerting on 4xx/5xx/auth-fail/score-delta/AI cost;
  incident runbooks written.
- **Testing:** load/abuse test on ingest; log-scrub test; retention job test.
- **Deliverables:** hardened platform.
- **DoD:** SECURITY.md checklist satisfied.

## Sprint 17 — Dogfood + golden-corpus expansion + precision tuning
- **Goal:** earn trust before launch.
- **Files:** `engine/fixtures/*`, CI step "ShipReady scans ShipReady", rule tuning.
- **Deps:** S1–S16.
- **Acceptance:** run ShipReady on our own repo + a curated set of real AI-built repos; measure precision
  (target ≥95% on Critical/High), fix false positives via confidence/heuristic tuning (not suppression);
  our own repo passes; corpus regression gate enforced.
- **Testing:** precision report; corpus diff gate; no rule regresses.
- **Deliverables:** a credibility dataset + a self-clean repo.
- **DoD:** measured precision documented; no known false Critical.

## Sprint 18 — Onboarding, docs, marketing site, launch
- **Goal:** ship V1.
- **Files:** `app/(marketing)/*`, docs site (rule catalog pages, `docsUrl` targets), onboarding flow,
  OpenAPI publish.
- **Deps:** all.
- **Acceptance:** landing + "how it works" + honest-scoping/privacy messaging; first-run onboarding (the
  `npx` command front and center); every rule's `docsUrl` resolves to a real page; OpenAPI published;
  pricing/plan gating stub (billing may defer to Phase 2); status/security.txt.
- **Testing:** onboarding e2e; all `docsUrl`s 200; a11y on marketing.
- **Deliverables:** **V1 launch.**
- **DoD:** MVP_SCOPE.md "in" list complete; excluded items explicitly deferred.

---

### Dependency map (abridged)
```
S0 → S1 → {S2→S3→S4→S5→S6→S7→S8}        (engine + CLI track)
S1 → S9 → S10 → S11                       (cloud track, parallel after S1)
S6+S11 → S10 (server scoring shares catalog)
{S10,S11} → S12 → S13
S12 → S14
S9..S14 → S15 → S16 → S17 → S18
```
The engine/CLI track and the cloud track proceed in parallel after Sprint 1; they converge at Sprint 10
(ingest needs both the scoring logic and the data layer).
