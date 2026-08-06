# ADR-006: Repository Foundation & Monorepo Architecture

**Status:** Accepted

**Date:** 2026-08-06

**Owners:** ShipReady Architecture Team

---

# Context

Sprint 0 established the engineering foundation for ShipReady.

Unlike feature sprints, Sprint 0 intentionally delivers almost no business functionality.

Its purpose is to create a repository that encodes architectural decisions directly into the development workflow so they cannot silently drift over time.

This ADR documents those foundational decisions and explains why they exist.

Future contributors should assume these decisions are deliberate rather than incidental.

---

# Decision

ShipReady will be developed as a **pnpm + Turborepo monorepo** with strict architectural boundaries enforced through tooling rather than documentation alone.

The initial repository consists of four packages:

```
@shipready/schema
@shipready/core
@shipready/cli
@shipready/config-tsconfig
```

The dependency graph is intentionally one-directional.

```
schema
    ↓
core
    ↓
cli
```

No reverse dependencies are permitted.

The CLI orchestrates execution.

The Core implements provider-independent business logic.

The Schema package owns all shared contracts and types.

---

# Repository Principles

## 1. Schema Owns the Language

The Schema package defines the canonical vocabulary of ShipReady.

Examples include:

- CanonicalFinding
- ProviderFinding
- RuleId
- Severity
- Confidence
- Evidence
- Coverage
- PolicyResult
- Verdict

Every package depends on these contracts.

No package may redefine or extend them independently.

Schema is the single source of truth.

---

## 2. Core Owns Behavior

The Core package contains the deterministic business logic that transforms provider findings into production-readiness decisions.

Core is intentionally provider-blind.

It does not:

- know which analyzer produced a finding
- invoke external analyzers directly
- contain CLI concerns
- contain UI concerns

Core only consumes canonical contracts.

---

## 3. CLI Owns Orchestration

The CLI coordinates execution.

Responsibilities include:

- loading configuration
- discovering repositories
- invoking providers
- collecting provider output
- invoking the Core
- rendering results
- handling process exit codes

The CLI must not contain business logic.

Business logic belongs exclusively in Core.

---

## 4. Shared Configuration

Common TypeScript configuration is centralized in:

```
@shipready/config-tsconfig
```

This guarantees:

- consistent compiler options
- consistent strictness
- reproducible builds
- identical type behavior across packages

Projects should extend shared configuration rather than duplicating compiler settings.

---

# Architectural Enforcement

Repository boundaries are enforced through tooling.

Documentation alone is insufficient.

The repository includes automated checks for:

- dependency direction
- build correctness
- linting
- type safety
- testing
- dependency auditing

Violations fail CI.

This architecture is intended to be mechanically enforceable.

---

# TypeScript Standards

All packages use strict TypeScript.

Required compiler options include:

- strict
- noUncheckedIndexedAccess
- exactOptionalPropertyTypes
- verbatimModuleSyntax

Relaxing compiler strictness requires an ADR.

---

# Build Philosophy

Source packages resolve directly through workspace references during development.

Compiled output is produced only during package builds.

TypeScript is responsible for validation.

tsup is responsible for packaging.

The repository intentionally avoids unnecessary intermediate build steps during development.

---

# Continuous Integration

Every pull request must successfully complete:

1. Install
2. Lint
3. Typecheck
4. Build
5. Test
6. Dependency audit

CI failures block merges.

Architectural correctness is considered part of build correctness.

---

# Dependency Management

ShipReady prioritizes reproducible builds.

Repository-wide dependency versions are managed centrally through pnpm.

Temporary overrides are acceptable when they eliminate known security issues or supply-chain vulnerabilities.

Overrides should be reviewed and removed once upstream dependencies have incorporated the fixes.

---

# Security Philosophy

ShipReady is a security product.

The repository itself should reflect the standards expected of the software it evaluates.

This includes:

- zero known dependency vulnerabilities
- strict type safety
- reproducible builds
- explicit dependency relationships
- automated architectural enforcement

We should never ask customers to trust practices we do not follow ourselves.

---

# Consequences

## Positive

- Clear package ownership
- Stable dependency direction
- Fast local development
- Predictable builds
- Strong architectural enforcement
- Easier onboarding
- Lower long-term maintenance cost
- Better scalability as packages grow

## Tradeoffs

- Additional repository complexity compared to a single package
- More configuration up front
- Stricter contribution requirements
- Contributors must understand package boundaries

These costs are intentional and acceptable.

---

# Alternatives Considered

## Single Package Repository

Rejected.

Advantages:

- Simpler initially
- Less configuration

Disadvantages:

- Weak architectural boundaries
- Easier coupling
- Harder future extraction
- Reduced scalability

---

## Independent Repositories

Rejected.

Advantages:

- Complete package isolation

Disadvantages:

- More operational overhead
- Version coordination complexity
- Poor local development experience
- Difficult cross-package refactoring

---

## Engine-Centric Package Structure

Rejected.

Following ADR-001, ShipReady is no longer an analysis engine.

The package formerly described as an "engine" is instead the provider-independent Core.

This naming reflects the actual architectural responsibility and reinforces the distinction between analyzer providers and ShipReady's value layer.

---

# Success Criteria

This foundation is considered successful if future contributors can:

- add providers without modifying Core contracts
- evolve policy independently of the CLI
- enforce architecture automatically through CI
- scale the repository without restructuring package boundaries

---

# Future Evolution

This ADR intentionally does **not** define:

- provider implementations
- canonical finding schema
- policy engine behavior
- scoring
- reporting
- analyzer integration

Those are covered by separate ADRs and implementation sprints.

This document exists solely to preserve the repository architecture established during Sprint 0.

---

# Decision Summary

Sprint 0 established the repository as an enforceable architectural foundation rather than a collection of packages.

The repository structure is part of the product architecture.

Changes to package boundaries, dependency direction, or repository organization should be treated as architectural decisions and require a new ADR.
