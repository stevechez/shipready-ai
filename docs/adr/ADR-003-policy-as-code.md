# ADR-003 — Policy-as-Code Is the Product; Scoring Is Secondary

- **Status:** Accepted (locked pre–Sprint 0)
- **Date:** 2026-08-06
- **Deciders:** Architecture Review Board / Founding CTO
- **Related:** SCORING.md, PROVIDER_ARCHITECTURE.md (§5), ARCHITECTURE_REVIEW.md (§4)

## Context

The original design led with a 0–100 Production Readiness Score. The review established two problems:

1. **Any visible score is a Goodhart target** — developers optimize the number, not the software (suppress
   here, restructure to dodge a pattern there). A single headline number invites gaming and disputes.
2. **Enterprises don't buy a number; they enforce controls.** Serious buyers want named, non-negotiable
   requirements ("no data-exposure finding at firm+ confidence may ship") with waivers, audit trails, and
   the ability to override our opinions — not a weighted average whose weights are our judgment presented
   as fact.

Meanwhile the platform is now provider-agnostic (ADR-001): the verdict must be defined purely over the
**canonical finding set + coverage**, independent of which analyzers produced it.

## Decision

**Policy-as-code is the primary abstraction and the product's verdict; the 0–100 score is one optional,
override-able diagnostic output of a policy — not the verdict.**

- A **policy profile** (`shipready.policy.yaml`, versioned + pinned per scan) defines: **named controls**
  (predicates over canonical findings), a **gate** (`pass` / `fail` / `insufficient_coverage`),
  **required coverage**, **severity/weight overrides**, and **waivers** (expiring, justified, audited).
- The **gate is binary and named.** "Blocked because control `NO-DATA-EXPOSURE` failed" is the verdict —
  explainable, defensible, and enforceable in CI.
- **Scoring is a policy sub-output.** The default profile reproduces SCORING.md's math as a *diagnostic and
  trend signal*. Enterprises may re-weight it or disable it entirely and gate purely on controls.
- The policy engine is **provider-blind and coverage-aware**: it reads `PolicyFinding` (no provenance) plus
  the coverage matrix, so it can return `insufficient_coverage` rather than a false `pass`, and its verdict
  is byte-identical regardless of which provider produced an equivalent canonical finding.

## Why policy is the product

- It is the artifact a team can **enforce** (CI gate), **audit** (named controls + waivers + timestamps),
  and **own** (override our defaults). A score is none of those.
- It makes the verdict **explainable to a non-engineer** ("this specific, named rule failed, here's the
  evidence") and **defensible to an engineer** (deterministic predicate, not an opaque weighting).
- It is the correct home for enterprise requirements (policy-per-org, compliance mappings, custom
  thresholds) — the layer people actually pay for.

## Why scoring is secondary

- A number is a lossy, game-able compression of a set of facts. Keeping it as a *diagnostic* preserves its
  genuine value (trend lines, at-a-glance health, prioritization) without letting it become the thing teams
  optimize or dispute in place of shipping safe software.
- Because weights are judgment calls, presenting them as *the* verdict invites (justified) rejection.
  Framing them as a tunable diagnostic profile makes the judgment explicit and negotiable.

## How deterministic policy enables enterprise trust

- **Reproducible verdicts:** `evaluatePolicy(findings, coverage, policy)` is pure. Same inputs → same
  verdict, pinned by `policyVersion` + `catalogVersion` + provider BOM (ADR-002). An auditor can reproduce
  any historical verdict.
- **No AI on the verdict path:** policy is deterministic code over deterministic facts; AI only explains.
  This is the property that lets a Fortune 500 team gate a deployment on us.
- **Coverage honesty:** "we could not verify X" is a first-class verdict, so a passing gate means "the
  required checks ran and passed," never "nothing was found."
- **Ownership + auditability:** controls are named, waivers are explicit and expiring, overrides are
  recorded. The verdict is a governed artifact, not a black box.

## Alternatives

1. **Score as the verdict (original).** Rejected: game-able, disputable, not enforceable, weights-as-fact.
2. **Letter grades.** Rejected: *less* explainable and *more* Goodhart-prone than a named gate + evidence.
3. **Policy only, no score at all.** Rejected: the score is genuinely useful as a diagnostic/trend; discard
   its value, not its primacy.

## Consequences

- SCORING.md is reframed as the **default scoring profile**, one input to a policy — not the top-level
  contract.
- Enterprise features (policy-per-org, compliance profiles, custom gates) get a natural home and become the
  monetizable control plane.
- The score can never, by construction, gate a deployment on its own; a control must.

## Tradeoffs

- **Familiarity vs. rigor:** a headline number is easier to market than "define your policy." Mitigated by
  shipping a strong default policy so the out-of-box experience is one-click, while the ceiling is
  enterprise policy-as-code.
- **Flexibility vs. comparability:** org-overridable policies make cross-org score comparison less
  meaningful — an acceptable loss, since comparability was never a trustworthy basis for a verdict anyway.

## Future Evolution

- Policy profiles as versioned, shareable content (community/industry baselines; compliance mappings to
  SOC2 / OWASP ASVS with evidence export).
- Org policy inheritance/composition; per-repo overrides; policy simulation ("what would this policy change
  do to our last 100 scans").
