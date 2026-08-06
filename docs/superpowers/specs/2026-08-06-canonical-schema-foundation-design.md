# Design: Canonical Schema Foundation (`packages/schema`)

**Status:** Approved
**Date:** 2026-08-06
**Sprint:** 1
**Related:** ADR-001 (adopt-not-build), ADR-002 (trust & attestation), ADR-003 (policy-as-code),
ADR-006 (repository foundation), `docs/PROVIDER_ARCHITECTURE.md`, `docs/SCORING.md`, `docs/AUDIT_ENGINE.md`

## 1. Mission

Sprint 0 built the repository. Sprint 1 builds the language of the system: the immutable contracts
that let analyzer providers, policy evaluation, reporting, and (later) attestation operate without
knowing or trusting each other.

```
Provider Signal
       |
Canonical Finding Model
       |
Policy Evaluation Input
       |
Deterministic Verdict Foundation
```

This sprint produces **types and Zod schemas only.** No policy engine, no normalization pipeline, no
provider adapters, no scoring math, no AI, no UI, no persistence. Those are later sprints.

## 2. Context: reconciling two specs

Sprint 1 was handed off with a simplified contract sketch (single `VerdictStatus` enum, flat
`CoverageReport`, a `ProviderFinding` type, `confirmed|probable|tentative` confidence). The repository
already contains a materially more detailed, ADR-linked design — `docs/PROVIDER_ARCHITECTURE.md` — which
Sprint 0's shipped code already depends on (`Confidence = certain | firm | tentative`, referenced by
docstring comments and passing tests).

**Decision: build to `PROVIDER_ARCHITECTURE.md` / `SCORING.md` / `AUDIT_ENGINE.md` fidelity**, using the
handoff's file layout as the organizing scheme. Rationale:

- Sprint 0's `Confidence` enum is already shipped and tested; changing it now is free, changing it after
  Sprint 4+ consumes it is a breaking schema migration (§8 of `PROVIDER_ARCHITECTURE.md`).
- `SCORING.md` §3 defines a three-value gate tier (`Blocked / At Risk / Ready`) that the handoff's
  two-value-plus-coverage `VerdictStatus` silently drops. `at_risk` is a real, load-bearing state, not an
  omission.
- `PROVIDER_ARCHITECTURE.md` §4.8 defines coverage as a `(language × category × analysisKind)` matrix,
  which is what makes `insufficient_coverage` meaningful; a flat `{languages, categories, analysisKinds}`
  list can't express "TS was analyzed for a11y but not for authz."
- Every one of these types is already fully specified in committed documentation. Implementing this sprint
  is a transcription-plus-Zod-validation exercise, not new design work, so there is no added risk from
  going with the richer model.

## 3. Package layout

```
packages/schema/src/
├── index.ts        # barrel: re-exports only, no logic
├── finding.ts       # Severity, Confidence, Category, RuleId, CanonicalFinding + supporting types
├── provider.ts      # provider-facing data contracts (metadata/capabilities/raw output — not behavior)
├── policy.ts         # PolicyFinding, PolicyEvaluationInput, PolicyResult
├── verdict.ts         # VerdictDecision, VerdictTier, Verdict
├── coverage.ts       # CoverageCell, CoverageReport (the language×category×analysisKind matrix)
└── report.ts           # ReportFinding
```

Each file gets a matching `<name>.test.ts`. `FINDING_SCHEMA_VERSION`, `SEVERITIES`, `CONFIDENCES` move
from today's `index.ts` stub into `finding.ts`, same values, same behavior — `index.ts` becomes a pure
barrel (`export * from "./finding"` etc.), no logic of its own.

## 4. Core vocabulary — `finding.ts`

- **`Severity`**: `critical | high | medium | low | info`, highest-impact first. Unchanged from Sprint 0.
- **`Confidence`**: `certain | firm | tentative`. Unchanged from Sprint 0.
- **`Category`**: the closed, 11-value set from `AUDIT_ENGINE.md` §3 (which `SCORING.md`'s weight table is
  built on): `security | authentication | authorization | database | api | dependencies | typescript |
  accessibility | performance | architecture | configuration`. (`PROVIDER_ARCHITECTURE.md`'s inline
  `data-exposure | authz | secrets | injection | ...` sketch is explicitly illustrative/open-ended in that
  document and is superseded here by the closed, cross-referenced list.)
- **`RuleId`**: pattern `SR-<PREFIX>-<NNN>`, e.g. `SR-RLS-001`. **`SyntheticRuleId`**: pattern
  `SR-EXT-<provider>.<native>` for unmapped passthrough rules (§1.2). A `CatalogRuleId` union type covers
  both.

## 5. `CanonicalFinding` — `finding.ts`

Full fidelity to `PROVIDER_ARCHITECTURE.md` §1.1:

```ts
CanonicalFinding {
  schemaVersion: string;
  id: string;
  fingerprint: string;

  rule: CanonicalRuleRef;        // { id, mapped, catalogVersion, cwe?, owaspAsvs?, docsUrl? }
  category: Category;
  severity: Severity;
  confidence: Confidence;

  message: string;
  locations: CanonicalLocation[];   // primary first
  dataFlow?: CanonicalFlow;          // { source, sink, steps, kind }
  evidence: Evidence;                 // { snippet?, matched?, facts: Record<string, string|number|boolean> }

  status: FindingStatus;               // open | acknowledged | fixed | wontfix | false_positive
  suppression?: Suppression;

  corroboration: Corroboration;         // { count, independentProviders }
  provenance: Provenance;                // QUARANTINED — never read by policy/report (§1.4)
}
```

`CanonicalLocation` is repo-relative POSIX path + 1-based line/col range + optional enclosing symbol.
`Provenance = { sources: FindingSource[] }`; `FindingSource = { provider, providerVersion,
providerApiVersion, nativeRuleId, nativeSeverity?, determinism, raw? }`.

## 6. Provider contracts — `provider.ts`

**Scope: data only.** This file implements the data half of `PROVIDER_ARCHITECTURE.md` §2 —
`ProviderMetadata` (`id, version, providerApiVersion, trustTier, signature?`), `TrustTier` (`core |
first-party | verified | community`), `Capabilities` (`languages, categories, analysisKinds, requires,
produces, determinism, incremental, outputFormat`), `IncrementalCapability`/`InvalidationTrigger`,
`RawResult` (`{ format: 'sarif-2.1.0' | 'native', payload: unknown }`).

The `Provider` *interface* itself (`detect()/plan()/run()/teardown()`) is behavior, not a Zod-validatable
data shape, and belongs to the future `@shipready/provider-sdk` package (§10) — out of scope here.

There is no separate `ProviderFinding` type. Providers emit opaque `RawResult.payload: unknown`; only a
future normalizer/adapter produces canonical shape. The provider-isolation test (§9) asserts this
structurally: `RawResult` cannot satisfy `CanonicalFinding` without a mapping function.

## 7. `coverage.ts`

```ts
CoverageCell {
  language: string;
  category: Category;
  analysisKind: AnalysisKind;    // 'ast' | 'taint' | 'sca' | 'secrets' | 'type-check' | 'iac' | 'lexical'
  covered: boolean;
  byProviders: string[];
  executedRuleCount: number;
  degraded?: boolean;
}

CoverageReport {
  cells: CoverageCell[];
}
```

This is the `(language × category × analysisKind)` matrix from §4.8 — not a flat list of what was
attempted. It's what makes `insufficient_coverage` a real, checkable state rather than a label.

## 8. `verdict.ts` + `policy.ts`

`verdict.ts` owns the two-axis verdict model from §5.2 and `SCORING.md` §3:

```ts
VerdictDecision = 'pass' | 'fail' | 'insufficient_coverage';
VerdictTier = 'ready' | 'at_risk' | 'blocked';

Verdict {
  decision: VerdictDecision;
  tier: VerdictTier;
  reasons: string[];
  evaluatedAt: string;   // ISO 8601
}
```

`policy.ts`:

```ts
PolicyFinding = Omit<CanonicalFinding, 'provenance' | 'corroboration'> & { corroborationCount: number };

PolicyEvaluationInput {
  findings: PolicyFinding[];
  coverage: CoverageReport;
  policy: { version: string; name: string };
}

PolicyResult {
  verdict: Verdict;
  controls: { id: string; passed: boolean; matched: string[] }[];   // matched fingerprints
  score?: { value: number; breakdown: Record<Category, number> };    // diagnostic only, never the verdict
  coverage: CoverageReport;
  waived: { fingerprint: string; reason: string; approvedBy: string; expires: string }[];
  policyVersion: string;
  catalogVersion: string;
}
```

`PolicyFinding` drops `provenance` entirely (§1.4 quarantine) and replaces the richer `corroboration`
object with a flat `corroborationCount`, matching the exact projection §1.4 specifies. No `evaluatePolicy()`
function ships in this sprint — types only.

## 9. `report.ts`

```ts
ReportFinding = Omit<CanonicalFinding, 'provenance' | 'corroboration'> & { corroborationCount: number };
```

Structurally identical to `PolicyFinding` today (§1.4 states report and policy read the same projection).
The shared omit-provenance shape is defined once in `finding.ts` and re-exported/aliased from both
`policy.ts` and `report.ts`, so the two can diverge later (e.g. AI-enrichment display fields on
`ReportFinding` in Sprint 13) without duplicating the base definition now.

## 10. Testing plan

Per file (`finding.test.ts`, `provider.test.ts`, `policy.test.ts`, `verdict.test.ts`, `coverage.test.ts`,
`report.test.ts`):

- **Validation:** a minimal valid object parses; a corrupted field (e.g. `severity: "super-critical"`,
  `tier: "kinda-ready"`) throws.
- **Serialization round-trip:** `Schema.parse(JSON.parse(JSON.stringify(Schema.parse(sample))))` equals the
  parsed sample.
- **Provider isolation (`provider.test.ts`):** a `RawResult`-shaped object does not satisfy
  `CanonicalFindingSchema` — asserted by attempting to parse a raw provider payload against the canonical
  schema and expecting rejection, plus a compile-time (`expectTypeOf` or equivalent) check that `RawResult`
  and `CanonicalFinding` are not assignable to each other.
- **Type projection (`policy.test.ts`, `report.test.ts`):** a static assertion that `PolicyFinding` and
  `ReportFinding` have no `provenance` key (e.g. `expectTypeOf<PolicyFinding>().not.toHaveProperty
  ('provenance')`, or a runtime check that `PolicyFindingSchema.shape` has no `provenance` key).

## 11. Definition of done

- [ ] All six contract files + `index.ts` barrel exist, each backed by Zod schemas with inferred types.
- [ ] `Severity`/`Confidence` values unchanged from Sprint 0; existing Sprint 0 tests still pass unmodified.
- [ ] No circular dependencies between the six files (`finding.ts` has no imports from the other five;
      `policy.ts`/`report.ts` import from `finding.ts` + `coverage.ts` + `verdict.ts`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all green.
- [ ] Validation, serialization, provider-isolation, and type-projection tests pass per §10.

## 12. Explicit non-goals

No `ScanResult`, no catalog/mapping-rule types, no `/v1` API DTOs, no `evaluatePolicy()` implementation, no
normalization/correlation logic, no Semgrep/SARIF integration, no CLI scanning, no database, no Supabase,
no authentication, no dashboard, no AI explanations, no scoring math, no PDF reports. All later sprints.
This is a narrower scope than the *original*, pre-ADR-001 `SPRINTS.md` Sprint 1 description, which is
superseded by this design and by the ADR-001 re-derivation note at the top of `SPRINTS.md`.
