# ShipReady AI

> Deterministic production-readiness auditing for AI-built applications.
> A **provider-agnostic policy engine**: existing analyzers (Semgrep, CodeQL, ESLint, Trivy, `tsc`, …)
> are interchangeable providers; ShipReady owns the canonical findings, policy, verdict, report, and AI
> explanations. AI never determines findings or verdicts.

## Status

**Sprint 0 — foundations.** Monorepo scaffold, strict TypeScript, CI, and the locked layering rules are
in place; packages are stubs proving the toolchain and the dependency graph. Real functionality begins in
Sprint 1 (the canonical `@shipready/schema`).

## Repository

- `packages/` — `schema` (contract) · `core` (provider-blind core) · `cli` · `config-tsconfig`.
- `docs/` — the full engineering blueprint, the adversarial review, and the provider architecture.
- `docs/adr/` — locked Architecture Decision Records (ADR-001 adopt-not-build, ADR-002 trust/attestation,
  ADR-003 policy-as-code).

## Quick start

```bash
pnpm install
pnpm run ci     # lint + typecheck + build + test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the layering rules and Definition of Done, and
[docs/README.md](./docs/README.md) for the blueprint index.
