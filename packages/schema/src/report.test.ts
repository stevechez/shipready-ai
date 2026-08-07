import { describe, expect, it } from 'vitest';
import { ReportFindingSchema } from './report';
import { PolicyFindingSchema } from './policy';

const validReportFinding = {
  schemaVersion: '0.0.0',
  id: 'find_01',
  fingerprint: 'fp_abc123',
  rule: { id: 'SR-SEC-001', mapped: true, catalogVersion: '2026.08.0' },
  category: 'security',
  severity: 'critical',
  confidence: 'certain',
  message: 'Secret committed to the repo',
  locations: [{ repoRelPath: '.env', lineStart: 1 }],
  evidence: { facts: { pattern: 'aws-secret-key' } },
  status: 'open',
  corroborationCount: 1,
};

describe('report.ts', () => {
  it('parses a valid ReportFinding with no provenance key', () => {
    const parsed = ReportFindingSchema.parse(validReportFinding);
    expect(parsed).not.toHaveProperty('provenance');
    expect(parsed).not.toHaveProperty('corroboration');
  });

  it('rejects a ReportFinding missing corroborationCount', () => {
    const { corroborationCount, ...rest } = validReportFinding;
    expect(() => ReportFindingSchema.parse(rest)).toThrow();
  });

  it('is the same projection as PolicyFinding today (§1.4)', () => {
    expect(ReportFindingSchema.parse(validReportFinding)).toEqual(
      PolicyFindingSchema.parse(validReportFinding),
    );
  });

  it('round-trips through JSON', () => {
    const parsed = ReportFindingSchema.parse(validReportFinding);
    expect(ReportFindingSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
