import type { PolicyFinding, WaivedFinding } from '@shipready/schema';
import { describe, expect, it } from 'vitest';
import { applyWaivers } from './waivers';

function makeFinding(fingerprint: string): PolicyFinding {
  return {
    schemaVersion: '0.0.0',
    id: `find_${fingerprint}`,
    fingerprint,
    rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
    category: 'database',
    severity: 'high',
    confidence: 'firm',
    message: 'RLS enabled but policy is permissive',
    locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
    evidence: { facts: {} },
    status: 'open',
    corroborationCount: 1,
  };
}

const NOW = new Date('2026-08-07T00:00:00.000Z');

describe('applyWaivers', () => {
  it('moves a finding with a live waiver to waived, not active', () => {
    const finding = makeFinding('fp_abc');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_abc',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-12-31T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([finding], [waiver], NOW);
    expect(active).toHaveLength(0);
    expect(waived).toEqual([waiver]);
  });

  it('keeps a finding active when its waiver has expired', () => {
    const finding = makeFinding('fp_abc');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_abc',
      reason: 'vendored fixture',
      approvedBy: 'u_123',
      expires: '2026-01-01T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([finding], [waiver], NOW);
    expect(active).toEqual([finding]);
    expect(waived).toHaveLength(0);
  });

  it('leaves findings without a matching waiver active', () => {
    const finding = makeFinding('fp_xyz');
    const { active, waived } = applyWaivers([finding], [], NOW);
    expect(active).toEqual([finding]);
    expect(waived).toHaveLength(0);
  });

  it('handles multiple findings with a mix of waived and active', () => {
    const waivedFinding = makeFinding('fp_waived');
    const activeFinding = makeFinding('fp_active');
    const waiver: WaivedFinding = {
      fingerprint: 'fp_waived',
      reason: 'known issue, tracked',
      approvedBy: 'u_456',
      expires: '2026-12-31T00:00:00.000Z',
    };
    const { active, waived } = applyWaivers([waivedFinding, activeFinding], [waiver], NOW);
    expect(active).toEqual([activeFinding]);
    expect(waived).toEqual([waiver]);
  });
});
