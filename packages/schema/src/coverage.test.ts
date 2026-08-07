import { describe, expect, it } from 'vitest';
import { CoverageReportSchema } from './coverage';

const validCoverage = {
  cells: [
    {
      language: 'ts',
      category: 'authorization',
      analysisKind: 'taint',
      covered: true,
      byProviders: ['semgrep'],
      executedRuleCount: 4,
    },
    {
      language: 'python',
      category: 'authorization',
      analysisKind: 'taint',
      covered: false,
      byProviders: [],
      executedRuleCount: 0,
      degraded: true,
    },
  ],
};

describe('coverage.ts', () => {
  it('parses a valid CoverageReport', () => {
    expect(CoverageReportSchema.parse(validCoverage)).toEqual(validCoverage);
  });

  it('rejects an unknown category on a cell', () => {
    const bad = {
      cells: [{ ...validCoverage.cells[0], category: 'not-a-real-category' }],
    };
    expect(() => CoverageReportSchema.parse(bad)).toThrow();
  });

  it('rejects an unknown analysisKind on a cell', () => {
    const bad = {
      cells: [{ ...validCoverage.cells[0], analysisKind: 'vibes' }],
    };
    expect(() => CoverageReportSchema.parse(bad)).toThrow();
  });

  it('models an uncovered cell as covered:false, never a silent pass', () => {
    const parsed = CoverageReportSchema.parse(validCoverage);
    expect(parsed.cells[1]?.covered).toBe(false);
    expect(parsed.cells[1]?.degraded).toBe(true);
  });

  it('round-trips through JSON', () => {
    const parsed = CoverageReportSchema.parse(validCoverage);
    expect(CoverageReportSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});
