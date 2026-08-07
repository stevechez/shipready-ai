# Design: Diagnostic Score (Sprint 3)

**Status:** Approved
**Date:** 2026-08-07
**Sprint:** 3
**Related:** ADR-003 (policy-as-code), `docs/SCORING.md`, `docs/PROVIDER_ARCHITECTURE.md` §5.1/§5.3,
`docs/superpowers/specs/2026-08-07-policy-engine-design.md` (Sprint 2)

## 1. Mission

Sprint 2 built the gate (controls → decision → tier) and deliberately left `PolicyResult.score` unset,
flagging scoring as the natural next slice once the gate was proven. Sprint 3 builds that slice:
`SCORING.md`'s 0–100 diagnostic score, computed as part of `evaluatePolicy()`.

This is **purely additive**. Per ADR-003 and `SCORING.md`'s own status note ("the authoritative verdict is
the policy gate, not the score"), the score must never influence `decision` or `tier` — it already can't,
structurally, since `verdict` is computed independently of `score` in Sprint 2's `evaluate.ts`. `SCORING.md`
§3's gate pseudocode is explicitly superseded by that same status note in favor of Sprint 2's control-based
gate; Sprint 3 does not touch gate logic at all.

## 2. New file: `packages/core/src/policy/scoring.ts`

Sibling to `waivers.ts`/`controls.ts`/`coverage.ts` (Sprint 2) — same internal-file pattern, protected by
the same `respect-core-barrel` dependency-cruiser rule. Only `evaluate.ts` imports it; it is not separately
re-exported from `packages/core/src/index.ts`.

```ts
function computeScore(
  findings: PolicyFinding[],
  coverage: CoverageReport,
  policy: Policy,
): PolicyScore | undefined
```

## 3. Schema addition: `Policy.scoring`

`SCORING.md`'s status note requires the score be *"override-able or disable-able per org."* Nothing in the
Sprint 2 `Policy` schema carries that. Adding, matching `PROVIDER_ARCHITECTURE.md` §5.1's YAML shape (minus
`profile`, since there's exactly one profile this sprint — no profile-selection mechanism exists):

```ts
ScoringConfig {
  enabled?: boolean;                                    // default true
  overrides?: { weights?: Partial<Record<Category, number>> };
}
```

Added to `PolicySchema` as `scoring?: ScoringConfig`. `PolicyScoreSchema`/`ScoreBreakdownSchema`
(Sprint 1) are **unchanged** — `ScoreBreakdownSchema`'s existing `z.record(CategorySchema, z.number())`
already infers `Partial<Record<Category, number>>`, which is exactly the shape needed for "inapplicable
categories are simply absent from the breakdown" (§6).

## 4. Real gaps found, with resolutions

`SCORING.md` assumes infrastructure (a rule catalog, a defined notion of category "applicability") that
doesn't exist yet in this repo. Four concrete gaps, each resolved rather than left ambiguous:

### `ruleWeightFactor`
Spec: "per-rule multiplier from the catalog (default `1.0`)." No catalog service exists (a later sprint
per `SPRINTS.md`), and `PROVIDER_ARCHITECTURE.md` §5.1's YAML example shows no per-rule override surface
(only `scoring.overrides.weights` at the category level). **Resolution: `ruleWeightFactor` is always `1.0`
this sprint.** No override hook is invented — same discipline Sprint 2 applied to `onlyDeterministic`
(accept the deferral, don't speculatively build a config surface nothing asks for yet).

### "Applicable categories" for renormalization
Spec: a project with no database "drops" `RLS/DB/SUP` weights and renormalizes the rest to 100, but never
defines how a category is determined applicable. **Resolution: a category is applicable iff it appears in
`coverage.cells` at all**, regardless of `covered: true/false` — a category some provider *attempted* still
counts; only a category no provider ever touched is inapplicable. This is the only signal already flowing
into `evaluatePolicy` that plausibly answers "does this category exist in this stack."

**Edge case:** if `coverage.cells` is empty — true of every existing Sprint 1/2 test fixture — there is no
signal to determine applicability from at all. Falling back to "no categories are applicable" would divide
by zero in the weighted-average step. **Resolution: when `coverage.cells` is empty, treat all 11 categories
as applicable** (use the full default weight table unmodified) rather than produce no score or crash.

### Diminishing-returns grouping and ordering
Spec: "the Nth identical-rule finding in a category counts at a decaying factor," with no stated tie-break
for what "Nth" means when the same finding set arrives in a different array order. `SCORING.md` §1 requires
`(findings, catalog_version) → score` be a pure function — "Same inputs, same output, forever" — which
"same inputs" naturally reads as *the same set*, not *the same array order*. **Resolution: group open
findings by `category`, then by `rule.id` within category, then sort each group by `fingerprint` before
assigning decay position 1, 2, 3, ….** Guarantees the same finding set produces the same score regardless
of input array order.

### Decay sequence beyond the four given terms
Spec: `1, 0.7, 0.5, 0.4, …`, "floored at `0.3`" — no closed form connects these four numbers (differences
are `-0.3, -0.2, -0.1`, not geometric or arithmetic). **Resolution: literal lookup table `[1, 0.7, 0.5,
0.4]` for the 1st–4th occurrence, floor `0.3` for the 5th and every occurrence after** — matches every
explicitly given number exactly; "floored at" read as "clamps there and stays," the simplest reading that
doesn't require guessing an unstated formula.

## 5. Algorithm

```ts
function computeScore(findings, coverage, policy):
  if policy.scoring?.enabled === false:
    return undefined

  applicableCategories =
    coverage.cells.length === 0
      ? ALL_CATEGORIES
      : new Set(coverage.cells.map(cell => cell.category))

  openFindings = findings.filter(f => f.status === 'open')
  groupedByCategoryThenRule = groupBy(openFindings, f => [f.category, f.rule.id])
  # within each (category, ruleId) group, sort by fingerprint, assign occurrence index 0,1,2,...

  for each applicable category:
    penalty(finding, occurrenceIndex) =
      SEVERITY_POINTS[finding.severity]
      * CONFIDENCE_FACTOR[finding.confidence]
      * 1.0                                    # ruleWeightFactor, always 1.0 this sprint
      * DECAY[occurrenceIndex]                 # DECAY = [1, 0.7, 0.5, 0.4], floor 0.3 beyond index 3
    subscore(category) = clamp(0, 100, 100 - sum(penalty(f, i) for f, i in category's findings))

  weight(category) = policy.scoring?.overrides?.weights?.[category] ?? DEFAULT_WEIGHTS[category]
  totalWeight = sum(weight(c) for c in applicableCategories)
  value = round(sum(subscore(c) * weight(c) for c in applicableCategories) / totalWeight)
  breakdown = { [c]: subscore(c) for c in applicableCategories }   # inapplicable categories absent

  return { value, breakdown }
```

`SEVERITY_POINTS = { critical: 40, high: 20, medium: 8, low: 3, info: 0 }`
`CONFIDENCE_FACTOR = { certain: 1.0, firm: 1.0, tentative: 0.4 }`
`DEFAULT_WEIGHTS` = the 11-category table in `SCORING.md` §4, summing to 100 exactly:
`authorization:18, database:18, security:16, authentication:12, api:10, typescript:8, configuration:6,
dependencies:5, architecture:3, performance:2, accessibility:2`.

Only **open** findings count toward the score (suppressed/false-positive/wontfix findings are excluded,
matching `SCORING.md` §3's gate exclusion — applied consistently to the score for the same reason:
"shown in the report; a scan that reaches Ready only via heavy suppression is flagged in the summary" is a
future report-engine concern, not this sprint's).

`evaluate.ts` calls `computeScore(findings, coverage, policy)` and assigns the result to `score` on the
returned `PolicyResult` only when it's not `undefined` — same omit-the-key discipline Sprint 2 already
established for the disabled case.

## 6. Worked-example regression test

`SCORING.md` §5's worked example becomes a golden fixture test, mirroring Sprint 2's §11 golden-scenario
pattern: one `SR-RLS-001` (Critical, Certain), two `SR-API-001` (High, Firm), one `SR-A11Y-001` (Low, Firm)
→ Database/RLS subscore `60`, API subscore `66`, A11Y subscore `97`, all other applicable categories `100`,
weighted average ≈ `90`. The doc's own worked example doesn't specify which categories are "applicable" for
this fixture — the test will supply `coverage.cells` covering every category the four findings' categories
belong to (`database`, `api`, `accessibility`) plus enough others to make the "all other categories: 100"
claim concrete rather than vacuous, and will assert the exact computed value lands in the doc's stated
"~90" range (documented as an approximation in the source, so the test asserts a tight range, not an exact
literal `90`, to avoid being a false regression trap if the true weighted computation lands at `89` or `91`).

## 7. Testing

Per-concern unit tests in `scoring.test.ts`: severity/confidence/weight multiplication, diminishing-returns
decay sequence and floor, applicable-category derivation (including the empty-coverage fallback), weight
renormalization over a subset of categories, `scoring.enabled: false` → `undefined`, category weight
overrides via `policy.scoring.overrides.weights`, suppressed/non-open findings excluded. Plus the §5
worked-example golden test (§6 above). Plus one `evaluate.test.ts` addition confirming `score` is populated
end-to-end and never influences `decision`/`tier` (construct a case where the score would be very low but
no control fails and coverage is sufficient — assert `decision: 'pass'` regardless of a low score value).

## 8. Definition of done

- [ ] `Policy.scoring` schema field added (`packages/schema/src/policy.ts`); existing Sprint 1/2 tests
      pass unmodified (the field is optional, non-breaking).
- [ ] `computeScore()` implemented in `packages/core/src/policy/scoring.ts`, wired into `evaluate.ts`.
- [ ] All resolutions in §4 covered by tests per §7.
- [ ] `SCORING.md` §5's worked example reproduced as a golden regression test.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm run depcruise` all green.
- [ ] No circular dependencies; `respect-core-barrel` still enforced against the new file.
- [ ] Gate/tier logic verifiably unaffected by score value (§7's explicit low-score-still-passes test).

## 9. Explicit non-goals

No catalog-driven `ruleWeightFactor` overrides (§4). No server-side recompute / trust boundary (`SCORING.md`
§6 — CLI/API ingest sprint). No UI/report rendering of the per-finding explainability breakdown (§7 of
`SCORING.md` — report engine sprint; this sprint only produces the category-level `breakdown` the schema
already supports). No trend scoring (`SCORING.md` §8 — needs persistence/history, a cloud sprint). No
changes to gate/control/coverage/waiver logic — those are Sprint 2's, untouched here.
