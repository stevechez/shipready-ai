# SECURITY.md — ShipReady AI

> **Status note (post-lock):** The provider model adds trust boundaries this document must reflect (see
> `PROVIDER_ARCHITECTURE.md` §3, §4.1): **analyzers execute as sandboxed subprocesses** (trust tiers:
> core / first-party / verified / community), **no third-party executable code runs in-process**, **rule
> packs are declarative**, the **provider set is pinned via `shipready.providers.lock`**, and **untrusted
> provider output (SARIF) is schema-validated, size-capped, and sanitized before storage/render** (raw
> payloads are bounded, never persisted unbounded). These are additive to the controls below; nothing here
> is retracted.

We are a security product. Our own security posture *is* the pitch. This document is the standard we
hold ourselves to — and, not coincidentally, the checklist our engine enforces on others.

## 1. Assets & trust boundaries

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Customer source code | **Highest** | **Never on our infra** (CLI-first). Only redacted evidence crosses the wire. |
| Redacted findings/evidence | Medium | Postgres (RLS), our servers |
| API tokens | High | Hashed in DB; plaintext only shown once, client-side |
| Supabase service-role key | Critical | Server env only (Vercel encrypted) |
| AI provider keys | High | Server env / AI Gateway |
| User PII (email) | Medium | Supabase Auth + `users` |
| Generated reports (may embed evidence) | Medium | Supabase Storage; public shares unguessable + expiring |

**Primary trust boundary:** the `/api/v1` line. Everything from the CLI is untrusted input — validated
(Zod), authorized (token→org), size-capped, and re-redacted on ingest.

## 2. Threat model (STRIDE summary; full authz model in AUTH.md)

| Category | Top threats | Mitigations |
|---|---|---|
| Spoofing | Forged/stolen API token; session hijack | Hashed tokens + constant-time compare + revocation; HttpOnly/Secure cookies, short TTL, refresh rotation, origin checks |
| Tampering | Fabricated `ScanResult`; injected `org_id`; evidence containing payloads | Server-side score recompute; server-derived `org_id`; strict Zod schema; ingest-time secret re-scan |
| Repudiation | Denying token/share/membership actions | Append-only `audit_log` |
| Info disclosure | Cross-tenant reads; secrets in evidence; leaky share links; verbose errors | RLS default-deny + force; client redaction + server re-redaction; unguessable expiring shares with `noindex`; sanitized error envelope |
| DoS | Upload flooding, huge payloads, expensive AI jobs | Rate limits, payload/finding caps, per-org quotas, AI job budgeting + queue backpressure, Vercel Firewall/BotID |
| Elevation | member→admin actions; RLS bypass | Two-layer authz (RLS + server guard); `security definer` helpers with pinned `search_path`; no service key in request path except audited ingest |

## 3. OWASP Top 10 — our stance (and self-audit)

| OWASP (2021) | How we address it | We also *detect* this in customers via |
|---|---|---|
| A01 Broken Access Control | RLS everywhere + server authorize guard + object-level checks | `SR-AUTHZ-*`, `SR-RLS-*` |
| A02 Cryptographic Failures | TLS everywhere; tokens hashed (SHA-256); no secret at rest in plaintext; Supabase-managed encryption at rest | `SR-SEC-*` |
| A03 Injection | Parameterized queries (Supabase/Drizzle); Zod validation at boundaries; no string-built SQL | `SR-API-001`, `SR-SEC-*` |
| A04 Insecure Design | This blueprint; deterministic core; least privilege | `SR-ARCH-*` |
| A05 Security Misconfiguration | Security headers (CSP/HSTS/frame), no debug in prod, sane defaults | `SR-CFG-*` |
| A06 Vulnerable Components | `pnpm audit` in CI, Renovate, minimal engine deps, no postinstall | `SR-DEP-*` |
| A07 Auth Failures | Supabase Auth, rotation, rate-limited auth endpoints | `SR-AUTH-*` |
| A08 Data Integrity | Immutable scans; signed attestation for badges (Phase 2); lockfile committed | `SR-DB-002`, `SR-DEP-*` |
| A09 Logging/Monitoring Failures | Structured audit log + app telemetry with secret scrubbing | `SR-*` (advisory) |
| A10 SSRF | No server-side fetch of user-controlled URLs in V1; strict allowlists if added | `SR-SEC-*` |

## 4. Secrets management

- **Never in the repo.** `.env*` gitignored; example values in `.env.example` only. (Our own repo passes
  `SR-SEC-*`.)
- **Server-only secrets** (service-role key, AI keys) live in Vercel encrypted env, never `NEXT_PUBLIC_`.
- **API tokens:** generated with a CSPRNG, shown once, stored as SHA-256 hash + prefix. Rotatable,
  revocable. Never logged (log middleware scrubs `Authorization`).
- **Evidence redaction (two layers):** engine marks secret-looking matches; CLI masks them *before
  upload*; server re-scans incoming evidence for secret patterns and masks/rejects on ingest. Raw
  secrets should be structurally unable to reach our DB.
- **Key rotation runbook** documented; rotating the service-role key must not require code deploys
  (env-only).

## 5. Supabase-specific hardening

- RLS `enable` **and** `force` on every tenant table; default-deny; `with check` on writes.
- `get_advisors` (security + performance) gate in CI — an "RLS disabled"/"policy allows all"/"function
  search_path mutable" advisory fails the build.
- Service-role key used only in the narrow, audited ingest path (which sets `org_id` from the token),
  never exposed to the browser or CLI.
- `security definer` functions pin `search_path = public` and are minimal.
- Storage buckets private by default; report artifacts served via signed URLs or unguessable slugs.

## 6. API protection

- **Validation:** every endpoint validates input with Zod; unknown fields rejected; strict types.
- **AuthN/Z:** token or session required on all non-public routes; org/role checked server-side.
- **Payload caps:** max request body (e.g. 5–10 MB scan payloads), max findings per scan, max evidence
  snippet length; oversize → `413`.
- **Error envelope:** uniform `{ error: { code, message, requestId } }`; never leak stack/DB errors
  (we detect `SR-API-002` in customers — we must not do it).
- **Idempotency:** scan ingest accepts an idempotency key (client scan UUID) to make retries safe.

## 7. Rate limiting & abuse

- Per-token and per-IP limits on ingest and AI-triggering endpoints (sliding window; Upstash Redis via
  Marketplace or Vercel primitives).
- Per-org quotas by plan (scans/day, AI enrichments/day) with clear `429` + `Retry-After`.
- **Vercel Firewall/WAF + BotID** at the platform edge for DDoS and bot mitigation; Attack Mode runbook.
- AI cost is a DoS vector: enrichment is queued with a per-org budget; over budget → findings still show,
  enrichment deferred.

## 8. Validation & data handling

- All external input (CLI upload, form input, webhook payloads) validated with Zod at the boundary; the
  parsed, typed object is the only thing that flows inward.
- Output encoding by default (React escapes; we avoid `dangerouslySetInnerHTML`; if a report needs
  rich text we sanitize with a vetted sanitizer).
- No `eval`, no dynamic `require`, no shelling out to user-controlled strings.

## 9. Logging, monitoring, telemetry

- **Structured logs** with a `requestId`; **secret-scrubbing** middleware strips tokens, cookies, and
  known secret patterns before anything is written.
- **Audit log** (append-only) for security-relevant actions (token, membership, share, ingest).
- **Alerting** on anomalies: spikes in `4xx/5xx`, auth failures, score-delta tamper signals, AI cost.
- **No source code, ever, in logs** (we never have it) — and no raw evidence secrets (redacted upstream).
- Privacy: minimal PII; data-retention job (cron) enforces plan-based retention; user data export/delete
  endpoints for compliance.

## 10. Encryption

- **In transit:** TLS 1.2+ everywhere (Vercel/Supabase managed).
- **At rest:** Supabase-managed encryption for Postgres + Storage.
- **Application-level:** tokens hashed, not encrypted (one-way). No need to decrypt them.
- **Secrets at rest** live only in the platform secret stores (Vercel env, Supabase), never our tables.

## 11. Secure SDLC

- Two-layer review; Definition of Done (CURSOR_RULES.md) includes security checks.
- `pnpm audit`, `get_advisors`, secret scanning (we run *ourselves* through ShipReady — dogfood) in CI.
- Dependency governance (STACK.md §Dependency governance): justify engine deps, no postinstall in our
  packages.
- Coordinated disclosure: `SECURITY.md`/`security.txt` with a contact and safe-harbor statement.
- Incident runbook: token compromise, key rotation, tenant-isolation bug, AI provider breach.

## 12. Honest limitations (V1)

- Client-supplied scores are only trustworthy for the user's own dashboard; **externally verifiable
  badges require signed attestation** (Phase 2 — a signing key held by the CLI-authenticated session,
  server-verified). Documented in BACKLOG.md, not oversold.
- Static-only means we cannot assert runtime behavior (e.g. that an RLS policy *actually* denies a real
  request) — we assert its presence/shape and say so. Confidence levels communicate this.
- We depend on Supabase, Vercel, and an AI provider; their breaches are our exposure. Mitigated by
  holding no source and minimal PII.
