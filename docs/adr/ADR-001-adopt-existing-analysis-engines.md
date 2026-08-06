# ADR-001 — Adopt Existing Analysis Engines Instead of Building Our Own

- **Status:** Accepted (locked pre–Sprint 0)
- **Date:** 2026-08-06
- **Deciders:** Architecture Review Board / Founding CTO
- **Supersedes:** the "own pure-TS deterministic engine" design in the original AUDIT_ENGINE.md / FILE_SCANNER.md

## Context

The original blueprint had ShipReady building a bespoke static-analysis engine (TS compiler-API traversal,
custom SQL model, imperative "rules as pure TS functions," and — eventually — its own dataflow/taint).
The adversarial review (ARCHITECTURE_REVIEW.md, B0-1) established three facts that make that path wrong:

1. The **highest-value findings** ShipReady sells — broken authorization, auth-not-enforced,
   unvalidated-input-reaching-a-sink — require interprocedural symbol resolution, control-flow, and taint
   analysis. That is exactly where hand-written AST matching is weakest and false-positive rates are
   highest. Our own spec had to mark `SR-AUTHZ-001` *Tentative* for this reason.
2. Building that engine is a re-implementation of Semgrep/CodeQL — hundreds of engineer-years — and the
   result would be a *worse* Semgrep with a nicer report.
3. The engine is **not the moat.** The defensible assets are the curated readiness ruleset for AI-built
   Supabase/Next apps, the deterministic verdict, and the explanation/report experience.

## Decision

**ShipReady does not build a general static-analysis engine.** It becomes a **provider-agnostic policy and
verdict layer** over interchangeable analyzers (Semgrep, CodeQL, ESLint, Trivy, `tsc`, future providers),
normalized through SARIF 2.1.0 into a canonical Finding model that ShipReady owns
(PROVIDER_ARCHITECTURE.md). ShipReady authors:

- a small number of **native semantic providers** for gaps external engines cover poorly and that are core
  to our niche (Supabase RLS/SQL semantics, dependency-graph/lockfile facts, config facts);
- the **curated rule catalog** (canonical rules, severity, weight, remediation, docs) and the
  **mapping** from provider-native rules to canonical rules;
- the **policy engine, verdict, corroboration, coverage, reporting, and AI explanation** layers.

External engines are wrapped as sandboxed providers. Their rulesets are treated as raw signal; ShipReady
assigns all *meaning*.

## Alternatives Considered

1. **Build our own engine (original plan).** Rejected: cost, weaker dataflow, no moat, decade-long catch-up
   to incumbents on the parts that matter.
2. **Wrap a single engine (Semgrep only), hard-coupled.** Rejected: re-creates the lock-in and single-
   vendor risk we're trying to avoid; forecloses CodeQL-grade dataflow and multi-language expansion; makes
   us hostage to one competitor's roadmap and licensing.
3. **Pure LLM-based analysis.** Rejected outright: violates the determinism principle; unverifiable;
   hallucination-prone. AI never determines findings or verdicts.
4. **Provider-agnostic layer over many engines (chosen).** Accepted: inherits taint/multi-language for
   free, avoids single-vendor lock-in, and concentrates our effort on the durable assets.

## Consequences

**Positive**
- Real interprocedural authz/injection detection available in V1 via mature engines, not tentative
  heuristics.
- Multi-language future (Part-9 expansion) becomes "add a provider," not "rewrite the engine."
- Independence is preserved: we are the neutral verdict layer, not any one analyzer.
- Effort concentrates on the moat: catalog + policy + verdict + report + explanation.

**Negative / costs**
- We take a **runtime dependency on tools that are also potential competitors**, and inherit their
  operational quirks, versions, and licensing (LGPL/commercial nuances of the engines and of any registry
  rules — see OSS/licensing work).
- We must **wrap, sandbox, version, and reconcile** heterogeneous providers — the complexity moves from
  "write rules" to "normalize and govern providers."
- Some provider outputs (rich RLS facts) don't fit SARIF cleanly; native providers emit canonical findings
  directly (two ingestion lanes — see Tradeoffs).

## Tradeoffs

- **Control vs. leverage:** less control over the analysis engines, far more leverage from their maturity.
  Net positive given our moat is elsewhere.
- **Determinism vs. provider variance:** external engines vary in determinism; we record each provider's
  determinism guarantee and let policy refuse to *gate* on best-effort provenance (ADR-003 / coverage
  model). Verdict determinism is preserved *given a pinned provider set*.
- **SARIF-first vs. native facts:** SARIF is the interchange for wrapped external engines; native semantic
  providers (RLS/SQL, deps) emit canonical findings directly rather than round-tripping structured facts
  through SARIF `properties` bags. This two-lane ingestion is deliberate, not an inconsistency.

## Future Implications

- Positions ShipReady to become **infrastructure/standard** — an embeddable readiness layer other tools and
  platforms call — rather than a single SaaS tool. That optionality is cheap now and impossible to retrofit
  onto a bespoke-engine design.
- A signed, declarative **rule-pack ecosystem** ("OWASP for AI apps") becomes possible precisely because we
  don't run third-party engine code ourselves.
- If any single engine's license or roadmap turns hostile, we can swap it behind the canonical model with
  bounded blast radius — the exact property ADR-001 exists to guarantee.
