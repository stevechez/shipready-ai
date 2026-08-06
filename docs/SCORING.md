# SCORING.md — ShipReady AI

> **Status note (post-lock):** Per **ADR-003**, the authoritative verdict is the **policy gate**, not the
> score. This document now defines the **default scoring *profile*** consumed by the policy engine
> (`PROVIDER_ARCHITECTURE.md` §5): the 0–100 is a **secondary diagnostic / trend signal**, override-able or
> disable-able per org. Two alignments override the gate wording below:
> (1) the **default gate keys on base severity + status** (`PROVIDER_ARCHITECTURE.md` §4.9) — corroboration
> raises *displayed confidence* but does not, by itself, move a gate;
> (2) a passing gate additionally requires **effective coverage** — a required area with no executed rules
> yields **`INSUFFICIENT_COVERAGE`**, never PASS (§4.8/§5.4). The category weights and math below stand as
> the default profile.

The Production Readiness Score must be **deterministic, transparent, weighted, and explainable**. A user
should be able to reproduce it by hand from the findings and the catalog. No LLM touches it.

## 1. Design goals

1. **Reproducible:** `(findings, catalog_version) → score` is a pure function. Same inputs, same output,
   forever. The catalog version is stored per scan so historical scores never drift.
2. **Legible:** the report shows the exact arithmetic — which findings cost how many points in which
   category. No black box.
3. **Honest about severity:** a single Critical must not be averaged away by a hundred passing checks.
   Readiness is gated, not just summed.
4. **Confidence-aware:** tentative (heuristic) findings cannot, by themselves, sink a score or block
   shipping.
5. **Tamper-resistant:** authoritative score is computed **server-side** from submitted findings.

## 2. Two numbers, deliberately

We publish **two** things because collapsing them lies:

- **Readiness Tier** (gate): `Blocked` / `At Risk` / `Ready`. Driven primarily by the worst unresolved
  findings. This is the "can I ship?" answer.
- **Readiness Score** (0–100): a weighted quality measure for trend-tracking and comparison. This is the
  "how healthy overall?" answer.

A repo can be `Ready` at 88, or `Blocked` at 76 (one open Critical). Reporting only a number would let a
dangerous repo look "pretty good." Reporting only a tier would erase progress. We show both.

## 3. The gate (Readiness Tier)

```
if any OPEN finding with severity=Critical AND confidence in {certain, firm}:
    tier = Blocked
elif any OPEN finding with severity=High AND confidence in {certain, firm}:
    tier = At Risk
elif score < 70:
    tier = At Risk
else:
    tier = Ready
```

- **Tentative** findings never set `Blocked`/`At Risk` by gate; they only affect the score (dampened).
- Suppressed/false-positive/`wontfix` findings are excluded from the gate (but shown in the report; a
  scan that reaches `Ready` only via heavy suppression is flagged in the summary).
- Rationale: the gate encodes "would a senior engineer block this deploy?" — one real Critical blocks.

## 4. The score (0–100)

Computed as a weighted average of **per-category subscores**. Categories and default weights:

| Category | Weight | Why this weight |
|---|---|---|
| Authorization (`AUTHZ`) | 18 | The most common and most damaging AI-app failure |
| Database/RLS (`RLS`,`DB`,`SUP`) | 18 | Data exposure is existential |
| Security (`SEC`) | 16 | Secrets, dangerous sinks |
| Authentication (`AUTH`) | 12 | Enforcement gaps |
| API routes (`API`) | 10 | Validation, error hygiene |
| TypeScript (`TS`) | 8 | Compile health, boundary types |
| Configuration (`CFG`) | 6 | Headers, env, framework config |
| Dependencies (`DEP`) | 5 | Bloat, bad packages |
| Architecture (`ARCH`) | 3 | Maintainability |
| Performance (`PERF`) | 2 | Obvious regressions |
| Accessibility (`A11Y`) | 2 | Baseline a11y |
| **Total** | **100** | |

Weights live in the catalog (`rules_catalog` + a category-weight table) and are **versioned**. Changing
them is a **major** catalog bump.

### Per-category subscore

Each category starts at 100 and subtracts penalties for its open findings:

```
subscore(category) = clamp(0, 100, 100 - Σ penalty(finding))

penalty(finding) = severityPoints(finding.severity)
                 * confidenceFactor(finding.confidence)
                 * ruleWeightFactor(finding.ruleId)
```

- **severityPoints:** `critical=40, high=20, medium=8, low=3, info=0`.
- **confidenceFactor:** `certain=1.0, firm=1.0, tentative=0.4`. (Tentative is dampened — it can nudge a
  score but not dominate it.)
- **ruleWeightFactor:** per-rule multiplier from the catalog (default `1.0`), letting us tune specific
  rules without touching the formula. Bounded to `[0.5, 1.5]`.
- **Diminishing returns within a rule:** the Nth identical-rule finding in a category counts at a
  decaying factor (`1, 0.7, 0.5, 0.4, …`, floored at `0.3`) so 50 missing-alt-text findings don't zero
  a category while 1 still matters. Documented and deterministic.

### Overall score

```
score = round( Σ_category ( subscore(category) * weight(category) ) / Σ weight(category) )
```

Only categories that **apply** to the project contribute (weights renormalized over applicable
categories). Example: a repo with no database → RLS/DB/SUP weights drop out and the remaining weights
renormalize to 100. This prevents penalizing a project for a category it legitimately doesn't have,
and it's recorded in `score_breakdown` so the report can explain "Database: not applicable."

## 5. Worked example

Findings (all open): one `SR-RLS-001` (Critical, Certain), two `SR-API-001` (High, Firm), one
`SR-A11Y-001` (Low, Firm).

- **Database/RLS** subscore: `100 - (40 * 1.0 * 1.0) = 60`.
- **API** subscore: first High `20`, second High `20*0.7=14` → `100 - 34 = 66`.
- **A11Y** subscore: `100 - (3 * 1.0) = 97`.
- All other applicable categories: `100`.
- Weighted average across applicable categories → e.g. **~90**.
- **Gate:** open Critical (certain) ⇒ **tier = Blocked**, regardless of the 90.

Report headline: **"Blocked — 90/100. One critical data-exposure issue must be fixed before shipping."**
This is exactly the honest, senior-engineer framing we want.

## 6. Server-side recompute (trust boundary)

- The engine computes a *reference* score locally for the offline report.
- On upload, the server **ignores the client's score** and recomputes from the submitted `findings`
  against the pinned `catalog_version`. The stored/badge/trend score is always the server's.
- If `|localScore − serverScore| > ε`, we log it (version skew or tampering signal) and, for skew,
  reconcile by re-scoring older engine output with the current catalog when displaying trends.

## 7. Explainability requirements

Every score in the UI is expandable to show:
- the per-category subscores and weights (with "not applicable" where relevant),
- each finding's exact point cost (severity × confidence × ruleWeight × decay),
- the gate reason (which finding forced the tier),
- the `catalog_version` used.

If we can't show the arithmetic, we don't show the number. This is the contract that makes the score
trustworthy rather than another opaque "AI grade."

## 8. Trend scoring

- Trends compare **like catalog versions**: when the catalog changes, we re-score prior scans' stored
  findings under the new catalog for an apples-to-apples line, labeling the version boundary.
- The North-Star "remediation rate" is computed from finding `fingerprint`s appearing in an earlier
  scan and absent (or `fixed`) in a later one.

## 9. Non-goals

- No AI/ML-derived scoring. No opaque weights learned from data (would violate transparency).
- No "industry percentile" ranking in V1 (needs a trusted corpus; risk of misleading comparisons).
- No single collapsed grade letter as the *only* output — tier + score together, always.
