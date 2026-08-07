# Design: Policy Engine (Sprint 2, gate only)

**Status:** Approved
**Date:** 2026-08-07
**Sprint:** 2
**Related:** ADR-003 (policy-as-code), `docs/PROVIDER_ARCHITECTURE.md` §5, `docs/SCORING.md` §3,
`docs/superpowers/specs/2026-08-06-canonical-schema-foundation-design.md` (Sprint 1)

## 1. Mission

Sprint 1 built the canonical contracts — `PolicyFinding`, `CoverageReport`, `Verdict`, `PolicyResult` —
but left `evaluatePolicy()` itself, and the real policy profile it consumes, unbuilt by design (`policy.ts`
line 48: *"The output of `evaluatePolicy()` (§5.2) — that function itself is a later sprint"*).

Sprint 2 builds that function. Per ADR-003, this is **the product**: "policy is the primary abstraction and
the product's verdict; the 0–100 score is one optional, override-able diagnostic output of a policy — not
the verdict." This sprint delivers the gate — controls → decision → tier — and explicitly **does not**
implement the score.

```
PolicyFinding[] + CoverageReport + Policy
       |
  evaluatePolicy()
       |
PolicyResult { verdict, controls, coverage, waived, ... }
```

## 2. Scope decision: gate only, scoring deferred

Confirmed with the user: Sprint 2 implements control matching, the gate decision, coverage-aware
`insufficient_coverage`, and waivers. `PolicyResult.score` stays `undefined` this sprint — no `SCORING.md`
math (`severityPoints`, `confidenceFactor`, `ruleWeightFactor`, diminishing returns, category
renormalization). This keeps the sprint bounded and lets the gate — the actual product per ADR-003 — land
and be tested on its own before the diagnostic layer is added on top.

## 3. New schema: the real `Policy` profile

`packages/schema/src/policy.ts` currently has `PolicyEvaluationInput.policy: { version, name }` — a Sprint 1
placeholder. This sprint replaces it with the declarative profile from `PROVIDER_ARCHITECTURE.md` §5.1:

```ts
ControlMatch          { category?: Category; status?: FindingStatus; minSeverity?: Severity; rule?: CatalogRuleId }
Control                { id: string; description: string; match: ControlMatch; forbid: 'any';
                          onlyDeterministic?: boolean; requireCorroboration?: number }
RequiredCoverageEntry  { language: string; categories: Category[]; minAnalysisKind?: AnalysisKind }
Gate                    { failIf: { controlFailed: string[]; coverageInsufficient?: boolean };
                          atRiskIf?: { open?: { severity: Severity; status: FindingStatus } } }
SeverityOverride        { rule: CatalogRuleId; severity: Severity }
Policy                  { apiVersion: string; version: string; name: string;
                          requiredCoverage?: RequiredCoverageEntry[]; controls: Control[]; gate: Gate;
                          severityOverrides?: SeverityOverride[]; waivers?: WaivedFinding[] }
```

`Policy.waivers` reuses the existing `WaivedFindingSchema` — §5.1's waiver entry shape
(`fingerprint, reason, approvedBy, expires`) is already identical to it; no duplicate type.

`PolicyEvaluationInputSchema.policy` changes from the Sprint 1 placeholder to `PolicySchema`. This is a
breaking change to a type that shipped one sprint ago and has no external consumers yet — acceptable, and
exactly why Sprint 1 flagged it as a placeholder rather than a finished contract.

### `onlyDeterministic` — deliberately not implemented this sprint

`onlyDeterministic` needs per-finding determinism, but `PolicyFinding` deliberately strips `provenance`
(§1.4 quarantine), which is where determinism lives on `FindingSource.determinism`. There is no way to
honor this filter without either re-exposing a flattened field (more provenance-adjacent surface) or
deferring it. Decision: **keep the field in the `Control` schema** (so policy YAML written today doesn't
need a breaking migration later) **but don't implement the filtering logic this sprint** — there are no
real providers yet, so there's no meaningful determinism signal to filter on regardless.

`requireCorroboration` **is** implemented this sprint — it reads `corroborationCount`, already present on
`PolicyFinding` from Sprint 1, no schema gap.

## 4. `evaluatePolicy()` — internal structure

New internal structure in `packages/core/src/policy/` — the first real occupant of the internal-file space
ADR-007's `respect-core-barrel` dependency-cruiser rule was written to protect:

```
packages/core/src/policy/
├── evaluate.ts    # orchestrates the full pass; the only piece re-exported through core's index.ts barrel
├── controls.ts    # control matching: predicate → pass/fail + matched fingerprints
├── coverage.ts     # required-vs-actual coverage comparison (§5.4)
└── waivers.ts        # waiver application: fingerprint match, not-expired
```

Only `evaluate.ts`'s exports (`evaluatePolicy`, and any types it needs to expose) are re-exported from
`packages/core/src/index.ts`. `controls.ts`/`coverage.ts`/`waivers.ts` are internal — nothing outside
`packages/core/src` may import them directly, enforced by the existing `respect-core-barrel` rule.

## 5. Algorithm

```ts
function evaluatePolicy(
  findings: PolicyFinding[],
  coverage: CoverageReport,
  policy: Policy,
  now: Date = new Date(),
): PolicyResult
```

1. **Waivers first.** Partition `findings` into `active` and `waived` by fingerprint match against
   `policy.waivers`, excluding any whose `expires < now`. Waived-and-not-expired findings never enter
   control matching; expired waivers are treated as if the waiver doesn't exist (the finding stays active
   and gates normally — a stale waiver must never silently suppress a real issue). Waived findings appear
   in `PolicyResult.waived`, never silently dropped.
2. **Controls.** For each `policy.controls[]`, match against *active* findings only via the `match`
   predicate (`category`/`status`/`minSeverity`/`rule`, all ANDed when present). If `requireCorroboration`
   is set, further filter to findings with `corroborationCount >= requireCorroboration`. A control with
   `forbid: 'any'` fails if ≥1 match survives filtering. Record `{ id, passed, matched: fingerprint[] }`
   per control.
3. **Coverage.** For each `policy.requiredCoverage[]` entry, check `coverage.cells` for a `covered: true`
   cell matching `language` + a category in `categories` (+ `analysisKind` if `minAnalysisKind` given). Any
   unmet entry sets `coverageInsufficient = true`.
4. **Decision.**
   - `coverageInsufficient && policy.gate.failIf.coverageInsufficient !== false` → `'insufficient_coverage'`
     (defaults to blocking on insufficient coverage unless a policy explicitly opts out — "lack of evidence
     can never become PASS," §4.8).
   - else if any control named in `policy.gate.failIf.controlFailed` has `passed: false` → `'fail'`.
   - else → `'pass'`.
5. **Tier.**
   - `decision === 'fail'` or `decision === 'insufficient_coverage'` → `'blocked'` (insufficient coverage is
     never rendered as "ready" or even "at risk" — it's an unknown, treated as the worst case).
   - `decision === 'pass'` and an active finding matches `policy.gate.atRiskIf.open` → `'at_risk'`.
   - else → `'ready'`.
6. **`reasons[]`.** Human-readable strings naming the specific control or coverage cell that forced the
   decision, e.g. `"control NO-DATA-EXPOSURE failed: SR-RLS-002 (fp_abc123)"` or
   `"required coverage not met: sql/data-exposure"`.
7. **Assemble `PolicyResult`:**
   - `verdict: { decision, tier, reasons, evaluatedAt: now.toISOString() }`
   - `controls`: from step 2
   - `score`: `undefined` (deferred, §2)
   - `coverage`: passed through unchanged
   - `waived`: from step 1
   - `policyVersion: policy.version`
   - `catalogVersion: findings[0]?.rule.catalogVersion ?? ''` — derived from the **original** `findings`
     parameter (not the post-waiver `active` subset — a waived finding still carries a valid catalogVersion
     from the same scan). Catalog is pinned per-scan, so every finding in one call shares it; empty string
     when `findings` is empty (nothing to derive from).

## 6. Testing

Per-module unit tests: `controls.test.ts` (match predicate combinations, `requireCorroboration` filtering,
`forbid: 'any'` pass/fail), `coverage.test.ts` (met/unmet required-coverage entries, `minAnalysisKind`),
`waivers.test.ts` (active vs. expired waiver partitioning, waived findings excluded from control matching
but present in `PolicyResult.waived`). `evaluate.test.ts` for the orchestration and decision/tier matrix.

Plus one golden scenario test reproducing `PROVIDER_ARCHITECTURE.md` §11's worked example (RLS
`USING(true)` finding + failed `tsc` compile → `NO-DATA-EXPOSURE` and `TYPES-COMPILE` controls both fail →
`decision: 'fail'`, `tier: 'blocked'`) as a regression anchor, matching this repo's existing golden-fixture
testing convention (`AUDIT_ENGINE.md`: "golden known-good/known-bad per rule").

## 7. Definition of done

- [ ] `Policy` profile schema (and supporting types) added to `packages/schema/src/policy.ts`, replacing the
      Sprint 1 placeholder; existing Sprint 1 tests updated only where the placeholder type was directly
      exercised.
- [ ] `evaluatePolicy()` implemented in `packages/core/src/policy/`, re-exported from `core`'s barrel only.
- [ ] All algorithm steps in §5 covered by tests per §6.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm run depcruise` all green — including
      the `respect-core-barrel` rule staying enforced against the new internal files.
- [ ] No circular dependencies introduced.

## 8. Explicit non-goals

No scoring math (§2). No `onlyDeterministic` filtering (§3). No `severityOverrides` application (deferred to
a later sprint). No YAML file loading/parsing — `evaluatePolicy` takes an in-memory, already-validated
`Policy` object; loading `shipready.policy.yaml` from disk is CLI orchestration, a later sprint. No catalog
service. No normalization pipeline. No CLI integration.
