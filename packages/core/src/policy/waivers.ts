import type { PolicyFinding, WaivedFinding } from '@shipready/schema';

export interface WaiverPartition {
  active: PolicyFinding[];
  waived: WaivedFinding[];
}

/**
 * Partitions findings into those still subject to gating and those covered by a live waiver.
 * A waiver whose `expires` has passed is treated as if it doesn't exist — the finding it would
 * have covered stays active and gates normally. A stale waiver must never silently suppress a
 * real issue (PROVIDER_ARCHITECTURE.md §5.1).
 */
export function applyWaivers(
  findings: PolicyFinding[],
  waivers: WaivedFinding[],
  now: Date,
): WaiverPartition {
  const liveWaiversByFingerprint = new Map<string, WaivedFinding>();
  for (const waiver of waivers) {
    if (new Date(waiver.expires) > now) {
      liveWaiversByFingerprint.set(waiver.fingerprint, waiver);
    }
  }

  const active: PolicyFinding[] = [];
  const waived: WaivedFinding[] = [];
  for (const finding of findings) {
    const waiver = liveWaiversByFingerprint.get(finding.fingerprint);
    if (waiver) {
      waived.push(waiver);
    } else {
      active.push(finding);
    }
  }

  return { active, waived };
}
