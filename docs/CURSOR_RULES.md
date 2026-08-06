# CURSOR_RULES.md — ShipReady AI

Rules for any AI coding assistant (Cursor, Claude Code, Windsurf, Copilot) working in this repo. These
are **binding constraints**, not suggestions. Mirror the highest-signal ones into `.cursor/rules/*.mdc`
and `CLAUDE.md`. The irony is intentional: the tool that audits AI-generated code holds AI-generated
contributions to its own standard.

## 0. Prime directives

1. **Never break determinism.** Nothing in `packages/engine` or server scoring may use the network, the
   LLM, `Date.now()`, or `Math.random()` in a way that affects a finding or score.
2. **Never let AI decide facts.** The LLM explains; it never adds/removes/reclassifies findings or
   changes scores. If you're wiring AI into the verdict path, stop — that's a design violation.
3. **Never trust the client.** All `/api/v1` input is Zod-validated; `org_id` is derived server-side;
   the score is recomputed server-side.
4. **Never leak secrets or source.** We hold no source; redact evidence before upload; server-only
   modules marked `import 'server-only'`; no secret in client/`NEXT_PUBLIC_`.
5. **Evidence or it doesn't exist.** Every finding cites file:line + facts; no vague or invented output.

## 1. Security

- RLS on every tenant table (`enable` + `force`, default-deny, `with check` on writes). No table lands
  without its policy in the same migration.
- Two-layer authz: RLS **and** a server `authorize(action, resource)` guard. Hiding UI ≠ authorization.
- Validate all external input with Zod at the boundary. No raw `req.json()` into logic/DB.
- No string-built SQL; parameterized queries only. No `eval`, no dynamic `require`, no shelling out to
  user-controlled strings.
- Uniform error envelope; never return stack traces/DB errors to clients.
- Tokens hashed (SHA-256), shown once, revocable; never logged. Secret-scrubbing on all logs.
- Rate-limit and size-cap every public endpoint.
- If you touch auth, RLS, tokens, redaction, or scoring recompute → add tests proving isolation and
  correctness; request a security-focused review.

## 2. TypeScript

- `strict` everywhere; no `any` in `engine`/`schema`; `unknown` + Zod at boundaries.
- Discriminated unions over boolean flags; model impossible states away.
- `readonly`/`as const`; no mutation of shared structures in the engine.
- `import type` for types; explicit public signatures; no implicit `any`.

## 3. React / Next.js

- Server Components by default; `"use client"` only for real interactivity.
- Mutations via Server Actions with server-side re-validation + authz.
- No data fetching or secrets in client components. No `dangerouslySetInnerHTML` without sanitization.
- Suspense/streaming for AI + heavy report sections; provide loading/empty/error states.
- Keep client bundles lean (we detect bloat).

## 4. Supabase / Database

- Schema + RLS changes via reviewed migrations only (no dashboard edits in prod).
- Expand/contract for any destructive change (never drop-in-place). Index every FK.
- Scans/findings/audit_log are immutable — no UPDATE/DELETE policies for app roles.
- Run `get_advisors`; a security/perf advisory fails the task.
- Service-role key only in the audited ingest path; never client/CLI.

## 5. Engine & rules

- Rules are pure `(ProjectModel) => Finding[]`; no IO, no throw-for-absence (use `inconclusive`).
- Deterministic ordering; isolated execution; every finding carries evidence.
- New/changed rule ⇒ golden fixtures (known-good + known-bad) + catalog metadata + docs page +
  remediation template. Reweighting/removal ⇒ major catalog bump.
- Keep engine `dependencies` minimal and justified in the PR (we audit dep bloat).

## 6. AI layer

- AI I/O is the narrow enrichment DTO only (`explanation`, `remediation?`, `priorityRationale?`). No
  severity/existence/score fields anywhere in AI output.
- Structured output via `generateObject` + Zod; grounding check (no unknown identifiers) or fall back to
  the deterministic template.
- Never send source to the model — only redacted evidence facts. Report must render fully with AI down.
- Route via AI Gateway (`provider/model`); model + prompt_version recorded.

## 7. Testing

- TDD for rules and scoring. Golden corpus must not regress. Property tests for scoring invariants.
- RLS isolation tests, token auth tests, redaction tests, AI-can't-inject-a-finding tests.
- `schema`/`engine` ≥ 90% coverage; server logic ≥ 85%. Deterministic tests only.

## 8. Architecture & refactoring

- Respect layering: `schema ← engine ← cli`, `schema ← web`; **web never imports engine runtime**
  (dependency-cruiser enforces). No cross-package deep paths; no circular imports.
- Prefer deleting to duplicating; extract shared logic into `schema`/a lib, not copy-paste (we flag
  duplication).
- Small, focused PRs; Conventional Commits; Changesets for package bumps.
- When you find a better architecture, propose it in the PR description with justification — don't smuggle
  large redesigns into unrelated changes.

## 9. Things that automatically fail review

- AI on the verdict path; a finding without evidence; a score not recomputed server-side.
- A tenant table without RLS; client-provided `org_id` trusted; service-role key reachable client-side.
- `any` in engine/schema; unvalidated external input; string-built SQL.
- A new/changed rule without golden fixtures; a destructive migration without expand/contract.
- Secrets in logs/evidence; source code sent anywhere it shouldn't be.
- `web` importing `engine` runtime.

## 10. Definition of Done

A change is Done only when **all** hold:

- [ ] Meets the requirement; scope matches the ticket (no smuggled redesigns).
- [ ] `strict` types; no `any` (engine/schema); boundaries Zod-validated.
- [ ] Tests added/updated; golden corpus green; coverage thresholds met; tests deterministic.
- [ ] Security: RLS + server authz where relevant; input validated; no secret/source leakage; advisors
      clean.
- [ ] Determinism preserved (engine/scoring pure); AI stays off the verdict path.
- [ ] Layering/import rules respected (dependency-cruiser green).
- [ ] Lint (Biome) + typecheck + `pnpm audit` pass in CI.
- [ ] A11y checks pass on any touched screen (contrast, keyboard, non-color-only severity).
- [ ] Docs/catalog/OpenAPI updated if the change affects them.
- [ ] **ShipReady scan of this repo does not regress** (we run our own product in CI).
- [ ] Reviewed by a second party; security-sensitive areas get a security-focused review.
