# ADR-002 — Trust & Attestation Model

- **Status:** Accepted, with a phased rollout (locked pre–Sprint 0)
- **Date:** 2026-08-06
- **Deciders:** Architecture Review Board / Founding CTO
- **Related:** ARCHITECTURE_REVIEW.md (B0-2), PROVIDER_ARCHITECTURE.md (§7, §8), AUTH.md, SECURITY.md

## Context

ShipReady is local-first and zero-source-retention: the scan runs in the user's environment; only
normalized findings + redacted evidence leave the machine. The server recomputes the verdict from
submitted findings. The review (B0-2) proved this creates an **unavoidable tension**:

- Server recompute defends against a client *inflating* penalties.
- It does **nothing** against a client *omitting* findings — a tampered CLI can drop the one Critical and
  receive a clean, server-blessed verdict — because the server never sees the source and never re-runs the
  scan.
- Therefore any **externally visible "Ready" badge is forgeable**, and a signature over a fabricated
  ScanResult is a valid signature over a lie. Trustworthy attestation requires an *independent
  reproduction* of the scan, which conflicts with zero-retention.

We must decide what "trust" means for three different consumers: **(a) the user themselves**, **(b) a
client/buyer the user shares a report with**, and **(c) a third party relying on a public badge.**

## Decision

Adopt a **tiered trust model** matched to the consumer, and stop pretending one mechanism serves all three.

1. **Self-trust (V1, default): recompute + reproducibility.**
   - Every scan pins the full **bill of materials**: `engineVersion`, `findingSchemaVersion`,
     `providerApiVersion`, each provider `version`, `catalogVersion`, `policyVersion`, and
     `shipready.providers.lock` hash.
   - The ScanResult is **reproducible**: given the same commit + the same pinned BOM, `shipready verify`
     reproduces a byte-identical *canonical finding set hash* and verdict. Trust is grounded in
     reproducibility, not in our word.
   - For the user's own dashboard, tampering is self-defeating; recompute + reproducibility is sufficient.

2. **Shared-report trust (V1): signed report provenance, honestly scoped.**
   - Reports/badges are signed over `{commitSha, BOM hash, canonicalFindingSetHash, verdict}` and marked
     **self-reported**. A viewer can verify the signature and reproduce the scan themselves. We do **not**
     claim a self-reported badge proves the repo was scanned honestly.

3. **Verifiable trust (Phase 2): trusted-runner attestation.**
   - The authoritative, third-party-trustable badge is produced only by a **ShipReady-authorized runner**
     the *repo owner grants access to* (a GitHub App / CI action running in the customer's own CI or an
     isolated ephemeral runner). The runner attests
     `{commitSha, BOM, canonicalFindingSetHash, verdict, runnerIdentity}`.
   - Source is processed **transiently in the customer's CI / an isolated runner and never retained**,
     preserving the zero-retention *storage* guarantee while enabling independent reproduction.
   - This makes "zero-source-retention, client-only" a **V1 convenience, not a permanent architectural
     law** — the trusted runner is the sanctioned exception, and it is opt-in and owner-authorized.

**We will not ship a badge that claims third-party-verifiable trust until (3) exists. V1 badges are
explicitly self-reported.** Honesty of the trust claim is a hard requirement.

## Alternatives

1. **Server re-runs every scan (hold source transiently server-side).** Rejected for V1: reintroduces
   source custody and untrusted-code execution on our infra — the exact posture we rejected in the review.
   Survives only as the *customer-authorized runner* variant in Phase 2.
2. **Badges are always advisory, never verifiable.** Honest but caps the enterprise/marketing story; kept
   as the V1 stance, superseded by (3) later.
3. **Signature-only attestation (sign the ScanResult, call it verified).** Rejected: signs a possibly-
   fabricated artifact; false assurance is worse than none.
4. **Cryptographic proof of complete analysis (zk-ish).** Rejected: not tractable for arbitrary static
   analysis; research risk incompatible with a ship date.

## Consequences

- The **verdict is a function of `(code, policy, provider-set, catalog)`, not of code alone.** Attestation
  therefore binds the BOM + provider lock (it does). Marketing must say "deterministic *given a fixed,
  attested provider set*," never "deterministic" unqualified.
- V1 ships trustworthy *self-trust* and *reproducibility* immediately; verifiable public badges wait for
  the trusted runner. No dishonest interim claim.
- Reproducibility becomes a **product-testable property** (a CI check: re-run → identical hash), which also
  guards against determinism regressions.

## Tradeoffs

- **Trust vs. zero-retention purity:** verifiable trust requires transient source access in an
  owner-authorized runner. We accept a scoped, opt-in exception over a permanently unverifiable badge.
- **Simplicity vs. honesty:** three tiers is more to explain than one badge, but a single badge would be a
  lie for two of the three consumers.

## Future Evolution

- Phase 2: trusted-runner attestation + a **verification service** (given an attestation, a third party
  confirms it was produced by an authorized runner over that commit).
- Phase 3+: reproducible-build provenance for the CLI/providers (sigstore/npm provenance), a revocation
  list for compromised providers, and enterprise-controlled runner identities.
- The `canonicalFindingSetHash` + BOM primitives defined now are the durable foundation; the runner is an
  additive trust source, not a schema change.
