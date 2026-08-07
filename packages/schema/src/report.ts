import { z } from 'zod';
import { PublicFindingSchema } from './finding';

/**
 * What the report engine reads (§6): structurally identical to PolicyFinding today (§1.4).
 * Kept as its own named export so it can diverge later (e.g. AI-enrichment display fields in
 * Sprint 13) without touching policy.ts.
 */
export const ReportFindingSchema = PublicFindingSchema;
export type ReportFinding = z.infer<typeof ReportFindingSchema>;
