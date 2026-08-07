import type { Control, ControlMatch, PolicyFinding, Severity } from '@shipready/schema';

export interface ControlEvaluation {
  id: string;
  passed: boolean;
  matched: string[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function meetsMinSeverity(severity: Severity, minSeverity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minSeverity];
}

function matchesFinding(match: ControlMatch, finding: PolicyFinding): boolean {
  if (match.category !== undefined && finding.category !== match.category) {
    return false;
  }
  if (match.status !== undefined && finding.status !== match.status) {
    return false;
  }
  if (match.rule !== undefined && finding.rule.id !== match.rule) {
    return false;
  }
  if (match.minSeverity !== undefined && !meetsMinSeverity(finding.severity, match.minSeverity)) {
    return false;
  }
  return true;
}

/**
 * Evaluates one control against the active (non-waived) finding set. A `forbid: 'any'` control
 * fails when at least one finding survives the match predicate and, if set, the
 * `requireCorroboration` threshold. `onlyDeterministic` is accepted on the schema but not
 * enforced here — see packages/schema/src/policy.ts's note on why.
 */
export function evaluateControl(control: Control, findings: PolicyFinding[]): ControlEvaluation {
  const matched = findings
    .filter((finding) => matchesFinding(control.match, finding))
    .filter((finding) =>
      control.requireCorroboration === undefined
        ? true
        : finding.corroborationCount >= control.requireCorroboration,
    )
    .map((finding) => finding.fingerprint);

  return {
    id: control.id,
    passed: matched.length === 0,
    matched,
  };
}
