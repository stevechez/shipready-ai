import { z } from 'zod';
import { CoverageReportSchema } from './coverage';
import { CategorySchema, PublicFindingSchema } from './finding';
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
