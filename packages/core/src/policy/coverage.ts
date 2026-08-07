import type { CoverageReport, RequiredCoverageEntry } from '@shipready/schema';

/**
 * Checks whether every required-coverage entry (§5.4) has at least one effectively-covered
 * cell in the actual coverage report. Returns the entries that were NOT met — empty means
 * coverage is sufficient. "Lack of evidence can never become PASS" (§4.8): a required entry
 * with no matching covered:true cell is unmet, full stop.
 */
export function findUnmetCoverage(
  required: RequiredCoverageEntry[],
  coverage: CoverageReport,
): RequiredCoverageEntry[] {
  return required.filter((entry) => !isEntryCovered(entry, coverage));
}

function isEntryCovered(entry: RequiredCoverageEntry, coverage: CoverageReport): boolean {
  return coverage.cells.some(
    (cell) =>
      cell.covered &&
      cell.language === entry.language &&
      entry.categories.includes(cell.category) &&
      (entry.minAnalysisKind === undefined || cell.analysisKind === entry.minAnalysisKind),
  );
}
