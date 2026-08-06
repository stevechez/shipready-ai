# PROJECT.md — ShipReady AI

## 1. Vision

Millions of applications are now being built by people who are not professional software engineers,
using AI coding tools (Claude Code, Cursor, Windsurf, Bolt, Lovable, Replit Agent, v0). These apps
compile, deploy, and demo well — and a large fraction are **not safe to put in front of real users or
real data.** The gap between "it works on my screen" and "it is ready to ship" is invisible to the
person who built it, precisely because they lack the experience to see it.

ShipReady closes that gap with a single, honest answer to a single question:

> **Is this application actually ready to ship?**

We answer it the way a senior engineer would in a code review — with specific, evidence-backed findings
and a defensible verdict — but deterministically, in seconds, and at scale.

### What ShipReady is

- A **deterministic auditing platform**. Facts are established by static analysis, not by an LLM.
- **Explainability-first**. Every finding cites file, line, and the exact evidence that triggered it.
- **AI-enhanced, not AI-decided**. The LLM explains, prioritizes, and drafts remediation. It never
  decides whether a problem exists.

### What ShipReady is not

- Not a chatbot.
- Not another AI coding assistant.
- Not a linter reskin. Linters check style and local correctness; ShipReady checks *production
  readiness* — authz, data exposure, secret hygiene, architectural integrity — the classes of problem
  that AI code generators most reliably get wrong.

## 2. Goals

**Primary product goal:** the best AI-native software auditing platform available — trustworthy enough
that a Fortune 500 team would gate a deployment on it, simple enough that a solo freelancer runs it
before every client handoff.

Concrete goals for the first 12 months:

1. **Trust through determinism.** A given repo state always yields the same findings and the same score.
   No LLM nondeterminism in the verdict.
2. **Zero false-confidence.** We would rather report "unknown / low confidence" than assert a finding we
   cannot back with evidence. A single fabricated finding destroys the product's credibility.
3. **Frictionless entry.** `npx shipready scan` with no account, producing a real local report, is the
   top of the funnel. Accounts add explanation, history, and sharing — not gate the core value.
4. **Source-code privacy as a feature.** "Your code never leaves your machine" is both a security
   property and a sales argument for agencies and enterprises.
5. **CI-native.** Running in a GitHub Action / pre-deploy hook is a first-class use case, not an
   afterthought.

## 3. Users

| Tier | Persona | Job to be done | What they value most |
|---|---|---|---|
| **Primary** | Freelance AI developer | "Prove to my client (and myself) that what I built is safe to hand over." | Fast local scan, a shareable professional report, remediation they can actually act on |
| **Secondary** | Agency building AI apps | "Standardize a quality bar across every project and every developer." | Org accounts, per-project history, trend lines, a gate in CI |
| **Tertiary** | Company reviewing an AI-generated repo before deploying | "Independently verify a repo we didn't write before we trust it." | Source privacy, defensible evidence, executive summary for non-engineers |
| **Future** | Enterprise compliance team | "Continuous assurance and audit trails across many repos." | SSO, policy-as-code, attestation, retention controls, SOC2 alignment |

### Anti-persona
Experienced staff engineers auditing hand-written, mature codebases are **not** the target. ShipReady is
tuned for the failure modes of *AI-generated* app code (Next.js + Supabase being the dominant stack).
Over-generalizing to "audit any codebase" would dilute rule quality and the value proposition.

## 4. Market

- **Tailwind:** AI code generation is growing explosively; each generated app is a potential scan.
- **The pain is acute and recurring:** the same categories of mistake (missing RLS, leaked keys,
  unprotected routes) recur across nearly every AI-built Supabase/Next.js app, which makes a
  rules-based product unusually effective.
- **Adjacent tools and why they don't cover this:**
  - *Linters/formatters (ESLint, Biome):* style + local correctness, not readiness or data exposure.
  - *SAST tools (Semgrep, Snyk Code):* powerful but generic, noisy, and not opinionated about the
    Supabase/Next.js readiness checklist; steep for non-engineers.
  - *Dependency scanners (Dependabot, Snyk):* one dimension (CVEs) of many.
  - *AI review bots (generic "review my PR"):* non-deterministic, unverifiable, hallucination-prone —
    exactly what our determinism principle rejects.
  - ShipReady's wedge: **an opinionated, deterministic, evidence-backed readiness verdict for the
    specific stack AI tools generate, explained well enough for a non-engineer.**

## 5. The Problem (in detail)

AI code generators optimize for "make the demo work." They reliably under-produce the invisible 40% of
production software:

- **Data exposure:** tables created without Row Level Security; RLS enabled but with permissive
  `USING (true)` policies; service-role keys used from the browser.
- **Broken authorization:** routes and server actions that check *authentication* but not
  *authorization* (any logged-in user can act on any record).
- **Secret leakage:** `.env` committed, keys hardcoded, `NEXT_PUBLIC_` prefix on secrets.
- **Insecure API routes:** no input validation, no rate limiting, missing auth checks, verbose errors.
- **Weak validation:** trusting client input, no schema validation at trust boundaries.
- **Maintainability rot:** duplicated components, dependency bloat, dead code, no types at boundaries.
- **Migration/DB problems:** destructive migrations, missing indexes on FKs, no constraints.
- **A11y and performance regressions** that block real-world use.

Each of these is **statically detectable** with high confidence. That is the core bet.

## 6. Success Metrics

**North Star:** *Verified readiness improvements* — the number of findings that a user actually
remediates (measured by a follow-up scan showing the finding resolved). This ties our success to the
user's actual outcome, not vanity usage.

Supporting metrics:

| Metric | Why it matters | V1 target signal |
|---|---|---|
| Time-to-first-report | Activation | < 60s from `npx shipready scan` to a rendered report |
| Scan → account conversion | Funnel health | Users return and create an account for history/explanation |
| Findings precision (sampled) | Trust | > 95% of surfaced Critical/High findings judged true-positive on manual audit |
| Remediation rate | North Star input | Findings resolved in a subsequent scan |
| Repeat-scan rate | Habit / CI adoption | Projects scanned more than once |
| False-positive reports filed | Trust regression alarm | Trending toward zero per rule |

**Explicitly not a metric:** number of findings per scan. Optimizing finding *count* incentivizes noise.
We optimize precision and remediation.

## 7. Roadmap

**Phase 1 — Repository Auditor (this blueprint).**
CLI + engine + hosted dashboard + AI explanation + report export. Static-only, Next.js/Supabase-focused
rule set. Ships the core loop: scan → findings → explanation → report.

**Phase 2 — Team & CI.**
GitHub App (read-only, push-triggered scans), org/team management, project history and trend lines,
CI gate action, signed attestation for verifiable badges.

**Phase 3 — Remediation & Generators.**
AI remediation (draft PRs/diffs, still human-approved), Spec/PRD/Database/Migration generators, feedback
widget.

**Phase 4 — Continuous & Enterprise.**
Continuous monitoring, deployment-readiness gates, policy-as-code, SSO/SCIM, compliance mappings
(SOC2/ISO), retention controls, sandboxed dynamic checks (opt-in).

See [BACKLOG.md](./BACKLOG.md) for the itemized, prioritized list and [RISKS.md](./RISKS.md) for what
could derail this.
