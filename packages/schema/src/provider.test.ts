import { describe, expect, expectTypeOf, it } from 'vitest';
import { type CanonicalFinding, CanonicalFindingSchema } from './finding';
import {
  CapabilitiesSchema,
  ProviderMetadataSchema,
  type RawResult,
  RawResultSchema,
} from './provider';

const validMetadata = {
  id: 'semgrep',
  version: '1.80.0',
  providerApiVersion: '1.0',
  trustTier: 'first-party',
};

const validCapabilities = {
  languages: ['ts', 'tsx'],
  categories: ['authorization', 'security'],
  analysisKinds: ['ast', 'taint'],
  requires: { filesystem: 'read', network: false, build: false },
  produces: { findings: true, dataFlow: true, coverage: false },
  determinism: 'deterministic',
  incremental: { supported: false, unit: 'file', invalidatesOn: ['file-content'] },
  outputFormat: 'sarif-2.1.0',
};

describe('provider.ts', () => {
  it('parses valid ProviderMetadata', () => {
    expect(ProviderMetadataSchema.parse(validMetadata)).toMatchObject({ id: 'semgrep' });
  });

  it('rejects an unknown trustTier', () => {
    expect(() =>
      ProviderMetadataSchema.parse({ ...validMetadata, trustTier: 'trusted' }),
    ).toThrow();
  });

  it('parses valid Capabilities', () => {
    expect(CapabilitiesSchema.parse(validCapabilities)).toMatchObject({
      outputFormat: 'sarif-2.1.0',
    });
  });

  it('rejects capabilities.requires.filesystem other than "read"', () => {
    const bad = {
      ...validCapabilities,
      requires: { ...validCapabilities.requires, filesystem: 'write' },
    };
    expect(() => CapabilitiesSchema.parse(bad)).toThrow();
  });

  it('rejects capabilities.produces.findings other than true', () => {
    const bad = {
      ...validCapabilities,
      produces: { ...validCapabilities.produces, findings: false },
    };
    expect(() => CapabilitiesSchema.parse(bad)).toThrow();
  });

  it('parses a RawResult with an opaque payload', () => {
    const raw = { format: 'sarif-2.1.0', payload: { runs: [] } };
    expect(RawResultSchema.parse(raw)).toEqual(raw);
  });

  it('rejects a raw provider payload parsed as a canonical finding', () => {
    const raw: RawResult = {
      format: 'sarif-2.1.0',
      payload: { ruleId: 'sql-injection', level: 'error' },
    };
    expect(() => CanonicalFindingSchema.parse(raw)).toThrow();
  });

  it('is not, at the type level, assignable to CanonicalFinding without a mapping step', () => {
    expectTypeOf<RawResult>().not.toMatchTypeOf<CanonicalFinding>();
  });
});
