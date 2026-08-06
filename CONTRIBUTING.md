# Contributing to ShipReady

ShipReady audits other people's code for production readiness, so our own repo holds itself to the
standard it sells. Read `docs/CODING_STANDARDS.md` and `docs/CURSOR_RULES.md` before your first PR.

## Monorepo layout

| Package | Role |
|---|---|
| `@shipready/schema` | Canonical types + Zod schemas — the single source of truth. Depends on nothing internal. |
| `@shipready/core` | The **provider-blind** core: normalization → policy → report over the canonical model (ADR-001; formerly conceived as "the engine"). |
| `@shipready/cli` | The `shipready` CLI — orchestrates providers locally; a client of the core. |
| `@shipready/config-tsconfig` | Shared strict TypeScript presets. |

**Layering (enforced by dependency-cruiser, `pnpm run depcruise`):**

```
schema  ←  core  ←  cli
```

- `schema` imports no other `@shipready/*` package.
- `core` must never import the `cli`.
- No circular dependencies.
- Later: `apps/web` may import `@shipready/schema` (types) but never the core runtime.

## Setup

```bash
pnpm install
pnpm run build        # turbo: builds schema → core → cli
pnpm run typecheck    # tsc --noEmit per package (internal deps resolve to src via tsconfig paths)
pnpm run test         # vitest per package
pnpm run lint         # Biome + dependency-cruiser layering rules
```

`pnpm run ci` runs the full gate locally (the same steps CI runs).

## Conventions

- **TypeScript strict**, no `any` in `schema`/`core`; validate external input with Zod at boundaries.
- **Conventional Commits**; small, focused PRs; a **Changeset** (`pnpm changeset`) for any package change.
- **Determinism** in `core` is sacred: no network, no `Date.now()`/`Math.random()`, no LLM on the
  verdict path (docs/AI_LAYER.md, docs/PROVIDER_ARCHITECTURE.md §0).

## Definition of Done

A change is Done only when **all** hold:

- [ ] Meets the requirement; scope matches the ticket (no smuggled redesigns).
- [ ] `strict` types; no `any` in `schema`/`core`; boundaries Zod-validated.
- [ ] Tests added/updated; deterministic; coverage thresholds met (`schema`/`core` ≥ 90%).
- [ ] Security respected where relevant (RLS + server authz, input validation, no secret/source leakage).
- [ ] Determinism preserved in `core`; AI stays off the verdict path.
- [ ] Layering/import rules respected (`pnpm run depcruise` green).
- [ ] `pnpm run lint` + `pnpm run typecheck` + `pnpm run build` + `pnpm run test` pass.
- [ ] Docs / catalog / ADRs updated if the change affects them.
- [ ] A Changeset is included for any published-package change.
- [ ] Reviewed by a second party; security-sensitive areas get a security-focused review.

See `docs/README.md` for the full engineering blueprint and `docs/adr/` for locked decisions.
