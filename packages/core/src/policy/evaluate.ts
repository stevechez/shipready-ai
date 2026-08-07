import type {
  CoverageReport,
  Policy,
  PolicyFinding,
  PolicyResult,
  Verdict,
} from '@shipready/schema';
import { evaluateControl } from './controls';
import { findUnmetCoverage } from './coverage';
import { applyWaivers } from './waivers';

/**
 * The deterministic policy pass (PROVIDER_ARCHITECTURE.md §5.2): controls -> gate -> verdict.
 * Scoring is deliberately not computed here (ADR-003; PolicyResult.score stays undefined) —
 * that's a later sprint. `now` defaults to the real clock but can be pinned for deterministic
 * testing of waiver expiry, a documented deviation from §5.2's literal 3-arg signature.
 */
export function evaluatePolicy(
  findings: PolicyFinding[],
  coverage: CoverageReport,
  policy: Policy,
  now: Date = new Date(),
): PolicyResult {
  const { active, waived } = applyWaivers(findings, policy.waivers ?? [], now);

  const controls = policy.controls.map((control) => evaluateControl(control, active));
  const controlsById = new Map(controls.map((result) => [result.id, result]));

  const unmetCoverage = findUnmetCoverage(policy.requiredCoverage ?? [], coverage);
  const coverageInsufficient =
    unmetCoverage.length > 0 && policy.gate.failIf.coverageInsufficient !== false;

  const failedControlIds = policy.gate.failIf.controlFailed.filter((id) => {
    const result = controlsById.get(id);
    return result !== undefined && !result.passed;
  });

  const reasons: string[] = [];
  let decision: Verdict['decision'];
  if (coverageInsufficient) {
    decision = 'insufficient_coverage';
    for (const entry of unmetCoverage) {
      reasons.push(`required coverage not met: ${entry.language}/${entry.categories.join(',')}`);
    }
  } else if (failedControlIds.length > 0) {
    decision = 'fail';
    for (const id of failedControlIds) {
      const result = controlsById.get(id);
      reasons.push(`control ${id} failed: ${result?.matched.join(', ')}`);
    }
  } else {
    decision = 'pass';
  }

  let tier: Verdict['tier'];
  if (decision === 'fail' || decision === 'insufficient_coverage') {
    tier = 'blocked';
  } else if (matchesAtRisk(active, policy.gate.atRiskIf)) {
    tier = 'at_risk';
  } else {
    tier = 'ready';
  }

  return {
    verdict: {
      decision,
      tier,
      reasons,
      evaluatedAt: now.toISOString(),
    },
    controls,
    coverage,
    waived,
    policyVersion: policy.version,
    catalogVersion: findings[0]?.rule.catalogVersion ?? '',
  };
}

function matchesAtRisk(findings: PolicyFinding[], atRiskIf: Policy['gate']['atRiskIf']): boolean {
  if (!atRiskIf?.open) {
    return false;
  }
  const { severity, status } = atRiskIf.open;
  return findings.some((finding) => finding.severity === severity && finding.status === status);
}
