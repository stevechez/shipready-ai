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
