# CODING_STANDARDS.md — ShipReady AI

Standards exist to make the codebase **predictable, safe, and testable** — the same properties we audit
for. Where we'd flag it in a customer, we don't do it ourselves.

## 1. TypeScript

- **`strict: true`** plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. No exceptions in shipped packages.
- **No `any`.** Use `unknown` at boundaries and *narrow* with Zod. `any` is allowed only in tests with a
  `// eslint-disable` + reason, never in `engine`/`schema`.
- **Validate at every trust boundary** (API input, CLI upload, env, webhook, LLM output) with Zod;
  inward code works only with parsed, typed values.
- **Prefer discriminated unions** over booleans/optional soup for state (e.g. `RuleResult`,
  finding status). Model impossible states as unrepresentable.
- **Immutability by default:** `readonly`, `as const`, no in-place mutation of shared structures
  (critical for engine determinism).
- **`Result`-style returns** for expected failures in the engine (no throwing for "not found"); throw
  only for programmer errors.
- Exports are explicit and typed; no implicit `any` on public function signatures.

## 2. React / Next.js (App Router)

- **Server Components by default.** `"use client"` only for genuine interactivity (filters, toggles,
  theme). Keep client bundles small (we detect bundle bloat).
- **No data fetching in client components** where a Server Component/Server Action fits; secrets never
  reach the client; server-only modules marked `import 'server-only'`.
- **Server Actions** for mutations, always re-validating input and re-checking authorization server-side
  (never trust the client; never rely on a hidden button for authz).
- **Route Handlers** (`/api/v1`) use shared zod-validate + error-envelope helpers; uniform errors.
- **No `dangerouslySetInnerHTML`** unless sanitized via a vetted sanitizer (report rich text only).
- **Suspense + streaming** for AI/enrichment and heavy report sections; skeletons for perceived speed.
- Colocate loading/error/empty states; no unhandled async in components.

## 3. Engine-specific rules (the determinism contract)

- **Pure functions only** in `engine`: input → output, no IO, no `Date.now()`/`Math.random()` in the
  verdict, no network. (A lint rule forbids `fetch`, `fs` outside `scanner`, `Date`/`Math.random` in
  `rules`/`scoring`.)
- **Stable ordering:** sort findings deterministically (`file`, `lineStart`, `ruleId`).
- **Isolated rules:** never share mutable state; registry try/catches each rule → `ruleError`, never a
  silent pass.
- **Every finding cites evidence**; a rule that can't must emit `inconclusive`.
- **Golden fixtures required** for every new/changed rule; snapshot tests gate merges.

## 4. Testing

- **Vitest.** Coverage targets: `schema` & `engine` **≥ 90%** (they're verdict-critical); `web` server
  logic (scoring recompute, authz, api handlers) **≥ 85%**; UI smoke + a11y on key screens.
- **TDD for rules and scoring** (see the `test-driven-development` skill): write the failing fixture +
  expected findings first, then the rule. Red → green → refactor.
- **Golden corpus:** known-good and known-bad fixture repos; a rule change that regresses precision fails
  CI. This is our primary defense against false positives.
- **Contract tests** for `/v1` generated from the OpenAPI/Zod schemas.
- **Property tests** for scoring math (monotonicity: adding a finding never *raises* a score; gate
  invariants: an open certain Critical ⇒ Blocked).
- **Security tests:** RLS policy tests (a user in org A cannot read org B), token auth, redaction never
  leaks a secret, AI output can't inject a finding.
- Tests are deterministic (no real network, no real clock; fake timers if needed).

## 5. Comments & documentation

- Comment **why**, not **what**. The code says what; comments explain non-obvious decisions, invariants,
  and trade-offs (e.g. "tentative confidence: heuristic, dampened in scoring — see SCORING.md").
- Every **rule** has a header doc: what it detects, why it matters, false-positive notes, CWE, docs URL.
- Public package APIs have TSDoc. No commented-out code in merges. TODOs carry an owner + issue link.

## 6. Naming

- Intention-revealing, no abbreviations that aren't domain-standard (`rls`, `authz` are fine).
- Booleans read as predicates (`isTracked`, `hasPolicy`). Functions are verbs (`buildProjectModel`).
- Match the surrounding file's idiom; consistency beats personal preference.

## 7. Architecture & state management

- **Respect the layering** (PROJECT_STRUCTURE.md §2). No engine import in web; no db import in UI
  components; no cross-package deep paths. Enforced by dependency-cruiser in CI.
- **Server state** via Server Components / Server Actions + Supabase; avoid a heavy client store. For
  the little client state needed (filters, theme), use React state / URL search params (shareable,
  deep-linkable) before reaching for a store.
- **URL as state** for report filters (sortable/shareable). React Query only if/where client-side
  caching genuinely helps; default to server rendering.
- **Single source of truth:** types from `schema`, score from server recompute, catalog from
  `rules_catalog`. No duplicated definitions of a concept.

## 8. Performance

- Engine: one filesystem pass, one shared TS `Program`, parse-once; target seconds on a laptop.
- Web: Server Components for data-heavy views; virtualize long finding lists; SSR charts (no layout
  shift); avoid client bundle bloat (measure; we detect it).
- DB: index every FK and every query's filter columns (DATABASE.md); cursor pagination; no unbounded
  queries (we flag `SR-PERF-001` — we obey it).
- AI: enrich lazily, cache by fingerprint, batch, budget (AI_LAYER.md §6).

## 9. Error handling & logging

- Uniform API error envelope; never leak internals to clients (`SR-API-002`).
- Structured logs with `requestId`; **secret-scrubbing** before any log write; never log source (we have
  none) or raw evidence secrets.
- Expected failures are typed values; unexpected ones are logged + alerted, never swallowed.

## 10. Git & review

- Conventional Commits; small, focused PRs; Changesets for package version bumps.
- Two-layer review; the **Definition of Done** (CURSOR_RULES.md) is the merge checklist.
- CI must pass: lint (Biome), typecheck, unit + golden corpus, contract tests, `pnpm audit`, Supabase
  `get_advisors`, and **ShipReady scanning ShipReady** (we run our own product on our own repo).
