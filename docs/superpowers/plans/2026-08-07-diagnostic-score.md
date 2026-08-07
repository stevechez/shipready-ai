# Diagnostic Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `computeScore()` — the `SCORING.md` §4 diagnostic score, wired into `evaluatePolicy()` —
per `docs/superpowers/specs/2026-08-07-diagnostic-score-design.md`. Purely additive; never influences
`decision`/`tier`.

**Architecture:** One schema addition (`Policy.scoring` config), one new internal file
(`packages/core/src/policy/scoring.ts`, a sibling to Sprint 2's `waivers.ts`/`controls.ts`/`coverage.ts`),
and a small `evaluate.ts` wiring change.

**Tech Stack:** TypeScript (strict), Zod 3.25, Vitest 3.2, Biome, tsup, pnpm workspaces + Turborepo —
unchanged from Sprints 1-2.

## Global Constraints

- Score computation operates on **waived-excluded (`active`) findings**, not the raw input — waivers
  suppress a finding's impact on both the gate (Sprint 2) and the score (this sprint), consistently.
  `computeScore` itself further filters to `status: 'open'` findings internally.
- `ruleWeightFactor` is always `1.0` this sprint — no catalog exists, no per-rule override surface is
  built (design spec §4).
- A category is "applicable" (contributes to the weighted average) iff it appears in `coverage.cells`,
  regardless of `covered: true/false`. If `coverage.cells` is empty, **all 11 categories are applicable**
  (fallback — avoids divide-by-zero and matches every existing Sprint 1/2 test fixture's `{ cells: [] }`).
- Diminishing returns: group open findings by `category`, then by `rule.id` within category, sort each
  group by `fingerprint` ascending, assign decay position by that sorted order — guarantees the same
  finding set produces the same score regardless of input array order.
- Decay lookup: `[1, 0.7, 0.5, 0.4]` for the 1st–4th occurrence (0-indexed: `DECAY[0..3]`), `0.3` for the
  5th and every later occurrence.
- `SEVERITY_POINTS = { critical: 40, high: 20, medium: 8, low: 3, info: 0 }`.
- `CONFIDENCE_FACTOR = { certain: 1.0, firm: 1.0, tentative: 0.4 }`.
- `DEFAULT_WEIGHTS` (sums to 100): `authorization: 18, database: 18, security: 16, authentication: 12,
  api: 10, typescript: 8, configuration: 6, dependencies: 5, architecture: 3, performance: 2,
  accessibility: 2`.
- `policy.scoring?.enabled === false` → `computeScore` returns `undefined`; `evaluate.ts` must **omit**
  the `score` key entirely on that path (not assign `undefined`), matching Sprint 2's established pattern.
- `Policy.scoring` is optional and additive — existing `Policy` objects without it keep working; default
  behavior when `scoring` is omitted entirely is "enabled, no weight overrides."
- TypeScript strict flags apply (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `isolatedModules`). Biome style: single quotes, semicolons, trailing commas
  `all`, 2-space indent, 100-col width.
- `packages/core/src/policy/scoring.ts` is internal — only `evaluate.ts` may import it; nothing outside
  `packages/core/src` may reach it (enforced by the existing `respect-core-barrel` dependency-cruiser
  rule — no rule change needed).
- After every task: `pnpm --filter @shipready/schema` and/or `pnpm --filter @shipready/core`
  lint/typecheck/build/test (whichever package the task touches) must pass. The final task runs the
  full repo-wide gate.

---

### Task 1: `Policy.scoring` schema field

**Files:**
- Modify: `packages/schema/src/policy.ts` (add `ScoringConfigSchema`, add `scoring` field to `PolicySchema`)
- Modify: `packages/schema/src/policy.test.ts` (add tests; no existing test needs to change — `scoring` is
  a new optional field)

**Interfaces:**
- Produces (used by Task 2): `ScoringConfigSchema`/`ScoringConfig`. `PolicySchema`/`Policy` gains an
  optional `scoring: ScoringConfig` field.
- Consumes: `CategorySchema` (already imported in this file from Sprint 1).

- [ ] **Step 1: Write the failing test**

Add to `packages/schema/src/policy.test.ts` (inside the existing `describe('policy.ts', ...)` block, after
the existing `'parses a valid Policy profile...'` test):

```ts
  it('parses a Policy with a scoring config (enabled + weight overrides)', () => {
    const withScoring = {
      ...validPolicy,
      scoring: {
        enabled: true,
        overrides: { weights: { database: 25, authorization: 25 } },
      },
    };
    const parsed = PolicySchema.parse(withScoring);
    expect(parsed.scoring?.enabled).toBe(true);
    expect(parsed.scoring?.overrides?.weights?.database).toBe(25);
  });

  it('parses a Policy with scoring disabled and no overrides', () => {
    const withScoring = { ...validPolicy, scoring: { enabled: false } };
    const parsed = PolicySchema.parse(withScoring);
    expect(parsed.scoring?.enabled).toBe(false);
    expect(parsed.scoring?.overrides).toBeUndefined();
  });

  it('parses a Policy with scoring entirely omitted (backward compatible with Sprint 2)', () => {
    const parsed = PolicySchema.parse(validPolicy);
    expect(parsed.scoring).toBeUndefined();
  });

  it('rejects a scoring override weight for an unknown category', () => {
    const bad = {
      ...validPolicy,
      scoring: { overrides: { weights: { 'not-a-real-category': 10 } } },
    };
    expect(() => PolicySchema.parse(bad)).toThrow();
  });
```

Also add this import to the top of the same test file (extend the existing `import { ... } from './policy'`
line with `ScoringConfigSchema`):

```ts
import {
  ControlSchema,
  GateSchema,
  PolicyEvaluationInputSchema,
  PolicyFindingSchema,
  PolicyResultSchema,
  PolicySchema,
  ScoringConfigSchema,
} from './policy';
```

And one direct unit test for `ScoringConfigSchema` itself, added near the `ControlSchema`/`GateSchema`
tests:

```ts
  it('parses an empty scoring config (all fields optional)', () => {
    expect(ScoringConfigSchema.parse({})).toEqual({});
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/schema exec vitest run src/policy.test.ts`
Expected: FAIL — `ScoringConfigSchema` doesn't exist yet; `PolicySchema.parse` with a `scoring` key
currently succeeds anyway (Zod strips unknown keys by default, so the "omitted" test would pass
accidentally, but the override/disabled tests checking `parsed.scoring?.enabled` will fail since the field
isn't retained) and the "rejects... unknown category" test fails because there's no `scoring` field to
validate against at all.

- [ ] **Step 3: Write the implementation**

In `packages/schema/src/policy.ts`, add this new schema after `SeverityOverrideSchema` and before
`PolicySchema`:

```ts
/**
 * Per-org override/disable knob for the diagnostic score (SCORING.md's status note: the score
 * must be "override-able or disable-able per org"). Category weight overrides only — no
 * per-rule catalog-driven weight overrides yet (no catalog service exists; see
 * docs/superpowers/specs/2026-08-07-diagnostic-score-design.md §4).
 */
export const ScoringConfigSchema = z.object({
  enabled: z.boolean().optional(),
  overrides: z
    .object({
      weights: z.record(CategorySchema, z.number()).optional(),
    })
    .optional(),
});
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
```

Then add `scoring: ScoringConfigSchema.optional(),` to `PolicySchema`, positioned between `gate` and
`severityOverrides` (matching `PROVIDER_ARCHITECTURE.md` §5.1's YAML field order):

```ts
export const PolicySchema = z.object({
  apiVersion: z.string(),
  version: z.string(),
  name: z.string(),
  requiredCoverage: z.array(RequiredCoverageEntrySchema).optional(),
  controls: z.array(ControlSchema),
  gate: GateSchema,
  scoring: ScoringConfigSchema.optional(),
  severityOverrides: z.array(SeverityOverrideSchema).optional(),
  waivers: z.array(WaivedFindingSchema).optional(),
});
export type Policy = z.infer<typeof PolicySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/schema exec vitest run src/policy.test.ts`
Expected: PASS (16 tests: 11 from Sprint 2 + 5 new).

- [ ] **Step 5: Full package verification**

Run: `pnpm --filter @shipready/schema lint && pnpm --filter @shipready/schema typecheck && pnpm --filter @shipready/schema build && pnpm --filter @shipready/schema test`
Expected: all succeed. Full schema suite should be 51 tests (46 from Sprint 2 + 5 new), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/policy.ts packages/schema/src/policy.test.ts
git commit -m "feat(schema): add Policy.scoring config (enable/disable, weight overrides)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core/src/policy/scoring.ts`

**Files:**
- Create: `packages/core/src/policy/scoring.ts`
- Create: `packages/core/src/policy/scoring.test.ts`

**Interfaces:**
- Consumes: `Category`, `CoverageReport`, `Policy`, `PolicyFinding`, `PolicyScore` types from
  `@shipready/schema` (Task 1 for `Policy.scoring`; the rest already exist from Sprints 1-2).
- Produces (used by Task 3): `computeScore(findings, coverage, policy): PolicyScore | undefined`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/policy/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { computeScore } from './scoring';

function makeFinding(overrides: Partial<PolicyFinding> = {}): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: 'find_01',
    fingerprint: 'fp_a',
    rule: { id: 'SR-RLS-001', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'critical',
    confidence: 'certain',
    message: 'Table created without RLS enabled',
    locations: [{ repoRelPath: 'supabase/migrations/0001_init.sql', lineStart: 1 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 1,
    ...overrides,
  };
}

const minimalPolicy: Policy = {
  apiVersion: 'shipready.dev/policy/v1',
  version: '2026.08.0',
  name: 'Default — AI app readiness',
  controls: [],
  gate: { failIf: { controlFailed: [] } },
};

function coverageFor(categories: string[]): CoverageReport {
  return {
    cells: categories.map((category) => ({
      language: 'ts',
      category: category as CoverageReport['cells'][number]['category'],
      analysisKind: 'lexical',
      covered: true,
      byProviders: ['test'],
      executedRuleCount: 1,
    })),
  };
}

describe('computeScore', () => {
  it('returns 100 with no findings and empty coverage (all categories applicable, no penalties)', () => {
    const result = computeScore([], { cells: [] }, minimalPolicy);
    expect(result?.value).toBe(100);
  });

  it('applies severityPoints * confidenceFactor as the base penalty', () => {
    const finding = makeFinding({ severity: 'critical', confidence: 'certain' });
    const result = computeScore([finding], coverageFor(['database']), minimalPolicy);
    expect(result?.breakdown.database).toBe(60); // 100 - 40*1.0
  });

  it('dampens tentative confidence to 0.4', () => {
    const finding = makeFinding({ severity: 'critical', confidence: 'tentative' });
    const result = computeScore([finding], coverageFor(['database']), minimalPolicy);
    expect(result?.breakdown.database).toBe(84); // 100 - 40*0.4
  });

  it('applies diminishing returns for repeated rule findings, sorted by fingerprint regardless of input order', () => {
    const first = makeFinding({
      fingerprint: 'fp_1',
      category: 'api',
      severity: 'high',
      rule: { id: 'SR-API-001', mapped: true, catalogVersion: '2026.08.0' },
    });
    const second = makeFinding({
      fingerprint: 'fp_2',
      category: 'api',
      severity: 'high',
      rule: { id: 'SR-API-001', mapped: true, catalogVersion: '2026.08.0' },
    });
    const result = computeScore([second, first], coverageFor(['api']), minimalPolicy); // deliberately reversed
    expect(result?.breakdown.api).toBe(66); // 100 - (20*1 + 20*0.7)
  });

  it('floors decay at 0.3 for the 5th and later occurrence', () => {
    const findings = Array.from({ length: 6 }, (_, i) =>
      makeFinding({
        fingerprint: `fp_${i}`,
        category: 'accessibility',
        severity: 'low',
        rule: { id: 'SR-A11Y-001', mapped: true, catalogVersion: '2026.08.0' },
      }),
    );
    const result = computeScore(findings, coverageFor(['accessibility']), minimalPolicy);
    // decay: 1, 0.7, 0.5, 0.4, 0.3, 0.3 -> sum 3.2; penalty = 3 * 3.2 = 9.6
    expect(result?.breakdown.accessibility).toBeCloseTo(90.4);
  });

  it('excludes non-open findings from the score', () => {
    const finding = makeFinding({ status: 'fixed', severity: 'critical' });
    const result = computeScore([finding], coverageFor(['database']), minimalPolicy);
    expect(result?.breakdown.database).toBe(100);
  });

  it('only includes categories present in coverage.cells', () => {
    const finding = makeFinding({ category: 'database' });
    const result = computeScore([finding], coverageFor(['database', 'api']), minimalPolicy);
    expect(Object.keys(result?.breakdown ?? {}).sort()).toEqual(['api', 'database']);
  });

  it('falls back to all 11 categories applicable when coverage.cells is empty', () => {
    const finding = makeFinding({ category: 'database' });
    const result = computeScore([finding], { cells: [] }, minimalPolicy);
    expect(Object.keys(result?.breakdown ?? {})).toHaveLength(11);
  });

  it('renormalizes weight over only the applicable categories', () => {
    const finding = makeFinding({ category: 'database', severity: 'critical', confidence: 'certain' });
    const result = computeScore([finding], coverageFor(['database']), minimalPolicy);
    // database is the only applicable category, so its subscore IS the overall value
    expect(result?.value).toBe(60);
  });

  it('applies a category weight override from policy.scoring.overrides.weights', () => {
    const finding = makeFinding({ category: 'database', severity: 'critical', confidence: 'certain' });
    const policyWithOverride: Policy = {
      ...minimalPolicy,
      scoring: { overrides: { weights: { database: 100, api: 0 } } },
    };
    const result = computeScore([finding], coverageFor(['database', 'api']), policyWithOverride);
    // database subscore 60 at weight 100, api subscore 100 at weight 0 -> (60*100+100*0)/100 = 60
    expect(result?.value).toBe(60);
  });

  it('returns undefined when scoring is explicitly disabled', () => {
    const policyDisabled: Policy = { ...minimalPolicy, scoring: { enabled: false } };
    const result = computeScore([makeFinding()], coverageFor(['database']), policyDisabled);
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/scoring.test.ts`
Expected: FAIL — `Cannot find module './scoring'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/policy/scoring.ts`:

```ts
import type { Category, CoverageReport, Policy, PolicyFinding, PolicyScore } from '@shipready/schema';

const SEVERITY_POINTS: Record<PolicyFinding['severity'], number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
};

const CONFIDENCE_FACTOR: Record<PolicyFinding['confidence'], number> = {
  certain: 1.0,
  firm: 1.0,
  tentative: 0.4,
};

const DECAY = [1, 0.7, 0.5, 0.4];
const DECAY_FLOOR = 0.3;

function decayFactor(occurrenceIndex: number): number {
  return DECAY[occurrenceIndex] ?? DECAY_FLOOR;
}

const DEFAULT_WEIGHTS: Record<Category, number> = {
  authorization: 18,
  database: 18,
  security: 16,
  authentication: 12,
  api: 10,
  typescript: 8,
  configuration: 6,
  dependencies: 5,
  architecture: 3,
  performance: 2,
  accessibility: 2,
};

const ALL_CATEGORIES = Object.keys(DEFAULT_WEIGHTS) as Category[];

/**
 * A category is applicable (contributes to the weighted average) iff some provider attempted it
 * for this scan — i.e. it appears anywhere in the coverage matrix, covered or not. Empty
 * coverage means no signal exists to determine applicability from, so every category is treated
 * as applicable rather than dividing by zero (docs/superpowers/specs/2026-08-07-diagnostic-score-design.md §4).
 */
function determineApplicableCategories(coverage: CoverageReport): Set<Category> {
  if (coverage.cells.length === 0) {
    return new Set(ALL_CATEGORIES);
  }
  return new Set(coverage.cells.map((cell) => cell.category));
}

/** Groups findings (already filtered to one category) by rule id, sorted by fingerprint within
 * each group — deterministic diminishing-returns ordering regardless of input array order. */
function groupForDecay(findings: PolicyFinding[]): Map<string, PolicyFinding[]> {
  const groups = new Map<string, PolicyFinding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.rule.id);
    if (group) {
      group.push(finding);
    } else {
      groups.set(finding.rule.id, [finding]);
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  }
  return groups;
}

function penaltyFor(finding: PolicyFinding, occurrenceIndex: number): number {
  return (
    SEVERITY_POINTS[finding.severity] * CONFIDENCE_FACTOR[finding.confidence] * decayFactor(occurrenceIndex)
  );
}

function subscoreFor(category: Category, openFindings: PolicyFinding[]): number {
  const categoryFindings = openFindings.filter((finding) => finding.category === category);
  const groups = groupForDecay(categoryFindings);

  let totalPenalty = 0;
  for (const group of groups.values()) {
    group.forEach((finding, index) => {
      totalPenalty += penaltyFor(finding, index);
    });
  }

  return Math.min(100, Math.max(0, 100 - totalPenalty));
}

/**
 * The SCORING.md §4 diagnostic score: a weighted average of per-category subscores over only
 * the categories applicable to this scan. Purely additive — never read by evaluatePolicy's
 * decision/tier logic (ADR-003). `findings` should already be waiver-filtered (`active`, not the
 * raw input) by the caller; this function further filters to `status: 'open'` internally.
 */
export function computeScore(
  findings: PolicyFinding[],
  coverage: CoverageReport,
  policy: Policy,
): PolicyScore | undefined {
  if (policy.scoring?.enabled === false) {
    return undefined;
  }

  const applicableCategories = determineApplicableCategories(coverage);
  const openFindings = findings.filter((finding) => finding.status === 'open');
  const weightOverrides = policy.scoring?.overrides?.weights ?? {};

  const breakdown: Partial<Record<Category, number>> = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const category of applicableCategories) {
    const subscore = subscoreFor(category, openFindings);
    const weight = weightOverrides[category] ?? DEFAULT_WEIGHTS[category];
    breakdown[category] = subscore;
    weightedSum += subscore * weight;
    totalWeight += weight;
  }

  const value = totalWeight === 0 ? 100 : Math.round(weightedSum / totalWeight);

  return { value, breakdown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/scoring.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/policy/scoring.ts packages/core/src/policy/scoring.test.ts
git commit -m "feat(core): implement computeScore — the SCORING.md diagnostic score

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire `computeScore` into `evaluate.ts`

**Files:**
- Modify: `packages/core/src/policy/evaluate.ts`
- Modify: `packages/core/src/policy/evaluate.test.ts`

**Interfaces:**
- Consumes: `computeScore` from `./scoring` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/policy/evaluate.test.ts`, first **replace** the existing test at (current) lines
119-125 — its "leaves score undefined" assumption no longer holds now that scoring is real — with a
version that explicitly disables scoring to preserve its original, narrower intent (testing
`catalogVersion` derivation in isolation):

Old:
```ts
  it('derives catalogVersion from the first finding and leaves score undefined', () => {
    const finding = makeFinding({ category: 'security' });
    const policy: Policy = { ...basePolicy, controls: [] };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.catalogVersion).toBe('2026.08.0');
    expect(result.score).toBeUndefined();
  });
```

New:
```ts
  it('derives catalogVersion from the first finding regardless of scoring', () => {
    const finding = makeFinding({ category: 'security' });
    const policy: Policy = { ...basePolicy, controls: [], scoring: { enabled: false } };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.catalogVersion).toBe('2026.08.0');
    expect(result.score).toBeUndefined();
  });
```

Then add two new tests at the end of the same `describe('evaluatePolicy', ...)` block, before the closing
`});`:

```ts
  it('populates score end-to-end when scoring is enabled (the default)', () => {
    const finding = makeFinding({ category: 'security', severity: 'medium', confidence: 'certain' });
    const policy: Policy = { ...basePolicy, controls: [] };
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'security',
          analysisKind: 'lexical',
          covered: true,
          byProviders: ['test'],
          executedRuleCount: 1,
        },
      ],
    };
    const result = evaluatePolicy([finding], coverage, policy, NOW);
    expect(result.score).toBeDefined();
    expect(result.score?.breakdown.security).toBe(92); // 100 - 8*1.0 (medium, certain)
  });

  it('never lets a low score affect decision or tier', () => {
    const manyFindings = Array.from({ length: 10 }, (_, i) =>
      makeFinding({
        fingerprint: `fp_${i}`,
        category: 'performance',
        severity: 'critical',
        confidence: 'certain',
        rule: { id: 'SR-PERF-001', mapped: true, catalogVersion: '2026.08.0' },
      }),
    );
    const policy: Policy = { ...basePolicy, controls: [], gate: { failIf: { controlFailed: [] } } };
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'performance',
          analysisKind: 'lexical',
          covered: true,
          byProviders: ['test'],
          executedRuleCount: 1,
        },
      ],
    };
    const result = evaluatePolicy(manyFindings, coverage, policy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.verdict.tier).toBe('ready');
    expect(result.score?.value).toBeLessThan(10);
  });

  it('excludes a waived finding from the score, not just the gate', () => {
    const finding = makeFinding({ category: 'security', severity: 'critical', confidence: 'certain' });
    const policy: Policy = {
      ...basePolicy,
      controls: [],
      waivers: [
        {
          fingerprint: 'fp_abc123',
          reason: 'vendored fixture',
          approvedBy: 'u_123',
          expires: '2026-12-31T00:00:00.000Z',
        },
      ],
    };
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'security',
          analysisKind: 'lexical',
          covered: true,
          byProviders: ['test'],
          executedRuleCount: 1,
        },
      ],
    };
    const result = evaluatePolicy([finding], coverage, policy, NOW);
    expect(result.score?.breakdown.security).toBe(100); // waived finding contributes no penalty
  });
```

Also add `CoverageReport` to the existing type-only import at the top of the file if not already present
(check first — it already is, from Sprint 2: `import type { CoverageReport, Policy, PolicyFinding } from
'@shipready/schema';`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/evaluate.test.ts`
Expected: FAIL — the replaced test still passes (it's a valid assertion regardless), but the three new
tests fail: `computeScore` isn't called yet, so `result.score` is always `undefined`, failing
`toBeDefined()` and the specific breakdown-value assertions.

- [ ] **Step 3: Write the implementation**

Modify `packages/core/src/policy/evaluate.ts`. Update the import block at the top:

```ts
import type {
  CoverageReport,
  Policy,
  PolicyFinding,
  PolicyResult,
  Verdict,
} from '@shipready/schema';
import { evaluateControl } from './controls';
import { findUnmetCoverage } from './coverage';
import { computeScore } from './scoring';
import { applyWaivers } from './waivers';
```

Update the JSDoc above `evaluatePolicy` (remove the now-outdated "Scoring is deliberately not computed
here" sentence) and the function body's return statement:

Old JSDoc:
```ts
/**
 * The deterministic policy pass (PROVIDER_ARCHITECTURE.md §5.2): controls -> gate -> verdict.
 * Scoring is deliberately not computed here (ADR-003; PolicyResult.score stays undefined) —
 * that's a later sprint. `now` defaults to the real clock but can be pinned for deterministic
 * testing of waiver expiry, a documented deviation from §5.2's literal 3-arg signature.
 */
```

New JSDoc:
```ts
/**
 * The deterministic policy pass (PROVIDER_ARCHITECTURE.md §5.2): controls -> gate -> verdict,
 * plus the SCORING.md §4 diagnostic score. The score never influences decision/tier (ADR-003) —
 * it's computed independently and only conditionally attached to the result. `now` defaults to
 * the real clock but can be pinned for deterministic testing of waiver expiry, a documented
 * deviation from §5.2's literal 3-arg signature.
 */
```

Old return statement (the final block of the function):
```ts
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
```

New return statement:
```ts
  const score = computeScore(active, coverage, policy);

  return {
    verdict: {
      decision,
      tier,
      reasons,
      evaluatedAt: now.toISOString(),
    },
    controls,
    ...(score !== undefined ? { score } : {}),
    coverage,
    waived,
    policyVersion: policy.version,
    catalogVersion: findings[0]?.rule.catalogVersion ?? '',
  };
}
```

Note: `computeScore` is called with `active` (the waiver-filtered list already in scope from
`applyWaivers`), not `findings` — waivers must exclude a finding from the score exactly as they exclude it
from the gate. `catalogVersion` still derives from the original `findings` param, unchanged from Sprint 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/evaluate.test.ts`
Expected: PASS (12 tests: 9 from Sprint 2, minus the 1 replaced — same count — plus 3 new = 12).

- [ ] **Step 5: Package verification**

Run: `pnpm --filter @shipready/core lint && pnpm --filter @shipready/core typecheck && pnpm --filter @shipready/core build && pnpm --filter @shipready/core test`
Expected: all succeed. Full core suite: 2 (index) + 4 (waivers) + 7 (controls) + 5 (coverage) + 12
(evaluate) + 1 (golden-scenario, Sprint 2) + 11 (scoring, Task 2) = 42 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/policy/evaluate.ts packages/core/src/policy/evaluate.test.ts
git commit -m "feat(core): wire computeScore into evaluatePolicy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Worked-example golden test + full-repo verification

**Files:**
- Create: `packages/core/src/policy/scoring-golden-scenario.test.ts`

- [ ] **Step 1: Write the golden scenario test**

Create `packages/core/src/policy/scoring-golden-scenario.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { computeScore } from './scoring';

/**
 * Reproduces SCORING.md §5's worked example as a regression anchor. The doc's prose says
 * "~90" (an approximation); this test asserts the exact deterministic value our formula
 * produces from the doc's own per-category arithmetic (60, 66, 97, all others 100), which is
 * 89 — the doc's "~90" and our exact 89 are consistent with each other, not a contradiction.
 */
describe('golden scenario: SCORING.md §5 worked example', () => {
  const findings: PolicyFinding[] = [
    {
      schemaVersion: '0.0.0',
      id: 'find_rls',
      fingerprint: 'fp_rls_001',
      rule: { id: 'SR-RLS-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'database',
      severity: 'critical',
      confidence: 'certain',
      message: 'Table created without RLS enabled',
      locations: [{ repoRelPath: 'supabase/migrations/0001_init.sql', lineStart: 1 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_api_1',
      fingerprint: 'fp_api_001a',
      rule: { id: 'SR-API-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'api',
      severity: 'high',
      confidence: 'firm',
      message: 'Request body used without schema validation',
      locations: [{ repoRelPath: 'app/api/orders/route.ts', lineStart: 5 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_api_2',
      fingerprint: 'fp_api_001b',
      rule: { id: 'SR-API-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'api',
      severity: 'high',
      confidence: 'firm',
      message: 'Request body used without schema validation',
      locations: [{ repoRelPath: 'app/api/users/route.ts', lineStart: 8 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_a11y',
      fingerprint: 'fp_a11y_001',
      rule: { id: 'SR-A11Y-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'accessibility',
      severity: 'low',
      confidence: 'firm',
      message: 'Image missing alt text',
      locations: [{ repoRelPath: 'app/page.tsx', lineStart: 20 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 1,
    },
  ];

  // Every category applicable (full default weight table), matching "all other applicable
  // categories: 100" in the doc's worked example.
  const coverage: CoverageReport = {
    cells: [
      'authorization',
      'database',
      'security',
      'authentication',
      'api',
      'typescript',
      'configuration',
      'dependencies',
      'architecture',
      'performance',
      'accessibility',
    ].map((category) => ({
      language: 'ts',
      category: category as CoverageReport['cells'][number]['category'],
      analysisKind: 'lexical',
      covered: true,
      byProviders: ['test'],
      executedRuleCount: 1,
    })),
  };

  const policy: Policy = {
    apiVersion: 'shipready.dev/policy/v1',
    version: '2026.08.0',
    name: 'Default — AI app readiness',
    controls: [],
    gate: { failIf: { controlFailed: [] } },
  };

  it('reproduces the exact per-category subscores and overall value', () => {
    const result = computeScore(findings, coverage, policy);

    expect(result?.breakdown.database).toBe(60);
    expect(result?.breakdown.api).toBe(66);
    expect(result?.breakdown.accessibility).toBe(97);
    expect(result?.breakdown.authorization).toBe(100);
    expect(result?.breakdown.security).toBe(100);
    expect(result?.value).toBe(89);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @shipready/core exec vitest run src/policy/scoring-golden-scenario.test.ts`
Expected: PASS (1 test). This is an integration check over already-implemented code (Task 2) — it should
pass immediately. If the computed `value` doesn't come out to `89`, work through §4's algorithm by hand
against the four findings above before assuming the test's expected number is wrong — the arithmetic is
fully worked out in this plan's Global Constraints and Task 2 sections.

- [ ] **Step 3: Commit the golden scenario**

```bash
git add packages/core/src/policy/scoring-golden-scenario.test.ts
git commit -m "test(core): add scoring golden scenario (SCORING.md §5 worked example)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Format check**

Run: `pnpm exec biome check .`
Expected: no errors. If it reports diffs, run `pnpm exec biome check . --write`, review the diff, re-run
to confirm clean.

- [ ] **Step 5: Full CI script**

Run: `pnpm run ci` (from repo root)
Expected: all green — `@shipready/schema` (51 tests) and `@shipready/core` (43 tests: 42 from Task 3 + 1
golden scenario) both pass lint/typecheck/build/test; `apps/web`/`@shipready/cli` unaffected (this sprint
touches neither).

- [ ] **Step 6: Dependency-cruiser layering check**

Run: `pnpm run depcruise`
Expected: `no dependency violations found`. Confirms `respect-core-barrel` still holds with
`packages/core/src/policy/scoring.ts` as a new internal file — nothing outside `packages/core/src` may
import it directly.

- [ ] **Step 7: Dependency audit**

Run: `pnpm audit --audit-level=high`
Expected: `No known vulnerabilities found` (no new dependencies added this sprint).

- [ ] **Step 8: Confirm no placeholder markers were left behind**

Run: `grep -rn "TODO\|FIXME\|not implemented" packages/schema/src packages/core/src`
Expected: no output.

- [ ] **Step 9: Final verification commit (if Steps 4-8 required any fixes)**

If any step required a fix (e.g. a Biome auto-format), stage and commit it:

```bash
git add -A
git commit -m "chore: fix formatting after full-repo verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no fixes were needed, this task produces no additional commit beyond Step 3 — Tasks 1-3 already left
the repo green.
