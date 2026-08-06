import type { Severity } from '@shipready/schema';

/**
 * Describes the provider-blind core (post ADR-001; this package was formerly conceived as the
 * bespoke "engine"). The core reasons only about canonical findings — never about which
 * analyzer produced them (docs/PROVIDER_ARCHITECTURE.md §0).
 */
export interface CoreInfo {
  readonly name: string;
  readonly providerBlind: true;
}

export const CORE_INFO: CoreInfo = {
  name: '@shipready/core',
  providerBlind: true,
};

/**
 * Sprint 0 placeholder proving the schema→core dependency edge and the canonical severity
 * ordering. Real normalization, correlation, coverage, and policy evaluation land in later
 * sprints.
 */
export function highestSeverity(): Severity {
  return 'critical';
}
