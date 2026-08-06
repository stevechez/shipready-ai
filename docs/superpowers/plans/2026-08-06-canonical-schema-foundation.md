# Canonical Schema Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/schema`'s six canonical contract files (Finding, Provider, Coverage, Verdict,
Policy, Report) as Zod schemas + inferred TypeScript types, per
`docs/superpowers/specs/2026-08-06-canonical-schema-foundation-design.md`.

**Architecture:** Six focused files, each owning one contract family, layered to avoid circular imports:
`finding.ts` is the base (zero internal imports); `coverage.ts`, `provider.ts`, `verdict.ts` depend only on
`finding.ts` (or nothing); `policy.ts` and `report.ts` depend on the layers below them. `index.ts` is a
pure re-export barrel, built up one line per task so it (and the existing `index.test.ts`) stay valid after
every task.

**Tech Stack:** TypeScript (strict, `packages/config-tsconfig/library.json`), Zod 3.25 (already installed),
Vitest 3.2 (including `expectTypeOf` for type-level assertions — no new dependency), Biome (lint/format),
tsup (build), pnpm workspaces + Turborepo.

## Global Constraints

- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `isolatedModules` all on (`packages/config-tsconfig/base.json`) — every
  cross-file import in this plan is a value import (schemas), so no `import type` gymnastics are needed;
  don't add bare type-only imports unless a step says to.
- Biome formatting: single quotes, semicolons always, trailing commas `all`, 2-space indent, 100-col line
  width (`biome.json`). Run `pnpm exec biome check . --write` from the repo root if a step's pasted code
  doesn't already match — don't hand-format against the grain.
- Zod version installed is `3.25.76` (package.json pins `^3.24.1`) — all APIs used below
  (`z.object`, `z.enum`, `.omit()`, `.extend()`, `z.infer`, `.optional()`, `z.record`) are stable in that
  range.
- `Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'` and `Confidence = 'certain' | 'firm' |
  'tentative'` are **unchanged from Sprint 0** — `packages/schema/src/index.test.ts` must keep passing
  **without being edited**.
- `Category` is the closed 11-value list from `AUDIT_ENGINE.md` §3: `security, authentication,
  authorization, database, api, dependencies, typescript, accessibility, performance, architecture,
  configuration`.
- No circular dependencies (`.dependency-cruiser.cjs`'s `no-circular` rule); `packages/schema/src` must
  never import from `packages/(core|cli)/src` (`schema-is-the-contract` rule).
- After every task: `pnpm --filter @shipready/schema lint`, `typecheck`, `build`, and `test` must all pass.
  `pnpm run depcruise` (root) must stay green.
- No `.passthrough()`/forward-compat unknown-field handling this sprint — default Zod strip behavior is
  fine; no consumer exists yet to need it.

---

### Task 1: `finding.ts` — core vocabulary + `CanonicalFinding`

**Files:**
- Create: `packages/schema/src/finding.ts`
- Create: `packages/schema/src/finding.test.ts`
- Modify: `packages/schema/src/index.ts` (replace its current inline definitions with a re-export)
- Do NOT modify: `packages/schema/src/index.test.ts`

**Interfaces:**
- Produces (used by later tasks): `SeveritySchema`/`Severity`, `ConfidenceSchema`/`Confidence`,
  `CategorySchema`/`Category`, `AnalysisKindSchema`/`AnalysisKind`, `DeterminismSchema`/`Determinism`,
  `RuleIdSchema`, `SyntheticRuleIdSchema`, `CatalogRuleIdSchema`, `CanonicalRuleRefSchema`,
  `CanonicalLocationSchema`, `CanonicalFlowSchema`, `EvidenceSchema`, `FindingStatusSchema`,
  `SuppressionSchema`, `CorroborationSchema`, `FindingSourceSchema`, `ProvenanceSchema`,
  `CanonicalFindingSchema`/`CanonicalFinding`, `PublicFindingSchema`/`PublicFinding`,
  `FINDING_SCHEMA_VERSION` constant.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/finding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AnalysisKindSchema,
  CanonicalFindingSchema,
  CategorySchema,
  PublicFindingSchema,
  RuleIdSchema,
  SyntheticRuleIdSchema,
} from './finding';

const validFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',

  rule: {
    id: 'SR-RLS-001',
    mapped: true,
    catalogVersion: '2026.08.0',
    cwe: ['CWE-284'],
    docsUrl: 'https://shipready.dev/rules/SR-RLS-001',
  },
  category: 'database',
  severity: 'critical',
  confidence: 'certain',

  message: 'Table created without RLS enabled',
  locations: [{ repoRelPath: 'supabase/migrations/0001_init.sql', lineStart: 12 }],
  evidence: {
    snippet: 'create table public.profiles (...)',
    facts: { table: 'profiles', rlsEnabled: false },
  },

  status: 'open',

  corroboration: { count: 1, independentProviders: 1 },
  provenance: {
    sources: [
      {
        provider: 'native-sql',
        providerVersion: '0.1.0',
        providerApiVersion: '1.0',
        nativeRuleId: 'rls-missing',
        determinism: 'deterministic',
      },
    ],
  },
} as const;

describe('finding.ts', () => {
  it('parses a valid CanonicalFinding', () => {
    expect(CanonicalFindingSchema.parse(validFinding)).toMatchObject({ id: 'find_01' });
  });

  it('rejects an unknown severity', () => {
    const bad = { ...validFinding, severity: 'super-critical' };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('rejects an unknown category', () => {
    const bad = { ...validFinding, category: 'data-exposure' };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('requires at least one location', () => {
    const bad = { ...validFinding, locations: [] };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('requires at least one provenance source', () => {
    const bad = { ...validFinding, provenance: { sources: [] } };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('round-trips through JSON', () => {
    const parsed = CanonicalFindingSchema.parse(validFinding);
    const roundTripped = CanonicalFindingSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(parsed);
  });

  it('validates RuleId and SyntheticRuleId formats', () => {
    expect(RuleIdSchema.parse('SR-RLS-001')).toBe('SR-RLS-001');
    expect(() => RuleIdSchema.parse('rls-001')).toThrow();
    expect(SyntheticRuleIdSchema.parse('SR-EXT-semgrep.sql-injection')).toBe(
      'SR-EXT-semgrep.sql-injection',
    );
    expect(() => SyntheticRuleIdSchema.parse('semgrep.sql-injection')).toThrow();
  });

  it('validates AnalysisKind', () => {
    expect(AnalysisKindSchema.parse('taint')).toBe('taint');
    expect(() => AnalysisKindSchema.parse('vibes')).toThrow();
  });

  it('projects PublicFinding without provenance or raw corroboration, requiring corroborationCount', () => {
    const parsedCanonical = CanonicalFindingSchema.parse(validFinding);
    const { provenance, corroboration, ...rest } = parsedCanonical;
    const publicFinding = PublicFindingSchema.parse({ ...rest, corroborationCount: 1 });
    expect(publicFinding).not.toHaveProperty('provenance');
    expect(publicFinding).not.toHaveProperty('corroboration');
    expect(publicFinding.corroborationCount).toBe(1);

    // Passing the full canonical finding (has provenance/corroboration, no corroborationCount)
    // must fail — corroborationCount is required and missing.
    expect(() => PublicFindingSchema.parse(parsedCanonical)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/finding.test.ts`
Expected: FAIL — `Cannot find module './finding'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/finding.ts`:

```ts
import { z } from 'zod';

/**
 * The canonical Finding schema version. Versioned independently of the engine/core and of
 * providers, and pinned per scan for reproducibility (docs/PROVIDER_ARCHITECTURE.md §8).
 */
export const FINDING_SCHEMA_VERSION = '0.0.0' as const;

/**
 * Canonical severity, highest-impact first. Assigned by the catalog's predicate→assignment
 * mapping — never by a provider (docs/PROVIDER_ARCHITECTURE.md §1.2). Severity is what gates
 * by default (§4.9).
 */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Canonical confidence. Starts from the catalog's base confidence and is raised by
 * corroboration across independent providers (docs/PROVIDER_ARCHITECTURE.md §4.9). Confidence
 * informs display/prioritization; it does not, by itself, move a gate.
 */
export const CONFIDENCES = ['certain', 'firm', 'tentative'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Closed category set (docs/AUDIT_ENGINE.md §3). SCORING.md's category weight table is built
 * directly on these values.
 */
export const CATEGORIES = [
  'security',
  'authentication',
  'authorization',
  'database',
  'api',
  'dependencies',
  'typescript',
  'accessibility',
  'performance',
  'architecture',
  'configuration',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

/**
 * Analysis kind — shared vocabulary between provider capabilities (§2.1) and the coverage
 * matrix (§4.8).
 */
export const ANALYSIS_KINDS = [
  'ast',
  'taint',
  'sca',
  'secrets',
  'type-check',
  'iac',
  'lexical',
] as const;
export const AnalysisKindSchema = z.enum(ANALYSIS_KINDS);
export type AnalysisKind = z.infer<typeof AnalysisKindSchema>;

/** Provider determinism guarantee (§0.3, §2.1). */
export const DETERMINISM_LEVELS = ['deterministic', 'best-effort'] as const;
export const DeterminismSchema = z.enum(DETERMINISM_LEVELS);
export type Determinism = z.infer<typeof DeterminismSchema>;

/** Canonical rule identity: `SR-<PREFIX>-<NNN>`, e.g. `SR-RLS-001`. */
export const RuleIdSchema = z
  .string()
  .regex(/^SR-[A-Z]+-\d{3}$/, 'RuleId must match SR-<PREFIX>-<NNN>');
export type RuleId = z.infer<typeof RuleIdSchema>;

/** Unmapped passthrough rule identity: `SR-EXT-<provider>.<native>` (§1.2). */
export const SyntheticRuleIdSchema = z
  .string()
  .regex(
    /^SR-EXT-[a-z0-9_.-]+\.[a-zA-Z0-9_.-]+$/,
    'SyntheticRuleId must match SR-EXT-<provider>.<native>',
  );
export type SyntheticRuleId = z.infer<typeof SyntheticRuleIdSchema>;

export const CatalogRuleIdSchema = z.union([RuleIdSchema, SyntheticRuleIdSchema]);
export type CatalogRuleId = z.infer<typeof CatalogRuleIdSchema>;

/** Canonical rule reference attached to every finding (§1.2). */
export const CanonicalRuleRefSchema = z.object({
  id: CatalogRuleIdSchema,
  mapped: z.boolean(),
  catalogVersion: z.string(),
  cwe: z.array(z.string()).optional(),
  owaspAsvs: z.array(z.string()).optional(),
  docsUrl: z.string().url().optional(),
});
export type CanonicalRuleRef = z.infer<typeof CanonicalRuleRefSchema>;

/** Repo-relative, normalized location (§4.4) — what makes fingerprints stable. */
export const CanonicalLocationSchema = z.object({
  repoRelPath: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
  colStart: z.number().int().positive().optional(),
  colEnd: z.number().int().positive().optional(),
  enclosingSymbol: z.string().optional(),
});
export type CanonicalLocation = z.infer<typeof CanonicalLocationSchema>;

export const FLOW_KINDS = ['taint', 'reachability', 'path'] as const;
export const FlowKindSchema = z.enum(FLOW_KINDS);
export type FlowKind = z.infer<typeof FlowKindSchema>;

/** Provider-agnostic data-flow trace (§1.3). */
export const CanonicalFlowSchema = z.object({
  source: CanonicalLocationSchema,
  sink: CanonicalLocationSchema,
  steps: z.array(CanonicalLocationSchema),
  kind: FlowKindSchema,
});
export type CanonicalFlow = z.infer<typeof CanonicalFlowSchema>;

/** Evidence: snippet (redacted upstream) + structured facts (AUDIT_ENGINE.md §2). */
export const EvidenceFactValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const EvidenceSchema = z.object({
  snippet: z.string().optional(),
  matched: z.string().optional(),
  facts: z.record(z.string(), EvidenceFactValueSchema),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FINDING_STATUSES = ['open', 'acknowledged', 'fixed', 'wontfix', 'false_positive'] as const;
export const FindingStatusSchema = z.enum(FINDING_STATUSES);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const SUPPRESSION_SCOPES = ['inline', 'config', 'policy'] as const;
export const SuppressionSchema = z.object({
  reason: z.string(),
  suppressedBy: z.string(),
  scope: z.enum(SUPPRESSION_SCOPES),
  expires: z.string().datetime().optional(),
});
export type Suppression = z.infer<typeof SuppressionSchema>;

/** How many independent providers agree (§4.9) — provider-blind, integer-only. */
export const CorroborationSchema = z.object({
  count: z.number().int().nonnegative(),
  independentProviders: z.number().int().nonnegative(),
});
export type Corroboration = z.infer<typeof CorroborationSchema>;

/** One provider's contribution to a (possibly merged) finding — audit-only (§1.4). */
export const FindingSourceSchema = z.object({
  provider: z.string(),
  providerVersion: z.string(),
  providerApiVersion: z.string(),
  nativeRuleId: z.string(),
  nativeSeverity: z.string().optional(),
  determinism: DeterminismSchema,
  raw: z.unknown().optional(),
});
export type FindingSource = z.infer<typeof FindingSourceSchema>;

/**
 * QUARANTINED (§1.4): never read by policy/report modules. Only `finding.ts` may reference
 * this type directly; `PublicFindingSchema` below is the enforced projection that omits it.
 */
export const ProvenanceSchema = z.object({
  sources: z.array(FindingSourceSchema).min(1),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** The canonical Finding — the heart of provider-blindness (§1.1). */
export const CanonicalFindingSchema = z.object({
  schemaVersion: z.string(),
  id: z.string(),
  fingerprint: z.string(),

  rule: CanonicalRuleRefSchema,
  category: CategorySchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,

  message: z.string(),
  locations: z.array(CanonicalLocationSchema).min(1),
  dataFlow: CanonicalFlowSchema.optional(),
  evidence: EvidenceSchema,

  status: FindingStatusSchema,
  suppression: SuppressionSchema.optional(),

  corroboration: CorroborationSchema,
  provenance: ProvenanceSchema,
});
export type CanonicalFinding = z.infer<typeof CanonicalFindingSchema>;

/**
 * The type-projection enforcement mechanism from §1.4: what Policy and Report are allowed to
 * see. Drops `provenance` entirely and replaces the richer `corroboration` object with a flat
 * `corroborationCount`. `policy.ts` and `report.ts` re-export this under their own names.
 */
export const PublicFindingSchema = CanonicalFindingSchema.omit({
  provenance: true,
  corroboration: true,
}).extend({
  corroborationCount: z.number().int().nonnegative(),
});
export type PublicFinding = z.infer<typeof PublicFindingSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/finding.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire up the barrel and confirm Sprint 0's test still passes unmodified**

Replace the entire contents of `packages/schema/src/index.ts` with:

```ts
export * from './finding';
```

Run: `pnpm --filter @shipready/schema test`
Expected: PASS — both `finding.test.ts` (9 tests) and the untouched `index.test.ts` (3 tests) pass, because
`index.ts` now re-exports `FINDING_SCHEMA_VERSION`/`SEVERITIES`/`CONFIDENCES`/`SeveritySchema` from
`finding.ts` with identical values.

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build`
Expected: all three succeed with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/finding.ts packages/schema/src/finding.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add canonical Finding contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `coverage.ts` — the coverage matrix

**Files:**
- Create: `packages/schema/src/coverage.ts`
- Create: `packages/schema/src/coverage.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: `CategorySchema` (value + inferred `Category` type) and `AnalysisKindSchema` from
  `./finding` (Task 1).
- Produces (used by Task 5): `CoverageCellSchema`/`CoverageCell`, `CoverageReportSchema`/`CoverageReport`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CoverageReportSchema } from './coverage';

const validCoverage = {
  cells: [
    {
      language: 'ts',
      category: 'authorization',
      analysisKind: 'taint',
      covered: true,
      byProviders: ['semgrep'],
      executedRuleCount: 4,
    },
    {
      language: 'python',
      category: 'authorization',
      analysisKind: 'taint',
      covered: false,
      byProviders: [],
      executedRuleCount: 0,
      degraded: true,
    },
  ],
};

describe('coverage.ts', () => {
  it('parses a valid CoverageReport', () => {
    expect(CoverageReportSchema.parse(validCoverage)).toEqual(validCoverage);
  });

  it('rejects an unknown category on a cell', () => {
    const bad = {
      cells: [{ ...validCoverage.cells[0], category: 'not-a-real-category' }],
    };
    expect(() => CoverageReportSchema.parse(bad)).toThrow();
  });

  it('rejects an unknown analysisKind on a cell', () => {
    const bad = {
      cells: [{ ...validCoverage.cells[0], analysisKind: 'vibes' }],
    };
    expect(() => CoverageReportSchema.parse(bad)).toThrow();
  });

  it('models an uncovered cell as covered:false, never a silent pass', () => {
    const parsed = CoverageReportSchema.parse(validCoverage);
    expect(parsed.cells[1]?.covered).toBe(false);
    expect(parsed.cells[1]?.degraded).toBe(true);
  });

  it('round-trips through JSON', () => {
    const parsed = CoverageReportSchema.parse(validCoverage);
    expect(CoverageReportSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage'`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/coverage.ts`:

```ts
import { z } from 'zod';
import { AnalysisKindSchema, CategorySchema } from './finding';

/**
 * One cell of the (language × category × analysisKind) coverage matrix (§4.8). Coverage is the
 * intersection of declared capability AND rules that actually executed — never a bare claim.
 * `covered: false` must never be silently treated as "safe"; it drives `insufficient_coverage`
 * (§5.4).
 */
export const CoverageCellSchema = z.object({
  language: z.string(),
  category: CategorySchema,
  analysisKind: AnalysisKindSchema,
  covered: z.boolean(),
  byProviders: z.array(z.string()),
  executedRuleCount: z.number().int().nonnegative(),
  degraded: z.boolean().optional(),
});
export type CoverageCell = z.infer<typeof CoverageCellSchema>;

export const CoverageReportSchema = z.object({
  cells: z.array(CoverageCellSchema),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/coverage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Update the barrel**

Append to `packages/schema/src/index.ts` (now two lines total):

```ts
export * from './finding';
export * from './coverage';
```

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/coverage.ts packages/schema/src/coverage.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add coverage matrix contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `provider.ts` — provider-facing data contracts

**Files:**
- Create: `packages/schema/src/provider.ts`
- Create: `packages/schema/src/provider.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: `AnalysisKindSchema`, `CategorySchema`, `DeterminismSchema` (value + inferred types) from
  `./finding` (Task 1); `CanonicalFindingSchema`/`CanonicalFinding` from `./finding` (type-level isolation
  test only).
- Produces: `TrustTierSchema`/`TrustTier`, `SignatureSchema`/`Signature`,
  `ProviderMetadataSchema`/`ProviderMetadata`, `OutputFormatSchema`/`OutputFormat`,
  `CapabilitiesRequiresSchema`, `CapabilitiesProducesSchema`, `InvalidationTriggerSchema`,
  `IncrementalUnitSchema`, `IncrementalCapabilitySchema`/`IncrementalCapability`,
  `CapabilitiesSchema`/`Capabilities`, `RawResultSchema`/`RawResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/provider.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CanonicalFindingSchema, type CanonicalFinding } from './finding';
import { CapabilitiesSchema, ProviderMetadataSchema, RawResultSchema, type RawResult } from './provider';

const validMetadata = {
  id: 'semgrep',
  version: '1.80.0',
  providerApiVersion: '1.0',
  trustTier: 'first-party',
};

const validCapabilities = {
  languages: ['ts', 'tsx'],
  categories: ['authorization', 'security'],
  analysisKinds: ['ast', 'taint'],
  requires: { filesystem: 'read', network: false, build: false },
  produces: { findings: true, dataFlow: true, coverage: false },
  determinism: 'deterministic',
  incremental: { supported: false, unit: 'file', invalidatesOn: ['file-content'] },
  outputFormat: 'sarif-2.1.0',
};

describe('provider.ts', () => {
  it('parses valid ProviderMetadata', () => {
    expect(ProviderMetadataSchema.parse(validMetadata)).toMatchObject({ id: 'semgrep' });
  });

  it('rejects an unknown trustTier', () => {
    expect(() => ProviderMetadataSchema.parse({ ...validMetadata, trustTier: 'trusted' })).toThrow();
  });

  it('parses valid Capabilities', () => {
    expect(CapabilitiesSchema.parse(validCapabilities)).toMatchObject({ outputFormat: 'sarif-2.1.0' });
  });

  it('rejects capabilities.requires.filesystem other than "read"', () => {
    const bad = { ...validCapabilities, requires: { ...validCapabilities.requires, filesystem: 'write' } };
    expect(() => CapabilitiesSchema.parse(bad)).toThrow();
  });

  it('rejects capabilities.produces.findings other than true', () => {
    const bad = { ...validCapabilities, produces: { ...validCapabilities.produces, findings: false } };
    expect(() => CapabilitiesSchema.parse(bad)).toThrow();
  });

  it('parses a RawResult with an opaque payload', () => {
    const raw = { format: 'sarif-2.1.0', payload: { runs: [] } };
    expect(RawResultSchema.parse(raw)).toEqual(raw);
  });

  it('rejects a raw provider payload parsed as a canonical finding', () => {
    const raw: RawResult = {
      format: 'sarif-2.1.0',
      payload: { ruleId: 'sql-injection', level: 'error' },
    };
    expect(() => CanonicalFindingSchema.parse(raw)).toThrow();
  });

  it('is not, at the type level, assignable to CanonicalFinding without a mapping step', () => {
    expectTypeOf<RawResult>().not.toMatchTypeOf<CanonicalFinding>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/provider.test.ts`
Expected: FAIL — `Cannot find module './provider'`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/provider.ts`:

```ts
import { z } from 'zod';
import { AnalysisKindSchema, CategorySchema, DeterminismSchema } from './finding';

/**
 * Data contracts for the provider tier (§2, §3.1). This file intentionally does NOT define the
 * behavioral `Provider` interface (`detect()/plan()/run()/teardown()`) — that's an executable
 * contract for `@shipready/provider-sdk` (§10), a future package, not a Zod-validatable shape.
 */
export const TRUST_TIERS = ['core', 'first-party', 'verified', 'community'] as const;
export const TrustTierSchema = z.enum(TRUST_TIERS);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const SignatureSchema = z.object({
  algorithm: z.string(),
  value: z.string(),
  signedBy: z.string(),
});
export type Signature = z.infer<typeof SignatureSchema>;

export const ProviderMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  providerApiVersion: z.string(),
  trustTier: TrustTierSchema,
  signature: SignatureSchema.optional(),
});
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

export const OUTPUT_FORMATS = ['sarif-2.1.0', 'native'] as const;
export const OutputFormatSchema = z.enum(OUTPUT_FORMATS);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const CapabilitiesRequiresSchema = z.object({
  filesystem: z.literal('read'),
  network: z.boolean(),
  build: z.boolean(),
  toolchain: z.array(z.string()).optional(),
});
export type CapabilitiesRequires = z.infer<typeof CapabilitiesRequiresSchema>;

export const CapabilitiesProducesSchema = z.object({
  findings: z.literal(true),
  dataFlow: z.boolean(),
  coverage: z.boolean(),
});
export type CapabilitiesProduces = z.infer<typeof CapabilitiesProducesSchema>;

export const INVALIDATION_TRIGGERS = [
  'file-content',
  'directory-content',
  'dependency-graph',
  'configuration',
  'ruleset',
  'toolchain',
] as const;
export const InvalidationTriggerSchema = z.enum(INVALIDATION_TRIGGERS);
export type InvalidationTrigger = z.infer<typeof InvalidationTriggerSchema>;

export const INCREMENTAL_UNITS = ['file', 'directory', 'package', 'program'] as const;
export const IncrementalUnitSchema = z.enum(INCREMENTAL_UNITS);
export type IncrementalUnit = z.infer<typeof IncrementalUnitSchema>;

/**
 * Defined now so incremental execution can be switched on in Phase 2 without a schema change
 * (§2.1). A provider must declare the coarsest input change that invalidates a cached unit.
 */
export const IncrementalCapabilitySchema = z.object({
  supported: z.boolean(),
  unit: IncrementalUnitSchema,
  invalidatesOn: z.array(InvalidationTriggerSchema),
});
export type IncrementalCapability = z.infer<typeof IncrementalCapabilitySchema>;

export const CapabilitiesSchema = z.object({
  languages: z.array(z.string()),
  categories: z.array(CategorySchema),
  analysisKinds: z.array(AnalysisKindSchema),
  requires: CapabilitiesRequiresSchema,
  produces: CapabilitiesProducesSchema,
  determinism: DeterminismSchema,
  incremental: IncrementalCapabilitySchema,
  outputFormat: OutputFormatSchema,
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

/**
 * What a provider streams back. `payload` is deliberately opaque (`unknown`) — only a future
 * normalizer/adapter maps this into a `CanonicalFinding`. There is no `ProviderFinding` type:
 * providers never produce pre-canonical structured findings, only raw SARIF/native payloads.
 */
export const RawResultSchema = z.object({
  format: OutputFormatSchema,
  payload: z.unknown(),
});
export type RawResult = z.infer<typeof RawResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/provider.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Update the barrel**

`packages/schema/src/index.ts` (now three lines):

```ts
export * from './finding';
export * from './coverage';
export * from './provider';
```

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed. (`typecheck` is what actually enforces the `expectTypeOf` assertion from Step 1 —
confirm the command output shows no type errors.)

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/provider.ts packages/schema/src/provider.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add provider data contracts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `verdict.ts` — the two-axis verdict model

**Files:**
- Create: `packages/schema/src/verdict.ts`
- Create: `packages/schema/src/verdict.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: nothing internal.
- Produces (used by Task 5): `VerdictDecisionSchema`/`VerdictDecision`, `VerdictTierSchema`/`VerdictTier`,
  `VerdictSchema`/`Verdict`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/verdict.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VerdictSchema } from './verdict';

const validVerdict = {
  decision: 'fail',
  tier: 'blocked',
  reasons: ['control NO-DATA-EXPOSURE failed: SR-RLS-002 at firm confidence'],
  evaluatedAt: '2026-08-06T12:00:00.000Z',
};

describe('verdict.ts', () => {
  it('parses a valid Verdict', () => {
    expect(VerdictSchema.parse(validVerdict)).toEqual(validVerdict);
  });

  it('rejects an unknown decision', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, decision: 'maybe' })).toThrow();
  });

  it('accepts the at_risk tier (distinct from blocked)', () => {
    const atRisk = { ...validVerdict, decision: 'pass', tier: 'at_risk' };
    expect(VerdictSchema.parse(atRisk).tier).toBe('at_risk');
  });

  it('rejects an unknown tier', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, tier: 'sort-of-ready' })).toThrow();
  });

  it('rejects a non-ISO evaluatedAt', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, evaluatedAt: 'yesterday' })).toThrow();
  });

  it('round-trips through JSON', () => {
    const parsed = VerdictSchema.parse(validVerdict);
    expect(VerdictSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/verdict.test.ts`
Expected: FAIL — `Cannot find module './verdict'`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/verdict.ts`:

```ts
import { z } from 'zod';

/**
 * Two orthogonal axes (§5.2, SCORING.md §3) — never collapsed into one enum:
 * `decision` is whether the gate evaluated cleanly; `tier` is the human-facing readiness label,
 * and critically includes `at_risk` as a real middle state, not just ready/blocked.
 */
export const VERDICT_DECISIONS = ['pass', 'fail', 'insufficient_coverage'] as const;
export const VerdictDecisionSchema = z.enum(VERDICT_DECISIONS);
export type VerdictDecision = z.infer<typeof VerdictDecisionSchema>;

export const VERDICT_TIERS = ['ready', 'at_risk', 'blocked'] as const;
export const VerdictTierSchema = z.enum(VERDICT_TIERS);
export type VerdictTier = z.infer<typeof VerdictTierSchema>;

export const VerdictSchema = z.object({
  decision: VerdictDecisionSchema,
  tier: VerdictTierSchema,
  reasons: z.array(z.string()),
  evaluatedAt: z.string().datetime(),
});
export type Verdict = z.infer<typeof VerdictSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/verdict.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Update the barrel**

`packages/schema/src/index.ts` (now four lines):

```ts
export * from './finding';
export * from './coverage';
export * from './provider';
export * from './verdict';
```

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/verdict.ts packages/schema/src/verdict.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add two-axis Verdict contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `policy.ts` — policy evaluation input/output types

**Files:**
- Create: `packages/schema/src/policy.ts`
- Create: `packages/schema/src/policy.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: `CategorySchema`, `PublicFindingSchema` from `./finding` (Task 1); `CoverageReportSchema` from
  `./coverage` (Task 2); `VerdictSchema` from `./verdict` (Task 4).
- Produces (used by Task 6 only indirectly, via the shared `PublicFindingSchema`):
  `PolicyFindingSchema`/`PolicyFinding`, `PolicyEvaluationInputSchema`/`PolicyEvaluationInput`,
  `ControlResultSchema`/`ControlResult`, `ScoreBreakdownSchema`/`ScoreBreakdown`,
  `PolicyScoreSchema`/`PolicyScore`, `WaivedFindingSchema`/`WaivedFinding`,
  `PolicyResultSchema`/`PolicyResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PolicyEvaluationInputSchema, PolicyFindingSchema, PolicyResultSchema } from './policy';

const validPolicyFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',
  rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
  category: 'database',
  severity: 'high',
  confidence: 'firm',
  message: 'RLS enabled but policy is permissive',
  locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
  evidence: { facts: { table: 'profiles' } },
  status: 'open',
  corroborationCount: 2,
};

const validCoverage = { cells: [] };

const validVerdict = {
  decision: 'fail',
  tier: 'blocked',
  reasons: ['control NO-DATA-EXPOSURE failed'],
  evaluatedAt: '2026-08-06T12:00:00.000Z',
};

describe('policy.ts', () => {
  it('parses a valid PolicyFinding (no provenance key, has corroborationCount)', () => {
    const parsed = PolicyFindingSchema.parse(validPolicyFinding);
    expect(parsed).not.toHaveProperty('provenance');
    expect(parsed.corroborationCount).toBe(2);
  });

  it('rejects a PolicyFinding missing corroborationCount', () => {
    const { corroborationCount, ...rest } = validPolicyFinding;
    expect(() => PolicyFindingSchema.parse(rest)).toThrow();
  });

  it('parses a valid PolicyEvaluationInput', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: { version: '2026.08.0', name: 'Default — AI app readiness' },
    };
    expect(PolicyEvaluationInputSchema.parse(input).findings).toHaveLength(1);
  });

  it('parses a valid PolicyResult with an optional diagnostic score', () => {
    const result = {
      verdict: validVerdict,
      controls: [{ id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] }],
      score: { value: 76, breakdown: { database: 60, authorization: 100 } },
      coverage: validCoverage,
      waived: [],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    expect(PolicyResultSchema.parse(result).verdict.tier).toBe('blocked');
  });

  it('parses a valid PolicyResult with score omitted (score is diagnostic-only)', () => {
    const result = {
      verdict: { ...validVerdict, decision: 'pass', tier: 'ready' },
      controls: [],
      coverage: validCoverage,
      waived: [],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    expect(PolicyResultSchema.parse(result).score).toBeUndefined();
  });

  it('round-trips PolicyResult through JSON', () => {
    const result = {
      verdict: validVerdict,
      controls: [],
      coverage: validCoverage,
      waived: [
        { fingerprint: 'fp_xyz', reason: 'vendored fixture', approvedBy: 'u_123', expires: '2026-12-31T00:00:00.000Z' },
      ],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    const parsed = PolicyResultSchema.parse(result);
    expect(PolicyResultSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/policy.test.ts`
Expected: FAIL — `Cannot find module './policy'`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/policy.ts`:

```ts
import { z } from 'zod';
import { CategorySchema, PublicFindingSchema } from './finding';
import { CoverageReportSchema } from './coverage';
import { VerdictSchema } from './verdict';

/**
 * What the policy engine reads (§5.5): the same provenance-free, corroboration-flattened
 * projection as ReportFinding — defined once as `PublicFindingSchema` in finding.ts.
 */
export const PolicyFindingSchema = PublicFindingSchema;
export type PolicyFinding = z.infer<typeof PolicyFindingSchema>;

export const PolicyEvaluationInputSchema = z.object({
  findings: z.array(PolicyFindingSchema),
  coverage: CoverageReportSchema,
  policy: z.object({
    version: z.string(),
    name: z.string(),
  }),
});
export type PolicyEvaluationInput = z.infer<typeof PolicyEvaluationInputSchema>;

export const ControlResultSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  matched: z.array(z.string()),
});
export type ControlResult = z.infer<typeof ControlResultSchema>;

/** Per-category diagnostic breakdown (SCORING.md) — never the verdict (ADR-003). */
export const ScoreBreakdownSchema = z.record(CategorySchema, z.number());
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const PolicyScoreSchema = z.object({
  value: z.number().min(0).max(100),
  breakdown: ScoreBreakdownSchema,
});
export type PolicyScore = z.infer<typeof PolicyScoreSchema>;

export const WaivedFindingSchema = z.object({
  fingerprint: z.string(),
  reason: z.string(),
  approvedBy: z.string(),
  expires: z.string().datetime(),
});
export type WaivedFinding = z.infer<typeof WaivedFindingSchema>;

/** The output of `evaluatePolicy()` (§5.2) — that function itself is a later sprint. */
export const PolicyResultSchema = z.object({
  verdict: VerdictSchema,
  controls: z.array(ControlResultSchema),
  score: PolicyScoreSchema.optional(),
  coverage: CoverageReportSchema,
  waived: z.array(WaivedFindingSchema),
  policyVersion: z.string(),
  catalogVersion: z.string(),
});
export type PolicyResult = z.infer<typeof PolicyResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/policy.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Update the barrel**

`packages/schema/src/index.ts` (now five lines):

```ts
export * from './finding';
export * from './coverage';
export * from './provider';
export * from './verdict';
export * from './policy';
```

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/policy.ts packages/schema/src/policy.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add policy evaluation contracts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `report.ts` — display-safe finding projection

**Files:**
- Create: `packages/schema/src/report.ts`
- Create: `packages/schema/src/report.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: `PublicFindingSchema` from `./finding` (Task 1).
- Produces: `ReportFindingSchema`/`ReportFinding`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/src/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ReportFindingSchema } from './report';
import { PolicyFindingSchema } from './policy';

const validReportFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',
  rule: { id: 'SR-SEC-001', mapped: true, catalogVersion: '2026.08.0' },
  category: 'security',
  severity: 'critical',
  confidence: 'certain',
  message: 'Secret committed to the repo',
  locations: [{ repoRelPath: '.env', lineStart: 1 }],
  evidence: { facts: { pattern: 'aws-secret-key' } },
  status: 'open',
  corroborationCount: 1,
};

describe('report.ts', () => {
  it('parses a valid ReportFinding with no provenance key', () => {
    const parsed = ReportFindingSchema.parse(validReportFinding);
    expect(parsed).not.toHaveProperty('provenance');
    expect(parsed).not.toHaveProperty('corroboration');
  });

  it('rejects a ReportFinding missing corroborationCount', () => {
    const { corroborationCount, ...rest } = validReportFinding;
    expect(() => ReportFindingSchema.parse(rest)).toThrow();
  });

  it('is the same projection as PolicyFinding today (§1.4)', () => {
    expect(ReportFindingSchema.parse(validReportFinding)).toEqual(
      PolicyFindingSchema.parse(validReportFinding),
    );
  });

  it('round-trips through JSON', () => {
    const parsed = ReportFindingSchema.parse(validReportFinding);
    expect(ReportFindingSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/report.test.ts`
Expected: FAIL — `Cannot find module './report'`.

- [ ] **Step 3: Write the implementation**

Create `packages/schema/src/report.ts`:

```ts
import { z } from 'zod';
import { PublicFindingSchema } from './finding';

/**
 * What the report engine reads (§6): structurally identical to PolicyFinding today (§1.4).
 * Kept as its own named export so it can diverge later (e.g. AI-enrichment display fields in
 * Sprint 13) without touching policy.ts.
 */
export const ReportFindingSchema = PublicFindingSchema;
export type ReportFinding = z.infer<typeof ReportFindingSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/report.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Finalize the barrel**

`packages/schema/src/index.ts` (final form, six lines):

```ts
export * from './finding';
export * from './coverage';
export * from './provider';
export * from './verdict';
export * from './policy';
export * from './report';
```

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/report.ts packages/schema/src/report.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add report finding projection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full-repo verification

**Files:** none created or modified — this task only runs and confirms the repo-wide gates from the
design's Definition of Done (§11).

- [ ] **Step 1: Format check**

Run: `pnpm exec biome check .`
Expected: no errors. If it reports formatting diffs, run `pnpm exec biome check . --write`, review the
diff, and re-run to confirm clean.

- [ ] **Step 2: Full CI script**

Run: `pnpm run ci` (from repo root — runs lint, typecheck, build, test across every workspace package)
Expected: all green, including `@shipready/schema`'s new suite (Tasks 1–6: 38 tests across
`finding.test.ts`, `coverage.test.ts`, `provider.test.ts`, `verdict.test.ts`, `policy.test.ts`,
`report.test.ts`, plus the untouched 3 in `index.test.ts` = 41 tests total in the schema package) and
`apps/web`'s existing build.

- [ ] **Step 3: Dependency-cruiser layering check**

Run: `pnpm run depcruise`
Expected: `no dependency violations found` — confirms no circular imports were introduced across the six
new files and that `packages/schema/src` still depends on nothing in `core`/`cli`.

- [ ] **Step 4: Dependency audit**

Run: `pnpm audit --audit-level=high`
Expected: `No known vulnerabilities found` (no new dependencies were added this sprint, so this should be
unchanged from Sprint 0).

- [ ] **Step 5: Confirm no placeholder or TODO markers were left behind**

Run: `grep -rn "TODO\|FIXME\|not implemented" packages/schema/src`
Expected: no output.

- [ ] **Step 6: Final verification commit (if Steps 1–5 required any fixes)**

If any step above required a fix (e.g. a Biome auto-format), stage and commit it:

```bash
git add -A
git commit -m "chore(schema): fix formatting after full-repo verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no fixes were needed, this task produces no commit — Tasks 1–6 already left the repo green.
