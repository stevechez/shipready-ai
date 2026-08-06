# AUTH.md — ShipReady AI

Two distinct auth surfaces, deliberately kept separate:

1. **Human auth** (dashboard) → Supabase Auth (sessions, RLS via `auth.uid()`).
2. **Machine auth** (CLI upload) → hashed API tokens, verified in our Route Handler.

## 1. Authentication

### Human (dashboard)
- **Provider:** Supabase Auth. V1 methods: email magic link + GitHub OAuth (our users live on GitHub).
  Password auth optional; OAuth preferred to reduce credential handling.
- **Sessions:** Supabase-managed JWT in secure, `HttpOnly`, `SameSite=Lax` cookies via the
  `@supabase/ssr` helpers. Access token short-lived; refresh rotation on.
- **`auth.uid()`** is the spine of RLS. Every request-time DB read runs as the authenticated user with
  RLS enforced.

### Machine (CLI)
- **API tokens** minted in the dashboard: format `sr_live_<random>` (and `sr_test_<random>`). Shown once.
- Stored server-side as **SHA-256 hash only** (`api_tokens.token_hash`) + a non-sensitive prefix for
  display. Verification: hash the presented token, constant-time compare against stored hash, check
  `revoked_at IS NULL`, bump `last_used_at`.
- Sent as `Authorization: Bearer sr_live_…` to `/api/v1/*`. Never placed in URLs or logs.
- Tokens are **org-scoped** (Phase 2: project-scoped) and carry an implicit `ingest` capability only —
  they cannot read other orgs' data or manage members.

## 2. Authorization

### The organization is the tenancy boundary
Everything is owned by an `organization`. A "personal" account is an org with a single `owner` member —
no special-case code path. Access = membership in the row's org (enforced by RLS, see DATABASE.md §6).

### Role model
| Role | Scan/report read | Trigger/upload scans | Manage projects | Manage members | Manage tokens | Billing |
|---|---|---|---|---|---|---|
| **owner** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **admin** | ✔ | ✔ | ✔ | ✔ | ✔ | view |
| **member** | ✔ | ✔ | ✔ (create) | view | — | — |
| **viewer** | ✔ (read-only) | — | — | — | — | — |

- Enforced in **two layers**: RLS (`is_org_member` / `is_org_admin` helpers) as the hard floor, and a
  server-side `authorize(action, resource)` guard in Route Handlers/Server Actions for clear error
  messages and non-DB actions.
- **Never rely on the UI alone.** Hiding a button is UX, not security. This is literally a finding class
  we detect (`SR-AUTH-*`), so we implement it correctly.

### Ownership & object-level authorization
- Every mutation resolves the object's `org_id` and checks membership/role **before** acting — no
  "authenticated ⇒ authorized" shortcuts (the #1 AI-generated-app bug we exist to catch).
- IDs are UUIDv4 (unguessable) but authorization never *relies* on unguessability — RLS + explicit
  checks are the control; opacity is defense-in-depth.

## 3. Organizations & membership lifecycle

- **Create org:** any authenticated user; they become `owner`.
- **Invite:** owner/admin invites by email → pending invite row → accepted on sign-in → `membership`.
- **Role change / removal:** owner/admin only; cannot remove the last `owner` (constraint + guard).
- **Leave org:** members can leave; last owner cannot leave without transferring ownership.
- All membership changes write to `audit_log`.

## 4. Session management

- **Cookie-based**, `HttpOnly` + `Secure` + `SameSite=Lax`, set via `@supabase/ssr` in middleware.
- **Refresh rotation** on; stolen refresh token detection via Supabase.
- **Sign-out** clears cookies and revokes the refresh token.
- **CSRF:** state-changing routes are POST/PUT/DELETE with `SameSite=Lax` cookies + an origin check in
  middleware; Server Actions carry Next's built-in action protection. No state change on GET.
- **Idle/absolute timeouts:** rely on short access-token TTL + refresh; enterprise config later.

## 5. Threat model (STRIDE, focused)

| Threat | Vector | Mitigation |
|---|---|---|
| **Spoofing** | Forged API token | Only hashes stored; constant-time compare; revocation; per-token rate limits |
| **Spoofing** | Session hijack | HttpOnly/Secure cookies, short TTL, refresh rotation, origin checks |
| **Tampering** | Client fabricates a passing `ScanResult` | **Score recomputed server-side** from findings against pinned catalog; verifiable badges require signed attestation (Phase 2); local/server score delta logged |
| **Tampering** | Client sends another org's `org_id` on upload | Server ignores client `org_id`; derives it from the authenticated token; RLS `with check` |
| **Repudiation** | "I didn't share that report / revoke that token" | Append-only `audit_log` |
| **Info disclosure** | Cross-tenant data read | RLS default-deny on every table + `force`; CI advisor gate; server authorize guard |
| **Info disclosure** | Secrets in uploaded evidence | Evidence redacted **client-side** before upload; server re-scans evidence payloads for secret patterns and rejects/masks on ingest (defense in depth) |
| **Info disclosure** | Public share link leaks | Unguessable `share_slug`, `expires_at`, revocable, `noindex` |
| **Elevation of privilege** | member performs admin action | Two-layer authz (RLS + server guard); role checks in `with check` |
| **DoS** | Upload flooding / huge payloads | Token rate limits, payload size caps, finding-count caps, per-org quotas |

### Non-goals / accepted risks (V1)
- We do not defend against a user lying about *their own* repo's score for their own dashboard — it's
  self-defeating. The attestation work exists only when scores become *externally verifiable claims*
  (public badges), which is a Phase-2 feature with its own signing design (see BACKLOG.md).
- The CLI runs in the user's environment; we trust the user with their own machine, not with our
  server's integrity — hence the server-side recompute boundary.

## 6. Secrets & keys (auth-relevant)

- Supabase **service-role key** exists only in server env (Vercel encrypted env), never shipped to the
  client, never in the CLI. Most server work uses the RLS-scoped anon/auth key.
- API tokens never logged; redaction middleware scrubs `Authorization` headers from logs/telemetry.
- See SECURITY.md for the full secrets policy.
