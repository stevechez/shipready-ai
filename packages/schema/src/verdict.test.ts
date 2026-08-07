import { describe, expect, it } from 'vitest';
import { VerdictSchema } from './verdict';

const validVerdict = {
  decision: 'fail',
  tier: 'blocked',
  reasons: ['control NO-DATA-EXPOSURE failed: SR-RLS-002 at firm confidence'],
  evaluatedAt: '2026-08-06T12:00:00.000Z',
};

describe('verdict.ts', () => {
  it('parses a valid Verdict', () => {
    expect(VerdictSchema.parse(validVerdict)).toEqual(validVerdict);
  });

  it('rejects an unknown decision', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, decision: 'maybe' })).toThrow();
  });

  it('accepts the at_risk tier (distinct from blocked)', () => {
    const atRisk = { ...validVerdict, decision: 'pass', tier: 'at_risk' };
    expect(VerdictSchema.parse(atRisk).tier).toBe('at_risk');
  });

  it('rejects an unknown tier', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, tier: 'sort-of-ready' })).toThrow();
  });

  it('rejects a non-ISO evaluatedAt', () => {
    expect(() => VerdictSchema.parse({ ...validVerdict, evaluatedAt: 'yesterday' })).toThrow();
  });

  it('round-trips through JSON', () => {
    const parsed = VerdictSchema.parse(validVerdict);
    expect(VerdictSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
