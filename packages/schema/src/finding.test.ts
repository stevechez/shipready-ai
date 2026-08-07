import { describe, expect, it } from 'vitest';
import {
  AnalysisKindSchema,
  CanonicalFindingSchema,
  PublicFindingSchema,
  RuleIdSchema,
  SyntheticRuleIdSchema,
} from './finding';

const validFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',

  rule: {
    id: 'SR-RLS-001',
    mapped: true,
    catalogVersion: '2026.08.0',
    cwe: ['CWE-284'],
    docsUrl: 'https://shipready.dev/rules/SR-RLS-001',
  },
  category: 'database',
  severity: 'critical',
  confidence: 'certain',

  message: 'Table created without RLS enabled',
  locations: [{ repoRelPath: 'supabase/migrations/0001_init.sql', lineStart: 12 }],
  evidence: {
    snippet: 'create table public.profiles (...)',
    facts: { table: 'profiles', rlsEnabled: false },
  },

  status: 'open',

  corroboration: { count: 1, independentProviders: 1 },
  provenance: {
    sources: [
      {
        provider: 'native-sql',
        providerVersion: '0.1.0',
        providerApiVersion: '1.0',
        nativeRuleId: 'rls-missing',
        determinism: 'deterministic',
      },
    ],
  },
} as const;

describe('finding.ts', () => {
  it('parses a valid CanonicalFinding', () => {
    expect(CanonicalFindingSchema.parse(validFinding)).toMatchObject({ id: 'find_01' });
  });

  it('rejects an unknown severity', () => {
    const bad = { ...validFinding, severity: 'super-critical' };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('rejects an unknown category', () => {
    const bad = { ...validFinding, category: 'data-exposure' };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('requires at least one location', () => {
    const bad = { ...validFinding, locations: [] };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('requires at least one provenance source', () => {
    const bad = { ...validFinding, provenance: { sources: [] } };
    expect(() => CanonicalFindingSchema.parse(bad)).toThrow();
  });

  it('round-trips through JSON', () => {
    const parsed = CanonicalFindingSchema.parse(validFinding);
    const roundTripped = CanonicalFindingSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(parsed);
  });

  it('validates RuleId and SyntheticRuleId formats', () => {
    expect(RuleIdSchema.parse('SR-RLS-001')).toBe('SR-RLS-001');
    expect(() => RuleIdSchema.parse('rls-001')).toThrow();
    expect(SyntheticRuleIdSchema.parse('SR-EXT-semgrep.sql-injection')).toBe(
      'SR-EXT-semgrep.sql-injection',
    );
    expect(() => SyntheticRuleIdSchema.parse('semgrep.sql-injection')).toThrow();
  });

  it('validates AnalysisKind', () => {
    expect(AnalysisKindSchema.parse('taint')).toBe('taint');
    expect(() => AnalysisKindSchema.parse('vibes')).toThrow();
  });

  it('projects PublicFinding without provenance or raw corroboration, requiring corroborationCount', () => {
    const parsedCanonical = CanonicalFindingSchema.parse(validFinding);
    const { provenance, corroboration, ...rest } = parsedCanonical;
    const publicFinding = PublicFindingSchema.parse({ ...rest, corroborationCount: 1 });
    expect(publicFinding).not.toHaveProperty('provenance');
    expect(publicFinding).not.toHaveProperty('corroboration');
    expect(publicFinding.corroborationCount).toBe(1);

    // Passing the full canonical finding (has provenance/corroboration, no corroborationCount)
    // must fail — corroborationCount is required and missing.
    expect(() => PublicFindingSchema.parse(parsedCanonical)).toThrow();
  });
});
