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

export const FINDING_STATUSES = [
  'open',
  'acknowledged',
  'fixed',
  'wontfix',
  'false_positive',
] as const;
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
