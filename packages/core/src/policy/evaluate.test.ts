import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from './evaluate';

const NOW = new Date('2026-08-07T00:00:00.000Z');

function makeFinding(overrides: Partial<PolicyFinding> = {}): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: 'find_01',
    fingerprint: 'fp_abc123',
    rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'high',
    confidence: 'firm',
    message: 'RLS enabled but policy is permissive',
    locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 2,
    ...overrides,
  };
}

const basePolicy: Policy = {
  apiVersion: 'shipready.dev/policy/v1',
  version: '2026.08.0',
  name: 'Default — AI app readiness',
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
};

const emptyCoverage: CoverageReport = { cells: [] };

describe('evaluatePolicy', () => {
  it('passes with ready tier when nothing matches any control', () => {
    const result = evaluatePolicy([], emptyCoverage, basePolicy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.verdict.tier).toBe('ready');
  });

  it('fails and blocks when a listed control fails', () => {
    const finding = makeFinding();
    const result = evaluatePolicy([finding], emptyCoverage, basePolicy, NOW);
    expect(result.verdict.decision).toBe('fail');
    expect(result.verdict.tier).toBe('blocked');
    expect(result.controls).toEqual([
      { id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] },
    ]);
    expect(result.verdict.reasons[0]).toContain('NO-DATA-EXPOSURE');
  });

  it('reports insufficient_coverage and blocks when required coverage is unmet', () => {
    const policy: Policy = {
      ...basePolicy,
      controls: [],
      gate: { failIf: { controlFailed: [] } },
      requiredCoverage: [{ language: 'ts', categories: ['authorization'] }],
    };
    const result = evaluatePolicy([], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('insufficient_coverage');
    expect(result.verdict.tier).toBe('blocked');
  });

  it('lets insufficient_coverage take precedence over a failed control', () => {
    const finding = makeFinding();
    const policy: Policy = {
      ...basePolicy,
      requiredCoverage: [{ language: 'ts', categories: ['authorization'] }],
    };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('insufficient_coverage');
    expect(result.verdict.tier).toBe('blocked');
    expect(result.verdict.reasons).toContainEqual(
      expect.stringContaining('required coverage not met:'),
    );
    expect(result.verdict.reasons.some((reason) => reason.includes('NO-DATA-EXPOSURE'))).toBe(
      false,
    );
  });

  it('sets tier at_risk when passing but an open finding matches atRiskIf', () => {
    const policy: Policy = { ...basePolicy, controls: [] };
    const finding = makeFinding({ category: 'security' });
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.verdict.tier).toBe('at_risk');
  });

  it('excludes a waived finding from control matching but surfaces it in waived', () => {
    const finding = makeFinding();
    const policy: Policy = {
      ...basePolicy,
      waivers: [
        {
          fingerprint: 'fp_abc123',
          reason: 'vendored fixture',
          approvedBy: 'u_123',
          expires: '2026-12-31T00:00:00.000Z',
        },
      ],
    };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.verdict.decision).toBe('pass');
    expect(result.waived).toHaveLength(1);
    expect(result.waived[0]?.fingerprint).toBe('fp_abc123');
  });

  it('derives catalogVersion from the first finding and leaves score undefined', () => {
    const finding = makeFinding({ category: 'security' });
    const policy: Policy = { ...basePolicy, controls: [] };
    const result = evaluatePolicy([finding], emptyCoverage, policy, NOW);
    expect(result.catalogVersion).toBe('2026.08.0');
    expect(result.score).toBeUndefined();
  });

  it('uses an empty catalogVersion when there are no findings', () => {
    const result = evaluatePolicy([], emptyCoverage, basePolicy, NOW);
    expect(result.catalogVersion).toBe('');
  });

  it('defaults now to the real clock when omitted', () => {
    const before = Date.now();
    const result = evaluatePolicy([], emptyCoverage, basePolicy);
    const evaluatedAt = new Date(result.verdict.evaluatedAt).getTime();
    expect(evaluatedAt).toBeGreaterThanOrEqual(before);
  });
});
