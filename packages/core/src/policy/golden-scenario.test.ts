import type { CoverageReport, Policy, PolicyFinding } from '@shipready/schema';
import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from './evaluate';

/**
 * Reproduces PROVIDER_ARCHITECTURE.md §11's worked example as a regression anchor: an RLS
 * USING(true) finding and a failed tsc compile should block, with required coverage satisfied
 * (so the decision is 'fail', never 'insufficient_coverage').
 */
describe('golden scenario: PROVIDER_ARCHITECTURE.md §11', () => {
  const findings: PolicyFinding[] = [
    {
      schemaVersion: '0.0.0',
      id: 'find_authz',
      fingerprint: 'fp_authz_001',
      rule: { id: 'SR-AUTHZ-001', mapped: true, catalogVersion: '2026.08.0' },
      category: 'authorization',
      severity: 'high',
      confidence: 'firm',
      message: 'Authenticated but not authorized',
      locations: [{ repoRelPath: 'app/api/orders/route.ts', lineStart: 12 }],
      evidence: { facts: {} },
      status: 'open',
      corroborationCount: 2,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_rls',
      fingerprint: 'fp_rls_002',
      rule: { id: 'SR-RLS-002', mapped: true, catalogVersion: '2026.08.0' },
      category: 'database',
      severity: 'high',
      confidence: 'firm',
      message: 'RLS enabled but policy is permissive',
      locations: [{ repoRelPath: 'supabase/migrations/0002_policy.sql', lineStart: 4 }],
      evidence: { facts: { policy: 'USING (true)' } },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_ts',
      fingerprint: 'fp_ts_002',
      rule: { id: 'SR-TS-002', mapped: true, catalogVersion: '2026.08.0' },
      category: 'typescript',
      severity: 'medium',
      confidence: 'certain',
      message: 'TypeScript compile failed',
      locations: [{ repoRelPath: 'app/api/orders/route.ts', lineStart: 1 }],
      evidence: { facts: { exitCode: 2 } },
      status: 'open',
      corroborationCount: 1,
    },
    {
      schemaVersion: '0.0.0',
      id: 'find_dep',
      fingerprint: 'fp_dep_003',
      rule: { id: 'SR-DEP-003', mapped: true, catalogVersion: '2026.08.0' },
      category: 'dependencies',
      severity: 'high',
      confidence: 'certain',
      message: 'Known-vulnerable dependency',
      locations: [{ repoRelPath: 'package.json', lineStart: 1 }],
      evidence: { facts: { cve: 'CVE-2026-0001' } },
      status: 'open',
      corroborationCount: 1,
    },
  ];

  const coverage: CoverageReport = {
    cells: [
      {
        language: 'ts',
        category: 'authorization',
        analysisKind: 'taint',
        covered: true,
        byProviders: ['semgrep', 'native-authz'],
        executedRuleCount: 6,
      },
      {
        language: 'sql',
        category: 'database',
        analysisKind: 'lexical',
        covered: true,
        byProviders: ['native-sql'],
        executedRuleCount: 3,
      },
      {
        language: 'ts',
        category: 'dependencies',
        analysisKind: 'sca',
        covered: true,
        byProviders: ['trivy'],
        executedRuleCount: 12,
      },
    ],
  };

  const policy: Policy = {
    apiVersion: 'shipready.dev/policy/v1',
    version: '2026.08.0',
    name: 'Default — AI app readiness',
    requiredCoverage: [
      { language: 'ts', categories: ['authorization'], minAnalysisKind: 'taint' },
      { language: 'sql', categories: ['database'] },
    ],
    controls: [
      {
        id: 'NO-DATA-EXPOSURE',
        description: 'No open data-exposure finding at High or Critical severity',
        match: { category: 'database', status: 'open', minSeverity: 'high' },
        forbid: 'any',
      },
      {
        id: 'TYPES-COMPILE',
        description: 'TypeScript must compile',
        match: { rule: 'SR-TS-002', status: 'open' },
        forbid: 'any',
      },
    ],
    gate: {
      failIf: { controlFailed: ['NO-DATA-EXPOSURE', 'TYPES-COMPILE'] },
      atRiskIf: { open: { severity: 'high', status: 'open' } },
    },
  };

  it('blocks on NO-DATA-EXPOSURE and TYPES-COMPILE with sufficient coverage', () => {
    const result = evaluatePolicy(findings, coverage, policy, new Date('2026-08-07T00:00:00.000Z'));

    expect(result.verdict.decision).toBe('fail');
    expect(result.verdict.tier).toBe('blocked');

    const byId = new Map(result.controls.map((c) => [c.id, c]));
    expect(byId.get('NO-DATA-EXPOSURE')).toEqual({
      id: 'NO-DATA-EXPOSURE',
      passed: false,
      matched: ['fp_rls_002'],
    });
    expect(byId.get('TYPES-COMPILE')).toEqual({
      id: 'TYPES-COMPILE',
      passed: false,
      matched: ['fp_ts_002'],
    });

    // Required coverage was satisfied — this must never read as insufficient_coverage.
    expect(result.verdict.decision).not.toBe('insufficient_coverage');
  });
});
