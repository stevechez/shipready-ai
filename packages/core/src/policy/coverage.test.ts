import type { CoverageReport, RequiredCoverageEntry } from '@shipready/schema';
import { describe, expect, it } from 'vitest';
import { findUnmetCoverage } from './coverage';

const tsAuthzTaint: RequiredCoverageEntry = {
  language: 'ts',
  categories: ['authorization', 'security'],
  minAnalysisKind: 'taint',
};

describe('findUnmetCoverage', () => {
  it('returns empty when a covered cell matches language, category, and analysisKind', () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'authorization',
          analysisKind: 'taint',
          covered: true,
          byProviders: ['semgrep'],
          executedRuleCount: 4,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([]);
  });

  it('reports the entry unmet when the cell exists but covered is false', () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'authorization',
          analysisKind: 'taint',
          covered: false,
          byProviders: [],
          executedRuleCount: 0,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([tsAuthzTaint]);
  });

  it('reports the entry unmet when no cell matches at all', () => {
    const coverage: CoverageReport = { cells: [] };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([tsAuthzTaint]);
  });

  it("matches on any category in the entry's category list", () => {
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'ts',
          category: 'security',
          analysisKind: 'taint',
          covered: true,
          byProviders: ['semgrep'],
          executedRuleCount: 2,
        },
      ],
    };
    expect(findUnmetCoverage([tsAuthzTaint], coverage)).toEqual([]);
  });

  it('ignores minAnalysisKind when the entry does not specify one', () => {
    const entry: RequiredCoverageEntry = { language: 'sql', categories: ['database'] };
    const coverage: CoverageReport = {
      cells: [
        {
          language: 'sql',
          category: 'database',
          analysisKind: 'lexical',
          covered: true,
          byProviders: ['native-sql'],
          executedRuleCount: 3,
        },
      ],
    };
    expect(findUnmetCoverage([entry], coverage)).toEqual([]);
  });
});
