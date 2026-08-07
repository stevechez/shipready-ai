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
