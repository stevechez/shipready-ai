# Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `evaluatePolicy()` — the deterministic gate (controls → decision → tier) per
`docs/superpowers/specs/2026-08-07-policy-engine-design.md` — plus the real `Policy` profile schema it
consumes, replacing Sprint 1's placeholder.

**Architecture:** One schema addition (`packages/schema/src/policy.ts` gains `Policy`/`Control`/`Gate`/etc.)
plus four new internal files in `packages/core/src/policy/` (`waivers.ts`, `controls.ts`, `coverage.ts`,
`evaluate.ts`), with only `evaluate.ts`'s `evaluatePolicy` re-exported through `core`'s barrel — the first
real occupant of the internal space ADR-007's `respect-core-barrel` dependency-cruiser rule protects.

**Tech Stack:** TypeScript (strict), Zod 3.25, Vitest 3.2, Biome, tsup, pnpm workspaces + Turborepo — all
unchanged from Sprint 1.

## Global Constraints

- Scoring math is out of scope this sprint. `PolicyResult.score` is never set (key omitted, not assigned
  `undefined`) — `evaluatePolicy` never computes it.
- `onlyDeterministic` stays on the `Control` schema (forward-compatible policy YAML) but is **not**
  enforced by `evaluateControl` this sprint — no real providers exist yet to give it signal.
  `requireCorroboration` **is** enforced (reads `PolicyFinding.corroborationCount`, already present).
- `evaluatePolicy(findings, coverage, policy, now = new Date())` — the 4th `now` parameter is a documented,
  deliberate deviation from `PROVIDER_ARCHITECTURE.md` §5.2's literal 3-arg signature, needed for
  deterministic waiver-expiry testing.
- `catalogVersion` on the returned `PolicyResult` is derived from the **original** `findings` array's first
  element (`findings[0]?.rule.catalogVersion ?? ''`), not the post-waiver `active` subset.
- No YAML parsing/file loading. `evaluatePolicy` takes an in-memory, already-validated `Policy` object.
- TypeScript strict flags from `packages/config-tsconfig/base.json` apply
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`) —
  `Map.get()` results and any `Record`/index access must be narrowed or optional-chained, never asserted
  with `!` where an existing-key exhaustive-union pattern (e.g. `Record<Severity, number>`) avoids the need.
- Biome style: single quotes, semicolons, trailing commas `all`, 2-space indent, 100-col width.
- `packages/core/src/policy/{waivers,controls,coverage}.ts` are internal — only `evaluate.ts` is
  re-exported from `packages/core/src/index.ts`. Nothing outside `packages/core/src` may import them
  directly (enforced by the existing `respect-core-barrel` dependency-cruiser rule — no rule change needed).
- After every task: `pnpm --filter @shipready/schema lint/typecheck/build/test` and/or
  `pnpm --filter @shipready/core lint/typecheck/build/test` (whichever package the task touches) must pass.
  Task 6 runs the full repo-wide gate.

---

### Task 1: `Policy` profile schema (`packages/schema/src/policy.ts`)

**Files:**
- Modify: `packages/schema/src/policy.ts` (full rewrite of the file's content — every existing export stays,
  in a new order, plus new ones)
- Modify: `packages/schema/src/policy.test.ts` (one existing test fixture must change; new tests added)

**Interfaces:**
- Produces (used by Tasks 2-5): `WaivedFindingSchema`/`WaivedFinding` (unchanged shape, moved earlier in
  the file), `ControlMatchSchema`/`ControlMatch`, `ControlSchema`/`Control`,
  `RequiredCoverageEntrySchema`/`RequiredCoverageEntry`, `GateSchema`/`Gate`,
  `SeverityOverrideSchema`/`SeverityOverride`, `PolicySchema`/`Policy`. `PolicyEvaluationInputSchema.policy`
  now types as `Policy` instead of the Sprint 1 placeholder.
- Consumes: `CategorySchema`, `FindingStatusSchema`, `SeveritySchema`, `CatalogRuleIdSchema`,
  `AnalysisKindSchema` from `./finding` (all already exist from Sprint 1); `CoverageReportSchema` from
  `./coverage`; `VerdictSchema` from `./verdict`.

- [ ] **Step 1: Write the failing test — fix the existing placeholder-policy fixture and add new schema tests**

Replace `packages/schema/src/policy.test.ts` in full with:

```ts
import { describe, expect, it } from 'vitest';
import {
  ControlSchema,
  GateSchema,
  PolicyEvaluationInputSchema,
  PolicyFindingSchema,
  PolicyResultSchema,
  PolicySchema,
} from './policy';

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

const validPolicy = {
  apiVersion: 'shipready.dev/policy/v1',
  version: '2026.08.0',
  name: 'Default — AI app readiness',
  requiredCoverage: [{ language: 'ts', categories: ['authorization'], minAnalysisKind: 'taint' }],
  controls: [
    {
      id: 'NO-DATA-EXPOSURE',
      description: 'No open data-exposure finding at High or Critical severity',
      match: { category: 'database', status: 'open', minSeverity: 'high' },
      forbid: 'any',
    },
  ],
  gate: {
    failIf: { controlFailed: ['NO-DATA-EXPOSURE'] },
    atRiskIf: { open: { severity: 'high', status: 'open' } },
  },
  severityOverrides: [{ rule: 'SR-A11Y-001', severity: 'info' }],
  waivers: [
    {
      fingerprint: 'fp_xyz',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-12-31T00:00:00.000Z',
    },
  ],
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

  it('parses a valid Policy profile with controls, gate, requiredCoverage, and waivers', () => {
    const parsed = PolicySchema.parse(validPolicy);
    expect(parsed.controls).toHaveLength(1);
    expect(parsed.gate.atRiskIf?.open?.severity).toBe('high');
    expect(parsed.waivers).toHaveLength(1);
  });

  it('rejects a control with forbid other than "any"', () => {
    const bad = {
      id: 'X',
      description: 'x',
      match: {},
      forbid: 'all',
    };
    expect(() => ControlSchema.parse(bad)).toThrow();
  });

  it('accepts a control with no match clauses (matches everything) and optional tightening fields', () => {
    const control = {
      id: 'X',
      description: 'x',
      match: {},
      forbid: 'any',
      onlyDeterministic: true,
      requireCorroboration: 2,
    };
    expect(ControlSchema.parse(control)).toMatchObject({ requireCorroboration: 2 });
  });

  it('rejects a Gate missing failIf', () => {
    expect(() => GateSchema.parse({})).toThrow();
  });

  it('parses a valid PolicyEvaluationInput with a real Policy profile', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: validPolicy,
    };
    expect(PolicyEvaluationInputSchema.parse(input).policy.controls).toHaveLength(1);
  });

  it('rejects a PolicyEvaluationInput with the old placeholder policy shape', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: { version: '2026.08.0', name: 'Default' },
    };
    expect(() => PolicyEvaluationInputSchema.parse(input)).toThrow();
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
        {
          fingerprint: 'fp_xyz',
          reason: 'vendored fixture',
          approvedBy: 'u_123',
          expires: '2026-12-31T00:00:00.000Z',
        },
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
Expected: FAIL — `PolicySchema`, `ControlSchema`, `GateSchema` don't exist yet; `PolicyEvaluationInputSchema`
still accepts the placeholder shape (so the "rejects the old placeholder" test also fails).

- [ ] **Step 3: Write the implementation**

Replace `packages/schema/src/policy.ts` in full with:

```ts
import { z } from 'zod';
import { CoverageReportSchema } from './coverage';
import {
  AnalysisKindSchema,
  CatalogRuleIdSchema,
  CategorySchema,
  FindingStatusSchema,
  PublicFindingSchema,
  SeveritySchema,
} from './finding';
import { VerdictSchema } from './verdict';

/**
 * What the policy engine reads (§5.5): the same provenance-free, corroboration-flattened
 * projection as ReportFinding — defined once as `PublicFindingSchema` in finding.ts.
 */
export const PolicyFindingSchema = PublicFindingSchema;
export type PolicyFinding = z.infer<typeof PolicyFindingSchema>;

/** An exception, expiring, justified, and audited (§5.1) — never silent. */
export const WaivedFindingSchema = z.object({
  fingerprint: z.string(),
  reason: z.string(),
  approvedBy: z.string(),
  expires: z.string().datetime(),
});
export type WaivedFinding = z.infer<typeof WaivedFindingSchema>;

/** Predicate clauses for a control's `match` — every present clause is ANDed (§5.1). */
export const ControlMatchSchema = z.object({
  category: CategorySchema.optional(),
  status: FindingStatusSchema.optional(),
  minSeverity: SeveritySchema.optional(),
  rule: CatalogRuleIdSchema.optional(),
});
export type ControlMatch = z.infer<typeof ControlMatchSchema>;

/**
 * A named, auditable requirement (§5.1). `onlyDeterministic` is accepted for forward
 * compatibility but not enforced by `evaluatePolicy` yet — see
 * packages/core/src/policy/controls.ts for why (PolicyFinding quarantines provenance, where
 * determinism lives).
 */
export const ControlSchema = z.object({
  id: z.string(),
  description: z.string(),
  match: ControlMatchSchema,
  forbid: z.literal('any'),
  onlyDeterministic: z.boolean().optional(),
  requireCorroboration: z.number().int().positive().optional(),
});
export type Control = z.infer<typeof ControlSchema>;

/** One coverage-aware gating requirement (§5.4). */
export const RequiredCoverageEntrySchema = z.object({
  language: z.string(),
  categories: z.array(CategorySchema),
  minAnalysisKind: AnalysisKindSchema.optional(),
});
export type RequiredCoverageEntry = z.infer<typeof RequiredCoverageEntrySchema>;

/** The pass/fail/at-risk verdict rules (§5.1). */
export const GateSchema = z.object({
  failIf: z.object({
    controlFailed: z.array(z.string()),
    coverageInsufficient: z.boolean().optional(),
  }),
  atRiskIf: z
    .object({
      open: z
        .object({
          severity: SeveritySchema,
          status: FindingStatusSchema,
        })
        .optional(),
    })
    .optional(),
});
export type Gate = z.infer<typeof GateSchema>;

/** An org re-ranking a canonical rule's severity (§5.1). */
export const SeverityOverrideSchema = z.object({
  rule: CatalogRuleIdSchema,
  severity: SeveritySchema,
});
export type SeverityOverride = z.infer<typeof SeverityOverrideSchema>;

/**
 * The declarative policy profile (§5.1) — versioned content, pinned per scan. This is what
 * `evaluatePolicy` (packages/core/src/policy/evaluate.ts) consumes.
 */
export const PolicySchema = z.object({
  apiVersion: z.string(),
  version: z.string(),
  name: z.string(),
  requiredCoverage: z.array(RequiredCoverageEntrySchema).optional(),
  controls: z.array(ControlSchema),
  gate: GateSchema,
  severityOverrides: z.array(SeverityOverrideSchema).optional(),
  waivers: z.array(WaivedFindingSchema).optional(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const PolicyEvaluationInputSchema = z.object({
  findings: z.array(PolicyFindingSchema),
  coverage: CoverageReportSchema,
  policy: PolicySchema,
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

/** The output of `evaluatePolicy()` (§5.2). */
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
Expected: PASS (11 tests).

- [ ] **Step 5: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed. Full schema suite (all 7 files) should show 44 tests (41 from Sprint 1 minus the 1
replaced test, plus the new ones — count is illustrative; the key check is 0 failures).

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/policy.ts packages/schema/src/policy.test.ts
git commit -m "feat(schema): add the real Policy profile (controls, gate, coverage, waivers)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core/src/policy/waivers.ts`

**Files:**
- Create: `packages/core/src/policy/waivers.ts`
- Create: `packages/core/src/policy/waivers.test.ts`

**Interfaces:**
- Consumes: `PolicyFinding`, `WaivedFinding` types from `@shipready/schema` (Task 1).
- Produces (used by Task 5): `applyWaivers(findings, waivers, now): { active: PolicyFinding[]; waived: WaivedFinding[] }`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/policy/waivers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PolicyFinding, WaivedFinding } from '@shipready/schema';
import { applyWaivers } from './waivers';

function makeFinding(fingerprint: string): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: `find_${fingerprint}`,
    fingerprint,
    rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'high',
    confidence: 'firm',
    message: 'RLS enabled but policy is permissive',
    locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 1,
  };
}

const NOW = new Date('2026-08-07T00:00:00.000Z');

describe('applyWaivers', () => {
  it('moves a finding with a live waiver to waived, not active', () => {
    const finding = makeFinding('fp_abc');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_abc',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-12-31T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([finding], [waiver], NOW);
    expect(active).toHaveLength(0);
    expect(waived).toEqual([waiver]);
  });

  it('keeps a finding active when its waiver has expired', () => {
    const finding = makeFinding('fp_abc');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_abc',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-01-01T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([finding], [waiver], NOW);
    expect(active).toEqual([finding]);
    expect(waived).toHaveLength(0);
  });

  it('leaves findings without a matching waiver active', () => {
    const finding = makeFinding('fp_xyz');
    const { active, waived } = applyWaivers([finding], [], NOW);
    expect(active).toEqual([finding]);
    expect(waived).toHaveLength(0);
  });

  it('handles multiple findings with a mix of waived and active', () => {
    const waivedFinding = makeFinding('fp_waived');
    const activeFinding = makeFinding('fp_active');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_waived',
      reason: 'known issue, tracked',
      approvedBy: 'u_456',
      expires: '2026-12-31T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([waivedFinding, activeFinding], [waiver], NOW);
    expect(active).toEqual([activeFinding]);
    expect(waived).toEqual([waiver]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/waivers.test.ts`
Expected: FAIL — `Cannot find module './waivers'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/policy/waivers.ts`:

```ts
import type { PolicyFinding, WaivedFinding } from '@shipready/schema';

export interface WaiverPartition {
  active: PolicyFinding[];
  waived: WaivedFinding[];
}

/**
 * Partitions findings into those still subject to gating and those covered by a live waiver.
 * A waiver whose `expires` has passed is treated as if it doesn't exist — the finding it would
 * have covered stays active and gates normally. A stale waiver must never silently suppress a
 * real issue (PROVIDER_ARCHITECTURE.md §5.1).
 */
export function applyWaivers(
  findings: PolicyFinding[],
  waivers: WaivedFinding[],
  now: Date,
): WaiverPartition {
  const liveWaiversByFingerprint = new Map<string, WaivedFinding>();
  for (const waiver of waivers) {
    if (new Date(waiver.expires) > now) {
      liveWaiversByFingerprint.set(waiver.fingerprint, waiver);
    }
  }

  const active: PolicyFinding[] = [];
  const waived: WaivedFinding[] = [];
  for (const finding of findings) {
    const waiver = liveWaiversByFingerprint.get(finding.fingerprint);
    if (waiver) {
      waived.push(waiver);
    } else {
      active.push(finding);
    }
  }

  return { active, waived };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/waivers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/policy/waivers.ts packages/core/src/policy/waivers.test.ts
git commit -m "feat(core): add waiver partitioning for policy evaluation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `packages/core/src/policy/controls.ts`

**Files:**
- Create: `packages/core/src/policy/controls.ts`
- Create: `packages/core/src/policy/controls.test.ts`

**Interfaces:**
- Consumes: `Control`, `ControlMatch`, `PolicyFinding`, `Severity` types from `@shipready/schema` (Task 1).
- Produces (used by Task 5): `evaluateControl(control, findings): { id: string; passed: boolean; matched: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/policy/controls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Control, PolicyFinding } from '@shipready/schema';
import { evaluateControl } from './controls';

function makeFinding(overrides: Partial<PolicyFinding> = {}): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: 'find_01',
    fingerprint: 'fp_abc123',
    rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'high',
    confidence: 'firm',
    message: 'RLS enabled but policy is permissive',
    locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 2,
    ...overrides,
  };
}

const noDataExposure: Control = {
  id: 'NO-DATA-EXPOSURE',
  description: 'No open data-exposure finding at High or Critical severity',
  match: { category: 'database', status: 'open', minSeverity: 'high' },
  forbid: 'any',
};

describe('evaluateControl', () => {
  it('fails when a matching finding exists', () => {
    const result = evaluateControl(noDataExposure, [makeFinding()]);
    expect(result).toEqual({ id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] });
  });

  it('passes when no finding matches the category', () => {
    const finding = makeFinding({ category: 'security' });
    const result = evaluateControl(noDataExposure, [finding]);
    expect(result.passed).toBe(true);
    expect(result.matched).toEqual([]);
  });

  it('passes when the finding is below minSeverity', () => {
    const finding = makeFinding({ severity: 'medium' });
    expect(evaluateControl(noDataExposure, [finding]).passed).toBe(true);
  });

  it('passes when the finding does not match status', () => {
    const finding = makeFinding({ status: 'fixed' });
    expect(evaluateControl(noDataExposure, [finding]).passed).toBe(true);
  });

  it('matches on an exact rule id when specified', () => {
    const control: Control = {
      id: 'TYPES-COMPILE',
      description: 'TypeScript must compile',
      match: { rule: 'SR-TS-002', status: 'open' },
      forbid: 'any',
    };
    const matching = makeFinding({
      rule: { id: 'SR-TS-002', mapped: true, catalogVersion: '2026.08.0' },
    });
    const nonMatching = makeFinding({
      rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    });
    expect(evaluateControl(control, [matching]).passed).toBe(false);
    expect(evaluateControl(control, [nonMatching]).passed).toBe(true);
  });

  it('filters by requireCorroboration when set', () => {
    const control: Control = { ...noDataExposure, requireCorroboration: 2 };
    const weaklyCorroborated = makeFinding({ corroborationCount: 1 });
    const stronglyCorroborated = makeFinding({ corroborationCount: 2 });
    expect(evaluateControl(control, [weaklyCorroborated]).passed).toBe(true);
    expect(evaluateControl(control, [stronglyCorroborated]).passed).toBe(false);
  });

  it('collects all matched fingerprints, not just the first', () => {
    const first = makeFinding({ fingerprint: 'fp_1' });
    const second = makeFinding({ fingerprint: 'fp_2' });
    const result = evaluateControl(noDataExposure, [first, second]);
    expect(result.matched).toEqual(['fp_1', 'fp_2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/controls.test.ts`
Expected: FAIL — `Cannot find module './controls'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/policy/controls.ts`:

```ts
import type { Control, ControlMatch, PolicyFinding, Severity } from '@shipready/schema';

export interface ControlEvaluation {
  id: string;
  passed: boolean;
  matched: string[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function meetsMinSeverity(severity: Severity, minSeverity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
}

function matchesFinding(match: ControlMatch, finding: PolicyFinding): boolean {
  if (match.category !== undefined && finding.category !== match.category) {
    return false;
  }
  if (match.status !== undefined && finding.status !== match.status) {
    return false;
  }
  if (match.rule !== undefined && finding.rule.id !== match.rule) {
    return false;
  }
  if (match.minSeverity !== undefined && !meetsMinSeverity(finding.severity, match.minSeverity)) {
    return false;
  }
  return true;
}

/**
 * Evaluates one control against the active (non-waived) finding set. A `forbid: 'any'` control
 * fails when at least one finding survives the match predicate and, if set, the
 * `requireCorroboration` threshold. `onlyDeterministic` is accepted on the schema but not
 * enforced here — see packages/schema/src/policy.ts's note on why.
 */
export function evaluateControl(control: Control, findings: PolicyFinding[]): ControlEvaluation {
  const matched = findings
    .filter((finding) => matchesFinding(control.match, finding))
    .filter((finding) =>
      control.requireCorroboration === undefined
        ? true
        : finding.corroborationCount >= control.requireCorroboration,
    )
    .map((finding) => finding.fingerprint);

  return {
    id: control.id,
    passed: matched.length === 0,
    matched,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/controls.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/policy/controls.ts packages/core/src/policy/controls.test.ts
git commit -m "feat(core): add control matching for policy evaluation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `packages/core/src/policy/coverage.ts`

**Files:**
- Create: `packages/core/src/policy/coverage.ts`
- Create: `packages/core/src/policy/coverage.test.ts`

**Interfaces:**
- Consumes: `CoverageReport`, `RequiredCoverageEntry` types from `@shipready/schema` (Task 1).
- Produces (used by Task 5): `findUnmetCoverage(required, coverage): RequiredCoverageEntry[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/policy/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CoverageReport, RequiredCoverageEntry } from '@shipready/schema';
import { findUnmetCoverage } from './coverage';

const tsAuthzTaint: RequiredCoverageEntry = {
  language: 'ts',
  categories: ['authorization', 'security'],
  minAnalysisKind: 'taint',
};

describe('findUnmetCoverage', () => {
  it('returns empty when a covered cell matches language, category, and analysisKind', () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'authorization',
          analysisKind: 'taint',
          covered: true,
          byProviders: ['semgrep'],
          executedRuleCount: 4,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([]);
  });

  it('reports the entry unmet when the cell exists but covered is false', () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'authorization',
          analysisKind: 'taint',
          covered: false,
          byProviders: [],
          executedRuleCount: 0,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([tsAuthzTaint]);
  });

  it('reports the entry unmet when no cell matches at all', () => {
    const coverage: CoverageReport = { cells: [] };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([tsAuthzTaint]);
  });

  it('matches on any category in the entry\'s category list', () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'security',
          analysisKind: 'taint',
          covered: true,
          byProviders: ['semgrep'],
          executedRuleCount: 2,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([]);
  });

  it('ignores minAnalysisKind when the entry does not specify one', () => {
    const entry: RequiredCoverageEntry = { language: 'sql', categories: ['database'] };
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'sql',
          category: 'database',
          analysisKind: 'lexical',
          covered: true,
          byProviders: ['native-sql'],
          executedRuleCount: 3,
        },
      ],
    };
    expect(findUnmetCoverage([entry], coverage)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/policy/coverage.ts`:

```ts
import type { CoverageReport, RequiredCoverageEntry } from '@shipready/schema';

/**
 * Checks whether every required-coverage entry (§5.4) has at least one effectively-covered
 * cell in the actual coverage report. Returns the entries that were NOT met — empty means
 * coverage is sufficient. "Lack of evidence can never become PASS" (§4.8): a required entry
 * with no matching covered:true cell is unmet, full stop.
 */
export function findUnmetCoverage(
  required: RequiredCoverageEntry[],
  coverage: CoverageReport,
): RequiredCoverageEntry[] {
  return required.filter((entry) => !isEntryCovered(entry, coverage));
}

function isEntryCovered(entry: RequiredCoverageEntry, coverage: CoverageReport): boolean {
  return coverage.cells.some(
    (cell) =>
      cell.covered &&
      cell.language === entry.language &&
      entry.categories.includes(cell.category) &&
      (entry.minAnalysisKind === undefined || cell.analysisKind === entry.minAnalysisKind),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/coverage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/policy/coverage.ts packages/core/src/policy/coverage.test.ts
git commit -m "feat(core): add required-coverage checking for policy evaluation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `packages/core/src/policy/evaluate.ts` + barrel wiring

**Files:**
- Create: `packages/core/src/policy/evaluate.ts`
- Create: `packages/core/src/policy/evaluate.test.ts`
- Modify: `packages/core/src/index.ts` (add the `evaluatePolicy` re-export)

**Interfaces:**
- Consumes: `applyWaivers` from `./waivers` (Task 2), `evaluateControl` from `./controls` (Task 3),
  `findUnmetCoverage` from `./coverage` (Task 4); `Policy`, `PolicyFinding`, `CoverageReport`,
  `PolicyResult`, `Verdict` types from `@shipready/schema` (Task 1).
- Produces (public, re-exported from `core`'s barrel):
  `evaluatePolicy(findings, coverage, policy, now?): PolicyResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/policy/evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { evaluatePolicy } from './evaluate';

const NOW = new Date('2026-08-07T00:00:00.000Z');

function makeFinding(overrides: Partial<PolicyFinding> = {}): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: 'find_01',
    fingerprint: 'fp_abc123',
    rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'high',
    confidence: 'firm',
    message: 'RLS enabled but policy is permissive',
    locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 2,
    ...overrides,
  };
}

const basePolicy: Policy = {
  apiVersion: 'shipready.dev/policy/v1',
  version: '2026.08.0',
  name: 'Default — AI app readiness',
  controls: [
    {
      id: 'NO-DATA-EXPOSURE',
      description: 'No open data-exposure finding at High or Critical severity',
      match: { category: 'database', status: 'open', minSeverity: 'high' },
      forbid: 'any',
    },
  ],
  gate: {
    failIf: { controlFailed: ['NO-DATA-EXPOSURE'] },
    atRiskIf: { open: { severity: 'high', status: 'open' } },
  },
};

const emptyCoverage: CoverageReport = { cells: [] };

describe('evaluatePolicy', () => {
  it('passes with ready tier when nothing matches any control', () => {
    const result = evaluatePolicy([], emptyCoverage, basePolicy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.verdict.tier).toBe('ready');
  });

  it('fails and blocks when a listed control fails', () => {
    const finding = makeFinding();
    const result = evaluatePolicy([finding], emptyCoverage, basePolicy, NOW);
    expect(result.verdict.decision).toBe('fail');
    expect(result.verdict.tier).toBe('blocked');
    expect(result.controls).toEqual([
      { id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] },
    ]);
    expect(result.verdict.reasons[0]).toContain('NO-DATA-EXPOSURE');
  });

  it('reports insufficient_coverage and blocks when required coverage is unmet', () => {
    const policy: Policy = {
      ...basePolicy,
      controls: [],
      gate: { failIf: { controlFailed: [] } },
      requiredCoverage: [{ language: 'ts', categories: ['authorization'] }],
    };
    const result = evaluatePolicy([], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('insufficient_coverage');
    expect(result.verdict.tier).toBe('blocked');
  });

  it('sets tier at_risk when passing but an open finding matches atRiskIf', () => {
    const policy: Policy = { ...basePolicy, controls: [] };
    const finding = makeFinding({ category: 'security' });
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.verdict.tier).toBe('at_risk');
  });

  it('excludes a waived finding from control matching but surfaces it in waived', () => {
    const finding = makeFinding();
    const policy: Policy = {
      ...basePolicy,
      waivers: [
        {
          fingerprint: 'fp_abc123',
          reason: 'vendored fixture',
          approvedBy: 'u_123',
          expires: '2026-12-31T00:00:00.000Z',
        },
      ],
    };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.waived).toHaveLength(1);
    expect(result.waived[0]?.fingerprint).toBe('fp_abc123');
  });

  it('derives catalogVersion from the first finding and leaves score undefined', () => {
    const finding = makeFinding({ category: 'security' });
    const policy: Policy = { ...basePolicy, controls: [] };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.catalogVersion).toBe('2026.08.0');
    expect(result.score).toBeUndefined();
  });

  it('uses an empty catalogVersion when there are no findings', () => {
    const result = evaluatePolicy([], emptyCoverage, basePolicy, NOW);
    expect(result.catalogVersion).toBe('');
  });

  it('defaults now to the real clock when omitted', () => {
    const before = Date.now();
    const result = evaluatePolicy([], emptyCoverage, basePolicy);
    const evaluatedAt = new Date(result.verdict.evaluatedAt).getTime();
    expect(evaluatedAt).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/evaluate.test.ts`
Expected: FAIL — `Cannot find module './evaluate'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/policy/evaluate.ts`:

```ts
import type { CoverageReport, Policy, PolicyFinding, PolicyResult, Verdict } from '@shipready/schema';
import { evaluateControl } from './controls';
import { findUnmetCoverage } from './coverage';
import { applyWaivers } from './waivers';

/**
 * The deterministic policy pass (PROVIDER_ARCHITECTURE.md §5.2): controls -> gate -> verdict.
 * Scoring is deliberately not computed here (ADR-003; PolicyResult.score stays undefined) —
 * that's a later sprint. `now` defaults to the real clock but can be pinned for deterministic
 * testing of waiver expiry, a documented deviation from §5.2's literal 3-arg signature.
 */
export function evaluatePolicy(
  findings: PolicyFinding[],
  coverage: CoverageReport,
  policy: Policy,
  now: Date = new Date(),
): PolicyResult {
  const { active, waived } = applyWaivers(findings, policy.waivers ?? [], now);

  const controls = policy.controls.map((control) => evaluateControl(control, active));
  const controlsById = new Map(controls.map((result) => [result.id, result]));

  const unmetCoverage = findUnmetCoverage(policy.requiredCoverage ?? [], coverage);
  const coverageInsufficient =
    unmetCoverage.length > 0 && policy.gate.failIf.coverageInsufficient !== false;

  const failedControlIds = policy.gate.failIf.controlFailed.filter((id) => {
    const result = controlsById.get(id);
    return result !== undefined && !result.passed;
  });

  const reasons: string[] = [];
  let decision: Verdict['decision'];
  if (coverageInsufficient) {
    decision = 'insufficient_coverage';
    for (const entry of unmetCoverage) {
      reasons.push(`required coverage not met: ${entry.language}/${entry.categories.join(',')}`);
    }
  } else if (failedControlIds.length > 0) {
    decision = 'fail';
    for (const id of failedControlIds) {
      const result = controlsById.get(id);
      reasons.push(`control ${id} failed: ${result?.matched.join(', ')}`);
    }
  } else {
    decision = 'pass';
  }

  let tier: Verdict['tier'];
  if (decision === 'fail' || decision === 'insufficient_coverage') {
    tier = 'blocked';
  } else if (matchesAtRisk(active, policy.gate.atRiskIf)) {
    tier = 'at_risk';
  } else {
    tier = 'ready';
  }

  return {
    verdict: {
      decision,
      tier,
      reasons,
      evaluatedAt: now.toISOString(),
    },
    controls,
    coverage,
    waived,
    policyVersion: policy.version,
    catalogVersion: findings[0]?.rule.catalogVersion ?? '',
  };
}

function matchesAtRisk(findings: PolicyFinding[], atRiskIf: Policy['gate']['atRiskIf']): boolean {
  if (!atRiskIf?.open) {
    return false;
  }
  const { severity, status } = atRiskIf.open;
  return findings.some((finding) => finding.severity === severity && finding.status === status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/evaluate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Wire the barrel**

Modify `packages/core/src/index.ts` — add one export line at the top (after the existing `import type`
line) and trim the now-outdated comment on `highestSeverity` (it no longer needs to say policy evaluation
is a "later sprint" — it is this sprint, in a different file):

```ts
import type { Severity } from '@shipready/schema';

export { evaluatePolicy } from './policy/evaluate';

/**
 * Describes the provider-blind core (post ADR-001; this package was formerly conceived as the
 * bespoke "engine"). The core reasons only about canonical findings — never about which
 * analyzer produced them (docs/PROVIDER_ARCHITECTURE.md §0).
 */
export interface CoreInfo {
  readonly name: string;
  readonly providerBlind: true;
}

export const CORE_INFO: CoreInfo = {
  name: '@shipready/core',
  providerBlind: true,
};

/**
 * Sprint 0 placeholder proving the schema→core dependency edge and the canonical severity
 * ordering. Real normalization and correlation land in later sprints.
 */
export function highestSeverity(): Severity {
  return 'critical';
}
```

- [ ] **Step 6: Full package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed. `packages/core/src/index.test.ts` (unmodified) must still pass — it only tests
`CORE_INFO`/`highestSeverity`, both untouched in behavior.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/policy/evaluate.ts packages/core/src/policy/evaluate.test.ts packages/core/src/index.ts
git commit -m "feat(core): implement evaluatePolicy — the deterministic gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Golden scenario test + full-repo verification

**Files:**
- Create: `packages/core/src/policy/golden-scenario.test.ts`

- [ ] **Step 1: Write the golden scenario test**

Create `packages/core/src/policy/golden-scenario.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { evaluatePolicy } from './evaluate';

/**
 * Reproduces PROVIDER_ARCHITECTURE.md §11's worked example as a regression anchor: an RLS
 * USING(true) finding and a failed tsc compile should block, with required coverage satisfied
 * (so the decision is 'fail', never 'insufficient_coverage').
 */
describe('golden scenario: PROVIDER_ARCHITECTURE.md §11', () => {
  const findings: PolicyFinding[] = [
    {
      schemaVersion: '0.0.0',
      id: 'find_authz',
      fingerprint: 'fp_authz_001',
      rule: { id: 'SR-AUTHZ-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'authorization',
      severity: 'high',
      confidence: 'firm',
      message: 'Authenticated but not authorized',
      locations: [{ repoRelPath: 'app/api/orders/route.ts', lineStart: 12 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 2,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_rls',
      fingerprint: 'fp_rls_002',
      rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
      category: 'database',
      severity: 'high',
      confidence: 'firm',
      message: 'RLS enabled but policy is permissive',
      locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
      evidence: { facts: { policy: 'USING (true)' } },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_ts',
      fingerprint: 'fp_ts_002',
      rule: { id: 'SR-TS-002', mapped: true, catalogVersion: '2026.08.0' },
      category: 'typescript',
      severity: 'medium',
      confidence: 'certain',
      message: 'TypeScript compile failed',
      locations: [{ repoRelPath: 'app/api/orders/route.ts', lineStart: 1 }],
      evidence: { facts: { exitCode: 2 } },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_dep',
      fingerprint: 'fp_dep_003',
      rule: { id: 'SR-DEP-003', mapped: true, catalogVersion: '2026.08.0' },
      category: 'dependencies',
      severity: 'high',
      confidence: 'certain',
      message: 'Known-vulnerable dependency',
      locations: [{ repoRelPath: 'package.json', lineStart: 1 }],
      evidence: { facts: { cve: 'CVE-2026-0001' } },
      status: 'open',
      corroborationCount: 1,
    },
  ];

  const coverage: CoverageReport = {
    cells: [
      {
        language: 'ts',
        category: 'authorization',
        analysisKind: 'taint',
        covered: true,
        byProviders: ['semgrep', 'native-authz'],
        executedRuleCount: 6,
      },
      {
        language: 'sql',
        category: 'database',
        analysisKind: 'lexical',
        covered: true,
        byProviders: ['native-sql'],
        executedRuleCount: 3,
      },
      {
        language: 'ts',
        category: 'dependencies',
        analysisKind: 'sca',
        covered: true,
        byProviders: ['trivy'],
        executedRuleCount: 12,
      },
    ],
  };

  const policy: Policy = {
    apiVersion: 'shipready.dev/policy/v1',
    version: '2026.08.0',
    name: 'Default — AI app readiness',
    requiredCoverage: [
      { language: 'ts', categories: ['authorization'], minAnalysisKind: 'taint' },
      { language: 'sql', categories: ['database'] },
    ],
    controls: [
      {
        id: 'NO-DATA-EXPOSURE',
        description: 'No open data-exposure finding at High or Critical severity',
        match: { category: 'database', status: 'open', minSeverity: 'high' },
        forbid: 'any',
      },
      {
        id: 'TYPES-COMPILE',
        description: 'TypeScript must compile',
        match: { rule: 'SR-TS-002', status: 'open' },
        forbid: 'any',
      },
    ],
    gate: {
      failIf: { controlFailed: ['NO-DATA-EXPOSURE', 'TYPES-COMPILE'] },
      atRiskIf: { open: { severity: 'high', status: 'open' } },
    },
  };

  it('blocks on NO-DATA-EXPOSURE and TYPES-COMPILE with sufficient coverage', () => {
    const result = evaluatePolicy(
      findings,
      coverage,
      policy,
      new Date('2026-08-07T00:00:00.000Z'),
    );

    expect(result.verdict.decision).toBe('fail');
    expect(result.verdict.tier).toBe('blocked');

    const byId = new Map(result.controls.map((c) => [c.id, c]));
    expect(byId.get('NO-DATA-EXPOSURE')).toEqual({
      id: 'NO-DATA-EXPOSURE',
      passed: false,
      matched: ['fp_rls_002'],
    });
    expect(byId.get('TYPES-COMPILE')).toEqual({
      id: 'TYPES-COMPILE',
      passed: false,
      matched: ['fp_ts_002'],
    });

    // Required coverage was satisfied — this must never read as insufficient_coverage.
    expect(result.verdict.decision).not.toBe('insufficient_coverage');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/golden-scenario.test.ts`
Expected: PASS (1 test). This is a pure integration check over already-implemented code (Tasks 1-5), so no
RED step is expected here — it should pass immediately. If it fails, that's a real bug in Tasks 1-5's logic
surfaced by an end-to-end scenario a unit test missed; fix the root cause in `evaluate.ts`/`controls.ts`,
not the test.

- [ ] **Step 3: Commit the golden scenario**

```bash
git add packages/core/src/policy/golden-scenario.test.ts
git commit -m "test(core): add golden scenario regression test (PROVIDER_ARCHITECTURE.md §11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Format check**

Run: `pnpm exec biome check .`
Expected: no errors. If it reports diffs, run `pnpm exec biome check . --write`, review the diff, re-run to
confirm clean.

- [ ] **Step 5: Full CI script**

Run: `pnpm run ci` (from repo root)
Expected: all green — `@shipready/schema` and `@shipready/core` both pass lint/typecheck/build/test, and
`apps/web`'s build/test are unaffected (this sprint touches neither).

- [ ] **Step 6: Dependency-cruiser layering check**

Run: `pnpm run depcruise`
Expected: `no dependency violations found`. This is the real test of whether `respect-core-barrel` holds
now that `packages/core/src/policy/{waivers,controls,coverage}.ts` exist as genuine internal files:
`evaluate.ts` importing them is fine (same-directory-tree); nothing outside `packages/core/src` may import
them directly.

- [ ] **Step 7: Confirm the barrel rule actually still protects the new internals**

Temporarily prove `respect-core-barrel` catches a deep import into the new files, then revert:

```bash
cp packages/cli/src/index.ts /tmp/cli-index-backup.ts
printf '\nimport { evaluateControl } from "../../core/src/policy/controls";\nexport { evaluateControl as leaked };\n' >> packages/cli/src/index.ts
pnpm run depcruise
```

Expected: `error respect-core-barrel: packages/cli/src/index.ts → packages/core/src/policy/controls.ts`.
Then revert:

```bash
cp /tmp/cli-index-backup.ts packages/cli/src/index.ts
rm /tmp/cli-index-backup.ts
pnpm run depcruise
```

Expected: clean again, `git status` shows no changes to `packages/cli/src/index.ts`.

- [ ] **Step 8: Dependency audit**

Run: `pnpm audit --audit-level=high`
Expected: `No known vulnerabilities found` (no new dependencies added this sprint).

- [ ] **Step 9: Confirm no placeholder markers were left behind**

Run: `grep -rn "TODO\|FIXME\|not implemented" packages/schema/src packages/core/src`
Expected: no output.

- [ ] **Step 10: Final verification commit (if Steps 4-9 required any fixes)**

If any step required a fix (e.g. a Biome auto-format), stage and commit it:

```bash
git add -A
git commit -m "chore: fix formatting after full-repo verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no fixes were needed, this task produces no additional commit beyond Step 3 — Tasks 1-5 already left the
repo green.
