import { z } from 'zod';

/**
 * The canonical Finding schema version. Versioned independently of the engine/core and of
 * providers, and pinned per scan for reproducibility (docs/PROVIDER_ARCHITECTURE.md §8).
 *
 * Sprint 0 ships only the enums that anchor the rest of the model; the full canonical
 * `Finding`, provider contract, and policy types land in Sprint 1.
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
 * corroboration across independent providers (docs/PROVIDER_ARCHITECTURE.md §4.9).
 * Confidence informs display/prioritization; it does not, by itself, move a gate.
 */
export const CONFIDENCES = ['certain', 'firm', 'tentative'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;
