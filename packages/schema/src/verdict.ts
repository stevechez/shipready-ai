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
