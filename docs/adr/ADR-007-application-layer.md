# ADR-007 — Application Layer (`apps/web`)

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** ShipReady Architecture Team
- **Related:** ADR-001 (adopt-not-build), ADR-002 (trust & attestation), ADR-003 (policy-as-code),
  ADR-006 (repository foundation), `PROVIDER_ARCHITECTURE.md`, `SPRINTS.md` (S9–S15)

---

## Context

`apps/web` exists in the repository — a Next.js application, currently a marketing shell — but no ADR
defines what it is responsible for or what it may depend on. ADR-006 charters exactly four packages
(`schema`, `core`, `cli`, `config-tsconfig`) and is silent on the application layer entirely; the
dependency-cruiser rules encoding ADR-006 don't scan `apps/**` at all.

Left undefined, an application layer accumulates business logic by default, not by decision: a "just
this once" policy check inlined in a route handler, a severity computed in a component instead of read
from a canonical finding. Each instance is individually reasonable and collectively fatal to the
provider-blind, policy-as-code architecture ADR-001/003 establish. `SPRINTS.md` S9–S15 already assumes
`apps/web` hosts real product surface (auth, dashboard, ingest API, reports) — that surface needs a
boundary defined *before* it's built, not audited after the fact.

This ADR closes that gap and extends the same "boundaries enforced through tooling, not documentation
alone" posture ADR-006 established for the package graph.

---

## Decision

`apps/web` is the **application layer**: an orchestration and presentation surface. It calls into the
provider-blind core; it never becomes the core.

### Responsibilities

`apps/web` is responsible for:

- Marketing pages
- Dashboard UI
- Authentication
- Route handlers / API endpoints
- Server Actions
- Presentation logic (rendering findings, verdicts, and reports it does not compute)
- Calling the provider-blind core to obtain findings, coverage, and verdicts

### Must Never Contain

`apps/web` must never implement:

- Provider logic (analyzer adapters, SARIF ingestion)
- Scanner logic
- The policy engine or rule evaluation
- Canonical normalization (rule-identity resolution, fingerprinting, correlation)
- Score computation
- Security decision logic of any kind

If a page needs to know whether a repo is `blocked`, it reads a `Verdict` that was computed elsewhere —
it does not compute one.

### Allowed Internal Dependencies

```
@shipready/schema
```

Future (not yet built):

```
@shipready/sdk
```

`@shipready/schema` gives `apps/web` the canonical types it needs to validate input, render findings, and
type its own database/API layer — without exposing it to any decision logic. `@shipready/core` is
**deliberately not on this list today.** Once policy evaluation is real (Sprint 6+), the sanctioned way
for the application layer to invoke it is a future `@shipready/sdk` package — a stable, narrow, public
interface — not a direct dependency on `@shipready/core`'s internals. This keeps `core` free to change its
internal shape without a downstream break in the application layer, and keeps the application layer from
quietly absorbing business logic just because the import was one line away.

### Forbidden Dependencies

Application code must never directly import:

- Provider implementations
- Normalization internals
- Policy internals
- Analysis adapters

Concretely, this means no import of anything under `packages/core/src/` beyond its public barrel — and,
until `@shipready/sdk` exists, no import of `@shipready/core` at all. The application is an orchestration
layer, never a decision layer.

---

## Enforcement

Per ADR-006's posture, this is enforced by tooling, not left to review discipline:

- `.dependency-cruiser.cjs` now scans `apps/web/app` (previously out of scope entirely) and forbids
  `apps/web → packages/core/src` and `apps/web → packages/cli/src`, alongside the existing
  `packages/(schema|core|cli) → apps/web` reverse-direction prohibition.
- A general "respect the package barrel" rule forbids *any* consumer — `apps/web` included — from
  importing a file inside `packages/core/src` other than its `index.ts` entry point. This is written
  generally, not as three separately-named rules for "provider/policy/scanner," because those internals
  don't exist as concrete paths yet; a barrel-only rule protects whatever internal shape `core` grows into
  without needing an update every time it grows a new subdirectory.
- `apps/web/tsconfig.json` extends `@shipready/config-tsconfig`, so the application layer carries the same
  strict compiler settings as the rest of the repository.

---

## Alternatives Considered

### Allow `apps/web → @shipready/core` today

Rejected for now. `core` has no stable public contract yet beyond a placeholder — depending on it directly
from the application layer would mean `apps/web` breaks every time `core`'s internal shape changes during
Sprints 4–6, and it removes the one incentive (an explicit SDK boundary) to keep `core`'s public surface
deliberately narrow. Revisit once `@shipready/sdk` exists or `core` ships a stable evaluation entry point.

### No ADR — govern `apps/web` by convention/review only

Rejected. This is exactly the failure mode ADR-006 was written to prevent for the package graph: intent
that lives only in reviewers' heads drifts. `apps/web` is where the highest-traffic, most-frequently-edited
code in the product will live (dashboard, auth, reports) — it is the *most* important place to have a
mechanically enforced boundary, not the place to skip one.

---

## Consequences

**Positive**
- Closes the last ungoverned surface in the repository; `apps/web` now has the same "boundaries enforced
  through tooling" guarantee as the package graph.
- Forces the eventual policy-evaluation integration through a deliberate, narrow SDK boundary instead of a
  direct dependency on `core`'s internals.
- Future contributors adding a dashboard page or route handler have an explicit, checked answer to "am I
  allowed to import this."

**Tradeoffs**
- Until `@shipready/sdk` exists, any server-side code in `apps/web` that needs policy evaluation (S10:
  "server-side score recompute") has no sanctioned dependency to call. This is intentional pressure to
  build the SDK boundary deliberately, rather than reaching for `@shipready/core` because it's already in
  the workspace.

---

## Future Evolution

- `@shipready/sdk` is scoped and built when `apps/web` first needs to invoke policy evaluation
  (`PROVIDER_ARCHITECTURE.md` §5.2's `evaluatePolicy`), likely alongside Sprint 10.
- This ADR does not define the ingest API's trust boundary (ADR-002 already does: the server recomputes,
  the client is untrusted) or the database schema (`DATABASE.md`) — only what `apps/web` may import and
  contain.
