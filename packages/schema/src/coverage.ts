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
