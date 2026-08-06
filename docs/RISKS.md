# RISKS.md — ShipReady AI

Honest risk register. Each risk: **Likelihood × Impact**, the **early warning signal**, and the
**mitigation**. The existential ones are flagged 🔴. Reviewed each phase.

## 1. Product / trust risks (the ones that can kill us)

### 🔴 R1 — False positives destroy credibility
- **L: High · I: Existential.** A single wrong "Critical" told to a client is a firing offense for our
  user and a reason to never trust us again. Trust is the whole product.
- **Signal:** rising false-positive reports per rule; precision on the golden corpus dipping below 95%.
- **Mitigation:** confidence as a first-class concept (tentative rules dampened + quarantined from the
  gate); "evidence or no finding" contract; golden-corpus regression gate in CI; per-rule precision
  telemetry; bias toward under-claiming. We would rather miss than fabricate.

### 🔴 R2 — False negatives create false confidence
- **L: Med · I: High.** Telling a dangerous repo it's "Ready" is the inverse failure and equally
  damaging (a breach the user thought we'd catch).
- **Signal:** post-incident "you missed X"; coverage gaps in the corpus.
- **Mitigation:** honest scoping everywhere ("static analysis; presence/shape, not runtime proof");
  clear "not evaluated"/inconclusive surfacing; the gate is conservative; roadmap for dynamic checks
  (opt-in) to close known static blind spots without overpromising in V1.

### R3 — "Just a linter" perception / weak differentiation
- **L: Med · I: High.** Users conflate us with ESLint/Snyk and don't see the readiness-verdict value.
- **Signal:** low activation→account conversion; churn citing existing tools.
- **Mitigation:** lead with the *verdict + evidence + plain-language report* for a specific stack;
  deterministic, explainable score; the CLI's zero-friction "aha"; rule pages as SEO/education.

### R4 — Adoption friction / no habit formation
- **L: Med · I: Med.** A one-shot scan without recurring value doesn't retain.
- **Signal:** low repeat-scan rate.
- **Mitigation:** CI gate + GitHub App (P1), trend/regression alerts, North-Star focus on remediation
  rate (tie our success to their outcome).

## 2. Technical / architecture risks

### 🔴 R5 — Client-tamperable scores undermine verifiable claims
- **L: Med · I: High (for badges).** The CLI is untrusted; a user can fabricate a passing `ScanResult`.
- **Signal:** local/server score deltas; any public badge misuse.
- **Mitigation (V1):** server-side score recompute makes self-tampering pointless for one's own
  dashboard; delta logging. **(P1):** signed attestation for any externally verifiable badge — scoped
  honestly, not oversold in V1.

### R6 — Static analysis blind spots
- **L: High (inherent) · I: Med.** We can't prove runtime behavior (that an RLS policy *actually* denies
  a request), only its presence/shape.
- **Signal:** finding classes users expect that we structurally can't see.
- **Mitigation:** confidence levels communicate this; opt-in sandboxed dynamic checks on the roadmap as
  a *separated* surface; never claim more than static analysis supports.

### R7 — Parser fragility / engine crashes on weird repos
- **L: Med · I: Med.** Malformed SQL/TS, exotic configs, huge repos.
- **Signal:** `ruleError`/`parseError` rates; scan failures.
- **Mitigation:** isolated per-rule execution (throw→visible `ruleError`, never silent pass); graceful
  degradation; `truncated`/`skipped` surfaced; broad golden-fixture coverage of malformed inputs.

### R8 — Determinism regressions creep in
- **L: Med · I: High.** Someone adds a clock/random/network call to the engine or scoring.
- **Signal:** flaky snapshot tests; local/server score disagreement beyond version skew.
- **Mitigation:** lint rules banning `fetch`/`Date`/`Math.random`/`fs`(outside scanner) in
  engine/scoring; determinism property tests; server recompute as a second check.

### R9 — AI leaks onto the verdict path or hallucinates into reports
- **L: Med · I: High.** A refactor lets AI influence findings/scores, or AI fabricates an identifier.
- **Signal:** report claims not backed by evidence; enrichment referencing unknown files.
- **Mitigation:** structural impossibility (enrichment DTO has no severity/existence/score fields);
  Zod + grounding validation with template fallback; "renders fully with AI down" test; injection
  hygiene.

## 3. Security risks (we're a target *because* we're a security tool)

### 🔴 R10 — Tenant isolation failure (cross-org data read)
- **L: Low · I: Existential.** A security product leaking one customer's findings to another is fatal.
- **Signal:** RLS advisory failures; anomalous cross-org queries.
- **Mitigation:** RLS `enable`+`force` default-deny everywhere + `with check`; two-layer authz; CI
  `get_advisors` gate; RLS isolation tests in CI; server-derived `org_id`.

### R11 — Secret/source leakage via evidence
- **L: Low · I: High.** A raw secret or source snippet reaches our DB/logs/report.
- **Signal:** secret-pattern hits in stored evidence; scrub-test failures.
- **Mitigation:** two-layer redaction (engine marks, CLI masks) + ingest-time re-scan; secret-scrubbing
  logs; we never receive source at all.

### R12 — API abuse / DoS (esp. AI cost)
- **L: Med · I: Med.** Upload floods, huge payloads, expensive enrichment.
- **Signal:** rate-limit trips, cost spikes.
- **Mitigation:** rate limits + quotas + size/finding caps; AI budget + queue backpressure; Vercel
  Firewall/BotID; alerting.

## 4. Business risks

### R13 — Narrow ICP (Next.js/Supabase) caps TAM
- **L: Med · I: Med.** Focus is our strength and our ceiling.
- **Mitigation:** dominate the beachhead first (precision), then expand frameworks deliberately (P2)
  gated on corpus precision — breadth without precision would trigger R1.

### R14 — AI coding tools add "readiness" checks natively
- **L: Med · I: High.** Cursor/Claude/Vercel could bundle a checker.
- **Signal:** platform announcements.
- **Mitigation:** be the *independent, deterministic, evidence-backed* auditor (a generator grading its
  own homework is a conflict of interest); depth of rules + audit trail + report quality as moat;
  potential to be the engine *inside* those tools.

### R15 — Monetization timing
- **L: Med · I: Med.** Free CLI cannibalizes paid value.
- **Mitigation:** free core scan for activation; monetize teams/CI/history/attestation/enterprise
  (where the recurring value is), not the first scan.

## 5. Scaling risks

### R16 — Report/PDF + AI jobs under load
- **L: Med · I: Med.** Playwright PDF and enrichment are the heavy paths.
- **Mitigation:** Fluid Compute; queued jobs with budgets/backpressure; cache enrichment by fingerprint;
  scanning itself scales for free (runs on the user's machine).

### R17 — Postgres growth (immutable scans/findings)
- **L: Med · I: Low/Med.** Immutable history grows.
- **Mitigation:** normalized findings + jsonb raw; indexes per DATABASE.md; retention by plan; archival
  of old raw results; trend rollups.

## 6. Vendor / lock-in risks

### R18 — Supabase lock-in
- **L: Low · I: Med.** Deep on Supabase Auth + RLS + Storage.
- **Mitigation:** it's plain Postgres underneath (portable schema/migrations via Drizzle); auth behind
  our own `authorize()` seam; acceptable, deliberate lock-in for velocity. Documented exit path.

### R19 — Vercel lock-in
- **L: Low · I: Low/Med.** Fluid Compute, Gateway, Firewall.
- **Mitigation:** standard Next.js (portable); Gateway abstracts providers; edge-specific features
  avoided. Acceptable.

### 🔴 R20 — AI model/provider changes (deprecation, price, quality, ToS)
- **L: High · I: Med.** Models change under us.
- **Signal:** deprecation notices, cost/quality shifts, eval regressions.
- **Mitigation:** **AI Gateway** with `provider/model` routing + fallback chain; model + prompt_version
  recorded; eval harness catches regressions; and critically — **AI is never on the verdict path**, so a
  provider outage degrades prose, not correctness. This is the payoff of the whole determinism thesis.

### R21 — Engine dependency supply chain (we audit deps; ours could be compromised)
- **L: Low · I: High.** A poisoned parser dep in the engine users run locally.
- **Mitigation:** minimal, justified engine deps; lockfile committed; `pnpm audit`; no postinstall in our
  packages; pin + review updates; publish provenance (npm provenance/signing).

## 7. Top risks to watch (rolled up)

1. **R1 false positives** — precision is survival.
2. **R10 tenant isolation** — one leak ends us.
3. **R5/R20 tamper + model volatility** — both mitigated by the same core bet: *the verdict is
   deterministic and AI-independent*.
4. **R2 false negatives / R6 static blind spots** — honesty of scope is the mitigation.
5. **R14 platform incumbents** — independence + determinism + rule depth is the defense.

The through-line: **every existential risk is blunted by the same architectural decision — a
deterministic, evidence-backed core that neither the client nor the AI can move.** That is why the
determinism principle is treated as non-negotiable throughout this blueprint.
