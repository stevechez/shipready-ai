import type { Control, PolicyFinding } from '@shipready/schema';
import { describe, expect, it } from 'vitest';
import { evaluateControl } from './controls';

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

const noDataExposure: Control = {
  id: 'NO-DATA-EXPOSURE',
  description: 'No open data-exposure finding at High or Critical severity',
  match: { category: 'database', status: 'open', minSeverity: 'high' },
  forbid: 'any',
};

describe('evaluateControl', () => {
  it('fails when a matching finding exists', () => {
    const result = evaluateControl(noDataExposure, [makeFinding()]);
    expect(result).toEqual({ id: 'NO-DATA-EXPOSURE', passed: false, matched: ['fp_abc123'] });
  });

  it('passes when no finding matches the category', () => {
    const finding = makeFinding({ category: 'security' });
    const result = evaluateControl(noDataExposure, [finding]);
    expect(result.passed).toBe(true);
    expect(result.matched).toEqual([]);
  });

  it('passes when the finding is below minSeverity', () => {
    const finding = makeFinding({ severity: 'medium' });
    expect(evaluateControl(noDataExposure, [finding]).passed).toBe(true);
  });

  it('passes when the finding does not match status', () => {
    const finding = makeFinding({ status: 'fixed' });
    expect(evaluateControl(noDataExposure, [finding]).passed).toBe(true);
  });

  it('matches on an exact rule id when specified', () => {
    const control: Control = {
      id: 'TYPES-COMPILE',
      description: 'TypeScript must compile',
      match: { rule: 'SR-TS-002', status: 'open' },
      forbid: 'any',
    };
    const matching = makeFinding({
      rule: { id: 'SR-TS-002', mapped: true, catalogVersion: '2026.08.0' },
    });
    const nonMatching = makeFinding({
      rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    });
    expect(evaluateControl(control, [matching]).passed).toBe(false);
    expect(evaluateControl(control, [nonMatching]).passed).toBe(true);
  });

  it('filters by requireCorroboration when set', () => {
    const control: Control = { ...noDataExposure, requireCorroboration: 2 };
    const weaklyCorroborated = makeFinding({ corroborationCount: 1 });
    const stronglyCorroborated = makeFinding({ corroborationCount: 2 });
    expect(evaluateControl(control, [weaklyCorroborated]).passed).toBe(true);
    expect(evaluateControl(control, [stronglyCorroborated]).passed).toBe(false);
  });

  it('collects all matched fingerprints, not just the first', () => {
    const first = makeFinding({ fingerprint: 'fp_1' });
    const second = makeFinding({ fingerprint: 'fp_2' });
    const result = evaluateControl(noDataExposure, [first, second]);
    expect(result.matched).toEqual(['fp_1', 'fp_2']);
  });
});
