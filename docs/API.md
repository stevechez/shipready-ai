# API.md — ShipReady AI

Two API surfaces:
- **`/api/v1/*` (public, token-auth):** the CLI/CI contract. Versioned, stable, documented here.
- **Internal app routes / Server Actions:** session-auth, for the dashboard. Not a public contract.

All requests/responses are JSON. All input is Zod-validated (schemas live in `@shipready/schema`). All
auth, size, and rate-limit rules from SECURITY.md apply.

## 1. Conventions

- **Base:** `https://api.shipready.dev/v1` (or `app.shipready.dev/api/v1`).
- **Auth:** `Authorization: Bearer sr_live_…` (API token) for public routes; session cookie for app
  routes.
- **Content type:** `application/json; charset=utf-8`. Gzip accepted.
- **Versioning:** URL-versioned (`/v1`). Additive changes only within a version; breaking changes → `/v2`.
- **Idempotency:** mutating public endpoints accept `Idempotency-Key` (defaults to the client scan UUID)
  so retries are safe.
- **Request ID:** every response includes `X-Request-Id`; echoed in the error envelope.
- **Timestamps:** ISO-8601 UTC.

## 2. Error model

Uniform envelope — never leak stack traces or DB errors (we detect that as `SR-API-002`):

```json
{ "error": { "code": "validation_error", "message": "findings[3].severity is invalid",
             "requestId": "req_01H…", "details": [ { "path": "findings.3.severity", "issue": "enum" } ] } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | Zod rejects the payload |
| 401 | `unauthenticated` | Missing/invalid token or session |
| 403 | `forbidden` | Authn ok, not authorized (role/org) |
| 404 | `not_found` | Resource absent or not visible under RLS |
| 409 | `conflict` | Idempotency replay mismatch / duplicate |
| 413 | `payload_too_large` | Over size / finding-count caps |
| 422 | `unprocessable` | Semantically invalid (e.g. unknown catalog version) |
| 429 | `rate_limited` | Quota/limit exceeded (+ `Retry-After`) |
| 5xx | `internal_error` | Sanitized; `requestId` for support |

## 3. Public endpoints (CLI/CI contract)

### `POST /v1/scans` — ingest a scan
The core endpoint. Body is a `ScanResult` (redacted). Server validates, resolves org from token,
**recomputes the score**, stores immutably, enqueues enrichment.

Request (abridged):
```json
{
  "engineVersion": "1.4.2",
  "catalogVersion": "2026.08.0",
  "project": { "name": "acme-app", "repoIdentity": "sha256:…optional" },
  "scannedAt": "2026-08-06T12:00:00Z",
  "localScore": 90,
  "findings": [
    { "ruleId": "SR-RLS-001", "severity": "critical", "confidence": "certain",
      "location": { "file": "supabase/migrations/0003_init.sql", "lineStart": 12 },
      "fingerprint": "fp_…",
      "evidence": { "matched": "sr_masked(0,none)", "facts": { "table": "profiles", "rlsEnabled": false } },
      "message": "Table \"profiles\" created without RLS enabled" }
  ],
  "scanMeta": { "truncated": false, "durationMs": 3120 }
}
```

Response `202 Accepted`:
```json
{ "scanId": "scn_…", "score": 90, "tier": "blocked",
  "scoreBreakdown": { "database": 60, "api": 66, "…": 100 },
  "reportUrl": "https://app.shipready.dev/p/acme-app/scans/scn_…",
  "enrichment": "queued" }
```

Notes: client `localScore` is stored for skew detection but **not** authoritative. Unknown `ruleId`s are
accepted and scored `unweighted`. Oversized → `413`.

### `GET /v1/scans/{scanId}` — fetch a scan + findings
Returns the stored scan, server score, findings, and (if ready) enrichment. RLS-scoped to the token's
org. Supports `?include=enrichments`.

### `GET /v1/projects/{projectId}/scans` — history (paginated)
Cursor pagination: `?limit=20&cursor=…` → `{ data: [...], nextCursor: "…"|null }`. Sorted `created_at
DESC`. Used for trend lines and CI comparisons.

### `GET /v1/projects/{projectId}/scans/latest` — latest scan
Convenience for CI ("did readiness regress vs latest?").

### `GET /v1/catalog?version=` — rule catalog
Public, cacheable. Returns rule metadata (ids, categories, severities, weights, docs URLs) for a catalog
version so the CLI/report can render titles/links offline-consistently.

### `POST /v1/reports/{scanId}/export` — request a PDF
`202` + a job handle; poll `GET /v1/reports/{reportId}` or receive a webhook when ready. Returns a
signed download URL on completion.

## 4. App (session) endpoints — summary

Not a stable public contract; implemented as Route Handlers / Server Actions, session-authed, role-checked.

| Area | Examples |
|---|---|
| Orgs | create org, list my orgs, update org |
| Members | invite, accept invite, change role, remove, leave |
| Tokens | create (returns plaintext once), list (prefixes only), revoke |
| Projects | create, rename, delete, list |
| Scans/Reports | view, trigger re-enrichment, create/revoke share link, export PDF |
| Billing (Phase 2) | plan, usage, portal |

All follow the same error model, Zod validation, and two-layer authz (RLS + server guard).

## 5. Pagination

- **Cursor-based** everywhere lists appear (stable under inserts, unlike offset). `cursor` is an opaque
  encoded `(created_at, id)`. `limit` capped (e.g. 100). Response: `{ data, nextCursor }`.

## 6. Rate limiting & quotas

- Per-token + per-IP sliding window on `POST /v1/scans` and export/enrichment triggers.
- Per-org plan quotas (scans/day, enrichments/day, exports/day). Exceed → `429` + `Retry-After` +
  `X-RateLimit-*` headers.

## 7. Webhooks (Phase 2, specified now for stability)

Outbound webhooks let CI/Slack react to scans.

- **Events:** `scan.completed`, `scan.enrichment_ready`, `report.exported`, `scan.regressed` (score/tier
  worse than previous).
- **Delivery:** POST JSON with `X-ShipReady-Signature` = HMAC-SHA256 of the body using the endpoint's
  secret; timestamp header to prevent replay; ret/retries with backoff; at-least-once (consumers
  idempotent via event id).
- **Payload:** `{ id, type, createdAt, data: { scanId, projectId, score, tier, delta } }` — never
  source, never unredacted evidence.
- Inbound (GitHub App, Phase 2) handled on separate signed routes.

## 8. Compatibility & deprecation

- Additive-only within `/v1`. New fields are optional; clients ignore unknown fields.
- The server always accepts older `engineVersion`/`catalogVersion` scans and reconciles scoring.
- Deprecations announced with a sunset header + docs; a `/v2` only for genuine breaking changes.

## 9. OpenAPI

The public `/v1` surface is described by a committed **OpenAPI 3.1** document generated from the Zod
schemas (single source of truth). It powers docs, client generation, and contract tests in CI.
