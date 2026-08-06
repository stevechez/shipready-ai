# ShipReady AI — Engineering Blueprint

> Deterministic production-readiness auditing for AI-built applications.
> Static analysis first. AI for explanation only. Source code never leaves the user's machine.

This directory is the **engineering handbook**. It is designed so an engineer can build ShipReady
without making unrecorded architectural decisions. Read it in order.

## Foundational decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Where analysis runs | **CLI-first hybrid** — engine runs in the user's environment; only findings + redacted evidence sync to the hosted dashboard | Source code never leaves the machine; no untrusted-code execution on our infra; trivial CI integration; uses the user's real toolchain |
| Execution model | **Static-only for V1** — AST / SQL / config / lockfile parsing, never boot or run the target app | Maximizes determinism; zero sandbox infra; fast and safe |
| Trust boundary | **The CLI is untrusted.** Server recomputes scores from findings; public badges require signed attestation (Phase 2) | Prevents fabricated "100% ready" reports |

## Document index

| # | Doc | Purpose |
|---|---|---|
| 1 | [PROJECT.md](./PROJECT.md) | Vision, users, market, problem, success metrics, roadmap |
| 2 | [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, subsystems, data flow, boundaries, diagrams |
| 3 | [STACK.md](./STACK.md) | Technology choices with alternatives and justification |
| 4 | [DATABASE.md](./DATABASE.md) | Schema, relationships, indexes, RLS, versioning, migrations |
| 5 | [AUTH.md](./AUTH.md) | Authn, authz, orgs, permissions, ownership, sessions, threat model |
| 6 | [AUDIT_ENGINE.md](./AUDIT_ENGINE.md) | Rules, categories, IDs, evidence, confidence, severity, extensibility |
| 7 | [SCORING.md](./SCORING.md) | How the Production Readiness Score is computed |
| 8 | [SECURITY.md](./SECURITY.md) | Threat model, OWASP, secrets, rate limiting, validation, logging |
| 9 | [FILE_SCANNER.md](./FILE_SCANNER.md) | Repo parser, AST, discovery, dependency + framework detection |
| 10 | [REPORT_ENGINE.md](./REPORT_ENGINE.md) | HTML/PDF reports, charts, evidence formatting, summaries |
| 11 | [AI_LAYER.md](./AI_LAYER.md) | Where AI is allowed/forbidden, prompts, structured output, cost |
| 12 | [API.md](./API.md) | REST endpoints, payloads, errors, validation, pagination, webhooks |
| 13 | [UI_SYSTEM.md](./UI_SYSTEM.md) | Design system, components, dashboard, finding cards, a11y, dark mode |
| 14 | [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | Directory tree, naming, imports, layering |
| 15 | [CODING_STANDARDS.md](./CODING_STANDARDS.md) | TS/React/Next conventions, testing, state, performance |
| 16 | [CURSOR_RULES.md](./CURSOR_RULES.md) | Detailed AI-assistant rules + Definition of Done |
| 17 | [SPRINTS.md](./SPRINTS.md) | 18 implementation sprints with acceptance criteria |
| 18 | [MVP_SCOPE.md](./MVP_SCOPE.md) | What ships in V1, what is deliberately excluded |
| 19 | [BACKLOG.md](./BACKLOG.md) | Prioritized feature backlog with complexity/impact/risk |
| 20 | [RISKS.md](./RISKS.md) | Technical, business, architecture, scaling, vendor risks |

## The one-paragraph version

ShipReady is `npx shipready scan`. It walks an AI-built repository in place, runs a registry of
deterministic rules (does RLS exist, is a secret committed, is auth enforced, is the dependency tree
bloated, does TypeScript compile), and emits a structured, evidence-backed `ScanResult`. Run offline
it produces a local report. Authenticated, it uploads findings — never source — to a hosted dashboard
where an AI layer turns each proven finding into a plain-English explanation, a prioritized remediation
plan, and an exportable Production Readiness Report. The score is deterministic, transparent, and
recomputed server-side. Every finding carries evidence. Nothing is invented.
