import { describe, expect, it } from 'vitest';
import { PolicyEvaluationInputSchema, PolicyFindingSchema, PolicyResultSchema } from './policy';

const validPolicyFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',
  rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
  category: 'database',
  severity: 'high',
  confidence: 'firm',
  message: 'RLS enabled but policy is permissive',
  locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
  evidence: { facts: { table: 'profiles' } },
  status: 'open',
  corroborationCount: 2,
};

const validCoverage = { cells: [] };

const validVerdict = {
  decision: 'fail',
  tier: 'blocked',
  reasons: ['control NO-DATA-EXPOSURE failed'],
  evaluatedAt: '2026-08-06T12:00:00.000Z',
};

describe('policy.ts', () => {
  it('parses a valid PolicyFinding (no provenance key, has corroborationCount)', () => {
    const parsed = PolicyFindingSchema.parse(validPolicyFinding);
    expect(parsed).not.toHaveProperty('provenance');
    expect(parsed.corroborationCount).toBe(2);
  });

  it('rejects a PolicyFinding missing corroborationCount', () => {
    const { corroborationCount, ...rest } = validPolicyFinding;
    expect(() => PolicyFindingSchema.parse(rest)).toThrow();
  });

  it('parses a valid PolicyEvaluationInput', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: { version: '2026.08.0', name: 'Default — AI app readiness' },
    };
    expect(PolicyEvaluationInputSchema.parse(input).findings).toHaveLength(1);
  });

  it('parses a valid PolicyResult with an optional diagnostic score', () => {
    const result = {
      verdict: validVerdict,
      controls: [{ id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] }],
      score: { value: 76, breakdown: { database: 60, authorization: 100 } },
      coverage: validCoverage,
      waived: [],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    expect(PolicyResultSchema.parse(result).verdict.tier).toBe('blocked');
  });

  it('parses a valid PolicyResult with score omitted (score is diagnostic-only)', () => {
    const result = {
      verdict: { ...validVerdict, decision: 'pass', tier: 'ready' },
      controls: [],
      coverage: validCoverage,
      waived: [],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    expect(PolicyResultSchema.parse(result).score).toBeUndefined();
  });

  it('round-trips PolicyResult through JSON', () => {
    const result = {
      verdict: validVerdict,
      controls: [],
      coverage: validCoverage,
      waived: [
        {
          fingerprint: 'fp_xyz',
          reason: 'vendored fixture',
          approvedBy: 'u_123',
          expires: '2026-12-31T00:00:00.000Z',
        },
      ],
      policyVersion: '2026.08.0',
      catalogVersion: '2026.08.0',
    };
    const parsed = PolicyResultSchema.parse(result);
    expect(PolicyResultSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
