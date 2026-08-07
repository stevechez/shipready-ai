import { describe, expect, it } from 'vitest';
import {
  ControlSchema,
  GateSchema,
  PolicyEvaluationInputSchema,
  PolicyFindingSchema,
  PolicyResultSchema,
  PolicySchema,
} from './policy';

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

const validPolicy = {
  apiVersion: 'shipready.dev/policy/v1',
  version: '2026.08.0',
  name: 'Default — AI app readiness',
  requiredCoverage: [{ language: 'ts', categories: ['authorization'], minAnalysisKind: 'taint' }],
  controls: [
    {
      id: 'NO-DATA-EXPOSURE',
      description: 'No open data-exposure finding at High or Critical severity',
      match: { category: 'database', status: 'open', minSeverity: 'high' },
      forbid: 'any',
    },
  ],
  gate: {
    failIf: { controlFailed: ['NO-DATA-EXPOSURE'] },
    atRiskIf: { open: { severity: 'high', status: 'open' } },
  },
  severityOverrides: [{ rule: 'SR-AUTHZ-001', severity: 'info' }],
  waivers: [
    {
      fingerprint: 'fp_xyz',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-12-31T00:00:00.000Z',
    },
  ],
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

  it('parses a valid Policy profile with controls, gate, requiredCoverage, and waivers', () => {
    const parsed = PolicySchema.parse(validPolicy);
    expect(parsed.controls).toHaveLength(1);
    expect(parsed.gate.atRiskIf?.open?.severity).toBe('high');
    expect(parsed.waivers).toHaveLength(1);
  });

  it('rejects a control with forbid other than "any"', () => {
    const bad = {
      id: 'X',
      description: 'x',
      match: {},
      forbid: 'all',
    };
    expect(() => ControlSchema.parse(bad)).toThrow();
  });

  it('accepts a control with no match clauses (matches everything) and optional tightening fields', () => {
    const control = {
      id: 'X',
      description: 'x',
      match: {},
      forbid: 'any',
      onlyDeterministic: true,
      requireCorroboration: 2,
    };
    expect(ControlSchema.parse(control)).toMatchObject({ requireCorroboration: 2 });
  });

  it('rejects a Gate missing failIf', () => {
    expect(() => GateSchema.parse({})).toThrow();
  });

  it('parses a valid PolicyEvaluationInput with a real Policy profile', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: validPolicy,
    };
    expect(PolicyEvaluationInputSchema.parse(input).policy.controls).toHaveLength(1);
  });

  it('rejects a PolicyEvaluationInput with the old placeholder policy shape', () => {
    const input = {
      findings: [validPolicyFinding],
      coverage: validCoverage,
      policy: { version: '2026.08.0', name: 'Default' },
    };
    expect(() => PolicyEvaluationInputSchema.parse(input)).toThrow();
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
